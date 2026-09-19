# 05. インフラ層

[← 04. ゲームルール](./04-game-rules.md) | [目次](./README.md) | [次: 06. UI・UX・演出 →](./06-ui-ux.md)

---

この層だけがブラウザ API に触れる。
すべてのアダプタは `application/ports/` のインターフェースを実装し、`main.ts` から注入される。

---

## 5.1 CameraPort の実装

### 取得

原典 §6 に従い、背面カメラを取得する。

```typescript
// infrastructure/camera/MediaCameraAdapter.ts

const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
  audio: false,
};
```

`facingMode` に `exact` ではなく `ideal` を使う。
`exact` は背面カメラを持たない端末で `OverconstrainedError` となり起動不能になるため。
`ideal` なら前面カメラでフォールバックし、少なくとも起動はできる。

解像度を 1280×720 に抑える理由は原典 §28 の性能方針による。
カメラ映像は単に全画面表示されるだけで、解像度を上げても体験は向上しない一方、
デコード負荷と発熱は確実に増える。

### video 要素

```html
<video id="camera" playsinline autoplay muted></video>
```

```css
#camera {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;   /* アスペクト比を保ったまま画面を覆う */
  z-index: 0;
}
```

`playsinline` は必須。これがないとモバイルでフルスクリーン再生に奪われる。
`muted` も必須で、これがないと自動再生がブロックされる。

`object-fit: cover` により、映像の一部は画面外にはみ出す。
Three.js カメラの FOV と実カメラの画角は厳密には一致しないが、
原典 §17 の通り PoC では一致を要求しない。

### 停止

```typescript
stop(): void {
  this.stream?.getTracks().forEach((t) => t.stop());
  this.stream = null;
  this.video.srcObject = null;
}
```

トラックを停止せずにページを離れると、端末によってはカメラ使用中のインジケータが残る。
`pagehide` でも確実に停止させること。

### 想定される失敗

| エラー | 原因 | 表示文言 |
| --- | --- | --- |
| `NotAllowedError` | ユーザーが拒否、または権限がブロック済み | `カメラへのアクセスが必要です。` |
| `NotFoundError` | カメラが存在しない | 同上 |
| `NotReadableError` | 他アプリがカメラを占有 | `カメラを使用できません。他のアプリを終了してください。` |
| `SecurityError` | 非セキュアコンテキスト | 同上（Pages では発生しない） |

文言は原典 §25 を基礎とし、原因が区別できる場合のみ具体化する。

---

## 5.2 TorchPort の実装

原典 §7 の構成を踏襲する。ただし[Q8 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、
**ゲームロジックはこのアダプタの成否に一切依存しない**。

```typescript
// infrastructure/camera/MediaTorchAdapter.ts

async probe(track: MediaStreamTrack): Promise<TorchAvailability> {
  this.track = track;
  try {
    // 型定義に torch が無いため、この 1 箇所のみキャストを許可する
    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      torch?: boolean;
    };
    this.available = caps.torch === true ? 'AVAILABLE' : 'UNAVAILABLE';
  } catch {
    this.available = 'UNAVAILABLE';
  }
  return this.available;
}

async apply(on: boolean): Promise<boolean> {
  if (this.available !== 'AVAILABLE' || !this.track) return false;
  try {
    await this.track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    });
    this.state = on ? 'ON' : 'OFF';
    return true;
  } catch {
    this.state = 'ERROR';
    this.available = 'ERROR';
    return false;   // throw しない
  }
}
```

### 実装上の注意

- **必ずカメラと同一のトラックに対して制御する**（原典 §7）。
  別途 `getUserMedia` を呼んで得たトラックで Torch を点けると、
  カメラが二重に開かれて多くの端末で失敗する。
- `applyConstraints` は `Promise` を返すが、**連打されると競合する**。
  アダプタ内でキューイングし、直前の適用が終わるまで次を待つこと。
- 失敗しても `throw` しない。呼び出し側はゲームループであり、例外で止まってはならない。
- **Torch の点滅演出を実装してはならない**（[06.6](./06-ui-ux.md#66-安全上の制約)）。

### 状態の同期

照射状態が変化したとき、`application` は以下を行う。

```text
LightState を更新（ゲーム上はこの時点で確定）
        ↓
ScenePort.setBeamEnabled()  … 仮想スポットライト。必ず成功する
        ↓
TorchPort.apply()           … 物理 LED。失敗しても無視する
```

物理 LED の適用を待たずにゲーム状態を確定させる点が重要である。
`applyConstraints` は端末によって数百 ms かかることがあり、これを待つと操作感が損なわれる。

---

## 5.3 OrientationPort の実装

### イベントの選択

```typescript
// infrastructure/sensors/DeviceOrientationAdapter.ts

async start(): Promise<void> {
  // 絶対方位イベントを優先して購読する
  const hasAbsolute = 'ondeviceorientationabsolute' in window;
  this.eventName = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(this.eventName, this.onOrientation);

  // 一定時間内にイベントが来なければ利用不可と判定する
  await this.waitForFirstEvent(FIRST_EVENT_TIMEOUT_MS);
}
```

`deviceorientationabsolute` を優先する理由は**ドリフトの小ささ**である。
絶対イベントは磁力計による補正が入るため、長時間プレイしても正面がずれにくい。

ただし[03.4](./03-domain-model.md#磁北絶対方位を採用しない理由) の通り、
得られた絶対方位はキャリブレーションによって即座に相対化される。
したがって室内の地磁気歪みがワールドの向きを狂わせることはない。
**絶対イベントは「より安定した角速度の積分結果」としてのみ利用し、方角としては使わない。**

### capability 判定

センサー API の存在確認だけでは不十分である。
`window.DeviceOrientationEvent` が存在してもイベントが一切発火しない端末が存在する。

そこで**実際にイベントが届くかどうか**で判定する（原典 §26 の方針に合致する）。

```typescript
const FIRST_EVENT_TIMEOUT_MS = 1500;
```

1.5 秒以内に有効な値を持つイベントが来なければ `isAvailable() === false` とし、
`?mock=1` が指定されていなければ `ERROR_SENSOR` へ遷移する。

`alpha` / `beta` / `gamma` がすべて `null` のイベントは「届いた」とみなさないこと。
センサー非搭載端末では null のイベントだけが流れ続ける場合がある。

### 画面回転角の取得

```typescript
private screenAngle(): number {
  return screen.orientation?.angle ?? 0;
}
```

`window.orientation` は非推奨かつ Chrome で削除されているため使用しない。
値は毎フレーム読むのではなく、`orientationchange` で更新してキャッシュする。

### 読み取り方式

イベントハンドラでは**最新値を保存するだけ**とし、計算は行わない。

```typescript
private onOrientation = (e: DeviceOrientationEvent): void => {
  if (e.alpha === null || e.beta === null || e.gamma === null) return;
  this.latest = {
    alpha: e.alpha,
    beta: e.beta,
    gamma: e.gamma,
    screenAngle: this.cachedScreenAngle,
    absolute: e.absolute === true,
  };
};
```

センサーイベントは端末によっては 60Hz を超えて発火する。
ここで重い処理をすると `requestAnimationFrame` の予算を圧迫するため、
ゲームループ側が `read()` で最新値を引き取る **pull 方式**とする。

---

## 5.4 MotionPort の実装

### シェイク検出

```typescript
// infrastructure/sensors/DeviceMotionAdapter.ts

/** 重力を除いた加速度の大きさがこの値を超えたらシェイクとみなす */
const SHAKE_THRESHOLD = 18;          // m/s^2
/** 連続検出を防ぐ不応期 */
const SHAKE_REFRACTORY_MS = 400;

private onMotion = (e: DeviceMotionEvent): void => {
  const a = e.acceleration;          // 重力成分を含まない
  if (!a || a.x === null || a.y === null || a.z === null) {
    this.usableSource = false;       // fallback を使う
    return;
  }
  const magnitude = Math.hypot(a.x, a.y, a.z);
  if (magnitude < SHAKE_THRESHOLD) return;

  const now = performance.now();
  if (now - this.lastShakeAt < SHAKE_REFRACTORY_MS) return;

  this.lastShakeAt = now;
  this.pending = true;
};
```

`acceleration`（重力を除いた値）を優先する。
これが `null` を返す端末では `accelerationIncludingGravity` にフォールバックし、
**直前フレームとの差分**を取ることで重力成分を打ち消す。

```typescript
// フォールバック時
const dx = ax - this.prevAx;
const dy = ay - this.prevAy;
const dz = az - this.prevAz;
const delta = Math.hypot(dx, dy, dz);
// 閾値は差分ベースのため別途定める
```

### 消費セマンティクス

```typescript
consumeShake(): boolean {
  const v = this.pending;
  this.pending = false;
  return v;
}
```

読み取りで消費される。
同じシェイクが複数フレームにわたって `true` を返すと、
1 回の振りで振り払い回数を複数消費してしまうため。

### 閾値の調整

`SHAKE_THRESHOLD = 18` は暫定値である。
端末を軽く振った程度では反応せず、明確に振ったときに確実に反応する値を実機で探ること。
デバッグ HUD に加速度の瞬間値とピーク値を表示し、調整を支援する（[06.5](./06-ui-ux.md#65-デバッグ-hud)）。

---

## 5.5 AudioPort の実装

[Q7 の決定](./09-design-md-mapping.md#92-主要な設計判断)により空間音響を実装する。
**音源ファイルは一切持たず、すべて手続き的に生成する。**

### 構成

```text
AudioContext
  │
  ├─ listener（カメラの向きに追従）
  │
  ├─ ghost-0 ──→ PannerNode(HRTF) ──→ GainNode ──┐
  ├─ ghost-1 ──→ PannerNode(HRTF) ──→ GainNode ──┤
  ├─ ghost-2 ──→ PannerNode(HRTF) ──→ GainNode ──┼─→ masterGain ─→ destination
  │                                               │
  └─ oneShot ──────────────────────→ GainNode ───┘
```

### 呻き声の生成

```typescript
// infrastructure/audio/ProceduralVoice.ts

/**
 * 幽霊の呻き声に相当する音源を組み立てる。
 * ノイズをバンドパスで絞り、低周波 LFO で揺らすことで
 * 人の声とも風ともつかない不安定な音を作る。
 */
export function createVoice(ctx: AudioContext, seed: number): AudioNode {
  // 1. ピンクノイズに近い雑音源（ループする短いバッファ）
  const noise = createNoiseSource(ctx);

  // 2. 人の声の帯域へ絞り込む
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 220 + seed * 80;   // 個体差
  band.Q.value = 6;

  // 3. 音量を不規則に揺らす（呼吸のような明滅）
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18 + seed * 0.1;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.45;
  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.55;
  lfo.connect(lfoGain).connect(tremolo.gain);
  lfo.start();

  noise.connect(band).connect(tremolo);
  return tremolo;
}
```

個体ごとに `seed` を変え、帯域と揺らぎの周期をずらす。
3 体の声が同一だと、音で個体を区別できず方向探索が成立しない。

### 空間定位

```typescript
updateGhost(id: GhostId, position: Vector3Like, intensity: number): void {
  const node = this.nodes.get(id);
  if (!node) return;

  node.panner.positionX.value = position.x;
  node.panner.positionY.value = position.y;
  node.panner.positionZ.value = position.z;

  // 近いほど大きく、捕捉中は静まる
  node.gain.gain.setTargetAtTime(intensity, this.ctx.currentTime, 0.08);
}
```

```typescript
// PannerNode の設定
panner.panningModel = 'HRTF';       // 頭部伝達関数による定位
panner.distanceModel = 'inverse';
panner.refDistance = 1;
panner.maxDistance = 20;
panner.rolloffFactor = 1.2;
```

`HRTF` は計算コストが `equalpower` より高いが、**前後・上下の定位に必要**である。
`equalpower` では左右しか判別できず、背後からの接近に気づけない。
音源は最大 3 つに限られるため、コストは許容範囲に収まる。

### リスナーの向き

```typescript
setListenerOrientation(forward: Vector3Like, up: Vector3Like): void {
  const l = this.ctx.listener;
  if (l.forwardX) {
    l.forwardX.value = forward.x;
    l.forwardY.value = forward.y;
    l.forwardZ.value = forward.z;
    l.upX.value = up.x;
    l.upY.value = up.y;
    l.upZ.value = up.z;
  } else {
    // 古い API へのフォールバック
    l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}
```

**リスナーの位置は常に原点（0, 1.6, 0）で固定**し、向きだけを更新する。
プレイヤーは移動しないという世界モデル（[01.2](./01-overview.md#12-設計原則)）と一致する。

### 音量の設計

| 状況 | `intensity` |
| --- | --- |
| 遠距離（`visibleMaxDistance` 以上） | 0.15 |
| 接近するほど | 距離に反比例して増加、最大 1.0 |
| 捕捉中（`HELD`） | 0.3 へ低下。静止している表現 |
| `GRABBING` | 1.0 かつ別系統の一撃音を重ねる |
| `BANISHED` | 0 へフェードアウト |

捕捉中に音が静まることで、プレイヤーは「この個体は処理できている」と聴覚的に確認できる。
残りの音が背後から聞こえ続けるという構造が、本作の緊張の中核である。

### AudioContext の解錠

モバイルでは `AudioContext` はユーザー操作なしに `running` にならない。

```typescript
async unlock(): Promise<void> {
  if (this.ctx.state === 'suspended') {
    await this.ctx.resume();
  }
}
```

**必ず START タップのハンドラ内から同期的に呼び始めること。**
`await` を挟んだ後に `resume()` を呼ぶと、ユーザー操作との関連が切れて失敗する端末がある。

初期化失敗は非致命とし、無音で続行する（[02.7](./02-architecture.md#エラー分類)）。

---

## 5.6 ScenePort の実装

### レイヤ構成

原典 §5 の構成をそのまま採る。

```text
z-index 0 : <video>   カメラ映像（背景）
z-index 1 : <canvas>  Three.js（透明）
z-index 2 : HUD       DOM 要素
```

```typescript
const renderer = new THREE.WebGLRenderer({
  alpha: true,                       // 背景を透過させ、カメラ映像を見せる
  antialias: false,                  // モバイルでは負荷に見合わない
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x000000, 0); // 完全透過
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

`setPixelRatio` の上限を 2 に固定する。
近年の端末は `devicePixelRatio` が 3 を超えることがあり、
そのまま使うと描画面積が 9 倍になってフレームレートが崩壊する。

### カメラ

```typescript
const camera = new THREE.PerspectiveCamera(
  60,                                // 原典 §17
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 1.6, 0);      // 原典 §16
```

FOV は 60 度固定とする。
実カメラの画角との一致は原典 §17 の通り PoC では要求しない。
ただし将来のキャリブレーションに備え、**FOV を外部から変更できる口だけは用意する**。

```typescript
setFieldOfView(deg: number): void {
  this.camera.fov = deg;
  this.camera.updateProjectionMatrix();
}
```

`MediaTrackSettings` から実画角を推定できる端末では、後続フェーズでこれを利用できる。

### ライティング

原典 §19・§20 に従う。

```typescript
// 最低限の環境光。完全な暗闇ではシルエットも見えない
const ambient = new THREE.AmbientLight(0x223344, 0.35);

// 仮想スポットライト = プレイヤーの懐中電灯
const beam = new THREE.SpotLight(0xffffff, 3.0);
beam.angle = config.visibleHalfAngle;    // 光錐と視覚的に一致させる
beam.penumbra = 0.6;                     // 縁をぼかす
beam.distance = config.visibleMaxDistance;
beam.decay = 1.5;
beam.castShadow = false;                 // 原典 §28。影は使わない
```

スポットライトは**カメラの子オブジェクトとして配置**し、カメラの向きに自動で追従させる。

```typescript
camera.add(beam);
camera.add(beam.target);
beam.target.position.set(0, 0, -1);
scene.add(camera);                       // カメラ自身もシーンに入れる必要がある
```

`beam.target` をシーンに直接追加すると追従しない。
これは Three.js でよく踏まれる箇所なので注意する。

**影は一切使わない。** 原典 §28 の方針であり、シャドウマップはモバイル GPU で最も高価な処理の一つである。

### ゴーストの表示

```typescript
// infrastructure/rendering/GhostView.ts
export interface GhostView {
  readonly object: THREE.Object3D;
  setOpacity(value: number): void;
  playAnimation(name: GhostAnimation, dtSec: number): void;
  dispose(): void;
}
```

[Q6 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、実装を 2 つ用意する。

#### ProceduralGhostView（GLB 不在時）

外部アセットを一切使わず、Three.js のプリミティブで幽霊を構成する。

```text
構成：
  縦長のカプセル（体）
    + 半透明の加法合成マテリアル
    + 頂点シェーダで裾を揺らす
  暗い球 × 2（眼窩）
    + 加法合成を使わず、周囲より暗く抜く
  下端に向かって透明度を落とすグラデーション
    → 床との接地を曖昧にし、浮遊感を出す
```

```typescript
const material = new THREE.MeshBasicMaterial({
  color: 0xaaccdd,
  transparent: true,
  opacity: 0.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,           // 半透明の重なり順の破綻を避ける
  side: THREE.DoubleSide,
});
```

`MeshBasicMaterial` を使い、ライティング計算を行わない。
加法合成により、カメラ映像の上で「発光して浮かぶ」表現になる。
これは暗所のホラー表現として十分に機能し、かつ極めて軽量である。

アニメーションはシェーダのユニフォーム（時間・揺れ幅）で表現し、
`IDLE` / `WALK` / `ATTACK` に対して揺れの振幅と周期を変える。

#### GltfGhostView（GLB 存在時）

```typescript
const loader = new GLTFLoader();
const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/ghost.glb`);
const mixer = new THREE.AnimationMixer(gltf.scene);
```

**`import.meta.env.BASE_URL` を必ず使うこと。**
GitHub Pages のプロジェクトページでは `/cc_ghostar/` がベースになるため、
`/models/ghost.glb` と絶対パスで書くと 404 になる。これは最も頻出するデプロイ事故である。

#### フォールバック

```typescript
export async function createGhostViewFactory(): Promise<() => GhostView> {
  try {
    const gltf = await loadGhostModel();
    return () => new GltfGhostView(gltf);
  } catch {
    console.info('[ghost] GLB が見つからないためプレースホルダを使用します');
    return () => new ProceduralGhostView();
  }
}
```

読み込みは**起動時に 1 回だけ**行い、3 体はクローンして使い回す。

### GLB の規約

後日モデルを差し替える際の要件。原典 §18 を具体化したもの。

| 項目 | 要件 |
| --- | --- |
| 形式 | `.glb`（バイナリ、テクスチャ埋め込み） |
| 配置 | `public/models/ghost.glb` |
| ファイルサイズ | 5MB 以下を推奨 |
| 三角形数 | 50,000 未満（原典 §18） |
| テクスチャ | 2048×2048 以下（原典 §18） |
| **原点** | **足元の中心**。モデルの底面が y=0 に来ること |
| **向き** | **-Z を正面**とする（Three.js 規約） |
| **スケール** | **1 単位 = 1 メートル**。身長 1.7m 程度 |
| アニメーション名 | `Idle` / `Walk` / `Attack` / `Appear` / `Disappear` |

アニメーション名が一致しない場合は、`GltfGhostView` 内のマッピングテーブルで吸収する。
名前が見つからない場合は `Idle` にフォールバックし、警告をコンソールに出す。

### 描画の同期

```typescript
syncGhosts(views: readonly GhostViewModel[]): void {
  for (const vm of views) {
    const view = this.views.get(vm.id);
    if (!view) continue;
    // opacity 0 のものは描画対象から外す
    view.object.visible = vm.opacity > 0.01;
    if (!view.object.visible) continue;

    view.object.position.set(vm.position.x, vm.position.y, vm.position.z);
    // 常にプレイヤーの方を向く（ビルボード的挙動）
    view.object.lookAt(this.camera.position.x, vm.position.y, this.camera.position.z);
    view.setOpacity(vm.opacity);
    view.playAnimation(vm.animation, this.dtSec);
  }
}
```

`visible = false` の個体はアニメーション更新も行わない。
原典 §13 の「Torch ON かつ FOV 内のときのみレンダリング」を、
描画だけでなく**更新処理の省略**にも適用することで、性能予算を確保する。

`lookAt` の y 成分にゴースト自身の高さを渡している点に注意すること。
カメラの高さを渡すと、近距離でゴーストが前傾・後傾して不自然になる。

---

## 5.7 デバイス系アダプタ

### ScreenPort

[Q10 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、縦固定・全画面とする。

```typescript
// infrastructure/device/ScreenAdapter.ts

async enterImmersive(): Promise<ImmersiveResult> {
  const result: ImmersiveResult = {
    fullscreen: false,
    orientationLocked: false,
    wakeLock: false,
  };

  // 1. 全画面（向きロックの前提条件）
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    result.fullscreen = true;
  } catch { /* 非致命 */ }

  // 2. 向きロック。全画面でない場合は必ず失敗する
  try {
    await screen.orientation.lock('portrait-primary');
    result.orientationLocked = true;
  } catch { /* 非致命 */ }

  // 3. Wake Lock
  try {
    this.wakeLock = await navigator.wakeLock.request('screen');
    result.wakeLock = true;
  } catch { /* 非致命 */ }

  return result;
}
```

3 つすべてを `try` で個別に囲み、**いずれが失敗しても他を試みる**。
これらはすべて非致命であり、失敗しても告知しない（向きを除く）。

`requestFullscreen` は**ユーザー操作のハンドラ内から呼ぶ必要がある**。
START タップのハンドラで、`AudioContext.resume()` と合わせて実行する。

#### Wake Lock の再取得

Wake Lock はページが非表示になると自動的に解放される。
復帰時に再取得しなければ、2 回目以降のプレイで画面が消灯する。

```typescript
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && this.wakeLockWanted) {
    await this.reacquireWakeLock();
  }
});
```

原典 §30 のライフサイクル管理に、この再取得を明示的に含める。

### HapticsPort

```typescript
vibrate(pattern: number | readonly number[]): void {
  if (!('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern as number | number[]);
  } catch { /* 非致命 */ }
}
```

| 場面 | パターン |
| --- | --- |
| 接近警告（`hapticWarnDistance` を切った瞬間） | `40` |
| `GRABBING` 開始 | `[0, 60, 40, 60]` |
| 振り払い成功 | `30` |
| `GAME_OVER` | `200` |

**`GAME_OVER` の 200ms を上限とし、これを超える振動を出さない。**
長い振動は驚きではなく不快感として受け取られる。

### StoragePort

```typescript
const KEY = 'torch-webar-horror:best-time-ms';

readBestTimeMs(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;   // プライベートモード等で例外になりうる
  }
}
```

`localStorage` へのアクセスは**必ず `try` で囲む**。
ストレージが無効化された環境では、読み取りだけでも例外になる。

保存するのはクリアタイムのみで、端末内に留まる（原典 §31）。

---

## 5.8 モックアダプタ

[Q15 の決定](./09-design-md-mapping.md#92-主要な設計判断)により、
`?mock=1` 指定時、またはセンサー未検出時に使用する。

### MockOrientationAdapter

```typescript
/**
 * マウスドラッグと矢印キーで視点を操作する。
 * 実センサーと同じ DeviceAttitude を返すため、
 * 上位層はモックであることを知らない。
 */
export class MockOrientationAdapter implements OrientationPort {
  private yaw = 0;      // 度
  private pitch = 0;    // 度

  start(): Promise<void> {
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
    return Promise.resolve();
  }

  read(): DeviceAttitude {
    // DeviceOrientation の座標系に合わせて返す
    return {
      alpha: normalizeDeg(-this.yaw),
      beta: this.pitch + 90,     // 端末を立てた状態が beta = 90
      gamma: 0,
      screenAngle: 0,
      absolute: false,
    };
  }
}
```

| 操作 | 効果 |
| --- | --- |
| マウスドラッグ（左右） | 方位の変更 |
| マウスドラッグ（上下） | 仰俯角の変更 |
| 矢印キー ←→ | 方位を 5° ずつ変更 |
| `Space` | シェイク（`MockMotionAdapter` へ） |

`beta + 90` という補正は、「端末を垂直に立てて前方を見る」姿勢が
`beta = 90` に対応するという DeviceOrientation の定義に由来する。
これを忘れると、モックでは真下を向いた状態から始まる。

### MockCameraAdapter

カメラの代わりに、単色の背景を返す。

```typescript
async start(): Promise<HTMLVideoElement> {
  // 実際には video を返さず、CSS で暗い背景を敷く
  document.body.classList.add('mock-camera');
  return this.dummyVideo;
}
```

```css
body.mock-camera { background: #0a0a0c; }
```

Torch はモック時も `UNAVAILABLE` となるが、
`LightState` は独立しているため（[Q8](./09-design-md-mapping.md#92-主要な設計判断)）
ゲームは完全に動作する。

---

## 5.9 ライフサイクル管理

原典 §30 の要件を実装レベルで定義する。

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    onBackground();
  } else {
    onForeground();
  }
});

window.addEventListener('pagehide', () => {
  // ページ遷移・タブ破棄時に確実に解放する
  torch.apply(false);
  camera.stop();
  audio.setMuted(true);
});
```

### 非表示になったとき

```text
1. LightState を OFF にする
2. TorchPort.apply(false)   … 物理 LED を必ず消す
3. AudioPort.setMuted(true)
4. ゲームループを停止（cancelAnimationFrame）
5. phase を PAUSED へ
6. 計時を停止
```

**Torch の消灯を最優先で行う。** ポケットの中で LED が点きっぱなしになると、
発熱とバッテリー消費に直結する。これはユーザーへの実害である。

### 表示に戻ったとき

```text
1. カメラトラックの readyState を確認
     'ended' なら ERROR_CAMERA へ
2. センサーイベントが再開しているか確認
3. Wake Lock を再取得
4. ゲームループを再開
5. dt を 0 にリセット（巨大な dt での瞬間移動を防ぐ）
6. phase を PLAYING へ
```

照射状態は OFF のまま復帰させ、プレイヤーが自分で点け直す。
復帰と同時に LED が点灯すると驚かせることになるため。

---

[← 04. ゲームルール](./04-game-rules.md) | [目次](./README.md) | [次: 06. UI・UX・演出 →](./06-ui-ux.md)
