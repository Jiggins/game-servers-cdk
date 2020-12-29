module.exports = {
  env: {
    browser: true,
    es2020: true
  },
  extends: [
    'standard'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 11,
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
    'no-new': 0,

    // Replace no-unused-vars with TypeScript version
    'no-unused-vars': 0,
    '@typescript-eslint/no-unused-vars': 'warn',

    'space-before-function-paren': ['warn', 'never'],
    'sort-imports': ['warn', {
      allowSeparatedGroups: true,
      memberSyntaxSortOrder: ['none', 'all', 'single', 'multiple']
    }]
  }
}
