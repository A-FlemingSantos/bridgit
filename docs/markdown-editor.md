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
| `---`, `- [ ]`, imagem, tabela | renderizados com o cursor fora | texto cru |
| Bloco de código | destaque via `loadLanguage` | idem |

Botão "Visualizar código fonte" no cabeçalho, ao lado de Baixar. Só ele.

## Onde mexer

- `codeEditorSetup.js`: base comum + compartimentos por modo (gutter/minimap; visual markdown) e `setMode`.
- Arquivo novo para o modo visual: lê a árvore do `@codemirror/lang-markdown` (já instalado, com GFM) e gera as decorações. Elementos de bloco (tabela, imagem) precisam vir de um `StateField`, não de `ViewPlugin`.
- `FileReader`: `.md`/`.markdown` abrem no modo Visualizar.

## Cuidados

- **Tabelas:** a parte mais difícil. Começar com a tabela renderizada que vira texto cru quando o cursor entra.
- **Imagens com caminho relativo:** o arquivo está na nuvem, então a imagem teria de vir pelo hub, com autorização. Primeira versão: só URL completa, com aviso no lugar das relativas.
- **HTML no markdown:** não renderizar, ou passar por um limpador. Bloquear links `javascript:`.
- **Cursor perto da sintaxe escondida:** testar setas, seleção e acentos (teclas mortas, IME).

## Fora por enquanto

Fórmulas, mermaid, seletor de emoji e HTML colado virando markdown.

## Em aberto

1. Fonte no modo Visualizar: proporcional ou mono?
2. Ao abrir: sempre Visualizar, ou lembrar o último modo?
3. Imagens relativas: pelo hub já na primeira versão, ou só o aviso?
