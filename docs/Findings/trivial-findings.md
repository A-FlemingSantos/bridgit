# Trivial findings

Base: `Knowledge/99-lacunas-e-bugs.md`, escrito em 2026-10-06 a partir da leitura do código, sem nada executado. Em 2026-10-13 cada item foi conferido de novo contra o código atual. Quase todos procedem. Os que procedem só em parte estão com a ressalva no texto, e os que deixaram de valer estão no fim, em "Não procedem mais".

Itens marcados com ✅ foram resolvidos; a branch de cada correção está no histórico do git e na PR correspondente.

O arquivo tem três partes:

1. **Riscos antes do deploy:** segurança, perda de dados e erros que confundem o usuário. Explicados com mais detalhe.
2. **Dívidas de arquitetura:** coisas que funcionam, mas limitam o sistema ou tornam mudanças caras.
3. **Itens pontuais, por área:** em tabela, porque cada um se resolve num lugar só.

Os achados dos testes manuais de 2026-10-13 estão em `Findings.md`.

---

## Parte 1 — Riscos antes do deploy

### Segredo JWT de desenvolvimento como padrão

> ✅ **Resolvido** (`fix/seguranca`). Não há mais segredo padrão: a API não sobe sem `APP_JWT_SECRET`, com menos de 32 bytes ou com chave `dev-only-`. Os tickets de conteúdo usam uma chave derivada.

### Login sem proteção contra força bruta

> ✅ **Resolvido** (`fix/seguranca`; endereço real no `deploy/azure`). 5 falhas por usuário ou 20 por endereço em 15 minutos dão 429 `MUITAS_TENTATIVAS`; usuário inexistente leva o mesmo tempo que senha errada; excluir a conta pede a senha. Atrás do Caddy, a API lê o `X-Forwarded-For` (`SERVER_FORWARD_HEADERS_STRATEGY=native`).

### Falha de banco vira "sessão inválida"

> ✅ **Resolvido** (`fix/seguranca`). A falha vai para o log e a resposta é 500 `ERRO_INTERNO`, não 401.

### Tabelas que só crescem

> ✅ **Resolvido** (`fix/catalogo-e-eventos`). O `RetentionService` apaga de hora em hora eventos com mais de 7 dias, sessões encerradas há mais de 30 dias e estados OAuth usados há mais de 24 horas.

### OAuth: tentativa gasta antes da troca do código

> ✅ **Resolvido** (`fix/seguranca`). O state é liberado em falha passageira (`OAUTH_TROCA_TEMPORARIA`), toda falha vai para o log, e provedor mal configurado vira `PROVEDOR_NAO_CONFIGURADO`.

### Reconectar com outra conta apaga dados sem aviso

> ✅ **Resolvido** (`fix/seguranca`). Conta diferente responde `OAUTH_CONTA_DIFERENTE` sem apagar nada; web e mobile pedem confirmação antes de trocar.

### Links públicos revelam ou escondem mais do que deviam

> ✅ **Resolvido** (`fix/seguranca`). O visitante recebe 404 `LINK_NAO_ENCONTRADO` para o que não deve saber, 503 `LINK_INDISPONIVEL` em falha passageira e 429 `MUITOS_ACESSOS` acima de 60 acessos por minuto.

### Erros que viram mensagens erradas

> ✅ **Resolvido** (`fix/contrato-de-erros`). Valor repetido vira 409 `CONFLITO_DADOS`; 405, parâmetro, parte ou cabeçalho ausente, tipo de mídia e rota inexistente têm respostas próprias.

---

## Parte 2 — Dívidas de arquitetura

### `HubDataProvider` concentra o web inteiro

O `HubDataProvider.jsx` tem cerca de 1.970 linhas (eram 1.670 em 13/10). Concentra cache, eventos, operações duráveis, reconciliação e as ações de escrita, com blocos de renomear, mover e excluir repetidos. O efeito de eventos, a retomada por `listOperations` e o reconciliador não têm testes. As operações duráveis vivem só em memória. Qualquer mudança nos fluxos de escrita do web passa por esse arquivo, o que encarece e arrisca cada ajuste.

### Dois caminhos atualizam as mesmas tabelas

`CatalogStore`, por JDBC com collation binária, e `HubItemEventListener`, por JPA com a collation padrão, atualizam `hub_recents`, `hub_shortcuts` e `public_links` quando um item muda. Os dois diferem em detalhes: nome saneado, tamanho só em links, `updated_at`. Uma correção feita num caminho não chega ao outro.

### Travas e caches que só valem dentro de uma instância

A trava `ConnectionWork`, o conjunto `running` do `CatalogWorker`, o `active` do `OperationWorker` e o cache de access tokens do `ProviderConnectionService` são estruturas em memória. Com mais de uma instância da API, cada uma tem as suas. O lease no banco evita trabalho duplicado no catálogo, e a troca de refresh token é protegida por comparação no banco. Mesmo assim, o sistema não foi pensado para várias instâncias. O deploy previsto (uma VM) não é afetado.

`OperationService.upload` também é `synchronized` para a JVM inteira. Todos os uploads de todos os usuários passam em fila, incluindo a cópia do arquivo para o disco.

### Operações: estados como texto e "final" com dois significados

Os estados das operações são strings espalhadas em Java e SQL, sem enum. `View.terminal()` considera `NEEDS_ATTENTION` final, mas `OperationStore.pending` não, e `retry` ainda pode reenfileirar. Cada cliente pode interpretar de um jeito. Hoje o web mantém essas operações na projeção para sempre, e o mobile as mostra como erro.

Ainda nas operações:
- O caminho antigo (`runLegacy`) executa a operação dentro da requisição HTTP.
- A verificação de um upload ambíguo compara só o tamanho do arquivo.
- Vários valores estão fixos no código: 15 min de verificação, 5 min de reserva, 4 tentativas, 4 threads, lotes de 20 e 100, histórico de 24 h e 200 itens, backoff máximo de 300 s.

### Pacotes `integrations` e `catalog` dependem um do outro

`integrations` usa `LocalHubProperties` (do `catalog`, injetado com `required = false`) para decidir `operationsEnabled`, e o `catalog` usa repositórios de `integrations`. A dependência é cíclica. Se o bean faltar, as operações duráveis somem em silêncio.

### Carga fixa por usuário e por conexão

- Cada stream SSE aberto consulta o banco uma vez por segundo e reconecta a cada 25 s.
- O SSE ignora `Last-Event-ID` e só lê `after`.
- `ProviderWatchService.renew` percorre todas as conexões de todos os usuários a cada minuto.
- `renew` engole `RuntimeException` sem log.

Escala mal com o número de usuários, e a falta de log esconde problemas de inscrição nos provedores.

### Spaces ainda são simulados

Spaces (pares de sincronização) existem só no `localStorage` do navegador (`bridgit.hub.v3`), sem separação por usuário e sem validação ou migração do formato. Sincronizar, pausar e conflitos são simulados. Várias telas do web leem esse estado simulado: breadcrumb de reserva, `SpaceComposer`, aba Sincronização. É a maior parte "de fachada" do produto.

---

## Parte 3 — Itens pontuais, por área

### Contrato HTTP e shared-client

| Tipo | Finding | Onde |
|---|---|---|
| bug | ✅ Resposta 200 sem `data` devolve `undefined` em silêncio; `success` não é conferido | `apiClient.js` `apiRequest` |
| lacuna | ✅ Abort e falha de rede viram o mesmo `ERRO_CONEXAO`; o erro original é descartado (sem `cause`) | `apiRequest` |
| lacuna | ✅ No modo blob, um erro descarta a mensagem do servidor (`ERRO_DOWNLOAD`) | `apiRequest` |
| bug | ✅ `uploadFile` lança o erro de 50 MB de forma síncrona; as outras funções rejeitam a promise | `hub.js` |
| inconsistência | ✅ Raiz enviada de três formas: `null` em `createFolder`, `''` em `uploadFile` e `updateItem`, omitida em `listFolder` | `hub.js` |
| lacuna | ✅ `submitUploadOperation` não confere tamanho nem envia `Idempotency-Key` | `operations.js` |
| risco | ✅ `baseUrl` com barra no fim gera `//api` | `buildApiUrl` |
| morto | ✅ `createApiClient` não é usado | `apiClient.js` |
| lacuna | ✅ Sem testes para `apiClient.js` e `operations.js` | shared-client |
| inconsistência | ✅ Dois formatos de 401: o entry point escreve JSON à mão, sem envelope | `SecurityConfiguration` |
| inconsistência | ✅ Limite de 50 MB repetido em 8 lugares (handler, `application.yml`, `OperationService`, `UploadPayloadStore`, shared-client, `hubApi.js`, `hubErrorMessage.js`, mobile `useItemActions.js`) | vários |

### Banco de dados

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | `JwtAuthenticationFilter` usa `OffsetDateTime.now()` e `BaseEntity` usa `OffsetDateTime.now(UTC)`, e não o `Clock` injetado (✅ o filtro passou a usar o `Clock` em `fix/seguranca`; `BaseEntity` continua) | `JwtAuthenticationFilter`, `BaseEntity` |
| risco | `DatasourceSafetyGuard` só confere o nome do banco, não o host, e não roda em `@SpringBootTest` | `DatasourceSafetyGuard` |
| morto | ✅ `app.time.zone-id` não tem consumidor | `application.yml` |
| lacuna | ✅ Propriedades usadas mas ausentes do `application.yml` (todas com padrão no código): `app.search.budget-ms`, `app.hub.upload-cleanup-poll-ms`, `worker-poll-ms`, `watch-poll-ms`, `operation-poll-ms`, `upload-global-bytes`, `upload-user-bytes`, `disabled-providers` | `application.yml` |

### Autenticação, contas e sessões

| Tipo | Finding | Onde |
|---|---|---|
| inconsistência | Regras de nome e senha em vários lugares: records, `UsernameRules`, `validatePassword` copiado em `AuthService` e `AccountService`; a chave em minúsculas é recalculada inline em três lugares | auth, account |
| inconsistência | `SENHA_ATUAL_INVALIDA` é 400; credencial errada no login é 401 (mantido de propósito; ver "Não procedem mais") | `AccountService` |
| lacuna | Após renomear, os tokens das outras sessões mantêm o nome antigo no claim `username`. O servidor ignora o claim; só importa se um cliente decodificar o JWT | `AccountService` |
| lacuna | O filtro faz duas consultas e, às vezes, uma escrita por requisição | `JwtAuthenticationFilter` |
| lacuna | Não há rota para revogar uma sessão específica (o repositório já tem `revokeOne`) | `AuthController` |
| morto | ✅ `GET /api/account` sem uso nos clientes | `AccountController` |
| bug | ✅ `HUB_SESSION_FAILURE_CODES` não inclui `SESSAO_REVOGADA` nem `USUARIO_INVALIDO`; uma sessão revogada não desloga pela camada de dados do web | `shared/hub/hubCache.js` |
| risco | Web: no boot, um erro que não seja 401 usa a sessão guardada sem confirmar (mantido de propósito; ver "Não procedem mais") | `SessionContext.jsx` |
| lacuna | Web: sem refresh periódico; sessões com "lembrar" só percebem a expiração por 401 | `SessionContext.jsx` |
| bug | ✅ Web: na aba Segurança, um único `error` aparece só no cartão de senha; o rótulo "Encerradas" nunca volta; a sessão atual não é destacada | `SecurityTab.jsx` |
| bug | ✅ Web: o campo de nome não acompanha mudanças feitas em outra aba | `AccountTab.jsx` |
| lacuna | Web: "Esqueceu?" sem ação; sem validação local de tamanho de nome e senha; usuário logado não é redirecionado ao abrir `/login` ou `/`; cadastro sempre cria sessão sem "lembrar" | `AuthPage.jsx`, `authApi.js` |
| lacuna | Mobile: `expiresAt` guardado e nunca usado (a sessão mobile não expira por regra); sem refresh explícito ao voltar ao primeiro plano (ao voltar, recarrega os provedores e um 401 ali desloga); telas autenticadas aparecem por um instante antes de um 401 | `sessionManager.js`, `HubContext.js` |
| inconsistência | ✅ Mobile encerra a sessão em qualquer 401; o web distingue códigos | `HubContext.js`, `hooks.js` |
| risco | Mobile no navegador guarda o token em localStorage | `secureStorage.js` |
| inconsistência | ✅ Mobile "Sobre" diz versão 0.1; `app.config.js` diz 1.0.0 | `useSettings.js` |
| morto | ✅ Mobile: `AuthScreen` recebe `navigation` e não usa | `AuthScreen.js` |

### Conexão com provedores

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | OneDrive: desconectar não revoga o acesso na Microsoft | `MicrosoftOAuthClient.revoke` |
| bug | ✅ Google: a URL de revogação concatena o token sem codificar | `GoogleOAuthClient.revoke` |
| risco | Dropbox sem PKCE (intencional: o Dropbox recusa PKCE para apps confidenciais) | `DropboxOAuthClient` |
| morto | ✅ `ProviderConnectionRepository.deleteByUserIdAndProvider` | repositório |
| lacuna | Escopos concedidos são gravados, mas não conferidos | `ProviderConnectionService` |
| lacuna | Só há nova tentativa após 401; sem espera e repetição para 429 e 5xx | `ProviderRetryService` |
| risco | Prefixos de redirect do mobile comparados com `startsWith`; `bridgit://` aceita qualquer caminho | `ProviderConnectionService` |
| risco | Expo Go: sem `exp://` em `APP_MOBILE_REDIRECT_PREFIXES`, o destino do app é descartado em silêncio | configuração |
| lacuna | ✅ Web: `OAUTH_CODE_AUSENTE` sem mensagem própria | `ProvidersTab.OAUTH_ERROR_MESSAGES` |
| bug | ✅ Web: o efeito do aviso de retorno roda de novo após o próprio `navigate`; o aviso não some | `ProvidersTab.jsx` |

### Camada de provedores (comum)

| Tipo | Finding | Onde |
|---|---|---|
| bug | JSON montado à mão com `escapeJson` que não escapa caracteres de controle; nome com quebra de linha gera JSON inválido (✅ no Google Drive em `fix/google-drive`; Graph e Dropbox continuam) | Graph, Drive, chamadas `rpc` do Dropbox |
| risco | `ref` concatenado em URLs sem codificação (✅ no Google Drive em `fix/google-drive`; Graph continua) | Graph, Drive |
| inconsistência | ✅ Todo 413 vira `CONVERSAO_GRANDE_DEMAIS`, inclusive em upload | `ProviderHttpSupport` |
| risco | ✅ `isNameConflict` decide por substring, inclusive "conflict" | `ProviderHttpSupport` |
| lacuna | ✅ `parseRetryAfter` ignora `Retry-After` em formato de data | `ProviderHttpSupport` |
| risco | Respostas JSON lidas inteiras, sem limite (`readTree`) | Graph, Drive, Dropbox |
| morto | `CursorCodec`; mecanismo de sobrescrita por `@Order` em `CloudProviderClients` usado só em testes (✅ `CursorCodec` removido; o mecanismo de `@Order` continua) | providers |
| inconsistência | `CloudItem.provider` é string; o resto usa o enum | `CloudItem` |
| lacuna | Sem testes para `CloudProviderClients`, `ContentStreamResponder` e `CloudItemSupport`; `sync/` e `CloudChange` só com cobertura indireta | testes |

### OneDrive

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | Só `/me/drive`; sem SharePoint, outros drives ou compartilhados comigo | `GraphProviderClient` |
| lacuna | ID da raiz buscado a cada `get`, `ancestry` e `update`; `ancestry` faz N+2 chamadas | `GraphProviderClient` |
| lacuna | Busca sem paginação | `GraphProviderClient` |
| lacuna | Upload em sessão sem retomada | `GraphProviderClient` |
| inconsistência | `PUT` simples sem `conflictBehavior` substitui arquivo de mesmo nome; pasta e sessão renomeiam | `GraphProviderClient` |
| morto | ✅ Sobrecarga `authorizedDelete(accessToken, url)`; `DELTA_SELECT` é só um alias | `GraphProviderClient` |
| lacuna | Validade da inscrição fixa em 2 dias (com `Instant.now()`); qualquer falha de renovação zera a inscrição e volta ao polling, sem log | `GraphProviderClient`, `ProviderWatchService` |
| bug | ✅ Data inválida em `parseDateTime` lança `DateTimeParseException` sem mapeamento | `GraphProviderClient` |
| lacuna | Sem testes para update e move simples, createFolder e paginação da busca | testes |

### Google Drive

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | Sem escrita condicional; `expectedVersion` é ignorado (ver o finding de versão no arquivo dos testes de 13/10) (✅ em `fix/google-drive` a versão que o `OperationWorker` compara antes de escrever passou a ser confiável; o Drive continua sem escrita condicional atômica) | `GoogleDriveProviderClient` |
| lacuna | ✅ Só o primeiro pai é considerado; mover remove só o primeiro pai. Provável bug extra: itens na raiz têm pai `null`, então mover a partir da raiz não remove o pai antigo | `GoogleDriveProviderClient` |
| lacuna | ✅ ID da raiz não é guardado; cada listagem da raiz e cada `get` fazem uma chamada extra | `GoogleDriveProviderClient` |
| lacuna | Upload resumable feito num único `PUT`, sem retomada (fica aberto: com o limite de 50 MB a retomada ajuda pouco) | `GoogleDriveProviderClient` |
| lacuna | Busca só por nome, sem paginação, sem validar consulta vazia (✅ pagina e ignora consulta vazia em `fix/google-drive`; continua só por nome) | `GoogleDriveProviderClient` |
| inconsistência | ✅ Inventário com `corpora=user`; feed e canal cobrem drives compartilhados | `GoogleDriveProviderClient` |
| inconsistência | `incompleteSearch` só é conferido no inventário (✅ em `fix/google-drive` a busca também confere e registra no log; a resposta ainda não diz ao cliente que é parcial) | `GoogleDriveProviderClient` |
| lacuna | ✅ Atalhos do Drive e Formulários tratados como arquivo comum | `ReadPlanSupport` |
| risco | ✅ `ancestry` sem limite de profundidade nem proteção contra ciclo | `GoogleDriveProviderClient` |
| lacuna | ✅ Limite de exportação (403 `exportSizeLimitExceeded`) vira `SEM_PERMISSAO` | `ProviderHttpSupport` |
| lacuna | ✅ Sem testes para update, move e delete (o 403 é testado só em `ProviderHttpSupportTest`) | testes |

### Dropbox

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | Sem upload em sessões; arquivos acima de 150 MB falhariam (hoje bloqueados antes, pelo limite de 50 MB) | `DropboxProviderClient` |
| lacuna | Sem upload em modo `update` nem precondição por `rev`; a escrita condicional verifica e depois escreve, sem atomicidade | `DropboxProviderClient` |
| risco | `autorename: true` em criar, enviar e mover esconde conflitos de nome | `DropboxProviderClient` |
| lacuna | Busca sem continuação | `DropboxProviderClient` |
| lacuna | MIME deduzido por extensão, com 10 tipos | `DropboxProviderClient` |
| lacuna | `get_metadata` repetido para pais e ancestrais, sem cache | `DropboxProviderClient` |
| risco | ✅ Erros 409 classificados por substring; `insufficient_space` e `malformed_path` caem em `PROVEDOR_FALHOU` | `ProviderHttpSupport` |
| lacuna | ✅ `Retry-After` enviado no corpo JSON não é lido | `ProviderHttpSupport` |
| bug | ✅ `client_modified` inválido lança `DateTimeParseException` sem mapeamento | `DropboxProviderClient` |
| inconsistência | `mapUnknownParent` usa tamanho 0 onde os outros mapeadores usam `null` | `DropboxProviderClient` |
| lacuna | Sem testes para update, move, delete e `updateConditional` (só `deleteConditional` e o range de `get_preview`) | testes |

### Catálogo local

| Tipo | Finding | Onde |
|---|---|---|
| morto | ✅ `renew` consulta `watch_expires` duas vezes; a segunda é redundante (uma linha por conexão) | `ProviderWatchService` |
| lacuna | Sem testes para `ProviderWebhooksController`, `ProviderWatchService`, `CatalogWorker.sync` e a rota `/head`; o stream SSE só tem teste de autenticação | testes |

### Operações duráveis

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | Sem testes para `OperationsController` (só a leitura da parte `request`, de 13/10), `retry`, dependências, `WAITING_RECONNECT`, 429, cotas e `UploadCleanupService` (só indireto) | testes |
| lacuna | Mobile não lista nem repete operações; `WAITING_RECONNECT` e `NEEDS_ATTENTION` viram erro sem retomada; o app acompanha ~60 s e depois só diz que "continua em andamento" | `apps/mobile/src/hub/operations.js` |

### Leitura de conteúdo

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | `createDownloadTicket` não confere se o item existe | `ProviderFileService` |
| morto | ✅ `ContentController` valida o ticket duas vezes | `ContentController` |
| risco | Tickets não podem ser revogados; a reconexão os invalida pela generation, exceto no caminho de reserva sem generation | `ContentTicketService` |
| lacuna | Web `PdfReader`: sem ajuste de densidade de pixels, zoom, busca ou seleção de texto; falhas além da primeira página ignoradas; sem cancelar renderização; PDF com senha dá erro genérico | `PdfReader.jsx` |
| lacuna | `ProgressivePdfTransport` sem nova tentativa | web |
| lacuna | Web `TextReader` só decodifica UTF-8; texto truncado em 2 MB sem como ver o resto | `TextReader.jsx` |
| lacuna | Vídeo e áudio sem cache e sem renovação própria de ticket | `MediaReader.jsx` |
| inconsistência | `FileReader` (em `shared`) importa `FileSheet` de `features/spaces` | `FileReader.jsx` |
| bug | IndexedDB: `onblocked` é tratado como falha e desliga a persistência até recarregar a página | `storage/idb.js` |
| lacuna | Mobile: PDF, vídeo e áudio abrem fora do app (agora pelo "Abrir com…"; leitor de PDF embutido em decisão); texto sem nova tentativa após erro; `useFile` sem `reload` | `FileViewer.js`, `hooks.js` |
| inconsistência | ✅ Rótulo padrão do `Spinner` compartilhado é "Carregando arquivo" | `Spinner.jsx` |

### Dados no cliente

| Tipo | Finding | Onde |
|---|---|---|
| bug | `hubEvents.js` usa `/api/hub/events/stream` relativo com `fetch`, ignorando `baseUrl` | `hubEvents.js` |
| risco | `safeCopy` remove qualquer campo cujo nome contenha "url" ou "token", e qualquer valor que comece com http(s) ou blob | `storage/catalog.js` |
| morto | ✅ `invalidateMessage` | `hubChannel.js` |
| morto | ✅ Parâmetro `parentRef` ignorado em `deleteItem` | `HubDataProvider.jsx` |
| bug | ✅ Mobile: `useResource` sem cancelamento; uma resposta atrasada pode sobrescrever a mais nova | `apps/mobile/src/hub/hooks.js` |
| lacuna | Mobile: pasta limitada a 20 páginas, sem aviso | `hooks.js` |
| lacuna | ✅ Mobile: Home e Folder sem indicador de carregamento | telas |
| risco | ✅ Mobile: cada evento ou escrita recarrega todas as telas e os provedores | `HubContext.js`, `hooks.js` |
| lacuna | Mobile: sem mover; atalhos e links fora da fila de operações. ✅ Desligar link público: pela lista de links do painel lateral; em `feat/public-links` o menu de arquivo e de pasta cria o link e abre o compartilhar | `useItemActions.js`, `HubContext.js` |
| inconsistência | Mobile: Home usa `PROVIDER_LABELS` fixo; Folder usa a lista da API | `HomeScreen.js` |
| lacuna | Mobile: "Notificar falhas" é guardado e nada o lê | `useSettings.js` |
| inconsistência | Mobile: `useSettings` repete o listener de `AppState` do `HubContext` | `useSettings.js` |

### Recentes, atalhos e busca

| Tipo | Finding | Onde |
|---|---|---|
| risco | `listRecents` e `listShortcuts` fazem uma consulta por item para achar o provedor (N+1) | `HubService` |
| risco | `trimRecents` carrega todos os recentes do usuário a cada inclusão | `HubService` |
| lacuna | Executor da busca nunca é encerrado (threads virtuais; impacto baixo) | `SearchService` |
| inconsistência | Busca responde 200 mesmo com todos os provedores falhando (mantido de propósito; ver "Não procedem mais") | `SearchService` |
| bug | ✅ `ReconnectionRequiredException` na busca vira `PROVEDOR_FALHOU`, e não `RECONEXAO_NECESSARIA` | `SearchService` |
| lacuna | Busca não usa o catálogo | `SearchService` |
| lacuna | `LocalSyncFlag` só funciona em thread de requisição; o header só sai nas rotas antigas de escrita | `LocalSyncFlag` |
| morto | ✅ Web: filtro local de atalhos e recentes durante a busca nunca aparece; `features/home/data/mock.js` sem uso | `HomePage.jsx` |
| lacuna | Web: sem testes da exibição de recentes e atalhos na Home | testes |
| lacuna | Mobile sem busca | mobile |

### Links públicos

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | Sem expiração, sem senha, sem revogar todos (✅ listar os links existe) | `PublicLinkOwnerController` |
| bug | Slug não muda ao renomear o arquivo; nomes só com caracteres não latinos viram "arquivo". Em `feat/public-links` o endereço (`/p/<apelido>-<codigo>`) é fixado na criação e não muda ao renomear, de propósito. Continua aberto: nome sem caracteres latinos ainda vira "arquivo" ou "pasta" | `LinkSlug` |
| lacuna | Referências de item com barra codificada (`%2F`) são rejeitadas pelo firewall do servidor, nas rotas do dono e nas públicas | firewall padrão do Spring Security |
| morto | ✅ `accessToken` em `ResolvedPublicLink` e `PublicLinkContext` não é usado no stream (e ainda pode disparar um refresh de token) | `PublicLinkService` |
| bug | ✅ Web: ativar e desativar link sem proteção contra componente desmontado | `PublicLinkOverlay` |

### Spaces e shell web

| Tipo | Finding | Onde |
|---|---|---|
| bug | ✅ Dado inicial com ID malformado em `providerContents['google-drive']` | `hubStore.js` |
| bug | Breadcrumb de reserva lê o store simulado e mostra só "Pasta", "Arquivo", "Provedor" para itens reais | `SpaceViewHeader.jsx` |
| bug | `SpaceComposer` usa a lista simulada de provedores; "Espelhar" num arquivo passa o arquivo como origem | `SpaceComposer.jsx`, `entryActions.js` |
| lacuna | Itens de menu sem ação: "Editar PDF", "Pedir assinaturas", "Assinar" | `SpaceBrowsePage.jsx`, `SpaceViewActions.jsx` |
| lacuna | ✅ `NameOverlay` no modo "criar arquivo" fecha sem criar nada (hoje há o menu "Criar ou Enviar" e o overlay "Novo arquivo") | `HubOverlays.jsx` |
| lacuna | ✅ Sem rota 404; boot sem indicador (tela em branco) | `App.jsx` |
| bug | ✅ `AppHeader` usa `'arthur'` como nome padrão; o avatar sempre mostra "A" | `AppHeader.jsx` |
| lacuna | `AppOverlay` sem focus trap; menus sem navegação por setas | `AppOverlay.jsx`, menus |
| risco | `placeOverflowMenu` estima a altura do menu; diverge se o CSS mudar | `placeOverflowMenu.js` |
| lacuna | Privacidade e Termos são placeholders; aba Sobre diz "Versão 0.1 · mock" (✅ a aba Sobre mostra a versão real; Privacidade e Termos continuam) | `App.jsx`, `AboutTab.jsx` |
| lacuna | O proxy do Vite remove `Origin` sem explicação; não há definição de como produção serve `/api` | `vite.config.js` |
| morto | ✅ `isScrollingRef` em `useCustomScrollbar` | `useCustomScrollbar.js` |

### App mobile e UI

| Tipo | Finding | Onde |
|---|---|---|
| morto | ✅ `WelcomeScreen` não está registrada na navegação; seus botões não fazem nada | `WelcomeScreen.js` |
| morto | ✅ `CardFileSheet` e `normalizeThemePreference` | `FileSheet.js`, `tokens.js` |
| lacuna | Tema só segue o sistema; sem escolha no app | `ThemeProvider.js` |
| inconsistência | Cores escuras fixas fora dos tokens (`SuspendedMenu`, `FileSheet`, `HomeHeader`); tokens de tipografia sem uso | componentes |
| bug | ✅ `CreateFab` calcula o tempo de fechamento para 5 itens | `CreateFab.js` |
| bug | Provedor selecionado no `HomeHeader` fica só no estado local | `HomeHeader.js` |
| lacuna | Sem deep linking além do retorno do OAuth | navegação |
| risco | Build de release sem `EXPO_PUBLIC_API_BASE_URL` usa `localhost` (em dev, o app usa o IP do host do Expo) | `api/config.js` |

### Execução local

| Tipo | Finding | Onde |
|---|---|---|
| lacuna | ✅ Scripts de desenvolvimento só para Windows/PowerShell; o único caminho com Docker é `bridgit-db-up.sh`, do ambiente de nuvem | `scripts/` |
| lacuna | ✅ Scripts PowerShell não criam o banco; checagem com host e porta fixos | `scripts/powershell` |
| inconsistência | ✅ `start-shared-backend.ps1` e `start-mobile-web-backend.ps1` só diferem no rótulo | `scripts/powershell` |
| bug | ✅ `.env.example` sugere `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080`, que tem prioridade sobre o IP do Expo e quebra no Android; nenhum script lê `.env` | `.env.example` |
| lacuna | ✅ `.husky/pre-commit` vazio; `lint-staged` instalado sem configuração | raiz |
| lacuna | ✅ Sem script na raiz para a API; versões de Java e Maven não documentadas | raiz |
| lacuna | ✅ Modo dev-client não tratado pelos scripts | `scripts/powershell` |

---

## Não procedem mais

| Finding original | Situação em 2026-10-13 |
|---|---|
| `assets/providers/dropbox.svg` (web) tem 0 bytes | O arquivo tem 408 bytes |
| Mobile: `atSign` sem uso | Usado na `AuthScreen` |
| `SENHA_ATUAL_INVALIDA` é 400; credencial errada no login é 401 | Mantido de propósito em `fix/contrato-de-erros`: 401 é reservado para sessão, e os clientes deslogam com ele. Uma senha atual errada não encerra a sessão. |
| Web: no boot, um erro que não seja 401 usa a sessão guardada sem confirmar | Comportamento intencional: com a API fora do ar ou um 500 (inclusive falha de banco, que em `fix/seguranca` deixou de virar 401), o web mantém a sessão e revalida depois. Só 401 de sessão desloga. |
| Busca responde 200 mesmo com todos os provedores falhando | Contrato da F10: a resposta traz o status de cada provedor e o web monta a mensagem (nenhum resultado, parcial ou falha). Desde `fix/contrato-de-erros`, reconexão aparece como `RECONEXAO_NECESSARIA`. |
