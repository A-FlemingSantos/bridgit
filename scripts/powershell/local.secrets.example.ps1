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

# Chave AES-256 (32 bytes) em Base64 para criptografar refresh tokens de integracao.
# Gerar no PowerShell: [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
# $env:APP_INTEGRATION_TOKEN_KEY_B64 = 'sua_chave_base64_de_32_bytes'

# Credenciais OAuth por provedor (opcionais para desenvolvimento local basico).
# $env:APP_ONEDRIVE_CLIENT_ID = 'seu_client_id_microsoft'
# $env:APP_ONEDRIVE_CLIENT_SECRET = 'seu_client_secret_microsoft'
# $env:APP_ONEDRIVE_REDIRECT_URI = 'http://localhost:8080/api/providers/onedrive/callback'

# $env:APP_GOOGLE_DRIVE_CLIENT_ID = 'seu_client_id_google'
# $env:APP_GOOGLE_DRIVE_CLIENT_SECRET = 'seu_client_secret_google'
# $env:APP_GOOGLE_DRIVE_REDIRECT_URI = 'http://localhost:8080/api/providers/google-drive/callback'

# $env:APP_DROPBOX_CLIENT_ID = 'sua_app_key_dropbox'
# $env:APP_DROPBOX_CLIENT_SECRET = 'seu_app_secret_dropbox'
# $env:APP_DROPBOX_REDIRECT_URI = 'http://localhost:8080/api/providers/dropbox/callback'
