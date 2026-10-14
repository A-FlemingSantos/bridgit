const js = require('@eslint/js')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const globals = require('globals')

module.exports = [
  { ignores: ['node_modules/**', '.expo/**', 'android/**', 'ios/**', 'dist/**'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        // Set by the React Native / Expo runtime.
        __DEV__: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // The app does not use PropTypes.
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // The config and the Metro/Babel files are CommonJS.
    files: ['babel.config.js', 'metro.config.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
]
