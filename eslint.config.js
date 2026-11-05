// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['server/**', 'engine/**', 'shared/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**'],
    languageOptions: { globals: globals.browser },
  },
  // Architecture boundaries (see CLAUDE.md §6).
  {
    files: ['engine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(server|client)(/|$)',
              message: 'engine/ must not import from server/ or client/.',
            },
          ],
        },
      ],
    },
  },
  {
    // The client imports shared/, so shared/ importing engine/ would pull
    // game logic into the client bundle.
    files: ['shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(engine|server|client)(/|$)',
              message: 'shared/ must not import from engine/, server/ or client/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['client/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(engine|server)(/|$)',
              message:
                'The client only renders snapshots: import from shared/, never engine/ or server/.',
            },
          ],
        },
      ],
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
