import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const BROWSER_API_MESSAGE = 'domain 層はブラウザ API を参照できません。';

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'public/'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,

  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 設定ファイルは型付き lint の対象外
  {
    files: ['*.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  // ── domain 層の純粋性を強制する（設計書 02.3 / 07.5）──
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/application/*', '@/infrastructure/*', '@/presentation/*'],
              message: 'domain 層は他の層に依存できません。',
            },
          ],
          paths: [
            {
              name: 'three',
              allowImportNames: [
                'Vector2',
                'Vector3',
                'Quaternion',
                'Euler',
                'Matrix4',
                'MathUtils',
              ],
              message:
                'domain 層で使える three は数学クラスのみです。' +
                'Object3D 以上を使う処理は infrastructure/rendering に置いてください。',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: BROWSER_API_MESSAGE },
        { name: 'document', message: BROWSER_API_MESSAGE },
        { name: 'navigator', message: BROWSER_API_MESSAGE },
        { name: 'screen', message: BROWSER_API_MESSAGE },
        { name: 'localStorage', message: BROWSER_API_MESSAGE },
        { name: 'performance', message: BROWSER_API_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '乱数は引数で受け取ってください（テスト可能性のため）。',
        },
        {
          object: 'Date',
          property: 'now',
          message: '時刻は ClockPort 経由で引数として受け取ってください。',
        },
        {
          object: 'performance',
          property: 'now',
          message: '時刻は ClockPort 経由で引数として受け取ってください。',
        },
      ],
    },
  },

  // ── application 層は具体実装を知らない ──
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/infrastructure/*', '@/presentation/*'],
              message:
                'application 層は具体実装に依存できません。ports のインターフェースを使ってください。',
            },
          ],
        },
      ],
    },
  },

  // ── プライバシー方針の強制（設計書 01.5）──
  //
  // 禁じたいのは「外部への送信」であって、同梱アセットの読み込みではない。
  // 同一オリジンのアセットを読む箇所だけは個別に eslint-disable で解除し、
  // 解除にはその旨のコメントを必須とする。
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            '外部送信は行いません（設計書 01.5）。同梱アセットの読み込みに限り、' +
            '理由をコメントした上で eslint-disable-next-line で解除してください。',
        },
        { name: 'XMLHttpRequest', message: '外部送信は行いません（設計書 01.5）。' },
      ],
    },
  },

  // domain 層は上のブロックで上書きされるため、制約を再掲する
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: BROWSER_API_MESSAGE },
        { name: 'document', message: BROWSER_API_MESSAGE },
        { name: 'navigator', message: BROWSER_API_MESSAGE },
        { name: 'screen', message: BROWSER_API_MESSAGE },
        { name: 'localStorage', message: BROWSER_API_MESSAGE },
        { name: 'performance', message: BROWSER_API_MESSAGE },
        { name: 'fetch', message: BROWSER_API_MESSAGE },
        { name: 'XMLHttpRequest', message: BROWSER_API_MESSAGE },
      ],
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
