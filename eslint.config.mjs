import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import noInlineMotion from './eslint/no-inline-motion.js'

// The JavaScript and TypeScript half of the gate. CSS Modules are linted by
// the same plugin under their own config (eslint/css.config.mjs), because a
// CSS file is a different language to ESLint and the Next configs above do
// not scope themselves to JS, so mixing the two in one config would run
// JavaScript rules against a CSS syntax tree.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { 'no-inline-motion': noInlineMotion },
    rules: { 'no-inline-motion/jsx': 'error' },
  },
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '.wrangler/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Other sessions' worktrees of this repo live here, node_modules and
    // all (git ignores them through .git/info/exclude).
    '.claude/**',
    // The fixtures are linted by the rule's own test, never by the app's lint:
    // half of them are planted to fail.
    'eslint/fixtures/**',
  ]),
])

export default eslintConfig
