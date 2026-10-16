import { defineConfig, globalIgnores } from 'eslint/config'
import css from '@eslint/css'
import noInlineMotion from './no-inline-motion.js'

// The CSS half of the gate. `npm run lint` runs this after the JS config.
export default defineConfig([
  {
    files: ['**/*.css'],
    language: 'css/css',
    plugins: { css, 'no-inline-motion': noInlineMotion },
    rules: { 'no-inline-motion/css': 'error' },
  },
  globalIgnores(['.next/**', '.open-next/**', '.wrangler/**', 'node_modules/**', '.claude/**', 'eslint/fixtures/**']),
])
