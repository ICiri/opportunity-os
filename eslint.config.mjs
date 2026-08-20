import {defineConfig, globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  prettier,
  globalIgnores([
    '.next/**',
    '.next-dev/**',
    '.execution-pack/**',
    'artifacts/**',
    'coverage/**',
    'node_modules/**',
    'out/**',
    'playwright-report/**',
    'supabase/.temp/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
