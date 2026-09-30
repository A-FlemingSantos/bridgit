# Hub local: funcionamento e validação

O catálogo e as operações ficam no SQL Server. A interface hidrata metadados pelo IndexedDB, recebe mudanças por fluxo autenticado com recuperação por polling e projeta operações pendentes sobre dados confirmados. As cópias de leitura ficam no dispositivo do usuário, em OPFS com fallback para blobs no IndexedDB. O disco da API recebe apenas payloads de uploads pendentes.

## Configuração

Os valores padrão mantêm as novas capacidades habilitadas. A migration Flyway V3 é aditiva; a atualização ocorre pelo fluxo normal de inicialização. Não é necessário criar outro banco. Os testes usam exclusivamente `bridgit_test`; desenvolvimento mantém `bridgit_db`.

| Variável | Uso |
|---|---|
| `APP_HUB_CATALOG_ENABLED` | Servir listagens e detalhes pelo catálogo. |
| `APP_HUB_OPERATIONS_ENABLED` | Aceitar escritas pelo journal durável. Desativar não descarta operações aceitas. |
| `APP_HUB_WORKER_ENABLED` | Executar sincronização, operações e renovação de notificações. |
| `APP_HUB_CONTENT_CACHE_ENABLED` | Emitir descritores que permitem reutilização de conteúdo no navegador. |
| `APP_HUB_DIRECT_READ_ENABLED` | Permitir leitura direta original do OneDrive, com fallback para proxy. |
| `APP_HUB_WEBHOOK_BASE_URL` | URL HTTPS pública da API. Sem ela, a sincronização incremental usa polling. |
| `APP_HUB_UPLOAD_DIRECTORY` | Diretório persistente e privado dos envios aceitos, separado do cache do navegador. |

`app.hub.disabled-providers` permite desabilitar as capacidades novas para provedores específicos. As quotas de upload são configuráveis por `app.hub.upload-global-bytes` e `app.hub.upload-user-bytes` (5 GiB e 500 MiB por padrão). O worker aceita até quatro conexões simultâneas e coordena escritas por conexão.

Para Dropbox, cadastrar `/api/webhooks/dropbox` no console do aplicativo. Microsoft e Google registram/renovam suas notificações quando a URL HTTPS está configurada. O backend valida as notificações antes de agendar sincronização. Falhas de notificação preservam o polling.

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

BUG-027, BUG-028 e BUG-029 foram tratados no código. BUG-030 permanece aberto para preservar a restrição de não alterar layout ou estilos. Nenhum deploy faz parte desta entrega.

Os testes manuais nas contas reais, a avaliação visual e a medição das metas p95/80% permanecem com o usuário. Os resultados automatizados não representam uma medição de latência dos provedores reais ou da futura hospedagem.
