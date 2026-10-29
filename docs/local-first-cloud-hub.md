# Hub local: funcionamento e validação

O catálogo e as operações ficam no SQL Server. A interface hidrata metadados pelo IndexedDB, recebe mudanças por fluxo autenticado com recuperação por polling e projeta operações pendentes sobre dados confirmados. As cópias de leitura ficam no dispositivo do usuário, em OPFS com fallback para blobs no IndexedDB. O disco da API recebe apenas payloads de uploads pendentes.

## Configuração

Os valores padrão mantêm as novas capacidades habilitadas. A migration Flyway V3 é aditiva; a atualização ocorre pelo fluxo normal de inicialização. Não é necessário criar outro banco. Os testes usam exclusivamente `bridgit_test`; desenvolvimento mantém `bridgit_db`.

A migration V4 adiciona cascatas de exclusão por usuário para operações/eventos e uma fila persistente de limpeza de uploads. Ela também remove registros órfãos anteriores, preservando seus caminhos na fila. A exclusão de conta remove os registros e tenta apagar os arquivos logo após o commit. Se o disco impedir a remoção, a conta continua excluída e a limpeza é retomada automaticamente, independente de `APP_HUB_WORKER_ENABLED`. O intervalo é `app.hub.upload-cleanup-poll-ms` (5 segundos por padrão). O diretório de uploads deve ser persistente e compartilhado por processos que usam o mesmo banco, como já exigido pelo executor de uploads.

As migrations seguintes: V5 política de sessão, V6/V12 troca de conta no OAuth (criada e depois removida), V7 índices de retenção, V8 apelido e pastas nos links públicos, V9 reconstrução dos catálogos do Dropbox, V10 várias contas por provedor e V11 avatares das contas.

Com operações duráveis habilitadas para o provedor, as cinco rotas de escrita (`POST /folders`, `POST /files`, `POST /items/{ref}/content`, `PATCH /items/{ref}`, `DELETE /items/{ref}`) exigem o header `Idempotency-Key`, não vazio e com até 100 caracteres. Sem ele, retornam 400 antes de aceitar a operação. Repetições da mesma ação devem manter a chave e os dados, inclusive após 503; outra ação, ainda que idêntica, deve usar outra chave. Reutilizar a chave com dados diferentes retorna 409. As respostas de sucesso preservam o formato anterior. Se o diário estiver desabilitado, permanece o caminho síncrono anterior, sem as garantias de idempotência do diário.

O cliente compartilhado envia a chave e aceita `{ clientKey }` como último argumento das escritas para retries explícitos. O wrapper web preserva a chave das chamadas antigas após falha de rede ou 5xx e a libera após sucesso ou rejeição definitiva. Esse fallback mantém a chave durante a vida da instância; quem retoma uma chamada antiga após reiniciar deve persistir e reenviar a chave. O fluxo moderno mantém seu diário de intenções existente.

| Variável | Uso |
|---|---|
| `APP_HUB_CATALOG_ENABLED` | Servir listagens e detalhes pelo catálogo. |
| `APP_HUB_OPERATIONS_ENABLED` | Aceitar escritas pelo journal durável. Desativar não descarta operações aceitas. |
| `APP_HUB_WORKER_ENABLED` | Executar sincronização, operações e renovação de notificações. |
| `APP_HUB_CONTENT_CACHE_ENABLED` | Emitir descritores que permitem reutilização de conteúdo no navegador. |
| `APP_HUB_DIRECT_READ_ENABLED` | Permitir leitura direta original do OneDrive, com fallback para proxy. |
| `APP_HUB_WEBHOOK_BASE_URL` | URL HTTPS pública da API. Sem ela, a sincronização incremental usa polling. |
| `APP_HUB_UPLOAD_DIRECTORY` | Diretório persistente e privado dos envios aceitos, separado do cache do navegador. |

Outras propriedades de `app.hub`, todas com padrão no `application.yml`: `nudge-seconds` (5; adianta o sync das conexões em uso, hoje só enquanto o stream de eventos está aberto), `worker-poll-ms` (2000), `watch-poll-ms` (60000), `operation-poll-ms` (500) e `retention.*` (apaga de hora em hora eventos com mais de 7 dias, sessões encerradas há mais de 30 dias e estados OAuth com mais de 24 h).

`app.hub.disabled-providers` permite desabilitar as capacidades novas para provedores específicos. As quotas de upload são configuráveis por `app.hub.upload-global-bytes` e `app.hub.upload-user-bytes` (5 GiB e 500 MiB por padrão). O worker aceita até quatro conexões simultâneas e coordena escritas por conexão.

Para Dropbox, cadastrar `/api/webhooks/dropbox` no console do aplicativo. Microsoft e Google registram/renovam suas notificações quando a URL HTTPS está configurada. O backend valida as notificações antes de agendar sincronização. Falhas de notificação preservam o polling.

## Várias contas por provedor

Um usuário pode conectar mais de uma conta do mesmo provedor; a mesma conta remota entra uma vez só (índice único em `user_id, provider, account_id`, V10). Conectar outra conta acrescenta uma conexão em vez de substituir a existente. As rotas usam `connectionId` no caminho; as rotas antigas por `provider` continuam e resolvem para a conexão mais antiga (`ConnectionScope`). Cada conexão tem avatar, buscado sob demanda no provedor e servido pela API (`provider_connection_avatars`, V11). Web e mobile mostram as contas na sidebar/painel lateral e em "Minhas contas" nos ajustes.

## Salvar conteúdo de arquivos de texto

`POST /api/.../items/{ref}/content` (multipart `file` + `expectedVersion`) sobrescreve o conteúdo preservando a identidade do item. Só vale para texto editável (`ReadPlanSupport.isEditableText`: leitura textual, até 2 MiB e com revisão de conteúdo conhecida). Sem `expectedVersion` responde 400 `VERSAO_OBRIGATORIA`; versão diferente da atual, 409 `ARQUIVO_ALTERADO`; arquivo não editável, 409 `EDICAO_INDISPONIVEL`. Passa pelo diário de operações como `REPLACE_CONTENT` e exige `Idempotency-Key`. O editor do web salva sozinho; ver `markdown-editor.md` para o modo markdown.

## Garantias e limites

- Checkpoints e páginas de sincronização são aplicados juntos. Reconstrução conserva a última geração válida.
- IDs estáveis e gerações separam contas; logout e desconexão invalidam armazenamento local.
- Mutações têm chave idempotente e estado recuperável. Resultado remoto desconhecido leva a verificação, nunca a repetição cega de criação.
- Google usa IDs pré-gerados. Outros provedores não oferecem as mesmas garantias atômicas; uma operação ambígua pode exigir verificação pelo usuário.
- O upload só é aceito de forma durável depois de confirmar tamanho, checksum e gravação dos bytes. Depois disso, não depende da aba aberta.
- Reutilização de leitura exige revisão forte e autorização recente. Conteúdo incompleto ou cuja revisão mudou não é publicado no cache.
- O navegador pode remover seus dados por pressão de armazenamento. A leitura deve continuar pela rede quando a persistência não estiver disponível.
- Até 50 MiB por arquivo em cache, com orçamento local de até 512 MiB ou 20% da quota. Prefetch é limitado a 5 MiB por arquivo e 10 MiB por minuto de uso ativo.
- Arquivos grandes e formatos sem revisão/tamanho confiáveis continuam pelo transporte existente. Exportações sem tamanho conhecido não entram no cache completo.

## Executar localmente

Requisitos:

- Node 24 ou mais novo e npm 11 ou mais novo (`engines` do `package.json` da raiz). Depois de clonar, `npm install` na raiz.
- Java 21 (`java.version` do `services/api/pom.xml`) e Maven 3.9 ou mais novo, ambos no `PATH`.
- SQL Server com o banco `bridgit_db`. No Windows, uma instância local em `localhost:1433`. No Linux e no macOS, Docker: o `db-up.sh` sobe o contêiner.
- `SPRING_DATASOURCE_PASSWORD` (senha do `sa`) e `APP_JWT_SECRET` (chave HMAC de pelo menos 32 bytes) sempre definidas. Para conectar provedores, também `APP_INTEGRATION_TOKEN_KEY_B64` e as credenciais OAuth de cada um. O modelo está em `.env.example`.

Scripts bash (Linux e macOS), em `scripts/dev/`. Eles leem o `.env` da raiz (copie de `.env.example`); variáveis já definidas no processo têm prioridade. Maven, Vite e Expo chamados direto, como em `npm run api`, não leem o `.env`: exporte as variáveis no terminal.

| Script | O que faz |
|---|---|
| `bash scripts/dev/db-up.sh` | Sobe o SQL Server em Docker (contêiner `mssql`, porta 1433) e cria `bridgit_db` e `bridgit_test`. Se o contêiner já existe parado, só o religa. |
| `bash scripts/dev/api.sh [--shared] [--expo-go]` | Confere as variáveis e o banco (cria `bridgit_db` se faltar) e roda `mvn spring-boot:run`. `--shared` libera no CORS o Expo web (porta 8081); `--expo-go` acrescenta `exp://` aos redirecionamentos móveis. |
| `bash scripts/dev/web.sh` | Vite dev server do web (`npm run dev`). |
| `bash scripts/dev/mobile.sh [--dev-client] [--android] [--web] [--port N]` | Metro do app mobile. Por padrão usa o Expo Go na porta 8082; `--dev-client` usa o development build; `--web` roda no navegador (porta 8081). |

Scripts PowerShell (Windows), em `scripts/powershell/`. Copie `local.secrets.example.ps1` para `local.secrets.ps1` e preencha os segredos. Os scripts do backend conferem o SQL Server e criam o banco se ele não existir; `-DatabaseHost`, `-DatabasePort` e `-DatabaseName` mudam o destino (padrão `localhost`, `1433`, `bridgit_db`).

| Script | O que faz |
|---|---|
| `start-web-backend.ps1` | API para o web (CORS do `localhost:5173`). |
| `start-shared-backend.ps1` | API para o web e para o mobile no navegador (CORS também da porta 8081). |
| `start-mobile-android-backend.ps1` | API para o Android no Expo Go (aceita `exp://` nos redirecionamentos). |
| `start-web-frontend.ps1` | Web (`npm run dev`). |
| `start-mobile-android-expo.ps1 [-DevClient]` | Metro para Android; `-DevClient` usa o development build em vez do Expo Go. |
| `start-mobile-web-expo.ps1` | Mobile no navegador (`npm run mobile:web`). |

Atalhos na raiz: `npm run api` (`mvn spring-boot:run` em `services/api`) e `npm run api:test` (`mvn test`). Eles não conferem variáveis nem criam o banco.

No celular ou no emulador, o app monta o endereço da API a partir do IP que o Metro anuncia. Se o IP do PC mudar (outra rede, nova concessão do roteador), reinicie o Metro. Defina `EXPO_PUBLIC_API_BASE_URL` só em build de release ou quando a API não roda no PC do Metro: a variável tem prioridade sobre o IP do Expo, e `http://localhost:8080` quebra no Android.

Os testes de integração da API leem `SPRING_DATASOURCE_PASSWORD`. Sem ela, falham no Flyway com "Falha de logon do usuário 'sa'". No Windows, carregue `scripts/powershell/local.secrets.ps1` antes do Maven (`. .\scripts\powershell\local.secrets.ps1`). No Linux e no macOS, use `export SPRING_DATASOURCE_PASSWORD=...` no terminal.

## Verificação automatizada

```powershell
npm --workspace packages/shared-client run test:run
npm --workspace apps/web run test:run
npm run build
# Com SPRING_DATASOURCE_PASSWORD configurada no processo:
cd services/api
mvn test
```

Os testes cobrem os adaptadores com respostas controladas, catálogo SQL, cursores, reconstrução, idempotência, resultado ambíguo, isolamento de usuário, IndexedDB, cache autorizado e transportes dos leitores. Não criam bancos ou logins. A suíte de integração limpa dados do banco de testes existente, como já fazia antes desta mudança.

O deploy no Azure (uma VM com API, SQL Server Express e Caddy) está descrito em `deploy/README.md`; este documento trata só do hub.

Os testes manuais nas contas reais, a avaliação visual e a medição das metas p95/80% permanecem com o usuário. Os resultados automatizados não representam uma medição de latência dos provedores reais ou da futura hospedagem.
