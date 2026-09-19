# 07. ビルドとデプロイ

[← 06. UI・UX・演出](./06-ui-ux.md) | [目次](./README.md) | [次: 08. MVP ロードマップ →](./08-mvp-roadmap.md)

---

## 7.1 前提

| 項目 | 値 |
| --- | --- |
| リポジトリ | `sakanayuki/cc_ghostar` |
| 公開 URL | `https://sakanayuki.github.io/cc_ghostar/` |
| Pages の種別 | Project Pages |
| **Vite の `base`** | **`/cc_ghostar/`** |
| 公開方式 | GitHub Actions からの直接デプロイ |
| デプロイ契機 | `main` への push、および手動実行 |
| Node | 22（LTS） |
| パッケージマネージャ | npm（`package-lock.json` をコミット） |

### HTTPS について

本作は `getUserMedia`、Torch 制御、DeviceOrientation、Wake Lock を使用し、
これらはすべて**セキュアコンテキストを要求する**。

GitHub Pages は `*.github.io` に対して HTTPS を自動提供するため、この要件は追加作業なしに満たされる。
これが本 PoC の配信先として GitHub Pages が適している主要な理由である。

### base path に関する注意

Project Pages では公開 URL にリポジトリ名のパスが挟まる。
`base` の設定を怠ると、**ビルドは成功するのにデプロイ後に JS と GLB が 404 になる**という、
ローカル開発では絶対に再現しない事故が起きる。

コード内で静的アセットを参照する際は、**必ず `import.meta.env.BASE_URL` を使う**こと。

```typescript
// 正しい
const url = `${import.meta.env.BASE_URL}models/ghost.glb`;

// 誤り：Pages で 404 になる
const url = '/models/ghost.glb';
```

---

## 7.2 package.json

```json
{
  "name": "cc-ghostar",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run typecheck && npm run lint && npm run test && vite build"
  },
  "dependencies": {
    "three": "0.186.0"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/three": "0.186.0",
    "@vitest/coverage-v8": "5.0.1",
    "eslint": "10.11.0",
    "eslint-config-prettier": "10.1.8",
    "globals": "16.5.0",
    "prettier": "3.9.8",
    "typescript": "5.9.3",
    "typescript-eslint": "8.70.0",
    "vite": "8.3.0",
    "vitest": "5.0.1"
  }
}
```

### バージョン固定について

[Q18 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、
**キャレット（`^`）を使わず完全固定**とする。

特に `three` は重要である。Three.js はマイナーリリース間でも破壊的変更を導入する慣行があり、
キャレット指定にしていると、`package-lock.json` を更新した無関係なタイミングで
突然ビルドやレンダリングが壊れる。

依存の更新は意図的に行い、更新時は必ず実機で描画を確認すること。

### TypeScript のバージョン上限

**TypeScript は最新版を使えない。** `typescript-eslint@8.70.0` の peer 依存が
`typescript: ">=4.8.4 <6.1.0"` であり、TypeScript 7 系を入れると型付き lint が
動作しなくなる。実装時点の最新は 7.0.2 だったが、5.9.3 に固定した。

依存を更新する際は、この制約を最初に確認すること。

```bash
npm view typescript-eslint peerDependencies
```

> 上記のバージョンは実装時点で固定したものである。更新は意図的に行い、
> 更新時は必ず `npm run verify` と実機での描画を確認すること。
> 重要なのは特定のバージョン番号ではなく、固定されていることである。

---

## 7.3 Vite 設定

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cc_ghostar/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,   // LAN 上の実機から開発サーバーへ接続するため
  },
});
```

### `sourcemap: true` の理由

本番バンドルにソースマップを含める。
[Q15 の決定](./09-design-md-mapping.md#92-主要な設計判断)により実機デバッグを
Pages 上の本番 URL で行うため、スタックトレースが読めることの価値が
ソースコードの秘匿より大きい。本作は公開リポジトリであり、隠すべきものがない。

### `manualChunks` の理由

`three` を別チャンクに分離する。
アプリケーションコードの更新時に Three.js のチャンクがキャッシュから再利用され、
実機での再読み込みが速くなる。実機検証の反復回数が多い本 PoC では効果が大きい。

### 開発サーバーと HTTPS

`server.host: true` で LAN 上の実機から開発サーバーにアクセスできるが、
**`http://192.168.x.x:5173` は非セキュアコンテキストとなり、カメラもセンサーも動作しない。**

実機での開発時の選択肢は次の 3 つ。

| 手段 | 備考 |
| --- | --- |
| Pages にデプロイして確認 | 最も確実。本設計の標準手段 |
| `chrome://flags/#unsafely-treat-insecure-origin-as-secure` に LAN の URL を登録 | Android Chrome で可能。ホットリロードが使えるため反復が速い |
| ローカルに自己署名証明書を立てる | 証明書の信頼設定が手間。推奨しない |

2 番目が最も開発効率が良い。実装着手時に README へ手順を記載すること。

---

## 7.4 TypeScript 設定

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["vite/client"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

`noUncheckedIndexedAccess` を有効にする。
`speedByRemaining[idx]` のような配列アクセスが `undefined` を含む型になり、
[04.5](./04-game-rules.md#接近速度の算出) の添字計算の誤りをコンパイル時に検出できる。

---

## 7.5 ESLint 設定

[Q13 の決定](./09-design-md-mapping.md#92-主要な設計判断)で定めた層の境界を、
**人間の注意力ではなく静的解析で強制する**。

```javascript
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },

  // ── domain 層の純粋性を強制する ──────────────
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/application/*', '@/infrastructure/*', '@/presentation/*'],
            message: 'domain 層は他の層に依存できません。',
          },
        ],
        paths: [
          {
            name: 'three',
            // 数学クラスのみ許可する（02.3 参照）
            allowImportNames: [
              'Vector3', 'Vector2', 'Quaternion', 'Euler', 'Matrix4', 'MathUtils',
            ],
            message:
              'domain 層で使える three は数学クラスのみです。' +
              'Object3D 以上を使う処理は infrastructure/rendering に置いてください。',
          },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'window',     message: 'domain 層はブラウザ API を参照できません。' },
        { name: 'document',   message: 'domain 層はブラウザ API を参照できません。' },
        { name: 'navigator',  message: 'domain 層はブラウザ API を参照できません。' },
        { name: 'screen',     message: 'domain 層はブラウザ API を参照できません。' },
        { name: 'localStorage', message: 'domain 層はブラウザ API を参照できません。' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random',
          message: '乱数は引数で受け取ってください（テスト可能性のため）。' },
        { object: 'Date', property: 'now',
          message: '時刻は ClockPort 経由で引数として受け取ってください。' },
        { object: 'performance', property: 'now',
          message: '時刻は ClockPort 経由で引数として受け取ってください。' },
      ],
    },
  },

  // ── application 層は infrastructure を知らない ──
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/infrastructure/*', '@/presentation/*'],
            message:
              'application 層は具体実装に依存できません。ports のインターフェースを使ってください。',
          },
        ],
      }],
    },
  },

  // ── プライバシー方針の強制（01.5）────────────
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'fetch',
          message: '外部送信は行いません（01.5 プライバシー方針）。' +
                   'アセット読み込みは Vite の import か GLTFLoader を使ってください。' },
        { name: 'XMLHttpRequest',
          message: '外部送信は行いません（01.5 プライバシー方針）。' },
      ],
    },
  },

  {
    ignores: ['dist/', 'node_modules/', 'public/'],
  },
);
```

`main.ts` は合成ルートであり全層に依存してよいため、上記の制約の対象外とする
（`src/domain/` `src/application/` にのみ適用しているため自動的に除外される）。

---

## 7.6 Vitest 設定

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // domain は DOM を必要としない。node 環境で十分かつ高速
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
```

カバレッジの計測対象を `src/domain/**` に限定する。
インフラ層はブラウザ API のラッパーであり、単体テストの費用対効果が低い。
検証すべきなのは[03.6 の純粋関数群](./03-domain-model.md#36-純粋関数の一覧とテスト対象)である。

---

## 7.7 GitHub Actions ワークフロー

[Q3 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、ワークフローは 1 本とする。
検証（型・Lint・テスト）に通ったときだけデプロイする。

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

# GITHUB_TOKEN に Pages への書き込みを許可する。PAT は不要
permissions:
  contents: read
  pages: write
  id-token: write

# 進行中のデプロイを止めず、後続を 1 つだけ待たせる
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      # ── 品質ゲート（Q11）────────────────────
      # いずれかが失敗した時点でデプロイは行われない
      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test

      # ── ビルド ──────────────────────────────
      - name: Build
        run: npx vite build

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 設計上の要点

| 項目 | 理由 |
| --- | --- |
| `permissions` を最小化 | `pages: write` と `id-token: write` のみで足り、PAT は不要 |
| `concurrency: cancel-in-progress: false` | デプロイの途中中断を避ける。Pages のデプロイは中断すると中途半端な状態になりうる |
| ジョブを `build` と `deploy` に分離 | `deploy-pages` の要求する構成。`environment` の指定もこちらに置く |
| `node-version-file: .nvmrc` | ローカルと CI の Node バージョンを単一の情報源で揃える |
| `npm ci` | `package-lock.json` に厳密に従う。`npm install` は lockfile を書き換えうる |
| ビルドで `npx vite build` を直接呼ぶ | `npm run build` は `tsc --noEmit` を含み、直前の typecheck と重複するため |

### 品質ゲートの順序

型 → Lint → テスト → ビルドの順とする。
失敗の検出が速い順に並べることで、失敗時のフィードバックが早まる。
型エラーは数秒で検出できるが、ビルドは数十秒かかる。

---

## 7.8 リポジトリ側の設定

実装着手時に、リポジトリで以下を設定すること。**これはコードでは自動化できない。**

### Pages の有効化

```text
Settings → Pages → Build and deployment → Source
  → "GitHub Actions" を選択
```

`Deploy from a branch` のままだとワークフローが権限エラーで失敗する。

### .nojekyll

```text
public/.nojekyll   （空ファイル）
```

GitHub Pages は既定で Jekyll による処理を行い、
**アンダースコアで始まるファイルとディレクトリを無視する**。
Vite の出力に `_` 始まりの名前が含まれた場合、そのアセットだけが 404 になる。

`public/` に置くことで `dist/` のルートへコピーされる。

> `actions/upload-pages-artifact` は Jekyll 処理を行わないため、
> 現行の構成では実害が出ない可能性が高い。
> ただし空ファイル 1 つで確実に排除できるリスクであり、置いておく。

---

## 7.9 パフォーマンス上の実装規約

原典 §27・§28 の目標を達成するための、コードレベルの規約。

### 毎フレーム実行される箇所での禁止事項

```text
× new THREE.Vector3() などのオブジェクト生成
× 配列の map / filter / spread によるコピー
× 文字列の連結
× console.log
× JSON.parse / stringify
× localStorage へのアクセス
```

毎フレームのオブジェクト生成は GC を誘発し、
数百 ms のフレーム落ちとして現れる。これは 60 FPS の維持と直接競合する。

```typescript
// モジュールスコープに作業用インスタンスを確保する
const _tmpVec = new Vector3();
const _tmpQuat = new Quaternion();

export function beamAxis(q: Quaternion, out = _tmpVec): Vector3 {
  return out.set(0, 0, -1).applyQuaternion(q);
}
```

> ドメイン層は不変データを返す設計（[03.2](./03-domain-model.md#ゴースト)）だが、
> ゴーストは最大 3 体であり、1 フレームあたりの生成数は十分に小さい。
> 不変性による可読性・テスト容易性の利益が、この規模では生成コストを上回る。
> 数学関数のように**毎フレーム何度も呼ばれるもの**についてのみ、バッファ再利用を徹底する。

### 描画側

| 項目 | 方針 |
| --- | --- |
| シャドウマップ | 使用しない（原典 §28） |
| アンチエイリアス | 無効（モバイルでは負荷に見合わない） |
| `devicePixelRatio` | 上限 2 にクランプ |
| ポストプロセス | 使用しない（原典 §28・§36） |
| パーティクル | 使用しない（原典 §28） |
| 動的ライト | 2 つまで（AmbientLight + SpotLight） |
| 視野外のゴースト | `visible = false` にし、アニメーション更新も行わない |

### 計測

デバッグ HUD（[06.5](./06-ui-ux.md#65-デバッグ-hud)）に FPS・最小 FPS・フレーム時間を常時表示する。
最小 FPS を記録するのは、平均では見えないスパイク的なフレーム落ちを捉えるためである。

---

## 7.10 リポジトリ構成物

| ファイル | 内容 |
| --- | --- |
| `README.md` | 概要、公開 URL、開発手順、実機確認の手順、設計書へのリンク |
| `LICENSE` | MIT |
| `.nvmrc` | `22` |
| `.gitignore` | `node_modules/`、`dist/`、`.DS_Store` |
| `.prettierrc` | 既定設定 + `singleQuote: true` |
| `public/.nojekyll` | 空ファイル |
| `public/audio/ghost-voice.mp3` | ゴーストの声。差し替え可（[05.5](./05-infrastructure.md#素材の差し替え)） |
| `public/models/ghost.glb` | 任意。置けば GLB 表示へ切り替わる |
| `docs/` | 本設計書 |

---

[← 06. UI・UX・演出](./06-ui-ux.md) | [目次](./README.md) | [次: 08. MVP ロードマップ →](./08-mvp-roadmap.md)
