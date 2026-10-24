// Which grammar reads a file, by extension. Each one loads only when a file of its kind opens; anything
// missing here (txt, log, csv…) is plain text.

function legacy(load) {
  return async () => {
    const [{ StreamLanguage }, mode] = await Promise.all([import('@codemirror/language'), load()])
    return StreamLanguage.define(mode)
  }
}

const javascript = (options) => async () => (await import('@codemirror/lang-javascript')).javascript(options)
const cpp = async () => (await import('@codemirror/lang-cpp')).cpp()
const html = async () => (await import('@codemirror/lang-html')).html()
const shell = legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell)
const fromClike = (name) => legacy(async () => (await import('@codemirror/legacy-modes/mode/clike'))[name])

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
  md: async () => (await import('@codemirror/lang-markdown')).markdown(),
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

// The grammar for a file, or null for plain text.
export async function loadLanguage(extension) {
  const load = LOADERS[String(extension ?? '').toLowerCase()]
  return load ? load() : null
}
