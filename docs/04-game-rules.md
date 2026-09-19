# 04. ゲームルール

[← 03. ドメインモデル](./03-domain-model.md) | [目次](./README.md) | [次: 05. インフラ層 →](./05-infrastructure.md)

---

## 4.1 基本ルール

### 勝敗条件

| 条件 | 結果 |
| --- | --- |
| 3 体すべての浄化を完了する | `CLEARED` |
| いずれか 1 体に捕まる | `FAILED` |

### 同時に存在するのは 1 体だけ

ゴーストは**逐次に出現する**。1 体を浄化すると短い静寂を挟んで次の 1 体が別の方向に現れ、
これを 3 回繰り返すとクリアになる。

この構造を採る理由は空間音響にある。複数の個体が同時に声を出すと、
`PannerNode` が定位した複数の音源が混ざり合い、**どの方向から何が近づいているのかを
聞き分けられなくなる**。鳴っている声が常に 1 つであることが、
「音で方向を探して振り向く」という本作の中心的な行為を成立させる唯一の条件である。

同時出現をやめた代償として、「一体を処理する間に他が詰めてくる」という
圧力は失われる。これは**ウェーブごとの接近速度の上昇**（[4.4](#44-チューニング値gameconfig)）と、
**次の個体が視線から離れた位置に出る**制約（[4.7](#47-ゴーストの出現)）で置き換える。

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
  /** 出現時、現在の視線方向から最低これだけ離す */
  readonly spawnMinAngleFromView: Radians;
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
  /** 何体目かに応じた速度倍率。index = 0 起点のウェーブ番号 */
  readonly speedByWave: readonly number[];

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
  /** 浄化してから次の個体が現れるまでの間 */
  readonly nextSpawnDelayMs: number;

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
  speedByWave: [1.0, 1.3, 1.6],

  wobbleAmplitude: deg(30),
  wobbleFrequencyHz: 0.08,

  purifyDurationSec: 3.5,
  purifyDecayPerSec: 0.15,
  banishAnimationMs: 1200,
  nextSpawnDelayMs: 1600,

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
| `spawnMinAngleFromView = 90°` | 次の個体が必ず視界の外に出る。振り向いて探す行為が毎回発生する |
| `nextSpawnDelayMs = 1600` | 浄化後の無音の間。次の声が鳴り始めた方向が際立つ |
| `approachSpeed = 0.22 m/s` | 最遠 10m から `grabDistance` まで約 42 秒。1 体の浄化に 3.5 秒かかることを踏まえた猶予 |
| `speedByWave` | 3 体目で 1.6 倍。逐次出現では常に残り 1 体なので、残存数ではなく進行度で難易度を上げる |
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
  /** 0 起点のウェーブ番号。速度倍率の決定に使う */
  readonly waveIndex: number;
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
  const table = input.config.speedByWave;

  let byWave = 1;
  if (table.length > 0) {
    // 非有限値が来ても黙って 1 倍にならないようにする。添字が NaN になると
    // table[NaN] が undefined となり、難易度が上がらないまま気づけない
    const wave = Number.isFinite(input.waveIndex) ? input.waveIndex : 0;
    const idx = Math.min(Math.max(Math.floor(wave), 0), table.length - 1);
    byWave = table[idx] ?? 1;
  }

  const byLight = input.light === 'OFF' ? input.config.lightOffSpeedMultiplier : 1;
  return input.config.approachSpeed * byWave * byLight;
}
```

逐次出現では生存数が常に 1 なので、**残存数を基準にすると倍率が一定に張り付き、
難易度カーブが作れない**。進行度（何体目か）を基準にする。

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
浄化イベントがあり、まだ出し切っていない
  → nextSpawnAt = elapsedMs + nextSpawnDelayMs を予約

nextSpawnAt に達した
  → spawnOne() で次の 1 体を生成し、ghosts を差し替える
  → spawnedCount++、GHOST_APPEARED を発火

PLAYER_CAUGHT がイベント列に含まれる
  → outcome = FAILED を確定し、resultAt = elapsedMs + resultDelayMs を設定
  → 補充は行わない

全部出し切った かつ 生存ゼロ かつ 補充待ちでない
  → outcome = CLEARED を確定し、resultAt = elapsedMs + resultDelayMs を設定
  → SESSION_CLEARED を発火（記録更新の判定は application が StoragePort 経由で行う）

elapsedMs >= resultAt
  → phase を RESULT へ遷移
```

クリア条件に「補充待ちでない」を含めている点が重要である。
これがないと、1 体目を浄化して一瞬生存ゼロになった時点でクリアと誤判定する。

`reduce()` は出現処理を担うため `viewYaw` と `random` を引数で受け取る。
乱数を注入することで純粋性を保ち、テスト可能なままにしている。

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

## 4.7 ゴーストの出現

同時に存在するのは常に 1 体であり、浄化されるたびに次の 1 体を生成する
（[4.1](#同時に存在するのは-1-体だけ)）。

```typescript
// domain/ghost/GhostSpawner.ts

/**
 * ゴーストを 1 体生成する。乱数は引数で受け取るため純粋関数である。
 *
 * @param index 0 起点の通し番号。ID と速度倍率の決定に使う
 * @param viewYaw 生成時点でプレイヤーが向いているワールド方位
 */
export function spawnOne(
  config: GameConfig,
  index: number,
  viewYaw: Radians,
  random: () => number,
): Ghost {
  const azimuth = pickSpawnAzimuth(viewYaw, config.spawnMinAngleFromView, random);

  return {
    id: ghostId(`ghost-${index}`),
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
  };
}
```

### 視線から離れた方位に出す

出現位置の制約は「個体どうしを離すこと」ではなく、
**プレイヤーが今向いている方向を避けること**である。

逐次出現では、次がどこに出たかを音で探して振り向くことがゲームの中心になる。
見ている方向に出てしまうと、その探索が丸ごと消える。

```typescript
export function pickSpawnAzimuth(
  viewYaw: Radians,
  minAngleFromView: Radians,
  random: () => number,
): Radians {
  // 禁止扇の半角。円周を食い尽くさないよう上限を設ける
  const forbidden = Math.min(Math.abs(minAngleFromView), Math.PI * 0.9);
  // 許される弧の長さ（視線の裏側を中心とする弧）
  const allowed = Math.PI * 2 - forbidden * 2;
  // 視線の反対側を起点に、許容弧の中から一様に選ぶ
  const offset = forbidden + random() * allowed;
  return normalizeAngle(viewYaw + offset) as Radians;
}
```

視線を中心とする「出現禁止の扇」の外側の弧から一様に選ぶ。
棄却サンプリングを使わないため必ず 1 回で決まり、失敗する経路が存在しない。

既定の `spawnMinAngleFromView = 90°` では、出現位置は視線から最低 90°、
つまり**必ず視界の外**になる。実測では 129°・153°・147° といった値が得られており、
毎回ほぼ振り返る動作が要求される。

### 1 体目の出し方

キャリブレーション直後のワールド方位は定義上 0 である
（[03.4](./03-domain-model.md#34-キャリブレーション)）。
そのため 1 体目も `viewYaw = 0` を与えて同じ関数で生成すればよく、
開始と同時に正面で捕捉が始まることはない。

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
