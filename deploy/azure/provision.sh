#!/usr/bin/env bash
# Provisiona a infraestrutura do Bridgit no Azure: VM Ubuntu 24.04 (API + SQL Server Express + Caddy),
# rede, IP publico estatico, NSG (22/80/443) e Static Web App (Free) para o front.
# Opcionalmente cria um orcamento mensal com alerta por e-mail.
#
# Idempotente: pode ser executado de novo; recursos que ja existem sao mantidos.
# Requer bash (Linux, macOS, WSL ou Git Bash) e az CLI logada (az login --tenant <tenant>).
#
# Uso minimo:
#   SUBSCRIPTION=<id-ou-nome> ./deploy/azure/provision.sh
#
# Variaveis (todas opcionais, exceto SUBSCRIPTION):
#   SUBSCRIPTION          assinatura alvo (OBRIGATORIA). Toda chamada az leva --subscription.
#   LOCATION              regiao da VM e da rede            (brazilsouth)
#   RG                    resource group                    (rg-bridgit)
#   VM_NAME               nome da VM                        (vm-bridgit)
#   VM_SIZE               tamanho preferido                 (Standard_D2s_v4)
#   VM_SIZE_FALLBACK      usado se o preferido nao tem SKU/cota (Standard_D2as_v7)
#   ADMIN_USER            usuario administrador da VM       (azureuser)
#   SSH_PUBLIC_KEY_PATH   chave publica SSH (so chave, sem senha) (~/.ssh/id_ed25519.pub)
#   SSH_SOURCE            origem permitida na porta 22      (* = qualquer; restrinja se puder)
#   SWA_NAME              nome do Static Web App            (swa-bridgit)
#   SWA_LOCATION          regiao do Static Web App          (eastus2)
#   BUDGET_AMOUNT         valor mensal do orcamento (ex.: 50); com BUDGET_EMAIL cria o alerta
#   BUDGET_EMAIL          e-mail que recebe os alertas do orcamento
#   BUDGET_NAME           nome do orcamento                 (budget-bridgit)

set -euo pipefail

# Git Bash (Windows) reescreve argumentos que parecem caminhos; o az nao entende isso.
export MSYS_NO_PATHCONV=1

die() { echo "ERRO: $*" >&2; exit 1; }
warn() { echo "AVISO: $*" >&2; }
log() { echo "==> $*"; }

command -v az >/dev/null 2>&1 || die "az CLI nao encontrada no PATH."

SUBSCRIPTION="${SUBSCRIPTION:-}"
[[ -n "$SUBSCRIPTION" ]] || die "defina SUBSCRIPTION (id ou nome). A assinatura padrao do az nao e usada de proposito."

LOCATION="${LOCATION:-brazilsouth}"
RG="${RG:-rg-bridgit}"
VM_NAME="${VM_NAME:-vm-bridgit}"
VM_SIZE="${VM_SIZE:-Standard_D2s_v4}"
VM_SIZE_FALLBACK="${VM_SIZE_FALLBACK:-Standard_D2as_v7}"
ADMIN_USER="${ADMIN_USER:-azureuser}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/id_ed25519.pub}"
SSH_SOURCE="${SSH_SOURCE:-*}"
SWA_NAME="${SWA_NAME:-swa-bridgit}"
SWA_LOCATION="${SWA_LOCATION:-eastus2}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-}"
BUDGET_EMAIL="${BUDGET_EMAIL:-}"
BUDGET_NAME="${BUDGET_NAME:-budget-bridgit}"

OS_DISK_GB=64
IMAGE="Canonical:ubuntu-24_04-lts:server:latest" # Ubuntu 24.04 LTS Gen2 (x64)
VNET_NAME="vnet-bridgit"
SUBNET_NAME="snet-bridgit"
NSG_NAME="nsg-bridgit"
PIP_NAME="pip-bridgit"
VNET_PREFIX="10.20.0.0/16"
SUBNET_PREFIX="10.20.1.0/24"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_INIT="$SCRIPT_DIR/../vm/cloud-init.yaml"

# No Git Bash o python do az precisa de caminho no formato C:/...
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

[[ -f "$CLOUD_INIT" ]] || die "cloud-init nao encontrado: $CLOUD_INIT"
[[ -f "$SSH_PUBLIC_KEY_PATH" ]] || die "chave publica SSH nao encontrada: $SSH_PUBLIC_KEY_PATH (defina SSH_PUBLIC_KEY_PATH; gere com: ssh-keygen -t ed25519)"
grep -Eq '^(ssh-(ed25519|rsa)|ecdsa-sha2-)' "$SSH_PUBLIC_KEY_PATH" || die "$SSH_PUBLIC_KEY_PATH nao parece uma chave PUBLICA SSH."
CLOUD_INIT_ARG="$(winpath "$CLOUD_INIT")"
SSH_KEY_ARG="$(winpath "$SSH_PUBLIC_KEY_PATH")"

if [[ -n "$BUDGET_AMOUNT" || -n "$BUDGET_EMAIL" ]]; then
  if [[ -z "$BUDGET_AMOUNT" || -z "$BUDGET_EMAIL" ]]; then
    warn "BUDGET_AMOUNT e BUDGET_EMAIL precisam ser informados juntos; orcamento sera ignorado."
    BUDGET_AMOUNT=""; BUDGET_EMAIL=""
  else
    [[ "$BUDGET_AMOUNT" =~ ^[0-9]+([.][0-9]+)?$ ]] || die "BUDGET_AMOUNT invalido: $BUDGET_AMOUNT"
    [[ "$BUDGET_EMAIL" =~ ^[^@\"[:space:]]+@[^@\"[:space:]]+$ ]] || die "BUDGET_EMAIL invalido: $BUDGET_EMAIL"
  fi
fi

# --- Assinatura -------------------------------------------------------------------------------
log "Validando assinatura '$SUBSCRIPTION'"
SUB_ID="$(az account show --subscription "$SUBSCRIPTION" --query id -o tsv 2>/dev/null)" \
  || die "assinatura '$SUBSCRIPTION' nao encontrada. Rode: az login --tenant <tenant>"
SUB_NAME="$(az account show --subscription "$SUB_ID" --query name -o tsv)"
log "Assinatura: $SUB_NAME ($SUB_ID)"

# Todas as chamadas az passam por aqui para garantir --subscription.
azs() { az "$@" --subscription "$SUB_ID" --only-show-errors; }

# --- Resource providers -----------------------------------------------------------------------
providers=(Microsoft.Compute Microsoft.Network Microsoft.Web)
[[ -n "$BUDGET_AMOUNT" ]] && providers+=(Microsoft.Consumption)
for ns in "${providers[@]}"; do
  state="$(azs provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null || echo Unknown)"
  if [[ "$state" != "Registered" ]]; then
    log "Registrando provider $ns (estado: $state)"
    azs provider register --namespace "$ns" --wait -o none
  fi
done

# --- Verificacao de SKU e cota ----------------------------------------------------------------
# Retorna 0 se o SKU existe na regiao, sem restricao para a assinatura e com cota de vCPU suficiente.
check_size() {
  local size="$1" family restrictions vcpus cur lim rcur rlim
  family="$(azs vm list-skus --location "$LOCATION" --resource-type virtualMachines --size "$size" \
    --query "[?name=='$size'] | [0].family" -o tsv 2>/dev/null || true)"
  if [[ -z "$family" || "$family" == "None" ]]; then
    warn "$size nao existe em $LOCATION."; return 1
  fi
  restrictions="$(azs vm list-skus --location "$LOCATION" --resource-type virtualMachines --size "$size" \
    --query "[?name=='$size'] | [0].restrictions[?type=='Location'] | length(@)" -o tsv 2>/dev/null || echo 0)"
  if [[ "${restrictions:-0}" != "0" ]]; then
    warn "$size esta restrito para esta assinatura em $LOCATION (peca liberacao ou use outro tamanho/regiao)."; return 1
  fi
  vcpus="$(azs vm list-skus --location "$LOCATION" --resource-type virtualMachines --size "$size" \
    --query "[?name=='$size'] | [0].capabilities[?name=='vCPUs'].value | [0]" -o tsv 2>/dev/null || true)"
  vcpus="${vcpus:-2}"
  read -r cur lim <<<"$(azs vm list-usage --location "$LOCATION" \
    --query "[?name.value=='$family'].[currentValue,limit] | [0]" -o tsv 2>/dev/null || true)"
  if [[ -z "${lim:-}" ]]; then
    warn "nao foi possivel ler a cota da familia $family; seguindo sem validar."
  elif (( cur + vcpus > lim )); then
    warn "cota insuficiente na familia $family: usando $cur de $lim vCPUs, $size precisa de $vcpus."; return 1
  fi
  read -r rcur rlim <<<"$(azs vm list-usage --location "$LOCATION" \
    --query "[?name.value=='cores'].[currentValue,limit] | [0]" -o tsv 2>/dev/null || true)"
  if [[ -n "${rlim:-}" ]] && (( rcur + vcpus > rlim )); then
    warn "cota regional de vCPUs insuficiente: usando $rcur de $rlim, $size precisa de $vcpus."; return 1
  fi
  echo "    $size disponivel em $LOCATION (familia $family, $vcpus vCPUs)"
  return 0
}

VM_EXISTS=false
if azs vm show --resource-group "$RG" --name "$VM_NAME" -o none 2>/dev/null; then
  VM_EXISTS=true
  log "VM $VM_NAME ja existe; pulando verificacao de cota e criacao."
else
  log "Verificando SKU e cota em $LOCATION"
  CHOSEN_SIZE=""
  for candidate in "$VM_SIZE" "$VM_SIZE_FALLBACK"; do
    [[ -n "$candidate" ]] || continue
    if check_size "$candidate"; then CHOSEN_SIZE="$candidate"; break; fi
  done
  [[ -n "$CHOSEN_SIZE" ]] || die "nenhum dos tamanhos ($VM_SIZE, $VM_SIZE_FALLBACK) esta disponivel. Ajuste VM_SIZE/LOCATION ou peca aumento de cota."
  [[ "$CHOSEN_SIZE" == "$VM_SIZE" ]] || warn "usando o tamanho de fallback $CHOSEN_SIZE."
fi

# --- Rede -------------------------------------------------------------------------------------
log "Resource group $RG ($LOCATION)"
azs group create --name "$RG" --location "$LOCATION" --tags app=bridgit -o none

log "NSG $NSG_NAME (entrada: 22, 80, 443; 1433 e 8080 nao sao expostas)"
azs network nsg create --resource-group "$RG" --name "$NSG_NAME" --location "$LOCATION" -o none
nsg_rule() { # nome prioridade porta origem
  azs network nsg rule create --resource-group "$RG" --nsg-name "$NSG_NAME" --name "$1" \
    --priority "$2" --direction Inbound --access Allow --protocol Tcp \
    --source-address-prefixes "$4" --source-port-ranges '*' \
    --destination-address-prefixes '*' --destination-port-ranges "$3" -o none
}
nsg_rule allow-ssh 100 22 "$SSH_SOURCE"
nsg_rule allow-http 110 80 '*'
nsg_rule allow-https 120 443 '*'

if ! azs network vnet show --resource-group "$RG" --name "$VNET_NAME" -o none 2>/dev/null; then
  log "VNet $VNET_NAME / subnet $SUBNET_NAME"
  azs network vnet create --resource-group "$RG" --name "$VNET_NAME" --location "$LOCATION" \
    --address-prefixes "$VNET_PREFIX" --subnet-name "$SUBNET_NAME" --subnet-prefixes "$SUBNET_PREFIX" \
    --network-security-group "$NSG_NAME" -o none
else
  log "VNet $VNET_NAME ja existe"
fi

if ! azs network public-ip show --resource-group "$RG" --name "$PIP_NAME" -o none 2>/dev/null; then
  log "IP publico estatico $PIP_NAME (Standard)"
  azs network public-ip create --resource-group "$RG" --name "$PIP_NAME" --location "$LOCATION" \
    --sku Standard --allocation-method Static --version IPv4 -o none
else
  log "IP publico $PIP_NAME ja existe"
fi

# --- VM ---------------------------------------------------------------------------------------
if [[ "$VM_EXISTS" == "false" ]]; then
  log "Criando VM $VM_NAME ($CHOSEN_SIZE, Ubuntu 24.04, disco ${OS_DISK_GB} GB Premium_LRS)"
  azs vm create --resource-group "$RG" --name "$VM_NAME" --location "$LOCATION" \
    --image "$IMAGE" --size "$CHOSEN_SIZE" \
    --admin-username "$ADMIN_USER" --authentication-type ssh --ssh-key-values "$SSH_KEY_ARG" \
    --os-disk-size-gb "$OS_DISK_GB" --storage-sku Premium_LRS \
    --vnet-name "$VNET_NAME" --subnet "$SUBNET_NAME" --public-ip-address "$PIP_NAME" --nsg "" \
    --custom-data "$CLOUD_INIT_ARG" --tags app=bridgit -o none
else
  warn "VM ja existia: cloud-init/custom-data NAO e reaplicado."
fi

# --- Static Web App ---------------------------------------------------------------------------
if ! azs staticwebapp show --resource-group "$RG" --name "$SWA_NAME" -o none 2>/dev/null; then
  log "Criando Static Web App $SWA_NAME (Free, $SWA_LOCATION, sem vinculo com GitHub)"
  azs staticwebapp create --resource-group "$RG" --name "$SWA_NAME" --location "$SWA_LOCATION" \
    --sku Free --tags app=bridgit -o none
else
  log "Static Web App $SWA_NAME ja existe"
fi

# --- Orcamento (opcional) ---------------------------------------------------------------------
if [[ -n "$BUDGET_AMOUNT" ]]; then
  log "Orcamento $BUDGET_NAME: $BUDGET_AMOUNT/mes, alerta para $BUDGET_EMAIL"
  BUDGET_URI="https://management.azure.com/subscriptions/$SUB_ID/providers/Microsoft.Consumption/budgets/$BUDGET_NAME?api-version=2023-05-01"
  # Um orcamento existente nao aceita mudar a data inicial; reaproveita-a.
  start="$(azs rest --method get --uri "$BUDGET_URI" --query properties.timePeriod.startDate -o tsv 2>/dev/null || true)"
  start="${start:-$(date -u +%Y-%m-01)T00:00:00Z}"
  end="$(( $(date -u +%Y) + 3 ))-12-31T00:00:00Z"
  body_file="$(mktemp)"
  trap 'rm -f "$body_file"' EXIT
  cat >"$body_file" <<EOF
{
  "properties": {
    "category": "Cost",
    "amount": $BUDGET_AMOUNT,
    "timeGrain": "Monthly",
    "timePeriod": { "startDate": "$start", "endDate": "$end" },
    "notifications": {
      "actual_80_percent": {
        "enabled": true, "operator": "GreaterThan", "threshold": 80, "thresholdType": "Actual",
        "contactEmails": ["$BUDGET_EMAIL"]
      },
      "forecast_100_percent": {
        "enabled": true, "operator": "GreaterThan", "threshold": 100, "thresholdType": "Forecasted",
        "contactEmails": ["$BUDGET_EMAIL"]
      }
    }
  }
}
EOF
  azs rest --method put --uri "$BUDGET_URI" --body "@$(winpath "$body_file")" -o none
else
  log "Orcamento: pulado (defina BUDGET_AMOUNT e BUDGET_EMAIL para criar)"
fi

# --- Resumo -----------------------------------------------------------------------------------
PUBLIC_IP="$(azs network public-ip show --resource-group "$RG" --name "$PIP_NAME" --query ipAddress -o tsv)"
SWA_HOST="$(azs staticwebapp show --resource-group "$RG" --name "$SWA_NAME" --query defaultHostname -o tsv)"

cat <<EOF

============================================================
IP publico da VM : $PUBLIC_IP
Static Web App   : https://$SWA_HOST
Acesso SSH       : ssh $ADMIN_USER@$PUBLIC_IP
============================================================
Proximos passos (detalhes em deploy/README.md):
  1. Aponte bridgit-demo.duckdns.org para $PUBLIC_IP.
  2. Acompanhe o cloud-init:  ssh $ADMIN_USER@$PUBLIC_IP 'cloud-init status --wait'
  3. Token de deploy do SWA (segredo AZURE_STATIC_WEB_APPS_API_TOKEN no GitHub):
       az staticwebapp secrets list --subscription "$SUB_ID" -g "$RG" -n "$SWA_NAME" --query properties.apiKey -o tsv
  4. Origem do front para APP_FRONTEND_BASE_URL / APP_CORS_ALLOWED_ORIGINS: https://$SWA_HOST
EOF
