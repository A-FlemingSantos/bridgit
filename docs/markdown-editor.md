# Editor markdown (web)

Leitura e edição de `.md`/`.markdown` com renderização enquanto se digita e um modo "Visualizar código fonte". Só web.

## Decisões

- **Um só editor:** a mesma folha CodeMirror 6 do código (`shared/components/FileReader/`), com dois modos trocados por `Compartment`, sem recriar o editor. Cursor, rolagem e desfazer continuam.
- **O texto é a fonte da verdade:** o modo visual só decora, nunca reescreve o markdown. Salvar grava exatamente o que foi digitado.
- **Sem Muya/MarkText nem ProseMirror (Milkdown, TipTap):** normalizam o markdown ao salvar (marcadores, espaços, escapes) e seriam um segundo motor de editor. `~/Typedown` serve só de referência de comportamento.
- **Reaproveitado sem mudança:** salvamento automático, conflito, Ctrl+S, `decodeText`/`encodeText`, barras finas, tema Monochrome.

## Modos

| | Visualizar (padrão) | Código fonte |
|---|---|---|
| Numeração, gutter, minimap | desligados | ligados |
| Sintaxe (`#`, `**`, `[]()`, `` ` ``) | escondida, exceto onde está o cursor | visível, com cores |
| Títulos, negrito, itálico, citação, lista | estilizados no lugar | só cores |
| `---`, `- [ ]`, imagem, tabela, bloco HTML | renderizados com o cursor fora | texto cru |
| Bloco de código | destaque via `loadLanguage`, botão copiar | destaque via `loadLanguage` |
| Front matter YAML | bloco mono esmaecido, sem os `---` | texto com cores |
| Fonte | proporcional (`--type`), coluna de ~720px; código em mono | mono |

Botão "Visualizar código fonte" no cabeçalho, ao lado de Baixar. Só ele. Sempre abre em Visualizar, sem lembrar o último modo. Links públicos abrem em Visualizar, só leitura, sem o botão.

## Interações

- **Caixa de tarefa:** o clique troca `[ ]`↔`[x]` no texto (entra no desfazer e no salvamento). Desligada quando só lê.
- **Links:** clique simples só posiciona o cursor; Ctrl/Cmd+clique abre em nova aba, só `http:`, `https:` e `mailto:`.
- **Atalhos:** Ctrl+B e Ctrl+I envolvem a seleção em `**`/`*`; Ctrl+/ alterna Visualizar e Código fonte (no lugar do comentar do CodeMirror).

## Onde mexer

- `codeEditorSetup.js`: base comum + compartimentos por modo (gutter/minimap; visual markdown) e `setSourceView`.
- `markdownVisual/`: o modo visual. Lê a árvore do `@codemirror/lang-markdown` (GFM) e gera as decorações: `inlinePreview.js` (`ViewPlugin`: marcadores, títulos, ênfase, listas, links, código), `blockPreview.js` e `richBlocks.js` (`StateField`: linha, caixa de tarefa, imagem, tabela, front matter, HTML, copiar). `frontMatter.js` estende o parser, nos dois modos.
- `markdownCommands.js`: os atalhos.
- `FileReader`/`CodeEditor`: props `sourceView` e `onToggleSourceView`; o estado fica na página (`SpaceFilePage`).
- API: `markdown` entrou nas extensões de texto (`ReadPlanSupport`), ao lado de `md`.

## Cuidados

- **Tabelas:** a parte mais difícil. Começar com a tabela renderizada que vira texto cru quando o cursor entra.
- **Imagens:** só `https:` renderiza. Relativas (o arquivo está na nuvem, então viriam pelo hub, com autorização), `http:` e o resto viram um placeholder discreto com ícone e o texto alternativo.
- **HTML no markdown:** blocos passam pelo DOMPurify (carregado só com markdown), sem `style`, scripts, handlers nem URLs fora de `http`/`https`/`mailto`. Um elemento que o markdown parte em linha em branco (`<details>` … `</details>`) vira um bloco só; o que fica vazio depois da limpeza não ocupa espaço. HTML inline só de formatação, sem atributos (`<u>`, `<kbd>`, `<b>`, `<mark>`…), estiliza o texto como o equivalente em markdown, sem passar por parser de HTML; o resto fica como texto. Tabelas montam o DOM com elementos fixos e `textContent`, mantendo a formatação inline das células.
- **Cursor perto da sintaxe escondida:** testar setas, seleção e acentos (teclas mortas, IME).

## Fora por enquanto

- Fórmulas, mermaid, seletor de emoji e HTML colado virando markdown.
- Exportar HTML/PDF: precisa de um renderizador à parte (o CodeMirror só desenha o que está na tela); o PDF sairia da impressão do navegador sobre esse HTML.
- Notas de rodapé, `[toc]`, inserção rápida, barras de tabela e imagem, modo foco.
- Imagens relativas pelo hub.
