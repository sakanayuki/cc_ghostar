# 03. ドメインモデル

[← 02. アーキテクチャ](./02-architecture.md) | [目次](./README.md) | [次: 04. ゲームルール →](./04-game-rules.md)

---

## 3.1 座標系

原典 §16 の定義を、Three.js の規約に合わせて厳密化する。

```text
        Y（上）
        │
        │
        │
  Player●────── X（右）
       ╱
      ╱
    Z（手前）      ワールド前方 = -Z
```

| 項目 | 定義 |
| --- | --- |
| 座標系 | 右手系。Three.js の標準に従う |
| 単位 | メートル |
| 原点 | プレイヤーの足元（床面） |
| 上方向 | +Y |
| **ワールド前方** | **-Z**（Three.js のカメラが既定で向く方向） |
| カメラ高さ | `1.6`（原典 §16。実際の身長との一致は要求しない） |

### 方位の定義

プレイヤーを中心とする水平面上の角度を **方位（azimuth）** と呼ぶ。

| 項目 | 定義 |
| --- | --- |
| 基準 | ワールド前方（-Z）を `0` ラジアンとする |
| 正の向き | 上から見て時計回り（右を向く方向）。すなわち +X 側が正 |
| 範囲 | `(-π, π]` に正規化して保持する |

方位と距離から直交座標への変換は次式による。

```text
x = sin(azimuth) × distance
y = cameraHeight + heightOffset
z = -cos(azimuth) × distance
```

検算：`azimuth = 0` のとき `(0, y, -d)` すなわち正面。
`azimuth = π/2` のとき `(d, y, 0)` すなわち右手側。定義と一致する。

### キャリブレーションとの関係

ワールド前方は**磁北ではなく、キャリブレーション時に端末が向いていた方向**である（原典 §22）。
磁北を採用しない理由は [3.4](#34-キャリブレーション) に述べる。

---

## 3.2 型定義

### 識別子

```typescript
// shared/types.ts
declare const brand: unique symbol;
export type Brand<T, B> = T & { readonly [brand]: B };

export type GhostId = Brand<string, 'GhostId'>;
export const ghostId = (raw: string): GhostId => raw as GhostId;

/** ミリ秒。単調増加する時刻・経過時間の両方に用いる */
export type Millis = Brand<number, 'Millis'>;

/** ラジアン。度と取り違えないための型 */
export type Radians = Brand<number, 'Radians'>;

/** メートル */
export type Meters = Brand<number, 'Meters'>;
```

数値の取り違え（度とラジアン、秒とミリ秒）は AR 実装で頻出する事故であり、
かつ症状が「なんとなくずれる」という形で現れて発見が遅れる。Brand 型でコンパイル時に防ぐ。

### 照射状態

```typescript
// domain/light/LightState.ts

/** ゲームルール上の照射状態。物理 LED とは独立した概念 */
export type LightState = 'ON' | 'OFF';

/** 物理 Torch の状態。表示とデバッグのためだけに存在する */
export type TorchState = 'UNAVAILABLE' | 'OFF' | 'ON' | 'ERROR';
```

> 原典 §7 は `TorchState` の 4 状態を定義している。本設計はそれを維持した上で、
> **ゲームロジックが参照するのは `LightState` のみ**という規則を追加する。
> `TorchState` は表示専用であり、いかなる判定にも用いない。

### ゴースト

```typescript
// domain/ghost/Ghost.ts

export type GhostPhase =
  /** 接近中。捕捉されていない */
  | 'APPROACHING'
  /** 光錐内に捕捉され静止。浄化が進行する */
  | 'HELD'
  /** 距離 0 に到達。シェイクによる振り払いの猶予中 */
  | 'GRABBING'
  /** 浄化完了。消滅演出中 */
  | 'BANISHED';

export interface Ghost {
  readonly id: GhostId;
  /** 現在の方位 */
  readonly azimuth: Radians;
  /** スポーン時の方位。揺らぎの振れ幅を制限する基準 */
  readonly baseAzimuth: Radians;
  /** プレイヤーからの水平距離 */
  readonly distance: Meters;
  /** カメラ高さからの相対的な高さのオフセット */
  readonly heightOffset: Meters;
  readonly phase: GhostPhase;
  /** 浄化ゲージ。0〜1 */
  readonly purify: number;
  /** GRABBING に入った時刻。それ以外は null */
  readonly grabStartedAt: Millis | null;
  /** 振り払いに成功した回数 */
  readonly escapeCount: number;
  /** 方位の揺らぎに用いる位相。個体ごとに固定 */
  readonly wobbleSeed: number;
}
```

すべてのフィールドが `readonly` である。
状態遷移は**新しいオブジェクトを返す**形で表現し、破壊的更新を行わない。
これにより前フレームとの差分比較が容易になり、テストも書きやすくなる。

### セッション

```typescript
// domain/session/GameState.ts

export type GamePhase =
  | 'BOOT'
  | 'TITLE'
  | 'PERMISSION'
  | 'CAMERA_READY'
  | 'CALIBRATION'
  | 'PLAYING'
  | 'PAUSED'
  | 'RESULT'
  | 'ERROR_CAMERA'
  | 'ERROR_SENSOR'
  | 'ERROR_WEBGL';

export interface SessionState {
  readonly phase: GamePhase;
  readonly ghosts: readonly Ghost[];
  readonly light: LightState;
  readonly startedAt: Millis | null;
  readonly elapsedMs: Millis;
  readonly result: SessionResult | null;
}

// domain/session/SessionResult.ts
export interface SessionResult {
  readonly outcome: 'CLEARED' | 'FAILED';
  readonly elapsedMs: Millis;
  readonly purifiedCount: number;
  readonly isNewBest: boolean;
}
```

原典 §34 の状態機械に対する変更点は 2 つある。

1. `GAME_OVER` を `RESULT` に改名し、勝敗を `SessionResult.outcome` で表現する。
   クリアという結果が追加されたため、状態名としての `GAME_OVER` では両方を表せないため。
2. `TITLE` を追加する。リトライ導線の戻り先として必要なため（[04.3](./04-game-rules.md#43-状態機械)）。

---

## 3.3 姿勢変換

### 問題の所在

`DeviceOrientationEvent` の `alpha` / `beta` / `gamma` は、端末固有の座標系における Z-X'-Y'' の内因性回転である。
これを Three.js のカメラ姿勢に変換するには、以下の 3 つの補正が必要になる。

1. オイラー角の回転順序を `YXZ` として解釈し、`gamma` の符号を反転する
2. **端末の「画面が向く方向」と「カメラが向く方向」の差**を補正する（X 軸回りに -90°）
3. **画面の回転角**（`screen.orientation.angle`）を打ち消す

3 番目を忘れると、端末を横持ちしたときにワールドが 90 度ねじれる。
これは AR 実装で最も頻出するバグであり、かつ縦持ちでのテストでは絶対に発見できない。
本設計では[縦固定](./06-ui-ux.md#62-画面の向きと没入モード)を採るが、向きロックは失敗しうるため**補正は必ず実装する**。

### 実装

```typescript
// domain/math/Attitude.ts
import { Euler, Quaternion, Vector3, MathUtils } from 'three';

const ZEE = new Vector3(0, 0, 1);

/** 画面が向く方向とカメラが向く方向の差（X 軸回り -90°） */
const SCREEN_TO_CAMERA = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

/**
 * デバイス姿勢を Three.js のカメラ姿勢へ変換する。
 * 副作用を持たず、同じ入力に対して常に同じ出力を返す。
 */
export function toCameraQuaternion(
  attitude: DeviceAttitude,
  out: Quaternion = new Quaternion(),
): Quaternion {
  const alpha = MathUtils.degToRad(attitude.alpha);
  const beta = MathUtils.degToRad(attitude.beta);
  const gamma = MathUtils.degToRad(attitude.gamma);
  const screen = MathUtils.degToRad(attitude.screenAngle);

  // 1. YXZ 順で解釈。gamma は符号反転
  out.setFromEuler(new Euler(beta, alpha, -gamma, 'YXZ'));
  // 2. 画面向き → カメラ向き
  out.multiply(SCREEN_TO_CAMERA);
  // 3. 画面回転を打ち消す
  out.multiply(new Quaternion().setFromAxisAngle(ZEE, -screen));

  return out;
}
```

> 実装上の注意：上記は可読性のため毎回 `new` しているが、
> 実際には毎フレーム呼ばれるため、モジュールスコープに作業用インスタンスを確保して再利用すること。
> GC 由来のフレーム落ちは 60 FPS 維持の障害になる（[07.9](./07-build-deploy.md#79-パフォーマンス上の実装規約)）。

### 方位の抽出

キャリブレーションと光軸判定のために、姿勢から水平方向の向き（yaw）だけを取り出す。

```typescript
/** カメラ姿勢から水平方位（yaw）を取り出す。上下の傾きを無視する */
export function extractYaw(q: Quaternion): Radians {
  // カメラ前方 (0,0,-1) を回転させ、水平面に投影する
  const forward = new Vector3(0, 0, -1).applyQuaternion(q);
  return normalizeAngle(Math.atan2(forward.x, -forward.z)) as Radians;
}

/** 角度を (-π, π] に正規化する */
export function normalizeAngle(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** 2 つの角度の最小差分。符号付きで (-π, π] */
export function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}
```

`atan2(x, -z)` という引数順に注意すること。
これは [3.1](#31-座標系) で定めた「-Z を 0 とし +X を正とする」方位定義に対応する。
通常の `atan2(y, x)` と混同すると、方位が 90 度ずれるうえに回転方向も反転する。

---

## 3.4 キャリブレーション

### 方針

原典 §22 に従い、**キャリブレーション時点の端末の向きをワールド方位 0 とする相対方式**を採る。

```typescript
// application/CalibrationService.ts（抜粋。計算部分は domain に置く）
export function computeCalibration(current: Quaternion): Quaternion {
  const yaw = extractYaw(current);
  // yaw のみを打ち消す回転を返す
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw);
}

/** 毎フレーム、生の姿勢に較正を適用する */
export function applyCalibration(raw: Quaternion, calib: Quaternion): Quaternion {
  return new Quaternion().multiplyQuaternions(calib, raw);
}
```

較正は yaw（水平回転）のみを打ち消し、**ピッチとロールには手を加えない**。
端末を下に向けていれば下を、上に向けていれば上を見るのが正しい挙動であり、
それらまで基準化すると「キャリブレーション時の傾きが水平とみなされる」という不自然な状態になる。

### 磁北（絶対方位）を採用しない理由

`deviceorientationabsolute` を用いれば磁北基準の絶対方位が得られるが、本設計では採用しない。

本作の想定プレイ環境は**暗い室内**である。室内は鉄筋・配線・家電・スチール家具によって地磁気が大きく歪み、
コンパス方位は数十度単位で誤差を持つことが珍しくない。
しかも歪みは場所によって異なるため、プレイヤーが少し移動するだけでワールドが回転して見える。

一方、本作が必要とするのは**絶対的な方角ではなく、起点からの相対的な回転量**だけである。
相対方式であれば地磁気の影響を受けず、ゴーストの方位が磁気的に揺らぐこともない。

ただし `deviceorientationabsolute` の方が**ジャイロのドリフトが小さい**という利点はあるため、
イベントの購読自体は絶対イベントを優先する（[05.3](./05-infrastructure.md#53-orientationport-の実装)）。
取得後に相対化するので、ワールドの基準は変わらない。

### 再キャリブレーション

プレイ中いつでも HUD のボタンから実行できる（原典 §23）。
ジャイロのドリフトで「正面がずれてきた」と感じたときの救済手段である。

再キャリブレーション時、**ゴーストの方位も同じ量だけ回転させる**。
そうしないと、較正のたびにゴーストが瞬間移動することになる。

```typescript
export function recalibrate(
  ghosts: readonly Ghost[],
  yawShift: Radians,
): readonly Ghost[] {
  return ghosts.map((g) => ({
    ...g,
    azimuth: normalizeAngle(g.azimuth + yawShift) as Radians,
    baseAzimuth: normalizeAngle(g.baseAzimuth + yawShift) as Radians,
  }));
}
```

---

## 3.5 光錐判定

### 定義

「照らされている」の判定は、**カメラの前方ベクトルとゴースト方向ベクトルのなす角**で行う。

```typescript
// domain/math/BeamCone.ts

/** カメラ姿勢から光軸（単位ベクトル）を得る */
export function beamAxis(q: Quaternion, out = new Vector3()): Vector3 {
  return out.set(0, 0, -1).applyQuaternion(q);
}

/**
 * 対象が光錐の内側にあるか。
 * @param halfAngle 光錐の半頂角（ラジアン）
 */
export function isInsideCone(
  axis: Vector3,
  targetDir: Vector3,
  halfAngle: Radians,
): boolean {
  // 双方が単位ベクトルであれば内積が cos(なす角) に一致する
  return axis.dot(targetDir) >= Math.cos(halfAngle);
}
```

内積と閾値の比較で済ませ、`Math.acos` を呼ばない。
逆三角関数は毎フレーム × ゴースト数だけ呼ばれるうえ、比較のためだけに角度へ戻す必要がないため。

### 光錐の角度と描画 FOV の関係

ここで重要な設計判断がある。**光錐の半頂角と、Three.js カメラの FOV は別物として扱う**。

| 概念 | 値 | 用途 |
| --- | --- | --- |
| カメラ FOV | 60°（垂直、原典 §17） | 描画。「見えるかどうか」を決める |
| 光錐の半頂角 | 20°（[04.4](./04-game-rules.md#44-チューニング値gameconfig)） | 判定。「捕捉できるかどうか」を決める |

光錐を FOV より明確に狭くする理由は 2 つある。

第一に、画面の隅に映っただけで捕捉できてしまうと、プレイヤーは「だいたいそっちを向く」だけでよくなり、
狙いを定める行為がゲームから失われる。

第二に、狭い光錐は**画面中央に対象を収める必要**を生み、これが現実の懐中電灯の感覚と一致する。
光は前方に細く伸びるものであって、視野いっぱいに広がるものではない。

この差は、[06.4](./06-ui-ux.md#64-hud-の構成) の照準表示によってプレイヤーに可視化する。

### 視認判定（描画の可否）

原典 §13 の「Torch ON かつ FOV 内のときのみレンダリング」を、次のように具体化する。

```typescript
/**
 * 表示の濃さを返す。0 なら描画しない。
 * 光軸から外れるほど、また遠いほど薄くなる。
 */
export function computeOpacity(
  axis: Vector3,
  targetDir: Vector3,
  distance: Meters,
  light: LightState,
  config: GameConfig,
): number {
  if (light === 'OFF') return 0;

  const cos = axis.dot(targetDir);
  const visibleCos = Math.cos(config.visibleHalfAngle);
  if (cos < visibleCos) return 0;

  // 光錐の中心で 1、視認限界で 0 へ滑らかに落とす
  const heldCos = Math.cos(config.beamHalfAngle);
  const angular = cos >= heldCos ? 1 : (cos - visibleCos) / (heldCos - visibleCos);

  // 遠いほど薄い
  const far = config.visibleMaxDistance;
  const falloff = Math.max(0, Math.min(1, (far - distance) / far));

  return angular * falloff;
}
```

捕捉（`beamHalfAngle`）より広い範囲（`visibleHalfAngle`）で**薄く見える**ようにしている。
これは「光の縁にぼんやり何かがいる」という表現であり、
プレイヤーに「そこにいる」と気づかせつつ、捕捉するにはもう少し正確に向ける必要があると伝える。

> 原典 §13 の Optional に挙がっていた `random visibility`（ランダムな明滅）は**採用しない**。
> 判定に乱数が入ると、ドメイン関数の純粋性が失われてテストが不安定になる。
> また「照らしたのに見えない」体験は、恐怖ではなく不具合として受け取られる可能性が高い。

---

## 3.6 純粋関数の一覧とテスト対象

`domain/` に置かれる関数はすべて以下を満たす。

- 同じ入力に対して常に同じ出力を返す
- 引数を破壊的に変更しない（出力用バッファを明示的に受け取る場合を除く）
- `Date.now()` / `performance.now()` / `Math.random()` を呼ばない
- `window` / `document` / `navigator` を参照しない

時刻と乱数は、必要な場合すべて**引数として受け取る**。

| 関数 | 責務 | 主なテスト観点 |
| --- | --- | --- |
| `toCameraQuaternion` | 姿勢変換 | 既知の姿勢（水平前方 / 真上 / 真下 / 横持ち）で期待ベクトルを向くこと |
| `extractYaw` | 水平方位の抽出 | ピッチ・ロールを与えても yaw が変化しないこと |
| `normalizeAngle` | 角度正規化 | 境界値（±π、±2π、多重周回）で範囲に収まること |
| `angleDelta` | 最小差分 | 179° → -179° の差が +2° になること（周回を跨ぐ最短経路） |
| `computeCalibration` | 較正回転の算出 | 較正適用後の yaw が 0 になること |
| `recalibrate` | ゴースト方位の追従 | 較正前後で相対的な見え方が保存されること |
| `beamAxis` | 光軸の算出 | 単位ベクトルであること |
| `isInsideCone` | 光錐内判定 | 境界角ちょうどで true、わずかに外で false |
| `computeOpacity` | 表示濃度 | 照射 OFF で常に 0。距離・角度に対して単調であること |
| `wobbleAzimuth` | 方位の揺らぎ | 振れ幅が上限を超えないこと |
| `GhostSpawner.spawn` | 初期配置 | 個体間の方位が最小分離角以上であること |
| `GhostBehavior.step` | 1 フレームの遷移 | [04.5](./04-game-rules.md#45-遷移規則の詳細) の全分岐 |
| `GameState.reduce` | セッション遷移 | 全勝敗条件と不正遷移の拒否 |

テストは `tests/domain/` 以下に `domain/` と同じ階層で配置する。

---

[← 02. アーキテクチャ](./02-architecture.md) | [目次](./README.md) | [次: 04. ゲームルール →](./04-game-rules.md)
