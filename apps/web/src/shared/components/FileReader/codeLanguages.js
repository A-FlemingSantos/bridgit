// Which grammar reads a file, by extension. Each one loads only when a file of its kind opens; anything
// missing here (txt, log, csv…) is plain text. Every loader gives back a LanguageSupport.

function legacy(load) {
  return async () => {
    const [{ LanguageSupport, StreamLanguage }, mode] = await Promise.all([import('@codemirror/language'), load()])
    return new LanguageSupport(StreamLanguage.define(mode))
  }
}

const javascript = (options) => async () => (await import('@codemirror/lang-javascript')).javascript(options)
const cpp = async () => (await import('@codemirror/lang-cpp')).cpp()
const html = async () => (await import('@codemirror/lang-html')).html()
const shell = legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell)
const fromClike = (name) => legacy(async () => (await import('@codemirror/legacy-modes/mode/clike'))[name])

// GFM plus front matter. The fenced code inside reads through the same grammars as whole files (see FENCES).
async function markdown() {
  const [{ markdown: markdownSupport, markdownLanguage }, { LanguageDescription }, { frontMatter }, { insert }] = await Promise.all([
    import('@codemirror/lang-markdown'),
    import('@codemirror/language'),
    import('./markdownVisual/frontMatter.js'),
    import('./markdownVisual/insert.js'),
  ])
  return markdownSupport({
    base: markdownLanguage,
    codeLanguages: FENCES.map(([name, aliases, key]) =>
      LanguageDescription.of({ name, alias: aliases, load: LOADERS[key] }),
    ),
    extensions: [frontMatter, insert],
  })
}

const LOADERS = {
  js: javascript(),
  mjs: javascript(),
  cjs: javascript(),
  jsx: javascript({ jsx: true }),
  ts: javascript({ typescript: true }),
  tsx: javascript({ jsx: true, typescript: true }),
  json: async () => (await import('@codemirror/lang-json')).json(),
  py: async () => (await import('@codemirror/lang-python')).python(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  c: cpp,
  h: cpp,
  cc: cpp,
  cpp: cpp,
  hpp: cpp,
  rs: async () => (await import('@codemirror/lang-rust')).rust(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  html: html,
  htm: html,
  vue: html,
  svelte: html,
  css: async () => (await import('@codemirror/lang-css')).css(),
  scss: async () => (await import('@codemirror/lang-sass')).sass(),
  sass: async () => (await import('@codemirror/lang-sass')).sass({ indented: true }),
  less: async () => (await import('@codemirror/lang-less')).less(),
  xml: async () => (await import('@codemirror/lang-xml')).xml(),
  yml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  md: markdown,
  markdown,
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  sh: shell,
  bash: shell,
  zsh: shell,
  env: shell,
  cs: fromClike('csharp'),
  kt: fromClike('kotlin'),
  kts: fromClike('kotlin'),
  scala: fromClike('scala'),
  dart: fromClike('dart'),
  rb: legacy(async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby),
  lua: legacy(async () => (await import('@codemirror/legacy-modes/mode/lua')).lua),
  swift: legacy(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift),
  toml: legacy(async () => (await import('@codemirror/legacy-modes/mode/toml')).toml),
  ini: legacy(async () => (await import('@codemirror/legacy-modes/mode/properties')).properties),
  cfg: legacy(async () => (await import('@codemirror/legacy-modes/mode/properties')).properties),
  conf: legacy(async () => (await import('@codemirror/legacy-modes/mode/properties')).properties),
  properties: legacy(async () => (await import('@codemirror/legacy-modes/mode/properties')).properties),
  ps1: legacy(async () => (await import('@codemirror/legacy-modes/mode/powershell')).powerShell),
  dockerfile: legacy(async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile),
  r: legacy(async () => (await import('@codemirror/legacy-modes/mode/r')).r),
  pl: legacy(async () => (await import('@codemirror/legacy-modes/mode/perl')).perl),
  pm: legacy(async () => (await import('@codemirror/legacy-modes/mode/perl')).perl),
  groovy: legacy(async () => (await import('@codemirror/legacy-modes/mode/groovy')).groovy),
  gradle: legacy(async () => (await import('@codemirror/legacy-modes/mode/groovy')).groovy),
  erl: legacy(async () => (await import('@codemirror/legacy-modes/mode/erlang')).erlang),
  hrl: legacy(async () => (await import('@codemirror/legacy-modes/mode/erlang')).erlang),
  hs: legacy(async () => (await import('@codemirror/legacy-modes/mode/haskell')).haskell),
  clj: legacy(async () => (await import('@codemirror/legacy-modes/mode/clojure')).clojure),
  cljs: legacy(async () => (await import('@codemirror/legacy-modes/mode/clojure')).clojure),
  elm: legacy(async () => (await import('@codemirror/legacy-modes/mode/elm')).elm),
  pas: legacy(async () => (await import('@codemirror/legacy-modes/mode/pascal')).pascal),
  pp: legacy(async () => (await import('@codemirror/legacy-modes/mode/pascal')).pascal),
  proto: legacy(async () => (await import('@codemirror/legacy-modes/mode/protobuf')).protobuf),
  vb: legacy(async () => (await import('@codemirror/legacy-modes/mode/vb')).vb),
  vbs: legacy(async () => (await import('@codemirror/legacy-modes/mode/vbscript')).vbScript),
  ml: legacy(async () => (await import('@codemirror/legacy-modes/mode/mllike')).oCaml),
  mli: legacy(async () => (await import('@codemirror/legacy-modes/mode/mllike')).oCaml),
  fs: legacy(async () => (await import('@codemirror/legacy-modes/mode/mllike')).fSharp),
  fsx: legacy(async () => (await import('@codemirror/legacy-modes/mode/mllike')).fSharp),
}

// Names a fenced block can carry (```ts), each reading through the loader of the extension it points to.
const FENCES = [
  ['JavaScript', ['js', 'javascript', 'node', 'mjs', 'cjs'], 'js'],
  ['JSX', ['jsx'], 'jsx'],
  ['TypeScript', ['ts', 'typescript'], 'ts'],
  ['TSX', ['tsx'], 'tsx'],
  ['JSON', ['json', 'jsonc', 'json5'], 'json'],
  ['Python', ['py', 'python', 'python3'], 'py'],
  ['Java', ['java'], 'java'],
  ['C++', ['c', 'h', 'cpp', 'cc', 'c++', 'hpp'], 'cpp'],
  ['C#', ['cs', 'csharp', 'c#'], 'cs'],
  ['Rust', ['rs', 'rust'], 'rs'],
  ['Go', ['go', 'golang'], 'go'],
  ['PHP', ['php'], 'php'],
  ['HTML', ['html', 'htm', 'vue', 'svelte'], 'html'],
  ['CSS', ['css'], 'css'],
  ['SCSS', ['scss'], 'scss'],
  ['Sass', ['sass'], 'sass'],
  ['Less', ['less'], 'less'],
  ['XML', ['xml', 'svg'], 'xml'],
  ['YAML', ['yml', 'yaml'], 'yaml'],
  ['SQL', ['sql'], 'sql'],
  ['Shell', ['sh', 'shell', 'bash', 'zsh', 'console', 'env'], 'sh'],
  ['Kotlin', ['kt', 'kotlin', 'kts'], 'kt'],
  ['Scala', ['scala'], 'scala'],
  ['Dart', ['dart'], 'dart'],
  ['Ruby', ['rb', 'ruby'], 'rb'],
  ['Lua', ['lua'], 'lua'],
  ['Swift', ['swift'], 'swift'],
  ['TOML', ['toml'], 'toml'],
  ['Properties', ['ini', 'cfg', 'conf', 'properties'], 'ini'],
  ['PowerShell', ['ps1', 'powershell', 'pwsh'], 'ps1'],
  ['Dockerfile', ['dockerfile', 'docker'], 'dockerfile'],
  ['R', ['r'], 'r'],
  ['Perl', ['pl', 'perl'], 'pl'],
  ['Groovy', ['groovy', 'gradle'], 'groovy'],
  ['Haskell', ['hs', 'haskell'], 'hs'],
  ['Markdown', ['md', 'markdown'], 'md'],
]

// Markdown files open in the "Visualizar" mode (see markdownVisual/).
export function isMarkdownExtension(extension) {
  const ext = String(extension ?? '').toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

// The grammar for a file, or null for plain text.
export async function loadLanguage(extension) {
  const load = LOADERS[String(extension ?? '').toLowerCase()]
  return load ? load() : null
}
