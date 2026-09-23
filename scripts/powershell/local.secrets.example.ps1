# Copie este arquivo para local.secrets.ps1 na mesma pasta (scripts/powershell).
# O arquivo local.secrets.ps1 nao e versionado — ele ja esta no .gitignore.
#
# Variaveis de ambiente ja definidas no processo antes de executar os scripts
# tem prioridade sobre os valores deste arquivo.
#
# O start-web-backend.ps1 nao pede esses valores. Eles precisam estar aqui,
# no local.secrets.ps1, ou ja definidos no processo.

# $env:SPRING_DATASOURCE_PASSWORD = 'sua_senha_do_sql_server'
# $env:APP_JWT_SECRET = 'chave_hmac_com_pelo_menos_32_bytes'
