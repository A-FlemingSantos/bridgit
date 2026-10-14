# Fase 3 — findings e correções

**Projeto:** Bridgit  
**Revisão original:** `feat/phase-3-hub` @ `75f547d`  
**Correções:** branch `cursor/phase-3-findings-fixes-8468` — [PR #4](https://github.com/a-flemingsantos/bridgit/pull/4), mergeado em 27/09/2026 (`428a0b4`)  
**Status:** as 25 findings foram corrigidas. Testes: API 207/207, web 107/107, shared-client 17/17. Ainda não houve E2E com as contas reais.

## 1. Findings e correções

| ID | Prioridade | Finding | Correção |
| --- | --- | --- | --- |
| F01 | P1 | Cursor do OneDrive permitia requisições arbitrárias com o token do provedor | O cursor passou a ser selado pelo servidor (HMAC), com validade e vínculo à conexão e à pasta. O `nextLink` do Graph é validado (https, host exato, caminho permitido) e as chamadas autenticadas não seguem redirects. Cursor inválido retorna 400 sem nenhuma chamada de rede. |
| F02 | P1 | Uploads passavam `InputStream` a um contrato HTTP que não o serializava | O corpo agora é enviado por streaming a partir de uma fonte reabrível, com `Content-Length`. O retry após 401 reenvia o conteúdo completo. Testado byte a byte nos três provedores, nos dois lados de 4 MiB e 5 MiB. |
| F03 | P1 | HTTP `invalid_grant` não ativava o fluxo de reconexão | O corpo de erro do endpoint de token é interpretado: `invalid_grant` vira reconexão necessária; `invalid_client` vira erro de configuração; 429/5xx viram falha transitória. `RECONEXAO_NECESSARIA` é gravado em transação própria e sobrevive ao rollback do chamador. |
| F04 | P2 | Busca do Google Drive usava a máscara de campos de um arquivo numa listagem | A busca usa a máscara de lista `files(...)`. As constantes de máscara de item e de lista foram separadas. |
| F05 | P2 | Escrita pela home transformava um cache parcial em listagem completa | Uma pasta com itens otimistas continua marcada como não carregada. Ao visitá-la, a listagem real é buscada e reconciliada por identidade, sem perder os itens pendentes. |
| F06 | P2 | Referências de pasta pai e raiz não tinham contrato uniforme | A raiz canônica é `parentRef: null` nos três provedores, e o campo `parentKnown` indica pai desconhecido. No web, a chave da raiz é única e exclusão/movimentação reconciliam todas as listagens que contêm o item. |
| F07 | P2 | Falha parcial de upload removia da interface os envios que já tinham dado certo | Cada arquivo é uma operação independente e os sucessos permanecem. O resultado parcial vem em `HubUploadError`. O retry reenvia só os arquivos rejeitados explicitamente; falhas ambíguas são reconciliadas, sem reenvio. |
| F08 | P2 | Rollback por snapshot global sobrescrevia operações concorrentes | O rollback é por operação e só reverte se o valor atual ainda for o otimista daquela operação. |
| F09 | P2 | Cache sem expiração, revalidação ou invalidação entre abas | Validade por tipo de dado, dado antigo exibido enquanto revalida em segundo plano, revalidação ao focar a aba, limpeza ao desconectar, atualização dos recentes, invalidação entre abas via `BroadcastChannel` e descarte de respostas atrasadas por geração. |
| F10 | P2 | Busca ocultava falhas dos provedores sem resultados | A apresentação é montada a partir do status de cada provedor consultado: diferencia nenhum resultado, resultado parcial e falha de busca, com opção de tentar novamente. |
| F11 | P2 | Ancestrais do Google Drive incluíam o próprio item | A ancestralidade começa no pai e exclui o item e a raiz nos três provedores. Itens vindos da listagem buscam os detalhes em segundo plano. |
| F12 | P2 | Picker de movimentação ignorava as páginas adicionais | O picker ganhou "Carregar mais", carrega páginas sozinho enquanto não encontra pastas e trata erro de continuação com retry. "Pasta vazia" só aparece depois de a listagem acabar. |
| F13 | P2 | Falha ao carregar o destino podia selecionar a raiz por engano | O destino é derivado da navegação. "Escolher" só fica habilitado com o destino validado e nunca cai silenciosamente para a raiz. |
| F14 | P2 | Ticket de download expirava durante a leitura sem ser renovado | "Baixar" pede um ticket novo a cada clique. O ticket expõe `expiresAt` e, vencido, responde 410. O leitor renova sozinho uma vez uma fonte vencida e ignora respostas de um arquivo anterior. |
| F15 | P2 | PDF e mídia não propagavam falhas ao leitor | Os leitores reportam erro de carregamento e de renderização. O loader para, aparece a mensagem com "Tentar novamente" e o download continua disponível; cancelamentos não contam como erro. |
| F16 | P2 | Proxy de conteúdo não suportava intervalos de bytes | `Range` de intervalo único ponta a ponta: 206 com `Content-Range`, 416 quando o intervalo é inválido, e `Accept-Ranges` só quando o provedor atende. Variantes de conversão não anunciam suporte a intervalos. |
| F17 | P2 | Download público segurava uma transação SQL durante a transferência | O link é resolvido numa transação curta, o conteúdo é transmitido fora de transação e o último acesso é registrado em outra transação curta. |
| F18 | P2 | Erros do provedor eram mal classificados e podiam encerrar a sessão do hub | Erros de domínio por provedor: não encontrado, conflito, permissão, limite (inclusive cota do Drive) e indisponível. HTTP 401 ficou reservado para a sessão do hub, e o web só faz logout com os códigos de sessão. O retry foi centralizado. |
| F19 | P2 | Timeout por Future acumulava espera e não substituía limites HTTP | A busca tem um prazo global único, os clientes HTTP têm timeouts de conexão e leitura, e não há retry automático em 429. |
| F20 | P2 | Animação de entrada criava atraso proporcional ao tamanho da lista | Só os 12 primeiros itens são animados, com atraso máximo de 0,35 s. Os demais aparecem imediatamente e a animação respeita a preferência de movimento reduzido. |
| F21 | P2 | Refresh concorrente não era coordenado por conexão | Um único refresh por conexão por vez, com geração verificada antes de gravar e de publicar no cache. O retry após 401 foi separado da troca de conexão, e resultados obsoletos não são salvos. |
| F22 | P2 | A limpeza de link inválido era desfeita pela própria exceção | A limpeza é commitada em transação própria, apenas em casos definitivos (item ou conexão inexistente). Falhas transitórias não apagam o link. |
| F23 | P2 | Sucesso na nuvem seguido de falha SQL era apresentado como falha total | A atualização dos snapshots locais roda isolada, com uma nova tentativa. Se falhar, a resposta é 200 com `X-Bridgit-Local-Sync: pending`. No web, falha ambígua reconcilia com o servidor em vez de fazer rollback. |
| F24 | P2 | Tela de provedores engolia falhas de conectar e desconectar | O erro de cada ação aparece junto ao provedor afetado e é limpo na nova tentativa; o estado pendente sempre termina. |
| F25 | P2 | Requisições repetidas de paginação anexavam a mesma página mais de uma vez | Estado de carregamento da próxima página, continuação compartilhada, deduplicação por identidade e descarte de páginas de uma listagem antiga. Cursor recusado recarrega a pasta desde a primeira página. |

## 2. Leitura e edição de arquivos de código

A hipótese de que o projeto não lê arquivos de código precisa ser refinada. **Existe leitura real básica de texto; não existe ainda uma experiência própria de leitura/edição de código.**

### 2.1 O que existe

O backend reconhece extensões como `.py`, `.js`, `.jsx`, `.ts`, `.java` e muitas outras como texto. Para os arquivos elegíveis, o cliente obtém os bytes por `fetch` e renderiza um `<pre>`, escapado pelo React. Isso é conteúdo real, não seed do mock.

Evidências: [services/api/src/main/java/com/bridgit/api/providers/ReadPlanSupport.java](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/providers/ReadPlanSupport.java:10>), [apps/web/src/shared/components/FileReader/TextReader.jsx](<C:/Users/Arthur Fleming/bridgit/apps/web/src/shared/components/FileReader/TextReader.jsx:13>).

### 2.2 Limitações atuais

| Aspecto | Evidência e consequência |
| --- | --- |
| Apresentação | [CSS do leitor](<C:/Users/Arthur Fleming/bridgit/apps/web/src/shared/components/FileReader/FileReader.module.css:37>) limita o painel a 720 px. O bloco de texto usa `var(--type)`, `pre-wrap` e quebra em qualquer posição, sem uma configuração dedicada a código. |
| Navegação no conteúdo | O [TextReader](<C:/Users/Arthur Fleming/bridgit/apps/web/src/shared/components/FileReader/TextReader.jsx:43>) não oferece números de linha, busca própria, destaque de sintaxe ou navegação por posição. |
| Codificação | O leitor força `TextDecoder('utf-8', { fatal: false })`. Outras codificações podem produzir caracteres substituídos sem explicar o motivo. |
| Arquivos grandes | O backend recusa leitura textual quando o tamanho conhecido passa de 2 MiB. O frontend tem uma mensagem de truncamento, mas só corta depois de baixar o `arrayBuffer` inteiro. Logo, essa proteção do frontend não limita o tráfego nem o pico de memória quando o tamanho é desconhecido/incorreto. |
| Nomes sem extensão | A allowlist contém `dockerfile`, mas [extensionFromName](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/providers/CloudItemSupport.java:14>) depende de um ponto. Um arquivo chamado apenas `Dockerfile`, com MIME genérico, não se beneficia dessa entrada. |
| Edição | [CloudProviderClient.update](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/providers/CloudProviderClient.java:27>) recebe somente nome e pasta pai. Não há contrato de gravação de conteúdo nem controle de conflito por versão. |

Estas limitações de produto não foram todas classificadas como regressões. O critério de conclusão da fase 3 pede exploração, operações de metadados, preview e download; não exige um editor completo. A edição é uma evolução útil, mas precisa de contrato backend, não apenas um componente visual.

### 2.3 Evolução recomendada

1. **Concluir a leitura confiável.** Fonte monoespaçada, layout mais amplo, opção de quebrar linhas, rolagem horizontal, busca, números de linha e indicação de tamanho/codificação. Não interpretar HTML/JavaScript do arquivo como conteúdo executável.
2. **Definir limite de leitura coerente.** Ou oferecer preview realmente limitado em bytes, ou explicar que o arquivo excede o limite. Evitar baixar todo o arquivo para só então truncar. Diferenciar formato não suportado, arquivo grande e erro de acesso.
3. **Separar visualização de edição.** Modo de leitura deve permanecer simples e utilizável também em links públicos. Editar exige sessão e permissão de escrita; o visitante de um link público não recebe essa permissão.
4. **Criar contrato de atualização de conteúdo.** Operação explícita, conteúdo, tamanho, tipo e versão esperada. Os adaptadores devem preservar a identidade do arquivo quando o provedor permite. Upload de um novo arquivo não é automaticamente equivalente a salvar uma revisão.
5. **Detectar conflito.** Obter versão/revisão/ETag disponível no provedor, comparar antes de salvar e informar quando o arquivo mudou externamente. Não sobrescrever silenciosamente a edição feita em outra aplicação.
6. **Modelar estado local.** Alterações não salvas, confirmação de saída, erro de salvamento, tentativa novamente e resultado ambíguo. “Salvo” só depois da confirmação remota.
7. **Selecionar a biblioteca depois dos requisitos.** O investimento inicial deve ser no contrato e na experiência desejada; instalar um editor por si só não resolve versões, permissões, codificação e recuperação.

**Aceitação mínima sugerida:** abrir um arquivo real dos três provedores, preservar bytes/codificação conforme o contrato, editar e salvar mantendo identidade, detectar alteração externa e não perder o texto local se o provedor falhar.

## 3. Desempenho, cache e pré-carregamento

A implementação apresenta dois extremos ao mesmo tempo: **mantém listas antigas por tempo indefinido dentro de uma aba e repete trabalho ao abrir arquivos em novas abas.** Aumentar o cache sem corrigir identidade, completude e invalidação amplificaria F05–F09.

### 3.1 Onde o tempo é gasto no fluxo atual

Um caminho típico de abertura em nova aba é:

```text
Clique no arquivo
  → nova instância da aplicação
  → resolução/refresh da sessão
  → provedores + atalhos + metadados do item
  → preparação da leitura + registro de recente + ticket de download
  → GET do conteúdo
  → nova consulta de metadados + abertura/conversão no provedor
  → transferência e renderização
```

Nem todas essas operações são sequenciais: existem chamadas em paralelo. Ainda assim, o conteúdo depende da resolução do item e da preparação da leitura, além do boot da aplicação.

Evidências: [abertura em nova aba](<C:/Users/Arthur Fleming/bridgit/apps/web/src/features/spaces/pages/SpaceBrowsePage.jsx:239>), [preparação da página](<C:/Users/Arthur Fleming/bridgit/apps/web/src/features/spaces/pages/SpaceFilePage.jsx:28>), [obtenção de item](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/files/ProviderFileService.java:62>), [preparação da leitura](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/files/ProviderFileService.java:147>), [abertura de conteúdo](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/files/ProviderFileService.java:187>), [registro de recente](<C:/Users/Arthur Fleming/bridgit/services/api/src/main/java/com/bridgit/api/hub/HubService.java:68>).

No Graph, a ancestralidade busca a raiz e volta a consultar o item antes de percorrer seus pais. Drive também consulta a raiz/ancestrais. Listar uma pasta e construir seu contexto adiciona consultas remotas além da listagem. Não há cache de metadados equivalente no backend que evite essas repetições dentro desse fluxo. Isso é uma leitura estrutural do código; a revisão não mediu latência real de cada provedor.

### 3.2 Política de cache proposta

| Camada/dado | Estratégia sugerida | Invalidação e limites |
| --- | --- | --- |
| Conexões e capacidades | Cache curto, identidade explícita da conexão e estado de reconexão. | Invalidar ao conectar/desconectar/reconectar e ao detectar erro de credencial. |
| Listagem de pasta | Exibir a última página conhecida imediatamente e revalidar ao ficar obsoleta. Guardar cursor, completude e geração da consulta. | Criar/mover/excluir invalida as pastas envolvidas. Limitar memória por quantidade/uso. |
| Item | Entidade normalizada por conexão + ref, com versão e completude dos campos. | Alteração remota/local e troca da conexão. Não considerar um item de listagem como detalhes completos com ancestralidade. |
| Raiz e ancestrais | Reutilizar metadados por conexão, com validade e correção após mover/renomear pastas. | Mudança de árvore deve invalidar caminhos dependentes ou forçar revalidação. |
| Recentes e atalhos | Atualizar a própria ação e revalidar no foco/retorno quando houver indicação de mudança. | Eventos entre abas, exclusão e desconexão. |
| Conteúdo pequeno | Avaliar cache efêmero e limitado, associado à versão do arquivo. | Invalidar por mudança de versão; limpar ao encerrar acesso/trocar conexão. |
| Conteúdo grande | Streaming, intervalos e carregamento progressivo. | Evitar pré-download completo e duplicação permanente de blobs. |
| Tickets | Tratar como credenciais temporárias, não como URLs permanentes de cache. | Renovar no momento necessário; nunca reutilizar indefinidamente nem compartilhar entre usuários. |

Não há um TTL único correto para todos os dados. Os valores devem ser escolhidos por medição, tipo de dado e tolerância a desatualização. O primeiro ganho é representar os estados corretamente, não fixar um número arbitrário de segundos.

### 3.3 Pré-carregamento que faz sentido

- Pré-buscar **metadados** de destinos prováveis quando o usuário demonstra intenção de navegação, com debounce/cancelamento.
- Considerar primeira página da raiz de conexões visíveis, de forma limitada e após o trabalho essencial da home.
- Reutilizar metadados já recebidos para iniciar a tela do item, enquanto completa/revalida os campos necessários.
- Pré-carregar conteúdo apenas para arquivos pequenos e intenção clara, com orçamento de bytes e concorrência.
- Interromper ou ignorar respostas de operações abandonadas e deduplicar consultas idênticas em andamento.
- Evitar pré-carregar a árvore inteira ou os bytes de todos os arquivos. Isso aumenta custo, concorrência e chance de throttling sem garantir uso.

Se a abertura em nova aba for mantida como decisão de produto, priorizar cache backend e comunicação de invalidação entre abas. Se o leitor puder ser uma rota da mesma aplicação, os metadados em memória passam a ser reutilizáveis diretamente. A escolha deve ser de experiência, não um efeito incidental do uso de `target="_blank"`.

### 3.4 Instrumentação antes de otimizar

Medir separadamente:

- clique → início da navegação;
- boot/refresh da sessão;
- consulta ao banco;
- obtenção/reutilização do token;
- chamadas de metadados por provedor;
- conversão Office/exportação;
- primeiro byte e transferência;
- primeira página/imagem/texto utilizável;
- atraso de animação e renderização;
- cache hit, revalidação, chamadas deduplicadas e requisições abandonadas.

Comparar p50/p95 em primeira visita, revisita, nova aba, árvore profunda, pasta paginada e conexão degradada. Não registrar access tokens, refresh tokens, tickets completos ou URLs temporárias sensíveis na telemetria.

## 4. Evolução da arquitetura sem refazer o projeto

### 4.1 Contratos dos adaptadores

Formalizar e testar os mesmos conceitos nos três adaptadores:

- identidade estável do item e da conexão;
- representação da raiz e de pai desconhecido;
- ancestralidade excluindo item atual e raiz;
- paginação e validade do cursor;
- capacidade de leitura, exportação, edição e intervalos;
- versão/revisão remota;
- erro de domínio e possibilidade de retry;
- política de conflito de nomes;
- distinção entre metadados básicos e completos.

O contrato comum deve acomodar diferenças reais. Por exemplo, “conteúdo original” de um documento nativo Google é uma exportação, enquanto um arquivo binário pode ser transferido diretamente. Esconder essa diferença completamente dificulta edição e sincronização futuras.

### 4.2 Estado do frontend

O [HubDataProvider](<C:/Users/Arthur Fleming/bridgit/apps/web/src/shared/hub/HubDataProvider.jsx:30>) concentra consultas, cache, buscas, conexões, operações otimistas e reconciliação. Isso torna os invariantes difíceis de preservar.

Uma evolução incremental seria separar consultas/listagens, entidades normalizadas e operações em andamento. Definir explicitamente:

- não carregado, parcialmente conhecido, carregando, carregado, obsoleto e erro;
- estado confirmado versus alterações otimistas;
- erro de revalidação com dados antigos disponíveis versus ausência de dados;
- identidade estável de renderização versus identidade remota;
- geração da consulta, evitando que resposta antiga sobrescreva estado novo.

Essa divisão não exige uma reescrita integral. Corrigir os invariantes e extrair unidades testáveis já reduz a fragilidade, mesmo sem adotar uma biblioteca nova.

### 4.3 Escritas e recuperação

Separar “o provedor rejeitou”, “o provedor confirmou” e “o resultado remoto é desconhecido”. Timeout de rede depois do envio não prova que nada aconteceu. A interface e a API precisam preservar essa distinção para evitar duplicação e falsos rollbacks.

Antes de Spaces, definir idempotência, versão esperada, identificação da operação, registro de resultado e reconciliação. A sincronização deve reutilizar adaptadores confiáveis, sem se basear em nomes ou em snapshots locais como autoridade.

MCP também amplifica erros: um agente pode repetir rapidamente operações e interpretar resposta de falha como autorização para nova tentativa. É melhor estabilizar as garantias do hub antes de expor essas ações a clientes automatizados.

### 4.4 Banco e conexões externas

Manter transações curtas, sem aguardar transferências longas. Coordenar renovação por conexão e invalidar tokens em trânsito após mudanças de vínculo. Metadados derivados podem ser reconciliados; uma confirmação remota não pode ser “desfeita” apenas no banco ou no React.

Revisar tratamento de erro e observabilidade com códigos estáveis. A mensagem amigável para o usuário pode ser curta, enquanto um identificador de correlação permite diagnosticar a etapa que falhou sem revelar credenciais.

## 5. Cobertura: o que os testes atuais não demonstram

O principal problema não é a quantidade de testes. É a distância entre os fakes e os contratos dos adaptadores reais.

Evidências:

- [services/api/src/test/java/com/bridgit/api/providers/drive/GoogleDriveProviderClientTest.java](<C:/Users/Arthur Fleming/bridgit/services/api/src/test/java/com/bridgit/api/providers/drive/GoogleDriveProviderClientTest.java:24>) testa listagem da raiz e plano de leitura, mas não cobre o field mask da busca nem ancestralidade e upload.
- [services/api/src/test/java/com/bridgit/api/providers/dropbox/DropboxProviderClientTest.java](<C:/Users/Arthur Fleming/bridgit/services/api/src/test/java/com/bridgit/api/providers/dropbox/DropboxProviderClientTest.java:24>) testa listagem/continuação, sem exercer a serialização do upload.
- [services/api/src/test/java/com/bridgit/api/integrations/ProviderApiIntegrationTest.java](<C:/Users/Arthur Fleming/bridgit/services/api/src/test/java/com/bridgit/api/integrations/ProviderApiIntegrationTest.java:282>) injeta diretamente a exceção de reconexão esperada, pulando a resposta HTTP problemática.
- [apps/web/src/shared/hub/hubHooks.test.jsx](<C:/Users/Arthur Fleming/bridgit/apps/web/src/shared/hub/hubHooks.test.jsx:110>) cobre rollback simples e sucesso de upload, mas não os cenários de sucesso parcial e concorrência descritos neste relatório.
- [apps/web/src/shared/components/FileReader/FileReader.test.jsx](<C:/Users/Arthur Fleming/bridgit/apps/web/src/shared/components/FileReader/FileReader.test.jsx:6>) substitui pdfjs por mock; a suíte não valida integralmente layout real, mídia e falhas de carregamento/renderização.

### Matriz de regressão recomendada

| Área | Casos essenciais | Achados |
| --- | --- | --- |
| Segurança de cursor | Destino permitido, cursor adulterado, host externo/local, vínculo incorreto. | F01 |
| Uploads concretos | Comparação byte a byte, caminhos por tamanho, stream repetido/fechado, falha parcial. | F02, F07 |
| OAuth e credenciais | HTTP invalid_grant, transitórios, refresh concorrente, desconexão durante refresh. | F03, F18, F21 |
| Busca | Field mask, parcial, todos falham, prazo global, consulta abandonada. | F04, F10, F19 |
| Identidade e navegação | Raiz/subpasta em cada provedor, ancestrais, pai desconhecido. | F06, F11 |
| Cache | Escrita antes da primeira visita, obsolescência, desconexão, resposta tardia. | F05, F09 |
| Otimismo | Duas operações com ordem controlada de sucesso/falha, sem sobrescrever a outra. | F07, F08 |
| Picker | Mais de uma página, página inicial sem pastas, erro de destino sem fallback para raiz. | F12, F13 |
| Conteúdo | Ticket expirado, PDF inválido, mídia com erro, ranges, cancelamento. | F14, F15, F16 |
| Links/transações | Cliente lento, item ausente, limpeza persistente, falha após sucesso remoto. | F17, F22, F23 |
| UI | Erro de ação visível, animação limitada, paginação repetida. | F20, F24, F25 |

Depois desses testes determinísticos, realizar E2E nas três contas com um conjunto pequeno de arquivos descartáveis: texto, código, PDF, imagem, mídia, documento nativo/conversível e pasta com paginação. O E2E deve incluir criar, enviar, renomear, mover, excluir, ler, baixar, criar/revogar link, desconectar e reconectar. Testes destrutivos devem usar somente esse conjunto controlado, nunca arquivos pessoais existentes.

## 6. Sequência sugerida de trabalho

| Etapa | Objetivo | Resultado verificável |
| --- | --- | --- |
| 1 | Corrigir F01–F03 e contratos diretos dos adaptadores, incluindo F04/F11/F18. | Destinos HTTP controlados, uploads corretos e recuperação de credenciais previsível. |
| 2 | Corrigir identidade, completude de cache e resultados de operações. | F05–F09/F23 cobertos; sucesso remoto não desaparece por rollback incorreto. |
| 3 | Estabilizar navegação, busca, picker e paginação. | F10/F12/F13/F19/F24/F25 cobertos em cenários de falha e páginas adicionais. |
| 4 | Tornar leitura/download recuperáveis. | F14–F17/F22 cobertos, sem loader infinito ou transação presa à rede do visitante. |
| 5 | Medir e reduzir latência percebida. | Corrigir F20, reduzir consultas redundantes, adicionar revalidação e prefetch limitado. |
| 6 | Evoluir leitura de código e, depois, edição versionada. | Experiência apropriada e salvamento com conflito explícito. |
| 7 | Validar base para Spaces/MCP. | Adaptadores com versões, resultados consistentes, idempotência e recuperação. |

Não é necessário tratar cada linha como um PR separado. Algumas correções compartilham contratos e devem ser desenhadas juntas, sobretudo F05/F06/F08/F09 e F03/F18/F21. O importante é manter o escopo verificável e evitar uma grande reescrita sem testes de comportamento.

## 7. Decisões que vale preservar e limites de escopo

- Adaptadores separados por provedor e serviços de domínio distintos são uma base útil.
- Refresh tokens cifrados com AES-GCM e IV aleatório são uma decisão adequada a preservar.
- Tickets de conteúdo separados conceitualmente do JWT de sessão evitam expor diretamente a credencial do hub ao leitor de mídia.
- O banco guarda metadados, sem transformar o hub em uma terceira cópia permanente dos arquivos.
- O conteúdo textual é renderizado como texto pelo React, sem executar o HTML/JavaScript do arquivo.
- A proteção de datasource diferencia banco de aplicação e banco de testes.
- Spaces permanecer mock é compatível com a fase 3. Não foi contado como defeito a sincronização ainda não existir.
- Mobile, deploy, infraestrutura de produção e MCP não foram exigidos como correções deste MVP.

O documento de arquitetura contém o plano original de preview nativo e um registro posterior de implementação com pdfjs/conversões. A diferença foi tratada como contexto da implementação atual, não como motivo automático para reprovar o projeto. O problema concreto é a confiabilidade e a experiência do caminho escolhido.

## 8. Referências externas de contrato

- [Google Drive — seleção de campos](https://developers.google.com/workspace/drive/api/guides/fields-parameter): máscara de campos e erro de seleção inválida.
- [Google Drive — files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list): envelope de listagem e paginação.
- [Spring Framework — REST clients](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html): serialização de corpos e clientes REST. A exceção de F02 foi verificada também na versão instalada do projeto.
- [Dropbox — tratamento de erros](https://docs.dropboxapi.com/dropbox-api/docs/error-handling): códigos HTTP e erros específicos de endpoint.

As referências externas apoiam os contratos dos provedores/frameworks. As conclusões sobre o Bridgit decorrem dos arquivos e fluxos citados em cada achado.
