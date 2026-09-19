# 02. アーキテクチャ

[← 01. 概要](./01-overview.md) | [目次](./README.md) | [次: 03. ドメインモデル →](./03-domain-model.md)

---

## 2.1 基本方針

原典 §33 は「ゲームロジックからブラウザ API を直接呼び出さない」というルールを定めている。
本設計はこれを 4 層のレイヤードアーキテクチャとして具体化し、**依存の向きを一方向に固定する**。

この構成を採る理由は単一である。**カメラ・Torch・ジャイロを伴う総合動作は実機でしか確認できず、デバッグの往復コストが極めて高い**。
したがって、バグが発生しやすい計算部分をブラウザから切り離し、Node 上の自動テストで検証可能にしておくことの価値が大きい。

---

## 2.2 レイヤ構成

```text
┌─────────────────────────────────────────────────┐
│ presentation                                    │
│   HUD / タイトル / 結果表示 / デバッグ HUD       │
│   DOM を直接操作する。ゲーム状態を読むのみ       │
└────────────────────┬────────────────────────────┘
                     │ 依存
┌────────────────────▼────────────────────────────┐
│ application                                     │
│   ゲームループ / 状態機械 / ユースケース         │
│   ポート（インターフェース）を定義する           │
│   具体的な実装を一切知らない                     │
└────────────────────┬────────────────────────────┘
                     │ 依存
┌────────────────────▼────────────────────────────┐
│ domain                                          │
│   ゲームルール / 姿勢計算 / 判定 / 状態遷移      │
│   純粋関数と不変データのみ                       │
│   副作用・時刻取得・乱数を持たない               │
└─────────────────────────────────────────────────┘
                     ▲
                     │ 実装（ポートを満たす）
┌────────────────────┴────────────────────────────┐
│ infrastructure                                  │
│   カメラ / Torch / センサー / 音響 / WebGL       │
│   ブラウザ API に触れてよい唯一の層              │
└─────────────────────────────────────────────────┘
```

### 依存規則

| 層 | 依存してよい先 |
| --- | --- |
| `domain` | なし（`three` の数学 API のみ例外的に許可。後述） |
| `application` | `domain` のみ |
| `infrastructure` | `application` が定義したポート、`domain` |
| `presentation` | `application`、`domain` |
| `main.ts`（合成ルート） | 全層。ここだけが具体実装をポートに注入する |

`infrastructure` は `application` に**依存される側ではなく、実装する側**である。
`application` はポート（インターフェース）を定義するだけで、その実装が何であるかを知らない。
この反転により、実機のセンサーをモック入力に差し替えることが、合成ルートの 1 行の変更で済む。

---

## 2.3 domain 層における `three` の扱い

`domain` は原則として外部パッケージに依存しない。ただし **`three` の数学クラスのみ例外的に許可する**。

### 許可するもの

```text
THREE.Vector3
THREE.Quaternion
THREE.Euler
THREE.Matrix4
THREE.MathUtils
```

これらは WebGL・DOM・レンダリングに一切触れない純粋な数値計算実装であり、
Node 上の Vitest から import しても問題なく動作する。

### 禁止するもの

```text
THREE.Object3D およびその派生（Scene / Mesh / Camera / Light など）
THREE.WebGLRenderer
THREE.Loader およびその派生
THREE.Material / THREE.Geometry / THREE.Texture
```

### 判断の根拠

姿勢計算（デバイスの alpha/beta/gamma からカメラの向きを導く変換）はクォータニオン演算を含み、
自前実装すると符号・回転順序の誤りという、極めて発見しづらいバグを生む。
`three` の実装は広く検証されており、これを再発明する合理性がない。

一方で `Object3D` 以上を許すと、シーングラフの構築がドメインに混入し、テスト不能になる。
したがって**境界を `Object3D` に置く**。

### 機械的な強制

この境界は人間の注意力に頼らず、ESLint の `no-restricted-imports` で強制する。
設定の全文は [07. ビルドとデプロイ](./07-build-deploy.md#75-eslint-設定) に示す。

---

## 2.4 ディレクトリ構成

```text
.
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .nvmrc
├── .nojekyll                     （public/ に配置。7 章参照）
├── docs/                         本設計書
├── public/
│   ├── .nojekyll
│   └── models/
│       └── （ghost.glb を配置するとプレースホルダから自動切替）
├── src/
│   ├── main.ts                   合成ルート。唯一 DI を行う場所
│   │
│   ├── domain/                   ── 純粋・副作用なし・テスト対象
│   │   ├── config/
│   │   │   └── GameConfig.ts         全チューニング値の集約
│   │   ├── math/
│   │   │   ├── Attitude.ts           端末姿勢 → カメラ姿勢の変換
│   │   │   ├── Spherical.ts          方位・距離 ↔ 直交座標
│   │   │   └── BeamCone.ts           光錐内判定
│   │   ├── ghost/
│   │   │   ├── Ghost.ts              ゴーストの状態と型
│   │   │   ├── GhostBehavior.ts      1 フレーム分の状態遷移（純粋関数）
│   │   │   └── GhostSpawner.ts       初期配置の決定（乱数は引数で受ける）
│   │   ├── session/
│   │   │   ├── GameState.ts          状態機械の定義と遷移関数
│   │   │   └── SessionResult.ts      勝敗とクリアタイム
│   │   └── light/
│   │       └── LightState.ts         照射状態（物理 Torch と独立）
│   │
│   ├── application/              ── オーケストレーション
│   │   ├── ports/                    インターフェース定義のみ
│   │   │   ├── CameraPort.ts
│   │   │   ├── TorchPort.ts
│   │   │   ├── OrientationPort.ts
│   │   │   ├── MotionPort.ts
│   │   │   ├── AudioPort.ts
│   │   │   ├── ScenePort.ts
│   │   │   ├── HapticsPort.ts
│   │   │   ├── ScreenPort.ts
│   │   │   ├── StoragePort.ts
│   │   │   └── ClockPort.ts
│   │   ├── Game.ts                   セッション全体の制御
│   │   ├── GameLoop.ts               requestAnimationFrame の駆動
│   │   ├── CalibrationService.ts     方位基準の設定
│   │   └── CapabilityService.ts      capability 検出と起動可否判定
│   │
│   ├── infrastructure/           ── ブラウザ API に触れる唯一の層
│   │   ├── camera/
│   │   │   ├── MediaCameraAdapter.ts
│   │   │   ├── MediaTorchAdapter.ts
│   │   │   └── MockCameraAdapter.ts
│   │   ├── sensors/
│   │   │   ├── DeviceOrientationAdapter.ts
│   │   │   ├── DeviceMotionAdapter.ts
│   │   │   └── MockOrientationAdapter.ts
│   │   ├── rendering/
│   │   │   ├── ThreeSceneAdapter.ts   ScenePort の実装
│   │   │   ├── Lighting.ts
│   │   │   ├── GhostView.ts           表示実装のインターフェース
│   │   │   ├── ProceduralGhostView.ts GLB 不在時の実装
│   │   │   └── GltfGhostView.ts       GLB 存在時の実装
│   │   ├── audio/
│   │   │   ├── WebAudioAdapter.ts
│   │   │   └── ProceduralVoice.ts     音源の手続き生成
│   │   ├── device/
│   │   │   ├── VibrationAdapter.ts
│   │   │   ├── ScreenAdapter.ts       全画面・向きロック・Wake Lock
│   │   │   └── CapabilityDetector.ts
│   │   └── storage/
│   │       └── LocalStorageAdapter.ts
│   │
│   ├── presentation/             ── DOM / UI
│   │   ├── Hud.ts
│   │   ├── TitleScreen.ts
│   │   ├── ResultScreen.ts
│   │   ├── OverlayMessage.ts          エラー・告知・回転促し
│   │   ├── DebugHud.ts
│   │   └── styles.css
│   │
│   └── shared/                   ── 全層から参照される最小の共有物
│       ├── RuntimeOptions.ts          URL クエリの解釈
│       └── types.ts                   Brand 型など
│
├── tests/
│   └── domain/                    domain と同じ構造でミラーする
│
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── LICENSE
└── README.md
```

原典 §32 の構成からの変更点とその理由は [09. 原典との対応表](./09-design-md-mapping.md) に全件記載する。

---

## 2.5 ポート定義

`application/ports/` に置くインターフェース群。
実装は `infrastructure` が担い、注入は `main.ts` が行う。

### CameraPort

```typescript
export interface CameraPort {
  /** カメラを起動し、映像要素を返す。失敗時は CameraError を throw する */
  start(): Promise<HTMLVideoElement>;
  /** トラックを停止し、リソースを解放する */
  stop(): void;
  /** 現在アクティブかどうか */
  isActive(): boolean;
  /** Torch 制御に必要なトラック。未起動時は null */
  getTrack(): MediaStreamTrack | null;
}
```

### TorchPort

```typescript
export type TorchAvailability = 'UNAVAILABLE' | 'AVAILABLE' | 'ERROR';

export interface TorchPort {
  /** capability 検査。カメラ起動後に一度だけ呼ばれる */
  probe(track: MediaStreamTrack): Promise<TorchAvailability>;
  /** 物理 LED の点灯を試みる。失敗しても throw せず false を返す */
  apply(on: boolean): Promise<boolean>;
  availability(): TorchAvailability;
}
```

> `TorchPort` は**ゲームの勝敗に一切関与しない**。
> ゲームは `domain/light/LightState` のみを参照し、`TorchPort` はその状態を現実に反映しようと試みるだけの出力先である。
> この分離が、Torch 非対応端末と PC ブラウザの双方でゲームを成立させる。

### OrientationPort

```typescript
export interface DeviceAttitude {
  /** Z 軸回転（0〜360）。絶対方位が取得できた場合は磁北基準 */
  alpha: number;
  /** X 軸回転（-180〜180） */
  beta: number;
  /** Y 軸回転（-90〜90） */
  gamma: number;
  /** screen.orientation.angle。姿勢補正に必須 */
  screenAngle: number;
  /** 磁北基準の絶対方位か。deviceorientationabsolute 由来なら true */
  absolute: boolean;
}

export interface OrientationPort {
  start(): Promise<void>;
  stop(): void;
  /** 最新の姿勢。未取得なら null */
  read(): DeviceAttitude | null;
  isAvailable(): boolean;
}
```

### MotionPort

```typescript
export interface MotionPort {
  start(): Promise<void>;
  stop(): void;
  /**
   * 直近フレームでシェイクが検出されたか。
   * 読み取りで消費され、同じシェイクが二度返ることはない。
   */
  consumeShake(): boolean;
  isAvailable(): boolean;
}
```

### AudioPort

```typescript
export interface AudioPort {
  /** ユーザー操作のハンドラ内から呼ぶ必要がある */
  unlock(): Promise<void>;
  /** リスナーの向きを更新する */
  setListenerOrientation(forward: Vector3Like, up: Vector3Like): void;
  /** ゴーストごとの音源を生成・更新・破棄する */
  attachGhost(id: GhostId): void;
  updateGhost(id: GhostId, position: Vector3Like, intensity: number): void;
  detachGhost(id: GhostId): void;
  /** 一度きりの効果音 */
  playOneShot(kind: OneShotSound): void;
  setMuted(muted: boolean): void;
}

export type OneShotSound =
  | 'PURIFY_PROGRESS'
  | 'PURIFY_COMPLETE'
  | 'GRAB'
  | 'ESCAPE'
  | 'GAME_OVER'
  | 'GAME_CLEAR';
```

### ScenePort

`application` が Three.js を知らずに描画を指示するための抽象。

```typescript
export interface ScenePort {
  resize(width: number, height: number): void;
  /** カメラ姿勢を設定する */
  setCameraQuaternion(q: QuaternionLike): void;
  /** ゴーストの表示状態を同期する */
  syncGhosts(views: readonly GhostViewModel[]): void;
  /** 仮想スポットライトの ON/OFF */
  setBeamEnabled(enabled: boolean): void;
  render(): void;
  dispose(): void;
}

export interface GhostViewModel {
  id: GhostId;
  position: Vector3Like;
  /** 0〜1。表示の濃さ。0 なら描画しない */
  opacity: number;
  animation: 'IDLE' | 'WALK' | 'ATTACK' | 'APPEAR' | 'DISAPPEAR';
  purifyRatio: number;
}
```

### その他のポート

```typescript
export interface HapticsPort {
  vibrate(patternMs: number | readonly number[]): void;
  isAvailable(): boolean;
}

export interface ScreenPort {
  /** ユーザー操作のハンドラ内から呼ぶ。個別の失敗は throw せず結果に含める */
  enterImmersive(): Promise<ImmersiveResult>;
  exitImmersive(): Promise<void>;
  /** visibilitychange 後の Wake Lock 再取得に用いる */
  reacquireWakeLock(): Promise<void>;
  isPortrait(): boolean;
  onOrientationChange(cb: (angle: number) => void): () => void;
}

export interface ImmersiveResult {
  fullscreen: boolean;
  orientationLocked: boolean;
  wakeLock: boolean;
}

export interface StoragePort {
  readBestTimeMs(): number | null;
  writeBestTimeMs(ms: number): void;
}

/** 時刻を domain から締め出すためのポート */
export interface ClockPort {
  /** 単調増加するミリ秒。performance.now() 相当 */
  now(): number;
}
```

---

## 2.6 データフロー

1 フレームの処理順序。原典 §15 のゲームループを本構成に写したもの。

```text
requestAnimationFrame
  │
  ├─ ClockPort.now() で dt を算出（上限でクランプ）
  │
  ├─ OrientationPort.read()         … infrastructure
  │     ↓ DeviceAttitude
  ├─ Attitude.toCameraQuaternion()  … domain（純粋）
  │     ↓ Quaternion
  ├─ BeamCone.axisFrom()            … domain（純粋）
  │     ↓ 光軸ベクトル
  ├─ MotionPort.consumeShake()      … infrastructure
  │     ↓ boolean
  ├─ GhostBehavior.step()           … domain（純粋）
  │     入力: 前フレームのゴースト配列 / 光軸 / 照射状態 / shake / dt / config
  │     出力: 新しいゴースト配列 + 発生イベント配列
  │     ↓
  ├─ GameState.reduce()             … domain（純粋）
  │     ↓ 新しいセッション状態
  ├─ 発生イベントを副作用へ配送       … application
  │     ├→ AudioPort.playOneShot()
  │     ├→ HapticsPort.vibrate()
  │     └→ StoragePort.writeBestTimeMs()
  │
  ├─ AudioPort.updateGhost() × n     … infrastructure
  ├─ ScenePort.syncGhosts()          … infrastructure
  ├─ ScenePort.render()              … infrastructure
  └─ Hud.update() / DebugHud.update()… presentation
```

`GhostBehavior.step()` と `GameState.reduce()` が**この設計の中核**であり、
両者はブラウザ API・時刻・乱数に触れない純粋関数として、すべての入力を引数で受ける。
したがって Vitest から直接呼び出して検証できる。

---

## 2.7 エラーとイベントの伝播

### ドメインイベント

`GhostBehavior.step()` は状態だけでなくイベント列を返す。副作用は `application` が実行する。

```typescript
export type DomainEvent =
  | { type: 'GHOST_HELD'; id: GhostId }
  | { type: 'GHOST_RELEASED'; id: GhostId }
  | { type: 'GHOST_PURIFIED'; id: GhostId }
  | { type: 'GHOST_GRABBING'; id: GhostId }
  | { type: 'GHOST_ESCAPED'; id: GhostId }   // シェイクによる振り払い成功
  | { type: 'PLAYER_CAUGHT'; id: GhostId }
  | { type: 'SESSION_CLEARED'; elapsedMs: number }
  | { type: 'SESSION_FAILED'; elapsedMs: number };
```

この設計により、ドメインは「何が起きたか」だけを宣言し、
「その結果どんな音を鳴らし、どう振動させるか」を知らずに済む。

### エラー分類

| 分類 | 扱い | 遷移先 |
| --- | --- | --- |
| カメラ拒否・取得失敗 | 致命 | `ERROR_CAMERA` |
| WebGL 初期化失敗 | 致命 | `ERROR_WEBGL` |
| センサー利用不可（かつモック未指定） | 致命 | `ERROR_SENSOR` |
| Torch 非対応・制御失敗 | **非致命** | 告知のみ。ゲームは継続 |
| 振動非対応 | 非致命 | 無視 |
| Wake Lock / 全画面 / 向きロック失敗 | 非致命 | 無視（向きのみオーバーレイで促す） |
| 音響初期化失敗 | 非致命 | 無音で継続。デバッグ HUD にのみ表示 |
| GLB 読み込み失敗 | 非致命 | プレースホルダ表示へフォールバック |

原典 §34 の「Torch unsupported を Fatal Error としない」を、上表として明示的に一般化した。

---

[← 01. 概要](./01-overview.md) | [目次](./README.md) | [次: 03. ドメインモデル →](./03-domain-model.md)
