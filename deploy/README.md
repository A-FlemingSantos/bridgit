# Deploy no Azure (demo)

Arquitetura: uma VM Ubuntu 24.04 com a API Spring Boot (Java 21, porta 8080 só em loopback), SQL Server 2025 Express (só localhost) e Caddy (HTTPS automático). O Caddy também serve o web (arquivos estáticos). Nomes: `app.bridgit-cloud.duckdns.org` (web), `api.bridgit-cloud.duckdns.org` (API) e `db.bridgit-cloud.duckdns.org` (CloudBeaver). O nome antigo `bridgit-demo.duckdns.org` continua como proxy da API (webhooks já registrados e APKs antigos). **Uma única instância da API** (os workers rodam no processo).

```
deploy/
  azure/provision.sh        cria RG, rede, NSG, IP, VM (e orçamento opcional)
  vm/cloud-init.yaml        preparação da VM no primeiro boot (sem segredos)
  vm/setup-sql.sh           configura o SQL Server Express, banco, login e backup
  vm/Caddyfile              proxy reverso + HTTPS
  vm/bridgit-api.service    unit systemd da API
  vm/api.env.example        modelo de /etc/bridgit/api.env
  vm/deploy-api.sh          troca de release da API com rollback (usado pelo CI)
  vm/deploy-web.sh          publica o build do web em /var/www/bridgit (usado pelo CI)
  vm/setup-cloudbeaver.sh   CloudBeaver (banco pelo navegador)
```

## 1. Acesso ao Azure

```bash
az login --tenant <tenant-id>
az account set --subscription <id-ou-nome>   # confira com: az account show
```

A assinatura padrão do operador é outra: o `provision.sh` exige `SUBSCRIPTION` e passa `--subscription` em toda chamada.

## 2. Provisionar a infraestrutura

Precisa de uma chave SSH pública (`ssh-keygen -t ed25519` se não tiver).

```bash
SUBSCRIPTION=<id-ou-nome> \
SSH_PUBLIC_KEY_PATH=~/.ssh/id_ed25519.pub \
./deploy/azure/provision.sh
```

Opcionais: `LOCATION` (brazilsouth), `RG` (rg-bridgit), `VM_SIZE` (Standard_D2s_v4, 2 vCPU / 8 GiB; cai para `VM_SIZE_FALLBACK` Standard_D2as_v7 se faltar SKU/cota — a série B não é oferecida a esta assinatura no Brazil South), `ADMIN_USER` (azureuser), `SSH_SOURCE` (restrinja o IP de origem do SSH se puder), `BUDGET_AMOUNT` + `BUDGET_EMAIL` (cria orçamento mensal com alertas de 80% real e 100% previsto). O script verifica SKU e cota antes de criar qualquer coisa e é seguro repetir.

Ao final ele imprime o **IP público**. Anote.

Acompanhe o cloud-init (instala Java, Caddy, SQL Server; leva alguns minutos):

```bash
ssh azureuser@<IP> 'cloud-init status --wait; ls /var/lib/bridgit-bootstrap.done'
# se falhar: sudo tail -n 80 /var/log/bridgit-bootstrap.log
```

## 3. DuckDNS

Em duckdns.org, aponte o subdomínio `bridgit-cloud` para o IP público da VM. O DuckDNS resolve qualquer subdomínio dele (`app.`, `api.`, `db.`) para o mesmo IP. Confirme: `nslookup api.bridgit-cloud.duckdns.org`. O Caddy só emite o certificado depois que o DNS resolve e as portas 80/443 estão acessíveis.

## 4. Copiar arquivos para a VM

Do seu computador, na raiz do repositório:

```bash
scp -r deploy/vm azureuser@<IP>:/tmp/bridgit-vm
ssh azureuser@<IP>
```

Na VM:

```bash
cd /tmp/bridgit-vm
sudo install -m 0644 bridgit-api.service /etc/systemd/system/bridgit-api.service
sudo install -m 0644 Caddyfile /etc/caddy/Caddyfile
sudo install -o deploy -g deploy -m 0755 deploy-api.sh /opt/bridgit/deploy-api.sh
sudo systemctl daemon-reload
sudo systemctl reload caddy || sudo systemctl restart caddy
```

Chave SSH do CI (usuário `deploy`): gere um par dedicado (`ssh-keygen -t ed25519 -f bridgit_deploy -N ""`) e instale a pública:

```bash
echo '<conteudo de bridgit_deploy.pub>' | sudo tee -a /home/deploy/.ssh/authorized_keys
```

## 5. SQL Server

Na VM, em `/tmp/bridgit-vm`. As senhas são pedidas sem eco (ou venham de `MSSQL_SA_PASSWORD` / `BRIDGIT_APP_PASSWORD`). Nenhum EULA é aceito no boot: aceitar os EULAs do SQL Server Express e das ferramentas (`mssql-tools18`/driver ODBC, que fornecem o `sqlcmd`) é decisão sua. O script só roda o setup e instala o `sqlcmd` com `--accept-eula` (ou `ACCEPT_EULA=Y`).

```bash
chmod +x setup-sql.sh
sudo ./setup-sql.sh --accept-eula
```

Faz: edition Express, limite de memória 2048 MB, escuta só em `127.0.0.1` (se não subir assim, reverte e fica protegido só pelo NSG), banco `bridgit_db`, login `bridgit_app` (db_owner) e backup diário às 03:30 UTC em `/var/backups/bridgit` (últimos 3). É idempotente. O backup fica no mesmo disco: copie de tempos em tempos para fora (`scp`).

## 6. Segredos e `/etc/bridgit/api.env`

Gere os segredos (na VM ou no seu computador) e guarde-os em um cofre/gerenciador de senhas:

```bash
openssl rand -base64 48   # APP_JWT_SECRET
openssl rand -base64 32   # APP_INTEGRATION_TOKEN_KEY_B64 (trocar depois invalida tokens de provedores salvos)
```

```bash
sudo install -o root -g bridgit -m 0640 /tmp/bridgit-vm/api.env.example /etc/bridgit/api.env
sudoedit /etc/bridgit/api.env
```

Preencha `SPRING_DATASOURCE_PASSWORD` (a senha do `bridgit_app`), `APP_JWT_SECRET`, `APP_INTEGRATION_TOKEN_KEY_B64`, `APP_FRONTEND_BASE_URL` e `APP_CORS_ALLOWED_ORIGINS` (`https://app.bridgit-cloud.duckdns.org`) e, quando tiver, os client id/secret dos três provedores. As redirect URIs já estão preenchidas.

## 7. Primeiro deploy da API

Gere o jar (`services/api/target/api-1.0.0.jar`) e envie:

```bash
scp services/api/target/api-1.0.0.jar azureuser@<IP>:/tmp/api-manual.jar
ssh azureuser@<IP>
sudo -u deploy /opt/bridgit/deploy-api.sh /tmp/api-manual.jar abcdef1
sudo systemctl enable bridgit-api   # para subir sozinha após reboot
curl -s http://127.0.0.1:8080/actuator/health
curl -s https://api.bridgit-cloud.duckdns.org/actuator/health
```

O script move o jar para `/opt/bridgit/releases/api-<sha>.jar`, troca o symlink `/opt/bridgit/current.jar`, reinicia, espera `UP` (até ~120 s) e, se falhar, volta à release anterior e sai com erro. Mantém as 3 mais recentes. O Flyway migra o banco na partida. Se o `<sha>` for o de um commit, use o hash curto/completo; para testes manuais qualquer hexadecimal de 7+ caracteres serve (ex.: `abcdef1`).

## 8. OAuth: redirect URIs

URIs de produção (mantenha também as de `localhost:8080` se ainda desenvolve localmente):

```
https://api.bridgit-cloud.duckdns.org/api/providers/onedrive/callback
https://api.bridgit-cloud.duckdns.org/api/providers/google-drive/callback
https://api.bridgit-cloud.duckdns.org/api/providers/dropbox/callback
```

- **OneDrive (Microsoft Entra)**: `az ad app update --id <app-id> --web-redirect-uris <lista completa>`. Atenção: o comando **substitui** a lista inteira; inclua todas as URIs que devem continuar válidas (por exemplo `http://localhost:8080/api/providers/onedrive/callback` e a de produção). Veja a atual antes: `az ad app show --id <app-id> --query web.redirectUris`.
- **Google Drive**: Google Cloud Console > APIs e serviços > Credenciais > cliente OAuth > "URIs de redirecionamento autorizados".
- **Dropbox**: App Console > seu app > Settings > "Redirect URIs" > Add.

Depois copie client id/secret para `/etc/bridgit/api.env` e `sudo systemctl restart bridgit-api`.

## 9. Variáveis do CI (GitHub)

Em Settings > Secrets and variables > Actions:

| Nome | Tipo | Valor |
|---|---|---|
| `VM_HOST` | secret | IP público da VM |
| `VM_SSH_KEY` | secret | chave **privada** do usuário `deploy` (`bridgit_deploy`) |
| `VM_KNOWN_HOSTS` | secret | `ssh-keyscan -t ed25519 <IP>` (confira a impressão digital) |
| `VITE_API_BASE_URL` | variable | `https://api.bridgit-cloud.duckdns.org` |

Os dois workflows usam SSH como `deploy`:

- `api-deploy`: envia o jar e o `deploy-api.sh` para `/tmp` e executa `deploy-api.sh /tmp/api-<sha>.jar <sha>`.
- `web-deploy`: empacota `apps/web/dist`, envia com o `deploy-web.sh` e executa `deploy-web.sh /tmp/web-<sha>.tar.gz <sha>`, que publica em `/var/www/bridgit/releases/<sha>` e troca o symlink `current` (sem reiniciar nada).

## 10. SSMS 22 via túnel SSH

O SQL Server não é exposto na internet. Abra um túnel e conecte em `localhost,1433`:

```bash
ssh -L 1433:127.0.0.1:1433 azureuser@<IP>
```

No SSMS: servidor `localhost,1433`, autenticação SQL Server, login `bridgit_app` (ou `sa`), marque "Confiar no certificado do servidor".

## 11. CloudBeaver (banco pelo navegador)

Para consultar o banco em qualquer PC, sem SSMS nem chave SSH: `https://db.bridgit-cloud.duckdns.org` (o bloco está no `Caddyfile`).

```bash
scp deploy/vm/setup-cloudbeaver.sh azureuser@<IP>:/tmp/ && ssh azureuser@<IP> 'sudo bash /tmp/setup-cloudbeaver.sh'
```

- Docker + `dbeaver/cloudbeaver` (versão fixa no script), rede do host, porta 8978 só atrás do Caddy; acesso anônimo desligado.
- Administrador `bridgit-admin`; senha: `ssh azureuser@<IP> 'sudo grep CB_ADMIN_PASSWORD /etc/bridgit/cloudbeaver.env'`.
- Conexão já cadastrada, "Bridgit (produção, somente leitura)", com o login SQL `bridgit_readonly` (`db_datareader`). Na primeira conexão, informe a senha: `ssh azureuser@<IP> 'sudo grep BRIDGIT_READONLY /etc/bridgit/sql-secrets.env'`.

## Solução de problemas

```bash
sudo journalctl -u bridgit-api -n 100 --no-pager      # logs da API (deploy também lê, grupo systemd-journal)
sudo journalctl -u bridgit-api -f                      # acompanhar
sudo systemctl status bridgit-api caddy mssql-server --no-pager
sudo journalctl -u caddy -n 50 --no-pager             # emissão do certificado / proxy
sudo journalctl -u mssql-server -n 50 --no-pager
sudo ss -ltnp | grep -E ':(80|443|8080|1433)\b'       # 8080 e 1433 só em 127.0.0.1
sudo tail -n 80 /var/log/bridgit-bootstrap.log        # cloud-init / instalação de pacotes
sudo tail -n 20 /var/log/bridgit-backup.log           # backups
```

- **API não sobe**: quase sempre `api.env` (senha do banco, `APP_JWT_SECRET` com menos de 32 bytes ou começando com `dev-only-`, chave de 32 bytes em base64) ou banco com nome diferente de `bridgit_db`.
- **HTTPS não emite**: DNS do DuckDNS ainda não aponta para o IP, ou 80/443 bloqueadas; veja `journalctl -u caddy`.
- **Estouro de memória**: a JVM usa até 1,5 GB e o SQL Server 2 GB; há 2 GB de swap.
- **Upgrade automático do SQL Server**: os repositórios Microsoft/Caddy não entram no unattended-upgrades; atualize manualmente (`sudo apt-get update && sudo apt-get install --only-upgrade mssql-server`) com backup recente.
