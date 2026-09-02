// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const stylistic = require('@stylistic/eslint-plugin');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      stylistic.configs.recommended,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      'curly': [
        'error',
        'all'
      ],
      'no-warning-comments': [
        'warn',
        {
          terms: ['DEV'],
          location: 'start'
        }
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@stylistic/array-bracket-spacing': [
        'error',
        'never'
      ],
      '@stylistic/array-element-newline': [
        'error',
        'consistent'
      ],
      '@stylistic/arrow-parens': [
        'error',
        'always'
      ],
      '@stylistic/arrow-spacing': [
        'error',
        { before: true, after: true }
      ],
      '@stylistic/block-spacing': [
        'error',
        'always'
      ],
      '@stylistic/brace-style': [
        'error',
        '1tbs',
        { allowSingleLine: true }
      ],
      '@stylistic/comma-dangle': [
        'error',
        'only-multiline'
      ],
      '@stylistic/comma-spacing': [
        'error',
        { before: false, after: true }
      ],
      '@stylistic/comma-style': [
        'error',
        'last'
      ],
      '@stylistic/computed-property-spacing': [
        'error',
        'never'
      ],
      '@stylistic/curly-newline': [
        'error',
        'always'
      ],
      '@stylistic/dot-location': [
        'error',
        'property'
      ],
      '@stylistic/eol-last': [
        'error',
        'always'
      ],
      '@stylistic/function-call-argument-newline': [
        'error',
        'consistent'
      ],
      '@stylistic/function-call-spacing': [
        'error',
        'never'
      ],
      '@stylistic/function-paren-newline': [
        'error',
        'multiline-arguments'
      ],
      '@stylistic/implicit-arrow-linebreak': [
        'error',
        'beside'
      ],
      '@stylistic/indent': [
        'error',
        2
      ],
      '@stylistic/indent-binary-ops': [
        'error',
        2
      ],
      '@stylistic/key-spacing': [
        'error',
        { beforeColon: false, afterColon: true }
      ],
      '@stylistic/keyword-spacing': [
        'error',
        { before: true, after: true }
      ],
      '@stylistic/line-comment-position': [
        'error',
        { position: 'above' }
      ],
      '@stylistic/lines-around-comment': [
        'error',
        {
          beforeBlockComment: true,
          afterBlockComment: false,
          beforeLineComment: true,
          afterLineComment: false,
          allowBlockStart: true,
          allowBlockEnd: true,
          allowObjectStart: true,
          allowObjectEnd: true,
          allowArrayStart: true,
          allowArrayEnd: true,
        }
      ],
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true }
      ],
      
      '@stylistic/max-len': [
        'warn',
        { 
          code: 120, 
          ignoreComments: false,
          ignoreStrings: false,
          ignoreUrls: false,
        }
      ],
      '@stylistic/max-statements-per-line': [
        'error',
        { max: 1 }
      ],
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: {
            delimiter: 'comma',
            requireLast: true
          },
          singleline: {
            delimiter: 'comma',
            requireLast: false
          }
        }
      ],
      '@stylistic/multiline-ternary': [
        'error',
        'always-multiline'
      ],
      '@stylistic/new-parens': [
        'error',
        'always'
      ],
      '@stylistic/newline-per-chained-call': [
        'error',
        { ignoreChainWithDepth: 2 }
      ],
      '@stylistic/no-confusing-arrow': [
        'error',
        { allowParens: true }
      ],
      '@stylistic/no-extra-semi': [
        'error'
      ],
      '@stylistic/no-floating-decimal': [
        'error'
      ],
      '@stylistic/no-mixed-spaces-and-tabs': [
        'error'
      ],
      '@stylistic/no-multi-spaces': [
        'error'
      ],
      '@stylistic/no-multiple-empty-lines': [
        'error',
        { max: 2, maxEOF: 0, maxBOF: 0 }
      ],
      '@stylistic/no-tabs': [
        'error'
      ],
      '@stylistic/no-trailing-spaces': [
        'error',
        {
          skipBlankLines: true,
          ignoreComments: true
        }
      ],
      '@stylistic/no-whitespace-before-property': [
        'error'
      ],
      '@stylistic/object-curly-newline': [
        'error',
        { multiline: true, consistent: true }
      ],
      '@stylistic/object-curly-spacing': [
        'error',
        'always'
      ],
      '@stylistic/one-var-declaration-per-line': [
        'error',
        'always'
      ],
      '@stylistic/operator-linebreak': [
        'error',
        'after',
        { overrides: { '?': 'before', ':': 'before' } }
      ],
      '@stylistic/padded-blocks': [
        'error',
        'never'
      ],
      '@stylistic/quote-props': [
        'error',
        'consistent-as-needed'
      ],
      '@stylistic/quotes': [
        'error',
        'single'
      ],
      '@stylistic/rest-spread-spacing': [
        'error',
        'never'
      ],
      '@stylistic/semi': [
        'error',
        'always'
      ],
      '@stylistic/semi-spacing': [
        'error',
        { before: false, after: true }
      ],
      '@stylistic/semi-style': [
        'error',
        'last'
      ],
      '@stylistic/space-before-blocks': [
        'error',
        'always'
      ],
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always'
        }
      ],
      '@stylistic/space-in-parens': [
        'error',
        'never'
      ],
      '@stylistic/space-infix-ops': [
        'error'
      ],
      '@stylistic/space-unary-ops': [
        'error',
        { words: true, nonwords: false }
      ],
      '@stylistic/spaced-comment': [
        'error',
        'always'
      ],
      '@stylistic/switch-colon-spacing': [
        'error',
        { after: true, before: false }
      ],
      '@stylistic/template-curly-spacing': [
        'error',
        'never'
      ],
      '@stylistic/type-annotation-spacing': [
        'error',
        {
          before: false,
          after: true,
          overrides: {
            arrow: 'ignore',
          }
        }
      ],
      '@stylistic/type-named-tuple-spacing': [
        'error'
      ],
      '@stylistic/wrap-regex': [
        'error'
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
