# Findings

Tudo o que apareceu durante os testes da tarefa "[TESTAR] Funcionalidades" e ficou para depois, porque estava fora do escopo do branch `mobile/adjustments` ou porque a correção pedia uma decisão. As seções 16 e 17 vêm da revisão da fase 3 (`Fase 3 — revisão técnica e findings.md`, de setembro) e trazem só o que continua valendo no código de hoje. O que foi corrigido no dia dos testes está no fim, em "Corrigido no dia".

Os findings estão em ordem de peso. Os primeiros mexem em arquitetura e pedem decisão; os do meio dependem de configuração ou do deploy; os últimos são pontuais.

---

## 1. Google Drive: a "versão" do arquivo não serve para detectar conflito

**Peso:** alto. Mexe no contrato de concorrência das operações, no catálogo local e no cliente do Google Drive. Afeta web e mobile.

**Status:** código resolvido em `fix/google-drive`, seguindo a opção 1. `remoteVersion` passa a ser a revisão do conteúdo (ou checksum), e `modifiedTime` nos nativos. Item na lixeira responde 404, e o `OperationWorker` trata o 404 de um DELETE como feito. O checkpoint do Drive ganhou formato `v=2`, o que força uma única reconstrução do catálogo. **Falta confirmar com a conta real**, depois do deploy da branch: renomear `Livros de Matemática.docx`, excluir algo já na lixeira e ver "PDFs" sumir.

### O que o usuário vê

Renomear ou excluir certos arquivos do Google Drive falha com "O arquivo foi alterado. Atualize e tente de novo.", sem que ninguém tenha mexido no arquivo. Atualizar a tela não resolve. O caso visto foi `Livros de Matemática.docx`, parado desde o upload. Outros arquivos, como o `package.json`, renomeiam normalmente.

Um caso parecido, com outra causa direta: excluir algo que já está na lixeira do Google Drive também dá "O arquivo foi alterado". E uma pasta excluída pelo site do Drive (a pasta "PDFs") continua aparecendo no app e no web.

### Como a checagem de conflito funciona hoje

Toda escrita (renomear, mover, excluir) leva a versão do item que o cliente conhece (`expectedVersion`). Antes de escrever, o `OperationWorker` consulta o item no provedor e compara essa versão com a atual. Se forem diferentes, recusa com `ARQUIVO_ALTERADO`. A ideia é não sobrescrever uma mudança feita em outro lugar.

O valor que o cliente conhece vem do catálogo local, alimentado pelo inventário e pelo feed de alterações de cada provedor.

- **OneDrive:** a versão é o `eTag`, e a própria Microsoft recusa a escrita se ele mudou. É uma trava real e atômica.
- **Dropbox:** a versão é o `rev`. A escrita condicional do Bridgit confere e depois escreve, sem atomicidade, mas o valor é confiável.
- **Google Drive:** a versão é o campo `version` do arquivo. A API v3 do Drive não tem escrita condicional, então só existe a checagem do `OperationWorker`.

### A causa

A referência da API do Drive descreve `version` como um número que sobe a cada mudança no servidor, inclusive as que o usuário não vê: "This reflects every change made to the file on the server, even those not visible to the user." ([Drive API v3, recurso `files`](https://developers.google.com/drive/api/reference/rest/v3/files), campo `version`).

A parte seguinte é inferência nossa, não está documentada: essas mudanças internas nem sempre aparecem no feed de alterações (`changes`). O catálogo fica com o número antigo, o app manda esse número, a consulta direta devolve um número maior, e a operação é recusada.

Evidências de 13/10:
- O log de diagnóstico, adicionado no dia, registrou `provider=google-drive ref=1vsnJA4DGCqtZIE99BPQpk_DuLkyEWHgZ expected=2 current=3`.
- O catálogo estava sincronizando normalmente, sem falhas, e continuava com `remoteVersion = 2` para esse arquivo.
- No mesmo período, o `package.json` teve a versão acompanhada a cada renomeação (3, 4, 5), porque ali as mudanças vieram do próprio Bridgit.

### A variante da lixeira

No OneDrive e no Dropbox, um item excluído responde 404. No Google Drive, um item na lixeira continua respondendo à consulta, com o campo `trashed` verdadeiro ("Whether the file has been trashed", mesma referência), e o cliente do Bridgit não olha esse campo. Isso causa dois sintomas:

- **Excluir algo que já está na lixeira:** a consulta encontra o item com versão nova e a operação é recusada como "alterado". O certo seria tratar como já excluído.
- **Item excluído reaparece no catálogo:** quando o feed avisa que um item foi removido, e esse item tinha sido mexido pelo próprio Bridgit (marcação `mutation_fence`), o `CatalogWorker` não confia no aviso e consulta o provedor para confirmar. No Drive, a consulta devolve o item da lixeira e o catálogo o marca como existente de novo. Foi o que aconteceu com a pasta "PDFs".

### Opções avaliadas

1. **Usar a revisão do conteúdo como versão no Google Drive (recomendada).** `headRevisionId` ("The ID of the file's head revision") ou `md5Checksum` ("The MD5 checksum for the content of the file"), da mesma referência. Os dois mudam quando o conteúdo muda e não acompanham as mudanças internas. A documentação não recomenda esses campos para detectar conflito; a escolha é nossa, com base na descrição deles. Segundo a referência, `headRevisionId` só existe para arquivos com conteúdo binário; nos documentos nativos do Google, que não têm revisão nem checksum, usar `modifiedTime` ("The last time the file was modified by anyone"). Uma edição do conteúdo feita por outra pessoa continua sendo detectada. Renomear e mover passam a seguir "a última escrita vale", que é como o próprio Google Drive se comporta.
2. **Não checar conflito no Google Drive.** É a mais simples e honesta, porque o Drive não oferece trava. Mas uma edição feita em outro lugar pode ser sobrescrita ou o arquivo pode ser excluído sem aviso.
3. **Montar uma versão própria** com revisão + nome + pasta. Detecta mais casos, mas é uma trava inventada pelo Bridgit, não pelo provedor. Foi descartada por isso.

### Plano para a opção 1

1. **`GoogleDriveProviderClient.remoteVersion`:** passar a devolver `headRevisionId` ou checksum, e `modifiedTime` nos nativos.
2. **`GoogleDriveProviderClient.get` (e onde mais o item é mapeado):** tratar `trashed=true` como não encontrado (404). Isso corrige a variante da lixeira e o reaparecimento no catálogo.
3. **Reconstruir o catálogo do Google Drive uma vez:** as versões guardadas hoje estão no formato antigo e, sem reconstrução, quase toda escrita no Drive daria "alterado" logo depois da mudança. O `CatalogWorker` já trata `SyncResetException` chamando `store.reset`. O caminho provável é mudar o formato do checkpoint do Drive para que o checkpoint antigo force um novo inventário; precisa ser confirmado antes.
4. **Limpar a linha antiga de "PDFs"**, se a reconstrução não resolver sozinha.
5. **Testes:** versão a partir de revisão e de `modifiedTime`, item na lixeira como 404, e reconciliação do `CatalogWorker` com item na lixeira.

A mudança de código é pequena. O trabalho está em validar a reconstrução do catálogo, que mexe na sincronização às vésperas do deploy.

### Arquivos envolvidos

- `services/api/.../providers/drive/GoogleDriveProviderClient.java` (`remoteVersion`, `get`, mapeamento de itens, checkpoint)
- `services/api/.../operations/OperationWorker.java` (checagem de `expectedVersion`)
- `services/api/.../catalog/CatalogWorker.java` (reconciliação de itens com `mutation_fence`)

---

## 2. O catálogo local esconde que o provedor precisa reconectar

**Peso:** médio. Decisão de produto e contrato entre API e clientes.

Quando o acesso a um provedor expira (por exemplo, o Google recusa o refresh token), a conexão continua existindo com `lastError = RECONEXAO_NECESSARIA`. A sincronização do catálogo para, mas as pastas continuam sendo servidas a partir da última sincronização bem-sucedida, sem nenhuma marca na resposta. Para quem usa, parece que está tudo conectado e atualizado. Uma pasta vazia na última sincronização aparece como "Nenhum arquivo aqui ainda".

No dia 13/10, mobile e web passaram a ler o `lastError` da lista de provedores e a mostrar "Acesso expirado" com um botão Reconectar. O backend continua sem avisar nada na resposta de listagem. Um cliente que não olhe a lista de provedores, ou um caso intermediário (sincronização falhando por outro motivo), segue mostrando dados velhos como se fossem atuais.

**Decisão pendente:** a resposta de listagem deveria trazer o estado do catálogo (atualizado, desatualizado, desde quando), e quem decide o que mostrar é o cliente. A estrutura `store.metadata(...)` já devolve metadados do catálogo em cada listagem e pode ser o lugar natural para isso.

---

## 3. Eventos entre aparelhos: o que avisa e o que não avisa

**Peso:** médio. Mexe no modelo de eventos e no jeito como o mobile recarrega.

O mobile e o web acompanham mudanças por eventos do servidor (`cloud_events`), lidos por polling no mobile e por SSE no web. Até 13/10, só operações (criar, renomear, excluir, enviar) e mudanças vindas dos provedores geravam eventos. No dia, atalhos e links públicos passaram a gerar `hub_entries`.

**Recentes ficaram de fora de propósito.** Abrir um arquivo registra um recente. Se isso gerasse evento, o próprio celular que abriu o arquivo receberia o evento e recarregaria todas as telas, inclusive a do arquivo aberto. A imagem ou o texto seriam baixados de novo.

A raiz é outro finding, já conhecido: no mobile, **qualquer evento recarrega todas as telas e a lista de provedores** (`HubContext` incrementa um contador global e cada tela refaz a busca). Enquanto for assim, cada evento novo aumenta o tráfego e o risco de piscar a tela.

**Caminho sugerido:**
- Fazer o mobile recarregar só o que o evento afeta, usando o tipo do evento e o provedor (`hub_entries` → Home; operação ou mudança de provedor → a pasta afetada).
- Só então passar a emitir eventos de Recentes.

---

## 4. Mensagens de erro da API sem acento e respostas 401 sem UTF-8

**Peso:** médio. Afeta todos os clientes e exige mexer em duas camadas juntas.

**Status:** resolvido em `fix/contrato-de-erros`: os 401 e 403 saem pelo mesmo envelope do handler, em UTF-8 e com timestamp ISO; todas as mensagens da API têm acento; os mapas dos clientes ficaram só com o que é local ou aponta para a interface.

Todas as mensagens do backend são escritas sem acento ("Usuario ou senha invalidos.", "Sua sessao foi encerrada."). Parece proposital: os 401 de sessão são escritos direto na resposta, pelo `JwtAuthenticationFilter` e pelo entry point da `SecurityConfiguration`, sem charset UTF-8. Com acento, esses textos chegariam corrompidos.

Os mesmos 401 também trazem o `timestamp` como número, enquanto os erros tratados pelo `GlobalExceptionHandler` trazem data ISO. São dois formatos de erro para o mesmo contrato.

O mobile contorna desde 13/10 com um mapa de código → mensagem em português (`apps/mobile/src/api/errorMessage.js`). O web tem um mapa menor (`hubErrorMessage.js`) e mostra o texto cru nos outros casos, como o login.

**Correção completa:**
- Escrever os 401 pelo mesmo caminho do `GlobalExceptionHandler`, com UTF-8 e o mesmo formato de `timestamp`.
- Acentuar as mensagens do backend.
- Simplificar os mapas dos clientes.

São cerca de 90 mensagens em mais de 20 arquivos, e alguns testes conferem textos.

---

## 5. Retorno do OAuth aponta para `localhost`

**Peso:** alto para o produto, mas é configuração e decisão, não código. Tarefa "[TESTAR] OAuth com retorno por deep link" e pendência "[DECIDIR] Pendências".

O endereço de retorno cadastrado nos provedores é `http://localhost:8080/api/providers/{provedor}/callback`. No web isso funciona, porque navegador e API estão no mesmo PC. No celular, `localhost` é o próprio aparelho. O login no Google funciona, mas o redirecionamento com o código nunca chega à API. Confirmado no banco: a tentativa ficou registrada em `provider_oauth_states` e não foi usada.

**Para destravar:**
- Um endereço HTTPS público, por ngrok ou pelo deploy no Azure, em `APP_ONEDRIVE_REDIRECT_URI`, `APP_GOOGLE_DRIVE_REDIRECT_URI` e `APP_DROPBOX_REDIRECT_URI`, cadastrado no Azure, no Google Cloud e no Dropbox.
- No Expo Go, incluir `exp://` em `APP_MOBILE_REDIRECT_PREFIXES`. Sem isso, o retorno cai na página do web sem erro.

Enquanto isso, reconectar pelo web no PC resolve, porque a conexão é da conta e não do aparelho.

---

## 6. Google: acesso expirou cerca de 8 dias depois de conectar

**Peso:** médio, configuração. Hipótese não confirmada.

A conexão do Google Drive feita em 5/10 passou a exigir reconexão em 13/10. O log da API mostrava `Catalog sync deferred ... code=RECONEXAO_NECESSARIA` repetidamente. Isso combina com a regra do Google para apps OAuth em modo **"Testing"**: um projeto nesse status "is issued a refresh token expiring in 7 days", exceto quando o app pede só escopos básicos de identidade (e-mail, perfil, OpenID), o que não é o caso do Bridgit, que pede acesso ao Drive ([Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2), seção sobre expiração de refresh tokens).

**Para confirmar e resolver:** verificar no Google Cloud Console o status de publicação da tela de consentimento. Publicar como "In production" acaba com a expiração semanal, mas pode exigir verificação do app pelo Google, dependendo dos escopos.

---

## 7. Endereço dos links públicos usa o endereço do web configurado

**Peso:** baixo agora, obrigatório no deploy.

O link público é montado com o endereço do web configurado na API, que em desenvolvimento é `localhost`. Funciona no PC, mas não em outro aparelho. Resolve-se no deploy, junto com o retorno do OAuth.

---

## 8. Web: Optimistic UI "pisca" ao criar e excluir

**Peso:** médio para a percepção do produto; causa não investigada.

Ao criar uma pasta no web, ela aparece e pisca logo depois. O formulário de criar e o de excluir também demoram a fechar depois da confirmação. O esperado de um Optimistic UI é a ação parecer instantânea: o formulário fecha na hora e o item aparece ou some na hora.

O mecanismo existe:
- O `HubDataProvider` coloca um item temporário na lista e depois o troca pelo item real.
- A lista usa uma chave estável (`uiKey`) justamente para essa troca não refazer o item na tela.

Ainda não se sabe se a piscada vem da troca do item, da recarga da pasta disparada pelo evento da operação ou da animação de entrada (`StaggerItem`). O próximo passo é reproduzir e observar qual dos três acontece.

---

## 9. Web: a página do link público não rola

**Peso:** baixo, pontual. Ao abrir um PDF longo por um link público, só o topo do arquivo aparece; a página não tem rolagem. Está na página de link público do web (`PublicLinkPage`).

**Status:** resolvido em `fix/ui-e-limpeza`: a página rola dentro da altura da tela.

---

## 10. Envio com parte ausente no formulário vira 500 e corta a conexão

**Peso:** baixo depois da correção do dia, mas o comportamento de fundo continua.

**Status:** resolvido em `fix/contrato-de-erros`: parte, parâmetro ou cabeçalho ausente responde 400 `REQUISICAO_INVALIDA` dizendo o que falta, e o Tomcat lê o resto do envio (`server.tomcat.max-swallow-size`). Conferido com um envio real de 10 MB sem a parte `request`: 400, sem conexão cortada.

Quando uma requisição multipart chega sem uma parte obrigatória, o Spring lança `MissingServletRequestPartException`. O `GlobalExceptionHandler` não trata esse caso e responde 500. Como o servidor responde antes de ler o corpo inteiro, a conexão é cortada no meio do envio do arquivo. O cliente vê "sem conexão" em vez de um erro de validação.

Foi assim que o bug do upload no mobile se apresentou em 13/10. O upload foi corrigido, mas qualquer outra parte faltando ainda cai em 500. É o mesmo finding do levantamento original sobre 405 e parâmetro ausente virando 500. A correção é tratar essas exceções no handler como 400.

---

## 11. Logout de uma sessão já revogada responde 401

**Peso:** baixo. Chamar `/api/auth/logout` com um token de sessão já encerrada responde 401 `SESSAO_REVOGADA`, em vez de sucesso. O mobile ignora esse erro, então não afeta o usuário. Logout costuma ser idempotente.

**Status:** resolvido em `fix/contrato-de-erros`: logout é idempotente e responde 200 mesmo com a sessão já encerrada.

---

## 12. Google Drive: arquivos sem pasta visível não aparecem em lugar nenhum

**Peso:** baixo, mas é uma lacuna de produto.

**Status:** resolvido em `fix/google-drive`, pela decisão de ignorar esses itens explicitamente. Itens sem pasta visível ficam fora do inventário, do feed e da busca; o feed e a inscrição ficam restritos ao Meu Drive, como o inventário. Os três órfãos atuais saem na reconstrução do catálogo.

Arquivos compartilhados com o usuário, e não adicionados ao Meu Drive, chegam no inventário sem pai visível. O catálogo os grava com `parentKnown=false`, e eles não aparecem na raiz nem em nenhuma pasta. Foram vistos três casos no catálogo de 13/10. Falta decidir se o Bridgit mostra "Compartilhados comigo" ou ignora esses itens de forma explícita.

---

## 13. Excluir pasta não avisa que o conteúdo vai junto

**Peso:** baixo, UX.

**Status:** resolvido em `fix/ui-e-limpeza`: web e mobile avisam que a pasta e o conteúdo vão para a lixeira do provedor.

A confirmação de excluir pasta mostra só o nome da pasta. Em 13/10, o arquivo `Livros de Matemática.docx` "sumiu" do OneDrive porque estava dentro de "Pasta Vazia", excluída num teste. Foi para a lixeira do provedor, que é recuperável, mas o usuário não foi avisado.

**Proposta:** "'Pasta Vazia' e tudo o que está dentro dela vão para a lixeira do provedor." No mobile e no web.

---

## 14. Ambiente de desenvolvimento

**Peso:** baixo. Atritos encontrados ao testar.

**Status:** resolvido em `fix/ui-e-limpeza`: o mobile tem ESLint (`npm --workspace apps/mobile run lint`, também no pre-commit) e a seção "Executar localmente" de `docs/local-first-cloud-hub.md` documenta a troca de IP e a senha do banco nos testes.

- **IP do PC mudou:** o app monta o endereço da API a partir do IP anunciado pelo Metro. Se o IP do PC muda (outra rede ou nova concessão do roteador), é preciso reiniciar o Metro.
- **Testes de integração da API exigem a senha do banco:** eles leem `SPRING_DATASOURCE_PASSWORD`. Sem ela, falham no Flyway com "Falha de logon do usuário 'sa'". É preciso carregar `scripts\powershell\local.secrets.ps1` antes do Maven.
- **O mobile não tem configuração de ESLint:** o `npx eslint` falha por falta de `eslint.config.*`.

---

## 15. Funcionalidade nova: links públicos de pastas

Hoje só arquivos podem ter link público (`LINK_APENAS_ARQUIVO`). Pastas devem poder ser públicas mais para frente. Isso envolve:
- uma página de navegação pública;
- a regra de quais subpastas e arquivos entram no link;
- o comportamento quando o conteúdo muda;
- o custo de cota do dono a cada acesso, que já é um risco com arquivos.

---

## 16. Leitura e edição de arquivos de código

**Peso:** médio como produto; alto se a edição entrar no escopo, porque pede contrato novo no backend. Vem da revisão da fase 3 e foi conferido no código de 13/10.

### O que existe

O backend reconhece dezenas de extensões de código e texto como leitura textual (`ReadPlanSupport`, lista de extensões). O web baixa os bytes e mostra o texto num bloco simples (`TextReader`); o mobile faz o mesmo numa caixa com rolagem (`FileViewer`). É conteúdo real, renderizado como texto, sem executar HTML ou JavaScript do arquivo.

### O que falta para ler código de verdade

- **Apresentação:** não há fonte monoespaçada dedicada, números de linha, busca no arquivo, destaque de sintaxe nem opção de quebrar ou não as linhas. O painel do web é estreito para código.
- **Codificação:** o web e o mobile decodificam tudo como UTF-8. Um arquivo em outra codificação aparece com caracteres trocados, sem explicação.
- **Arquivos grandes:** o backend recusa leitura textual acima de 2 MB quando conhece o tamanho. Mas o web baixa o arquivo inteiro (`arrayBuffer`) e só depois corta em 2 MB, e o mobile baixa tudo e corta em 200 mil caracteres. Quando o tamanho informado pelo provedor está errado ou ausente, o corte não protege nem o tráfego nem a memória. O certo é pedir só o começo do arquivo (intervalo de bytes, que a API já suporta) ou recusar antes de baixar.
- **Arquivos sem extensão:** a lista inclui `dockerfile`, mas a extensão é tirada do que vem depois do último ponto (`CloudItemSupport.extensionFromName`). Um arquivo chamado só `Dockerfile` (ou `Makefile`) não tem ponto e não é reconhecido como texto.

### Edição

Não existe contrato para salvar o conteúdo de um arquivo. As operações de escrita são criar pasta, enviar, renomear, mover e excluir; `UPDATE` mexe só em nome e pasta. Enviar um arquivo novo com o mesmo nome não equivale a salvar uma revisão: muda a identidade do item em alguns provedores e perde o vínculo com recentes, atalhos e links.

Se a edição entrar no escopo, os passos sugeridos na revisão da fase 3 continuam válidos:
1. Separar leitura de edição. A leitura continua simples e disponível também em links públicos; editar exige sessão e permissão.
2. Criar uma operação explícita de salvar conteúdo, com tamanho, tipo e versão esperada, preservando a identidade do arquivo quando o provedor permite.
3. Detectar conflito antes de salvar. Isso depende de cada provedor ter uma versão confiável, e o finding 1 mostra que o Google Drive ainda não tem.
4. Modelar o estado local: alterações não salvas, confirmação ao sair, erro, tentar de novo e resultado ambíguo. "Salvo" só depois da confirmação do provedor.
5. Escolher a biblioteca de editor depois disso. Instalar um editor não resolve versão, permissão, codificação e recuperação.

**Aceitação mínima:** abrir um arquivo real nos três provedores, preservar bytes e codificação, editar e salvar mantendo a identidade, detectar uma alteração externa e não perder o texto local se o provedor falhar.

---

## 17. Abrir arquivos em nova aba e falta de medição de desempenho

**Peso:** médio. Afeta a percepção de velocidade do web e decide onde vale investir em cache.

### Abrir em nova aba repete trabalho

No web, os arquivos abrem em nova aba (`target="_blank"` na pasta do provedor e na Home). Cada nova aba sobe a aplicação inteira de novo: confirma a sessão, busca provedores e atalhos, consulta o item, prepara a leitura, registra o recente, pede o ticket e só então baixa o conteúdo. Uma parte disso roda em paralelo, mas o conteúdo depende do boot e da preparação.

Desde a revisão da fase 3, o sistema evoluiu: o catálogo local no backend passou a servir listagens e metadados de itens, o que reduz as idas ao provedor. A repetição dentro do navegador continua: o que a aba anterior já sabia (item, provedor, sessão) não é reaproveitado, a não ser pelo armazenamento local do web.

**Decisão pendente:** abrir em nova aba é uma escolha de produto ou um efeito de usar `target="_blank"`? Se o leitor virar uma rota da mesma aba, os metadados em memória são reaproveitados de graça. Se a nova aba ficar, o caminho é passar o que já se sabe e reduzir as consultas do boot.

### Não há medição

Não existe instrumentação de latência. A API tem o Actuator, mas sem métricas próprias dos fluxos, e os clientes não marcam tempos. Antes de otimizar cache ou pré-carregamento, medir separadamente:
- clique até o início da navegação;
- boot e confirmação da sessão;
- consultas ao banco e ao catálogo;
- obtenção do token do provedor;
- chamadas de metadados por provedor;
- conversão ou exportação (Office, Google Docs);
- primeiro byte e transferência;
- primeira página, imagem ou texto utilizável.

Comparar primeira visita, revisita, nova aba, pasta profunda, pasta paginada e rede lenta. Nunca registrar tokens, tickets completos ou URLs temporárias na telemetria.

### Pré-carregamento que faz sentido

A revisão da fase 3 propôs uma política que continua válida:
- buscar metadados de destinos prováveis quando o usuário demonstra intenção (passar o mouse), com cancelamento;
- carregar conteúdo antecipadamente só de arquivos pequenos e com intenção clara, com limite de bytes e de concorrência;
- nunca pré-carregar a árvore inteira nem os bytes de todos os arquivos.

O web já tem parte disso: busca antecipada ao passar o mouse e cache de conteúdo com limite de tamanho. O que falta é medir se ajuda.

---

## Corrigido no dia

Branch `mobile/adjustments`, PR #6 (aberta; a revisão automática do Copilot não rodou por limite de cota).

| Problema | Correção |
|---|---|
| Mobile mostrava as mensagens do servidor sem acento | Mapa de código → mensagem em português (`errorMessage.js`) e validação local do cadastro |
| Sessões do celular apareciam como "Navegador · Dispositivo" no web | "App Bridgit · Celular" (`SessionClientLabel.forSession`) |
| Provedor com acesso expirado parecia conectado, no mobile e no web | "Acesso expirado"/Reconectar em Ajustes e Provedores, aviso nas pastas, cartão da Home e menu de envio do web |
| Leitor de texto do mobile cortava a última linha e truncava sem aviso | Espaçamento corrigido; aviso de corte e "Abrir em outro app" |
| "Abrir em outro app" abria o navegador | "Abrir com…" do sistema, com o nome original e o tipo real do arquivo |
| Google Drive: criar pasta e enviar falhavam com "Item não encontrado" | `files/generateIds` passou de POST (404 no Google) para GET, que é o método documentado ([files.generateIds](https://developers.google.com/drive/api/reference/rest/v3/files/generateIds)) |
| Renomear no mobile colava nome e extensão | O campo edita só o nome; a extensão fica fixa ao lado, como no web |
| Envio de arquivo no mobile falhava com "sem conexão" | O servidor lê a parte `request` como texto (400 em JSON inválido); o cliente a envia como string |
| Atalhos e links públicos não apareciam em outros aparelhos | Eventos `hub_entries` |
| Sem como diagnosticar "arquivo alterado" | Log `Operation version mismatch` com a versão esperada e a atual |
