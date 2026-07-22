import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: false,
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: [
      'src/app/(frontend)/**/*.{ts,tsx}',
      'src/features/**/*.{ts,tsx}',
      'src/ui/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 250, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['src/features/**/ui/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { message: 'Navigation belongs in a connector or hook.', name: 'next/link' },
            { message: 'Navigation belongs in a connector or hook.', name: 'next/navigation' },
            { message: 'Payload must not be imported by presentational UI.', name: 'payload' },
            { message: 'Database drivers must remain server-side.', name: 'pg' },
            {
              importNames: [
                'useCallback',
                'useEffect',
                'useMemo',
                'useReducer',
                'useRef',
                'useState',
              ],
              message: 'Presentational UI receives state and behavior through props.',
              name: 'react',
            },
          ],
          patterns: [
            {
              group: ['**/hooks/**', '**/services/**'],
              message: 'UI cannot import hooks or services.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    '.next-app-test/**',
    '.next-e2e/**',
    '.next-production-test/**',
    'playwright-report/**',
    'test-results/**',
    'src/payload-types.ts',
    'src/payload-generated-schema.ts',
    'src/app/(payload)/admin/importMap.js',
  ]),
])
