const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { resolve: resolveModule } = require('metro-resolver')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

// jsdom (web tests) hoists webidl-conversions@8, which references SharedArrayBuffer at
// module load time. Metro's flat lookup picks that before extraNodeModules, so Hermes
// crashes on Android. Force the v5 copy used by expo's whatwg-url-without-unicode.
const webidlConversionsEntry = path.resolve(
  monorepoRoot,
  'node_modules/whatwg-url-without-unicode/node_modules/webidl-conversions/lib/index.js',
)

const config = getDefaultConfig(projectRoot)
const defaultResolveRequest = config.resolver.resolveRequest

config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'webidl-conversions') {
    return {
      type: 'sourceFile',
      filePath: webidlConversionsEntry,
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform)
  }

  return resolveModule(context, moduleName, platform)
}

module.exports = config
