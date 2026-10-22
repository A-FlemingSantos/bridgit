# Findings

Tudo o que apareceu durante os testes da tarefa "[TESTAR] Funcionalidades" e ficou para depois, porque estava fora do escopo do branch `mobile/adjustments` ou porque a correção pedia uma decisão. As seções 16 e 17 vêm da revisão da fase 3 (`Fase 3 — revisão técnica e findings.md`, de setembro) e trazem só o que continua valendo no código de hoje. O que foi corrigido no dia dos testes está no fim, em "Corrigido no dia".

Os itens resolvidos ficam só com o título e um resumo. Os findings estão em ordem de peso. Os primeiros mexem em arquitetura e pedem decisão; os do meio dependem de configuração ou do deploy; os últimos são pontuais.

---

## 1. Google Drive: a "versão" do arquivo não serve para detectar conflito

> ✅ **Resolvido** (`fix/google-drive`, confirmado com a conta real em 14/10). A versão comparada nas escritas passou a ser a revisão do conteúdo (ou checksum), e `modifiedTime` nos documentos nativos; o campo `version` do Drive mudava sozinho e fazia escritas parecerem conflito. Item na lixeira conta como inexistente (404), e excluí-lo de novo dá certo. O checkpoint `v=2` forçou uma reconstrução do catálogo, que tirou a pasta "PDFs".

---

## 2. O catálogo local esconde que o provedor precisa reconectar

> ✅ **Resolvido** (`fix/catalogo-e-eventos`). A listagem traz `freshness` e `staleReason`: fica `stale` quando a conexão pede reconexão ou a sincronização falha em rodadas seguidas. Web e mobile mostram "pode estar desatualizada" com a última sincronização. Só há testes automáticos; falta ver o aviso na tela.

---

## 3. Eventos entre aparelhos: o que avisa e o que não avisa

> ✅ **Resolvido** (`fix/catalogo-e-eventos`). Web e mobile recarregam só o que o evento afeta (Home, pasta, item); o mobile deixou de recarregar tudo a cada evento. Recentes passaram a gerar `hub_entries`. No teste de 14/10, o web ignorava eventos de outros aparelhos porque a API mandava o `connectionId` em maiúsculas; corrigido.

---

## 4. Mensagens de erro da API sem acento e respostas 401 sem UTF-8

> ✅ **Resolvido** (`fix/contrato-de-erros`). 401 e 403 saem pelo mesmo envelope dos outros erros, em UTF-8 e com data ISO. Todas as mensagens da API têm acento, e os mapas de mensagens dos clientes encolheram.

---

## 5. Retorno do OAuth aponta para `localhost`

> ✅ **Resolvido** (`deploy/azure`). Os três provedores retornam para `https://api.bridgit-cloud.duckdns.org/api/providers/{provedor}/callback`, cadastrado no Entra, no Google Cloud e no Dropbox. O APK volta ao app por `bridgit://`. Só o Expo Go, em desenvolvimento, ainda precisaria de `exp://` em `APP_MOBILE_REDIRECT_PREFIXES`.

---

## 6. Google: acesso expirou cerca de 8 dias depois de conectar

**Peso:** médio, configuração. Hipótese não confirmada.

A conexão do Google Drive feita em 5/10 passou a exigir reconexão em 13/10. O log da API mostrava `Catalog sync deferred ... code=RECONEXAO_NECESSARIA` repetidamente. Isso combina com a regra do Google para apps OAuth em modo **"Testing"**: um projeto nesse status "is issued a refresh token expiring in 7 days", exceto quando o app pede só escopos básicos de identidade (e-mail, perfil, OpenID), o que não é o caso do Bridgit, que pede acesso ao Drive ([Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2), seção sobre expiração de refresh tokens).

**Para confirmar e resolver:** verificar no Google Cloud Console o status de publicação da tela de consentimento. Publicar como "In production" acaba com a expiração semanal, mas pode exigir verificação do app pelo Google, dependendo dos escopos.

---

## 7. Endereço dos links públicos usa o endereço do web configurado

> ✅ **Resolvido** (`deploy/azure`). Em produção, `APP_FRONTEND_BASE_URL` é `https://app.bridgit-cloud.duckdns.org`, e os links públicos abrem em qualquer aparelho.

---

## 8. Web: Optimistic UI "pisca" ao criar e excluir

> ✅ **Resolvido** (`fix/catalogo-e-eventos`, conferido em 14/10). A piscada vinha da troca da chave do item quando a pasta era recarregada; agora a chave é preservada. Os formulários de criar e excluir fecham assim que o servidor aceita, e uma recusa posterior aparece num aviso.

---

## 9. Web: a página do link público não rola

> ✅ **Resolvido** (`fix/ui-e-limpeza`). A página do link público rola dentro da altura da tela.

---

## 10. Envio com parte ausente no formulário vira 500 e corta a conexão

> ✅ **Resolvido** (`fix/contrato-de-erros`). Parte, parâmetro ou cabeçalho ausente responde 400 `REQUISICAO_INVALIDA`, e o servidor lê o resto do envio antes de responder, sem cortar a conexão.

---

## 11. Logout de uma sessão já revogada responde 401

> ✅ **Resolvido** (`fix/contrato-de-erros`). Logout responde 200 mesmo com a sessão já encerrada.

---

## 12. Google Drive: arquivos sem pasta visível não aparecem em lugar nenhum

**Peso:** baixo, mas é uma lacuna de produto.

**Status:** resolvido em parte em `fix/google-drive`; falta implementar a decisão de 14/10, abaixo. A decisão foi ignorar esses itens de forma explícita. Itens sem pasta visível ficam fora do inventário, do feed e da busca; o feed e a inscrição ficam restritos ao Meu Drive, como o inventário. Os três órfãos de 13/10 saíram na reconstrução.

⚠️ **Visto em 14/10:** o filtro olha só se o item tem um pai. O conteúdo de uma pasta compartilhada que não foi adicionada ao Meu Drive tem pai (a própria pasta), então entra no inventário e na busca. A pasta em si fica de fora, porque não tem pai. Na conta real são 9 itens assim. Exemplo: as fotos `DSC00716.JPG` e outras, da pasta compartilhada "Olimpíadas da Matemática". Elas não aparecem em nenhuma pasta do hub, mas ficam gravadas no catálogo e aparecem na busca com `parentKnown=false`. Abrir uma delas mostra a pasta compartilhada como caminho, e dá para navegar por ela.

**Decisão (14/10):** no Google Drive, só entra no catálogo o que é alcançável a partir da raiz do Meu Drive. Não haverá "Compartilhados comigo".
- **Feed:** já não traz esses itens. O feed e a inscrição usam `restrictToMyDrive=true`, que omite arquivos compartilhados fora do Meu Drive. Nada a mudar.
- **Inventário:** é o único caminho por onde esses itens entram, porque o `files.list` com `corpora=user` devolve tudo o que o usuário enxerga. No fim do inventário do Drive, antes de ativar o novo scan, uma consulta SQL recursiva (`WITH … UNION ALL`) parte dos itens da raiz e marca seus descendentes; o que não for marcado é apagado do scan em construção. É uma instrução no `CatalogStore`, usada só para o Drive. No OneDrive e no Dropbox tudo já está na árvore.
- **Busca:** pelo finding 18, passa a usar o catálogo e herda a regra. Até lá, ainda consulta o provedor e mostra esses itens.
- **Limpeza do que já está gravado:** o formato do checkpoint do Drive sobe para `v=3`, o que força uma nova reconstrução e remove os 9 itens atuais.
- **Desempenho:** a consulta roda uma vez por inventário completo (ao conectar a conta ou numa reconstrução), nunca na navegação nem na sincronização incremental. Cada item é visitado uma vez, e o número de rodadas é a profundidade das pastas. Encontrar os filhos de uma pasta usa o índice `ix_catalog_parent`, o mesmo da listagem.
- **Caso de borda aceito:** um arquivo movido do Meu Drive para uma pasta compartilhada de fora deve chegar pelo feed como removido. Se escapar, a próxima reconstrução corrige.

**Alternativas descartadas:**
- **Filtrar o inventário com `'me' in owners`:** esconderia arquivos que outras pessoas colocaram nas pastas do usuário. Eles sumiriam da navegação.
- **Percorrer a árvore pasta por pasta na API do Google:** correto por construção, mas exige uma chamada de rede por pasta a cada inventário e guardar a fila de pastas no checkpoint.

---

## 13. Excluir pasta não avisa que o conteúdo vai junto

> ✅ **Resolvido** (`fix/ui-e-limpeza`). Web e mobile avisam que a pasta e o conteúdo vão para a lixeira do provedor.

---

## 14. Ambiente de desenvolvimento

> ✅ **Resolvido** (`fix/ui-e-limpeza`). ESLint no mobile (também no pre-commit) e seção "Executar localmente" em `docs/local-first-cloud-hub.md`, com a troca de IP do Metro e a senha do banco nos testes.

---

## 15. Funcionalidade nova: links públicos de pastas

> ✅ **Implementado** (`feat/public-links`). Pastas podem ter link público, no web e no mobile. As decisões:

**Endereço do link:** passou a ser `/p/<apelido>-<codigo>`. O código tem 4 caracteres `[a-z0-9]`, é gerado pelo sistema e não muda. O apelido é o nome do item no momento da criação (até 60 caracteres, `a-z 0-9 -`) e não pode ser editado; para trocar o endereço, revoga-se o link e cria-se outro. A unicidade é do par (apelido, código), e o acesso exige os dois. Renomear o arquivo não muda o endereço. Os links antigos, de 16 caracteres, continuam funcionando.

**Regra de escopo:** o visitante navega pela pasta e por todas as subpastas, só para leitura, e pode visualizar e baixar arquivos. Não há download em ZIP. Todo item filho é conferido como estando dentro da pasta compartilhada, em três passos: o pai direto, depois a ascendência no catálogo, depois a ascendência no provedor. Pai desconhecido é negado. Um item de fora da pasta responde exatamente como um item inexistente (404 `LINK_ITEM_NAO_ENCONTRADO`), para não revelar que ele existe.

**Quando o conteúdo muda:**
- Uma falha num item filho nunca apaga o link. Só a falha da própria pasta raiz conta contra ele.
- Os cursores de paginação são selados por link e por pasta. Um cursor que ficou velho responde 409 `PASTA_ALTERADA`, e o visitante recarrega a pasta.

**Custo de cota e limites:** cada visita ainda gasta cota do provedor do dono (consulta da raiz, ascendência e listagem). O que o limita são os limitadores:
- 20 buscas sem resultado por IP em 15 minutos, depois 429. Isso dificulta adivinhar endereços;
- 60 acessos por minuto por link e por IP;
- 600 acessos por minuto por link, somando todos os IPs, para proteger a cota do dono.

**Limitação conhecida:** referências de item com barra codificada (`%2F`) são rejeitadas pelo firewall do servidor, tanto nas rotas do dono quanto nas públicas. Está em `trivial-findings.md`.

**Ainda em aberto:** expiração, senha e revogar todos os links.

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

## 18. Busca consulta os provedores em vez do catálogo

**Peso:** médio. Simplifica o backend e alinha a busca com a navegação.

**Decisão (14/10):** a busca passa a consultar o catálogo SQL, sem chamar os provedores e sem plano B no provedor. A busca não precisa ser exata.

Hoje o `SearchService` consulta cada provedor em paralelo, com até 8 s para responder. O OneDrive usa `/root/search` do Graph, o Dropbox usa `/files/search_v2` e o Google Drive usa `files.list` com `name contains`. O catálogo não é usado. Isso tem três consequências:
- A busca segue regras diferentes das da navegação. No Google Drive, o conteúdo de pastas compartilhadas fora do Meu Drive aparece na busca, mas não em nenhuma pasta (ver finding 12).
- A busca depende de três chamadas de rede, da disponibilidade e da cota de cada provedor. Um provedor lento aparece como "tempo esgotado".
- O Graph e o Dropbox demoram para indexar arquivos novos.

**O que muda:**
- A busca filtra por nome no catálogo do usuário, respeitando as mesmas regras da listagem: scan ativo, geração atual, `deleted = 0` e só itens que pertencem à árvore do hub. Com isso, a parte da busca do finding 12 se resolve junto.
- A resposta traz, por provedor, o mesmo `coverage`/`freshness` da listagem. Assim, o cliente pode avisar "ainda sincronizando" quando o catálogo estiver incompleto, como na primeira sincronização ou numa reconstrução.
- Saem os métodos `search` dos clientes de provedor, a execução em paralelo e o limite de tempo.

**O que se aceita perder:**
- A busca por conteúdo que o OneDrive e o Dropbox fazem hoje.
- Arquivos criados fora do Bridgit só aparecem depois da próxima sincronização.

`LIKE '%termo%'` percorre os itens do usuário. Isso basta no tamanho atual; um índice de texto completo fica para quando os catálogos crescerem.

---

## 19. Mobile: sem estado offline

**Peso:** médio. Funcionalidade nova no mobile.

Hoje o app só tem "carregando" e "erro". Sem rede, nada aparece. Falta tratar a falta de rede, guardar dados no aparelho para mostrar o último estado conhecido e indicar "sessão não confirmada" enquanto o servidor não responde.

---

## 20. Ações sem back-end nos menus

**Peso:** médio. Funcionalidade nova.

Mover, Espelhar, Editar PDF, Pedir assinaturas e Assinar foram tirados dos menus do mobile por não terem back-end; no web, Editar PDF e as assinaturas continuam nos menus sem fazer nada. Cada ação precisa do seu back-end antes de voltar ao menu.

---

## 21. Mobile: PDF abre no leitor do sistema

**Peso:** baixo. Decisão de produto.

Hoje o PDF sai do app e abre no leitor do sistema, como solução provisória. Falta decidir se vale embutir um leitor (por exemplo, com WebView).

---

## 22. Mobile: navegador do OAuth

**Peso:** baixo. Decisão de produto.

O login no provedor abre uma aba do navegador do sistema. WebView não serve para o Google (erro `disallowed_useragent`). Opções: manter a aba do navegador, que é o padrão no mobile; usar WebView só para Microsoft e Dropbox; ou outra ideia.

---

## 23. Ajustes: as opções bastam?

**Peso:** baixo. Decisão de produto.

Falta decidir se as opções atuais de Ajustes bastam ou se faltam opções de personalização.

---

## 24. Web: pasta excluída continua sendo recarregada (404 no console)

**Peso:** baixo. Sobram dois casos pontuais no web.

**Status:** resolvido em parte em `fix/onedrive-delta-deletions` (conferido em produção em 21/10); falta o ajuste abaixo. O mobile ainda não trata esse código (finding 27).

### O que foi feito

Quando a API responde `ITEM_NAO_ENCONTRADO`, a entrada da pasta no cache (`folderCache` no `HubDataProvider`) passa ao estado `gone`, com a lista vazia e a pasta de cima guardada em `parentRef`. O `useFolder` não recarrega uma entrada `gone`, então a pasta não é mais pedida. Ela também sai de todas as listas na hora (`removeItemFromCaches`). Se estiver aberta, a tela volta para a pasta de cima com "Essa pasta não existe mais.". Vale para pasta excluída no próprio aparelho, em outro aparelho ou direto no provedor. Arquivos seguem a mesma regra no `itemCache`, com "Esse arquivo não existe mais.". A API também tira o item do catálogo nesse 404 e avisa as outras telas.

A correção prevista aqui antes era apagar a entrada da pasta e das subpastas guardadas sob ela. A implementação marcou a entrada em vez de apagar. Comparando as duas:

| | Apagar a entrada (previsto) | Marcar como `gone` (implementado) |
|---|---|---|
| Pasta aberta na tela | Volta a pedir sem parar: sem entrada, o `useFolder` entende que a pasta ainda não foi carregada, pede de novo e leva outro 404. | Para na hora e volta para a pasta de cima. |
| Subpastas já abertas antes | Somem junto. | Ficam no cache. Cada uma leva um 404 na próxima recarga ao voltar para a aba (`revalidateStale`) e só então para. É uma requisição inútil por subpasta, uma vez só. |
| Pasta restaurada da lixeira | Abre normalmente. | Fica `gone` até recarregar a página. O OneDrive e o Google Drive mantêm o mesmo id na restauração, então quem restaura a pasta e tenta abri-la na mesma sessão é mandado de volta para a pasta de cima. |

### O que falta

Juntar as duas abordagens:
1. **Manter a marca `gone`**, só para a tela aberta parar e voltar à pasta de cima.
2. **Descartar junto as entradas das subpastas** guardadas sob ela, como previsto antes, para não gerar um 404 por subpasta.
3. **A marca expira.** Abrir aquela pasta de novo mais tarde consulta o servidor outra vez: se ela foi restaurada, abre normalmente; se não, volta o aviso. O mesmo vale para arquivos no `itemCache`.

É uma mudança só no web (`HubDataProvider` e `useFolder`/`useItem`).

---

## 25. Google Drive: arquivos do Office não têm leitura, e o aviso engana

**Peso:** baixo. A limitação é aceita; só o aviso muda.

Visto em 14/10 com `Math Books.docx`. O Google Drive só exporta para PDF os documentos nativos do Google (Docs, Planilhas, Apresentações e Desenhos). Um `.docx`, `.xlsx` ou `.pptx` enviado ao Drive não é nativo, então `ReadPlanSupport` devolve `none` e o web mostra "Este arquivo não tem leitura no Bridgit", com o botão de baixar. O comportamento já existia no `main`: não é bug, é limitação do provedor. No OneDrive e no Dropbox o mesmo arquivo abre, porque esses provedores geram o PDF.

**Decisão:** manter sem leitura, com o aviso e o download. Não converter no servidor nem criar cópias convertidas no Drive do usuário.

**O que muda:** o texto atual sugere que o Bridgit não lê esse tipo de arquivo em lugar nenhum, o que é falso. O aviso deve dizer que o provedor não oferece visualização para este arquivo e que dá para baixá-lo, por exemplo: "O Google Drive não gera visualização deste arquivo. Baixe para abrir." O modo `none` também cobre outros casos, como texto grande demais e tipos sem leitor. Para o texto acertar a causa, a resposta de leitura (`ReadResponse`) pode trazer um motivo, por exemplo `PROVEDOR_SEM_VISUALIZACAO` ou `ARQUIVO_GRANDE_DEMAIS`, e o cliente escolhe a frase. O mobile segue o mesmo texto.

---

## 26. Optimistic UI só cobre parte das ações

**Peso:** médio. Percepção de velocidade no web e no mobile.

O finding 8 deixou criar pasta e excluir instantâneos no web. As outras ações ainda esperam o servidor terminar.

**Web, hoje:**
- **Já instantâneo:** criar pasta, enviar, renomear, mover, excluir, atalhos e recentes aparecem na lista na hora. `operationProjection.js` projeta as operações pendentes sobre o cache. Os formulários de criar pasta e de excluir fecham assim que o servidor aceita (`onAccepted`).
- **Renomear e mover:** a lista muda na hora, mas o formulário fica aberto até a operação terminar, consultando o servidor a cada 750 ms. `renameItem` e `moveItem` não repassam o `onAccepted` para o `updateItem`.
- **Enviar vários arquivos:** `uploadFiles` envia um arquivo por vez e espera cada um terminar. O próximo arquivo só aparece como pendente depois que o anterior termina.

**Mobile, hoje:** não há Optimistic UI.
- **Criar pasta, renomear, excluir e enviar:** `useItemActions` espera `runOperation`, que consulta a operação a cada 750 ms por até 60 s. Só então recarrega as telas afetadas. O formulário fica aberto e a lista só muda depois da recarga.
- **Atalhos:** também esperam o servidor e depois recarregam a Home, as pastas e o arquivo.

**O que expandir:**
1. **Web, renomear e mover:** fechar o formulário quando o servidor aceitar, como criar pasta e excluir.
2. **Web, vários arquivos:** registrar a intenção de todos os arquivos de uma vez, para todos aparecerem como pendentes, e continuar enviando em sequência.
3. **Mobile:**
   - Projetar as operações pendentes sobre as listagens, como o `operationProjection` do web. A lógica é a mesma; vale considerar movê-la para o `shared-client`.
   - Fechar o formulário quando o servidor aceitar.
   - Mostrar a recusa num aviso, desfazendo a mudança na tela.
   - Atalhos entram e saem da lista na hora, desfeitos em caso de erro, como no web.

**Fica como está:** criar link público, porque o endereço vem do servidor; desconectar provedor; e alterações de conta. São ações raras, em que esperar a confirmação é o esperado.

---

## 27. Mobile: atualização ao vivo e item apagado ficam atrás do web

**Peso:** médio. Percepção de velocidade e uma tela sem saída no mobile.

Visto em 21/10, depois das mudanças de `fix/onedrive-delta-deletions` que deixaram o web refletir em segundos as mudanças feitas direto no provedor. O que mudou no servidor também vale para o mobile:
- webhook do Dropbox;
- exclusão por caminho sem cópias para trás e reconstrução do catálogo (migração V9);
- 404 que tira o item do catálogo;
- adiantamento do sync ao navegar;
- worker acordando na hora.

Duas partes ficaram só no web.

### O sync a cada 5 s com o app aberto não dispara no mobile

No web, o servidor adianta o sync de todas as conexões do usuário a cada `app.hub.nudge-seconds` (padrão 5 s) enquanto o stream de eventos (`/api/hub/events/stream`) está aberto. Quem dispara é o `HubEventsController.stream`, que chama `CatalogStore.nudgeUser`. Isso existe porque os avisos dos provedores atrasam: medido em 21/10, o Dropbox avisa em cerca de 1 s, o OneDrive em cerca de 30 s (o Graph agrupa as notificações), e o Google pode levar de segundos a minutos.

O mobile não usa o stream. Ele consulta `GET /api/hub/events` a cada 5 s (`eventPoller.js`), e essa rota não adianta o sync. Com o celular parado numa tela, sem navegar, uma mudança feita direto no OneDrive ou no Google só aparece quando chega o aviso do provedor ou, sem aviso, no sync periódico de até 5 min. Navegar entre pastas adianta o sync, porque a listagem passa pelo `CatalogStore.touch`.

**Correção:** a consulta `GET /api/hub/events` também chama `nudgeUser`, com os mesmos limites: só conexões paradas, com o último sync há mais de `nudge-seconds` e sem falha pendente (um 429 mantém a espera). A mudança é só no servidor e não precisa de build novo do mobile. O fallback do web, que usa a mesma rota quando o stream cai, também passa a contar.

### Abrir um item apagado deixa a tela presa no erro

No web, quando a API responde `ITEM_NAO_ENCONTRADO` ao abrir uma pasta, os detalhes de um item ou o conteúdo de um arquivo:
- o item sai de todas as listas na hora (`removeItemFromCaches`), sem esperar o evento do servidor;
- a tela volta para a pasta de cima com "Essa pasta não existe mais." ou "Esse arquivo não existe mais.".

O mobile não trata esse código. Abrir um item apagado mostra o erro e fica nessa tela. O item só some da lista na próxima consulta de eventos, em até 5 s, porque o servidor já o tirou do catálogo e emitiu o evento.

**Correção:**
- tratar `ITEM_NAO_ENCONTRADO` no mobile como no web: tirar o item das listas na hora e voltar para a pasta de cima com o aviso, nas telas de pasta e de arquivo;
- tratar só esse código. Falha de rede, 503 ou sessão expirada mantêm o item e a opção de tentar de novo, porque nesses casos ele pode continuar existindo;
- a mudança é no app e precisa de um build novo do APK, o que também pede atualizar o link e o QR do APK na landing.

**Não se aplica ao mobile:** a checagem de arquivo ilegível antes do envio, feita no web para atalhos quebrados do Windows. O seletor do celular entrega uma cópia do arquivo, então o problema não existe lá.

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
