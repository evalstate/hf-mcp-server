module.exports = [
  // Base configurations
  require('@eslint/js').configs.recommended,
  
  // Global settings
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/build/**'],
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parser: require('@typescript-eslint/parser'),
      globals: {
        ...require('globals').browser,
        ...require('globals').es2017,
        ...require('globals').node,
      },
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2020,
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      'prettier': require('eslint-plugin-prettier'),
    },
    rules: {
      // ESLint rules
      'no-constant-condition': 'off',
      
      // TypeScript rules
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-interfaces': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    }
  }
];