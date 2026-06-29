import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte']
      },
      globals: {
        HTMLCanvasElement: 'readonly',
        HTMLImageElement: 'readonly',
      }
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts', 'tsconfig.json']
  }
);
