# 04. ゲームルール

[← 03. ドメインモデル](./03-domain-model.md) | [目次](./README.md) | [次: 05. インフラ層 →](./05-infrastructure.md)

---

## 4.1 基本ルール

### 勝敗条件

| 条件 | 結果 |
| --- | --- |
| 3 体すべての浄化を完了する | `CLEARED` |
| いずれか 1 体に捕まる | `FAILED` |

制限時間は設けない。経過時間はスコアとして記録し、クリア時のみ `localStorage` に最短記録を保存する。

### コアメカニクス

原典 §12 のメカニクスを、[Q5 の決定](./09-design-md-mapping.md#92-主要な設計判断)に従って**方向依存**として定義する。

```text
照射 ON かつ 光錐内 ─────→ 静止する。浄化ゲージが溜まる
                             ↑ ここだけがプレイヤーの能動的手段

上記以外（照射 OFF、または光錐外）
                      ─────→ 接近し続ける。浄化ゲージは緩やかに減衰
```

**照射が ON であっても、光錐の外にいるゴーストは接近し続ける。**
これが本作の中心的な緊張であり、原典 §37 が掲げた「スマートフォンをどちらへ向けたか」を軸にする方針の直接的な表現である。

### 照射を切る意味

[Q5 の決定](./09-design-md-mapping.md#92-主要な設計判断)の帰結として、**プレイヤーが照射を切る戦術的な理由は存在しない**。
本設計はこれを問題と見なさず、次のように整理する。

- 照射 OFF 中は全ゴーストの接近速度に倍率が掛かる（ペナルティのみを与える）
- したがって照射 ON が常に有利であり、プレイヤーは迷わない
- 照射トグルは「一時的に暗闇に戻る」という体験のための演出的な操作として残す

原典 §12 が描いた「Torch OFF → 近づく → Torch ON → 近くに現れる」という体験は、
照射を切らなくとも**光錐の外で常に起きている**。原典の意図はルールとして保存されている。

---

## 4.2 プレイヤーの行動

プレイヤーが取れる行動は 3 つしかない。

| 行動 | 入力 | 効果 |
| --- | --- | --- |
| **向きを変える** | 端末を物理的に動かす | 光錐の向きが変わる。捕捉対象が切り替わる |
| **振り払う** | 端末を振る | `GRABBING` 中のゴーストを押し戻す（回数制限あり） |
| **照射を切り替える** | HUD のボタン | 照射 ON/OFF。OFF は不利にしかならない |

加えて、いつでも再キャリブレーションを実行できる（[03.4](./03-domain-model.md#34-キャリブレーション)）。
これはゲーム上の行動ではなく、センサードリフトに対する救済手段である。

---

## 4.3 状態機械

原典 §34 を基礎に、クリア状態とリトライ導線を追加したもの。

```text
                    BOOT
                      │ capability 検出
        ┌─────────────┼─────────────┐
        │             │             │
   ERROR_WEBGL   ERROR_SENSOR      TITLE ◄──────────────┐
                                    │                   │
                          START タップ                   │
                                    │                   │
                      ┌─────────────┴───────┐           │
                      │ 初回のみ             │ 2 回目以降 │
                      ▼                     │           │
                 PERMISSION                 │           │
                      │                     │           │
          ┌───────────┴──────┐              │           │
          │ 拒否 / 失敗       │ 許可         │           │
          ▼                  ▼              │           │
    ERROR_CAMERA       CAMERA_READY         │           │
                             │              │           │
                             └──────┬───────┘           │
                                    ▼                   │
                              CALIBRATION               │
                                    │ 基準方位を確定     │
                                    ▼                   │
                    ┌──────────► PLAYING ◄───┐          │
                    │               │        │          │
      visibilitychange              │   復帰 │          │
      （非表示）      │               │        │          │
                    └── PAUSED ◄────┘        │          │
                          └─────────────────-┘          │
                                    │                   │
                     全浄化 / 捕獲   │                   │
                                    ▼                   │
                                 RESULT ────────────────┘
                                          「もう一度」
```

### 遷移表

| 現在 | イベント | 次 | 付随処理 |
| --- | --- | --- | --- |
| `BOOT` | capability 検出完了（WebGL / センサー OK） | `TITLE` | Torch 非対応なら告知フラグを立てる |
| `BOOT` | WebGL 不可 | `ERROR_WEBGL` | 起動不可 |
| `BOOT` | センサー不可かつ `?mock=1` 未指定 | `ERROR_SENSOR` | 起動不可 |
| `TITLE` | START タップ（初回） | `PERMISSION` | 没入モード開始、`AudioContext` 解錠 |
| `TITLE` | START タップ（2 回目以降） | `CALIBRATION` | カメラ・センサーは保持済み |
| `PERMISSION` | `getUserMedia` 成功 | `CAMERA_READY` | Torch capability を検査 |
| `PERMISSION` | 拒否 / 失敗 | `ERROR_CAMERA` | 再試行ボタンを表示 |
| `CAMERA_READY` | センサー購読開始完了 | `CALIBRATION` | |
| `CALIBRATION` | 基準方位を確定 | `PLAYING` | ゴースト 3 体をスポーン、計時開始 |
| `PLAYING` | `visibilitychange`（非表示） | `PAUSED` | 照射 OFF、Torch OFF、音停止、計時停止 |
| `PAUSED` | `visibilitychange`（表示） | `PLAYING` | カメラ・センサー再確認、Wake Lock 再取得、計時再開 |
| `PAUSED` | カメラトラック停止を検出 | `ERROR_CAMERA` | |
| `PLAYING` | 全ゴースト `BANISHED` | `RESULT`（演出後） | `outcome: CLEARED`、記録更新を判定 |
| `PLAYING` | `PLAYER_CAUGHT` | `RESULT`（演出後） | `outcome: FAILED` |
| `RESULT` | 「もう一度」タップ | `TITLE` | 世界のみ破棄。カメラ・センサー・没入モードは保持 |
| `ERROR_CAMERA` | 再試行タップ | `PERMISSION` | |

### リトライ時に保持するもの

[Q16 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、リトライはページリロードを行わない。

| 保持する | 破棄・再生成する |
| --- | --- |
| `MediaStream` とカメラトラック | `SessionState.ghosts` |
| センサーの購読 | 経過時間 |
| フルスクリーン・向きロック・Wake Lock | Three.js のゴーストインスタンス |
| `AudioContext`（解錠済み） | ゴーストごとの音源ノード |
| Three.js のレンダラー・シーン・ライト | |
| キャリブレーション基準（任意でやり直し可） | |

これにより、パーミッションプロンプトも没入モードの再取得も発生せず、数秒で次のプレイに入れる。
PoC はバランス調整のために繰り返し試行するフェーズであり、ここの摩擦は開発効率に直結する。

---

## 4.4 チューニング値（GameConfig）

すべての調整可能な数値を 1 箇所に集約する。
マジックナンバーを他のファイルに散らさないこと。

```typescript
// domain/config/GameConfig.ts
import { MathUtils } from 'three';

const deg = (d: number) => MathUtils.degToRad(d) as Radians;

export interface GameConfig {
  // ── 世界構成 ──────────────────────────────
  /** 1 プレイのゴースト数 */
  readonly ghostCount: number;
  /** スポーン距離の範囲 */
  readonly spawnDistanceMin: Meters;
  readonly spawnDistanceMax: Meters;
  /** 個体間の最小方位差。固まって出現するのを防ぐ */
  readonly minSeparationAzimuth: Radians;
  /** 高さオフセットの範囲 */
  readonly heightOffsetMin: Meters;
  readonly heightOffsetMax: Meters;

  // ── 光 ────────────────────────────────────
  /** 捕捉できる光錐の半頂角 */
  readonly beamHalfAngle: Radians;
  /** 薄く視認できる限界の半頂角。beamHalfAngle より広い */
  readonly visibleHalfAngle: Radians;
  /** 視認できる最大距離 */
  readonly visibleMaxDistance: Meters;

  // ── 接近 ──────────────────────────────────
  /** 基準接近速度 */
  readonly approachSpeed: number;          // m/s
  /** 照射 OFF 中に掛かる速度倍率 */
  readonly lightOffSpeedMultiplier: number;
  /** 残存数に応じた速度倍率。index = 残り体数 - 1 */
  readonly speedByRemaining: readonly number[];

  // ── 方位の揺らぎ ──────────────────────────
  /** 初期方位からの最大振れ幅 */
  readonly wobbleAmplitude: Radians;
  /** 揺らぎの周波数 */
  readonly wobbleFrequencyHz: number;

  // ── 浄化 ──────────────────────────────────
  /** 捕捉し続けて浄化が完了するまでの秒数 */
  readonly purifyDurationSec: number;
  /** 捕捉が外れたときのゲージ減衰率（毎秒） */
  readonly purifyDecayPerSec: number;
  /** 消滅演出の長さ */
  readonly banishAnimationMs: number;

  // ── 掴みかかりと振り払い ──────────────────
  /** この距離まで詰められると GRABBING に入る */
  readonly grabDistance: Meters;
  /** 振り払いの猶予時間 */
  readonly grabGraceMs: number;
  /** 1 体あたりの振り払い成功可能回数 */
  readonly maxEscapes: number;
  /** 振り払い成功時に押し戻される距離 */
  readonly escapePushback: Meters;

  // ── 演出 ──────────────────────────────────
  /** 結果画面へ移るまでの演出時間 */
  readonly resultDelayMs: number;
  /** 接近警告の振動を出し始める距離 */
  readonly hapticWarnDistance: Meters;
}

export const DEFAULT_CONFIG: GameConfig = {
  ghostCount: 3,
  spawnDistanceMin: 6 as Meters,
  spawnDistanceMax: 10 as Meters,
  minSeparationAzimuth: deg(100),
  heightOffsetMin: -0.25 as Meters,
  heightOffsetMax: 0.15 as Meters,

  beamHalfAngle: deg(8),
  visibleHalfAngle: deg(14),
  visibleMaxDistance: 12 as Meters,

  approachSpeed: 0.22,
  lightOffSpeedMultiplier: 1.6,
  speedByRemaining: [1.7, 1.35, 1.0],

  wobbleAmplitude: deg(30),
  wobbleFrequencyHz: 0.08,

  purifyDurationSec: 3.5,
  purifyDecayPerSec: 0.15,
  banishAnimationMs: 1200,

  grabDistance: 0.8 as Meters,
  grabGraceMs: 1500,
  maxEscapes: 2,
  escapePushback: 2.0 as Meters,

  resultDelayMs: 1400,
  hapticWarnDistance: 2.5 as Meters,
};
```

### 値の根拠と想定プレイ時間

| 値 | 根拠 |
| --- | --- |
| `beamHalfAngle = 8°` | **縦持ちの水平半視野（約 15°）より明確に狭くする。**カメラ FOV 60° は垂直値であり、水平はその半分以下しかない（[03.5](./03-domain-model.md#光錐の角度と描画-fov-の関係)） |
| `visibleHalfAngle = 14°` | 水平半視野にほぼ一致。「画面の隅にぼんやり見える」が成立する上限 |
| `minSeparationAzimuth = 100°` | 3 体が 360° に散るため、2 体を同時に光錐へ収めることが原理的に不可能になる |
| `approachSpeed = 0.22 m/s` | 最遠 10m から `grabDistance` まで約 42 秒。1 体の浄化に 3.5 秒かかることを踏まえた猶予 |
| `speedByRemaining` | 残り 1 体で 1.7 倍。終盤に緊張が集中し、作業感を防ぐ |
| `purifyDurationSec = 3.5` | 「一体を処理する間に他がどれだけ詰めるか」が体感できる長さ。0.22 × 3.5 ≒ 0.77m |
| `purifyDecayPerSec = 0.15` | 完全リセットしない。3.5 秒かけた蓄積が消えるのに約 6.7 秒かかり、一瞬の視線移動を許容する |
| `maxEscapes = 2` | 1 体につき 2 回まで救済。3 回目の掴みかかりは猶予なしで即敗北 |

これらの値で、**1 プレイは概ね 60〜120 秒**を想定する。
実機での調整はこのファイルのみの変更で完結する。

---

## 4.5 遷移規則の詳細

`GhostBehavior.step()` の仕様。1 フレーム分の状態遷移を定義する。

### シグネチャ

```typescript
export interface StepInput {
  readonly ghosts: readonly Ghost[];
  /** 光軸（単位ベクトル、ワールド座標） */
  readonly beamAxis: Vector3;
  readonly light: LightState;
  /** このフレームでシェイクが検出されたか */
  readonly shook: boolean;
  /** 前フレームからの経過秒。上限でクランプ済み */
  readonly dt: number;
  /** セッション開始からの経過ミリ秒 */
  readonly elapsedMs: Millis;
  readonly config: GameConfig;
}

export interface StepOutput {
  readonly ghosts: readonly Ghost[];
  readonly events: readonly DomainEvent[];
}

export function step(input: StepInput): StepOutput;
```

### 処理順序

各ゴーストについて、以下の順に評価する。**順序が結果を変えるため、この順を守ること。**

```text
1. BANISHED なら何もしない（演出は表示層の責務）

2. 方位を更新する
     GRABBING 中は揺らさない
     HELD 中は揺らさない（静止しているため）
     APPROACHING のみ揺らぐ

3. 捕捉判定
     held = (light === 'ON') && isInsideCone(beamAxis, dir, beamHalfAngle)

4. フェーズ遷移
     4-1. GRABBING の場合
            shook かつ escapeCount < maxEscapes
              → ESCAPE：distance += escapePushback、escapeCount++、APPROACHING へ
            猶予時間を超過
              → PLAYER_CAUGHT
            それ以外
              → GRABBING を維持

     4-2. held の場合
            purify += dt / purifyDurationSec
            purify >= 1 → BANISHED、GHOST_PURIFIED を発火
            前フレームが HELD でなければ GHOST_HELD を発火
            距離は変化しない（静止）

     4-3. それ以外（APPROACHING）
            前フレームが HELD なら GHOST_RELEASED を発火
            purify = max(0, purify - purifyDecayPerSec × dt)
            distance -= speed × dt
            distance <= grabDistance のとき
              escapeCount >= maxEscapes → 即 PLAYER_CAUGHT
              それ以外                  → GRABBING へ、GHOST_GRABBING を発火
```

### 接近速度の算出

```typescript
function approachSpeedOf(input: StepInput): number {
  const remaining = input.ghosts.filter((g) => g.phase !== 'BANISHED').length;
  const idx = Math.min(remaining, input.config.speedByRemaining.length) - 1;
  const byRemaining = input.config.speedByRemaining[Math.max(0, idx)];
  const byLight =
    input.light === 'OFF' ? input.config.lightOffSpeedMultiplier : 1;
  return input.config.approachSpeed * byRemaining * byLight;
}
```

### 方位の揺らぎ

[Q20 の決定](./09-design-md-mapping.md#92-主要な設計判断)による。

```typescript
/**
 * 初期方位を中心に、低周波で緩やかに揺らぐ方位を返す。
 * 時刻を引数で受けるため純粋関数である。
 */
export function wobbleAzimuth(
  baseAzimuth: Radians,
  seed: number,
  elapsedMs: Millis,
  config: GameConfig,
): Radians {
  const t = (elapsedMs / 1000) * config.wobbleFrequencyHz * Math.PI * 2;
  // 2 つの異なる周期を重ねて、単純な往復に見えないようにする
  const wave = Math.sin(t + seed) * 0.7 + Math.sin(t * 0.37 + seed * 2.1) * 0.3;
  return normalizeAngle(baseAzimuth + wave * config.wobbleAmplitude) as Radians;
}
```

揺らぎは `baseAzimuth` からの相対量として毎フレーム再計算する。
現在値に加算していく方式だと誤差が蓄積し、振れ幅の上限を保証できなくなる。

**捕捉中（`HELD`）は揺らぎを止める。** これはルール上の「静止」と整合させるためであり、
照らしている最中に対象がわずかでも動くと、狙いを維持する難度が不当に上がる。

---

## 4.6 セッションの遷移

`GameState.reduce()` の仕様。

```typescript
export interface ReduceInput {
  readonly state: SessionState;
  readonly events: readonly DomainEvent[];
  readonly nowMs: Millis;
  readonly config: GameConfig;
}

export function reduce(input: ReduceInput): {
  state: SessionState;
  events: readonly DomainEvent[];
};
```

### 勝敗の確定

```text
PLAYER_CAUGHT がイベント列に含まれる
  → outcome = FAILED を確定し、resultAt = nowMs + resultDelayMs を設定

全ゴーストが BANISHED
  → outcome = CLEARED を確定し、resultAt = nowMs + resultDelayMs を設定
  → SESSION_CLEARED を発火（記録更新の判定は application が StoragePort 経由で行う）

nowMs >= resultAt
  → phase を RESULT へ遷移
```

勝敗が確定してから結果画面に移るまでに `resultDelayMs` の間を置く。
この間、演出（掴みかかりのアップ、あるいは最後の浄化の光）が表示される。
確定と表示を分離することで、ドメインは時間を持つ演出の存在を知らずに済む。

### 一時停止中の扱い

`PAUSED` の間、`elapsedMs` は進めない。
`step()` も呼ばない。復帰時に `dt` が巨大な値になってゴーストが瞬間移動する事故を防ぐため、
`dt` は常に上限（`1/30` 秒）でクランプする。

```typescript
const MAX_DT = 1 / 30;
const dt = Math.min(MAX_DT, (now - lastFrameTime) / 1000);
```

---

## 4.7 ゴーストの初期配置

```typescript
// domain/ghost/GhostSpawner.ts

/**
 * ゴーストを配置する。乱数は引数で受け取るため純粋関数である。
 * @param random 0 以上 1 未満を返す関数
 */
export function spawn(config: GameConfig, random: () => number): readonly Ghost[] {
  const gaps = pickGaps(config.ghostCount, config.minSeparationAzimuth, random);

  // 隙間を積み上げて方位を決め、最も広い隙間の中心を正面へ回す
  const raw: number[] = [];
  let cursor = 0;
  for (let i = 0; i < config.ghostCount; i++) {
    raw.push(cursor);
    cursor += gaps[i];
  }
  const rotation = frontClearingRotation(raw, gaps);

  return raw.map((azimuthRaw, i) => {
    const azimuth = normalizeAngle(azimuthRaw + rotation) as Radians;
    return {
      id: ghostId(`ghost-${i}`),
      azimuth,
      baseAzimuth: azimuth,
      distance: lerp(config.spawnDistanceMin, config.spawnDistanceMax, random()) as Meters,
      heightOffset: lerp(config.heightOffsetMin, config.heightOffsetMax, random()) as Meters,
      phase: 'APPROACHING',
      purify: 0,
      grabStartedAt: null,
      escapeCount: 0,
      wobbleSeed: random() * Math.PI * 2,
      banishedAt: null,
    } satisfies Ghost;
  });
}
```

### 分離制約

`minSeparationAzimuth`（既定 100°）以上離れた方位を選ぶ。
3 体 × 100° = 300° であり、360° の円周に収まるため解は必ず存在する。

ただし**棄却サンプリングは使わない**。分離角が大きいと実行可能領域が極端に狭くなり、
先に置いた 2 体の位置次第で 3 体目の候補がほとんど残らないため、
試行が頻繁に失敗してフォールバックへ落ちる。

代わりに**隙間（gap）そのものを構成する**。円周を個体数と同じ数の隙間に分け、
各隙間に最低 `minSeparationAzimuth` を割り当て、残りを乱数で配分する。
この方法なら制約は定義上必ず満たされ、失敗する経路が存在しない。

```typescript
function pickGaps(count: number, minSeparation: number, random: () => number): number[] {
  // 要求された分離角が円周に収まらない場合は等分まで緩める
  const base = Math.min(minSeparation, TAU / count);
  const slack = TAU - base * count;

  const weights = Array.from({ length: count }, () => random());
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return new Array<number>(count).fill(TAU / count);

  return weights.map((w) => base + (w / total) * slack);
}
```

隣り合う個体の距離は各隙間そのものであり、隣り合わない個体の距離は
隙間の和になる。どちらも `base` 以上であるため、全ペアで制約が成立する。

### 最初の 1 体を正面から外す

キャリブレーション直後、プレイヤーは正面を向いている。
そこにゴーストがいると、開始と同時に捕捉が始まってしまい、探索の体験が失われる。

そこで**最も広い隙間の中心が正面（方位 0）に来るよう、配置全体を回転させる**。

得られる正面クリアランスは「最大の隙間の半分」である。
隙間の総和は 360° なので最大の隙間は必ず `360°/n` 以上あり、
既定の 3 体なら **60° 以上**が保証される。

> `spawnFrontClearance` は**独立した調整値ではなく、この幾何から導かれる下限**である。
> 値を変えても配置アルゴリズムは変わらない。テストが満たすべき期待値として保持している。
> ゴースト数を増やすとこの下限は小さくなる（5 体なら 36°）。

なお方位には揺らぎ（[4.5](#方位の揺らぎ)）が加わるため、
開始直後にゴーストが正面へ寄ってくることはある。
ただし揺らぎの振幅は 30° であり、`beamHalfAngle`（8°）より十分大きいため、
放置していて勝手に捕捉されることはない。

---

## 4.8 未解決事項とバランス調整の指針

実機で検証すべき項目を明示しておく。

| 項目 | 確認すること | 調整するパラメータ |
| --- | --- | --- |
| 狙いの難度 | 手ブレで捕捉が途切れないか | `beamHalfAngle`、`purifyDecayPerSec` |
| 探索の時間 | 音だけで方向を特定できるか | `05` の音響パラメータ、`visibleHalfAngle` |
| 接近の恐怖 | 背後の接近に気づけるか | `approachSpeed`、`hapticWarnDistance` |
| 振り払いの手応え | シェイクが確実に検出されるか | `05` のシェイク閾値、`grabGraceMs` |
| プレイ時間 | 60〜120 秒に収まるか | `approachSpeed`、`spawnDistance*` |

いずれも `GameConfig` と `05` のアダプタ定数の変更のみで調整でき、
ドメインロジックの構造には手を入れずに済む。

---

[← 03. ドメインモデル](./03-domain-model.md) | [目次](./README.md) | [次: 05. インフラ層 →](./05-infrastructure.md)
