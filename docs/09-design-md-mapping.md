# 09. 原典との対応表

[← 08. MVP ロードマップ](./08-mvp-roadmap.md) | [目次](./README.md)

---

本章は、原典 [`original-design.md`](./original-design.md) と本設計書の差分を全件記録する。
**原典と本書が矛盾する場合は本書を優先するが、その矛盾は必ずここに記載されていなければならない。**

---

## 9.1 原典の各節と本書の対応

| 原典 | 内容 | 本書 | 扱い |
| --- | --- | --- | --- |
| §1 | Overview | [01.1](./01-overview.md#11-プロダクト定義) | 踏襲 |
| §2 | Product Concept | [01.1](./01-overview.md#11-プロダクト定義) | 踏襲 |
| §3 | Target Environment | [01.3](./01-overview.md#13-対象環境) | 踏襲。必須/任意の区別を追加 |
| §4 | Technology Stack | [07.2](./07-build-deploy.md#72-packagejson) | 踏襲。バージョンを完全固定 |
| §5 | System Architecture | [02.2](./02-architecture.md#22-レイヤ構成)、[06.3](./06-ui-ux.md#63-画面レイヤ) | **再設計**（9.3 参照） |
| §6 | Camera System | [05.1](./05-infrastructure.md#51-cameraport-の実装) | 踏襲。解像度とエラー分類を追加 |
| §7 | Torch System | [05.2](./05-infrastructure.md#52-torchport-の実装) | **変更**（9.2 の #8） |
| §8 | AR Strategy | [03.3](./03-domain-model.md#33-姿勢変換)、[03.4](./03-domain-model.md#34-キャリブレーション) | 踏襲。変換式と補正を具体化 |
| §9 | Important Limitation | [01.2](./01-overview.md#12-設計原則) | 踏襲 |
| §10 | Virtual World | [03.1](./03-domain-model.md#31-座標系)、[04.7](./04-game-rules.md#47-ゴーストの出現) | 踏襲。方位の符号と分離制約を追加 |
| §11 | Ghost Placement | [03.2](./03-domain-model.md#ゴースト) | **変更**（9.2 の #4、#9、#20） |
| §12 | Horror Mechanic | [04.1](./04-game-rules.md#41-基本ルール) | **変更**（9.2 の #5） |
| §13 | Visibility System | [03.5](./03-domain-model.md#視認判定描画の可否) | 変更。ランダム可視性を不採用 |
| §14 | Encounter Example | [04.4](./04-game-rules.md#44-チューニング値gameconfig) | 具体的な数値として実装 |
| §15 | Game Loop | [02.6](./02-architecture.md#26-データフロー) | 踏襲。層への割り当てを明記 |
| §16 | Coordinate System | [03.1](./03-domain-model.md#31-座標系) | 踏襲。Three.js 規約で厳密化 |
| §17 | Camera FOV | [05.6](./05-infrastructure.md#カメラ) | 踏襲。FOV 変更の口を用意 |
| §18 | 3D Assets | [05.6](./05-infrastructure.md#glb-の規約) | 踏襲。**調達方針を変更**（9.2 の #6） |
| §19 | Lighting | [05.6](./05-infrastructure.md#ライティング) | 踏襲 |
| §20 | Virtual Flashlight | [05.6](./05-infrastructure.md#ライティング) | 踏襲 |
| §21 | UX Flow | [06.1](./06-ui-ux.md#61-ux-フロー) | 踏襲。タイトルとリトライを追加 |
| §22 | Calibration | [03.4](./03-domain-model.md#34-キャリブレーション) | 踏襲。yaw のみ較正することを明記 |
| §23 | UI | [06.4](./06-ui-ux.md#64-hud-の構成) | 踏襲。照準とゲージを追加 |
| §24 | Debug Mode | [06.5](./06-ui-ux.md#65-デバッグ-hud) | 踏襲。**有効化方法を決定**（9.2 の #15） |
| §25 | Error Handling | [02.7](./02-architecture.md#エラー分類)、[06.7](./06-ui-ux.md#67-文言) | 踏襲。分類表として一般化 |
| §26 | Device Compatibility | [01.3](./01-overview.md#必要ハードウェア) | 踏襲 |
| §27 | Performance Target | [01.6](./01-overview.md#16-パフォーマンス目標) | 踏襲 |
| §28 | Performance Constraints | [07.9](./07-build-deploy.md#79-パフォーマンス上の実装規約) | 踏襲。コード規約として具体化 |
| §29 | Screen Wake Lock | [05.7](./05-infrastructure.md#screenport) | 踏襲。再取得を明記 |
| §30 | Lifecycle Management | [05.9](./05-infrastructure.md#59-ライフサイクル管理) | 踏襲 |
| §31 | Privacy | [01.5](./01-overview.md#15-プライバシー方針) | 踏襲。ESLint で強制 |
| §32 | Directory Structure | [02.4](./02-architecture.md#24-ディレクトリ構成) | **全面再設計**（9.3 参照） |
| §33 | Architecture Rules | [02.2](./02-architecture.md#依存規則) | 踏襲。4 層として具体化 |
| §34 | State Machine | [04.3](./04-game-rules.md#43-状態機械) | **変更**（9.2 の #4、#16） |
| §35 | MVP | [08](./08-mvp-roadmap.md) | 踏襲。MVP-0 と 7〜10 を追加 |
| §36 | Do NOT Implement | [01.4](./01-overview.md#実装しない) | 踏襲。除外項目を追加 |
| §37 | Key Technical Risk | [01.2](./01-overview.md#12-設計原則) | 踏襲 |
| §38 | Design Principle | [01.2](./01-overview.md#12-設計原則) | 最上位原則として採用 |

---

## 9.2 主要な設計判断

設計に先立つ確認で合意した 21 項目。
本設計書の記述が原典と異なる場合、その根拠はこの表にある。

| # | 論点 | 決定 | 原典の記述 |
| --- | --- | --- | --- |
| 1 | 成果物の範囲 | 設計書のみ。実装は次タスク | — |
| 2 | Pages 公開方式 | GitHub Actions 直接デプロイ、`base: '/cc_ghostar/'` | 記述なし |
| 3 | CI トリガ | `main` への push で即デプロイ。ワークフロー 1 本 | 記述なし |
| 4 | 勝敗条件 | 浄化型。全 3 体撃退でクリア、接触で敗北 | **未定義**（§34 に `GAME_OVER` の名のみ） |
| 5 | 静止判定 | **光軸内のみ**静止・浄化。光軸外は常時接近 | §12 は全体静止とも読める。§13 は方向依存 |
| 6 | 3D アセット | プレースホルダ先行。GLB は差し替え可能な抽象で | **調達元が未定義**（§18 は形式のみ） |
| 7 | サウンド | 空間音響あり。音源は手続き生成 | **記述なし** |
| 8 | Torch 非対応時 | `LightState` を正とし仮想ライトで継続 | §34 が「Fatal でない」とするのみで挙動が未定義 |
| 9 | DeviceMotion | シェイクによる振り払い＋接近度に応じた振動 | §32 にファイルのみ存在し、**用途が未定義** |
| 10 | 画面の向き | 縦固定＋全画面＋Wake Lock | **記述なし**（§29 の Wake Lock のみ） |
| 11 | 品質ゲート | 型 → Lint → テスト → ビルド。テストは純粋ロジックに限定 | 記述なし |
| 12 | 構成方針 | 白紙から再設計。§32 との対応表を付す | §32 が構成を指定 |
| 13 | レイヤ構成 | 4 層。`domain` は three の数学クラスのみ許可 | §33 が原則のみ規定 |
| 14 | プレイ構成 | **1 体ずつ逐次出現・計 3 体**（当初は同時出現。実機検証を受けて変更） | §10 に 3 体の例示のみ |
| 15 | デバッグ | `?debug=1` / `?mock=1`。本番バンドルに同梱 | §24 が「Production で非表示にできること」とのみ規定 |
| 16 | リトライ | タイトルへ戻る。リロードせずリソース保持 | **未定義**（§34 が `GAME_OVER` で終端） |
| 17 | 演出強度 | 中程度。3Hz 超の明滅禁止、LED 点滅禁止 | §14 に「画面いっぱいに表示」のみ |
| 18 | ビルド環境 | npm ＋ Node 22 ＋ 完全バージョン固定 | §4 がスタックのみ規定 |
| 19 | 設計書の形式 | `docs/` に章分割＋目次 | — |
| 20 | 方位の変化 | 微小な揺らぎを付与（±30° 以内） | §10 の記述からは固定と読める |
| 21 | 細目の確定 | センサー方式・描画方式・記録保存等を本書内で確定 | — |

---

## 9.3 §32 ディレクトリ構成との対応

[Q12 の決定](#92-主要な設計判断)により構成を白紙から再設計した。
原典の各ファイルが本設計のどこへ移ったかを示す。

| 原典 §32 | 本設計での位置 | 備考 |
| --- | --- | --- |
| `main.ts` | `src/main.ts` | 合成ルートとして責務を明確化 |
| `app/App.ts` | `src/application/Game.ts` | |
| `camera/CameraController.ts` | `src/infrastructure/camera/MediaCameraAdapter.ts` | `CameraPort` の実装 |
| `camera/TorchController.ts` | `src/infrastructure/camera/MediaTorchAdapter.ts` | `TorchPort` の実装。ゲーム判定から切り離した |
| `sensors/OrientationController.ts` | `src/infrastructure/sensors/DeviceOrientationAdapter.ts` | |
| `sensors/MotionController.ts` | `src/infrastructure/sensors/DeviceMotionAdapter.ts` | 責務をシェイク検出に限定（#9） |
| `ar/ARCamera.ts` | `src/domain/math/Attitude.ts` ＋ `ThreeSceneAdapter` | 姿勢計算（純粋）とカメラ操作（描画）に分割 |
| `ar/CalibrationManager.ts` | `src/application/CalibrationService.ts` ＋ `domain/math/Attitude.ts` | 同上 |
| `world/World.ts` | `src/domain/session/GameState.ts` | 世界の状態はセッション状態に統合 |
| `ghost/Ghost.ts` | `src/domain/ghost/Ghost.ts` | 型定義。全フィールドを `readonly` 化 |
| `ghost/GhostManager.ts` | `src/domain/ghost/GhostSpawner.ts` ＋ `ThreeSceneAdapter.syncGhosts` | 配置決定（純粋）と表示管理（描画）に分割 |
| `ghost/GhostBehavior.ts` | `src/domain/ghost/GhostBehavior.ts` | 純粋関数化。`Object3D` を触らない |
| `rendering/Renderer.ts` | `src/infrastructure/rendering/ThreeSceneAdapter.ts` | `ScenePort` の実装 |
| `rendering/Lighting.ts` | `src/infrastructure/rendering/Lighting.ts` | ほぼそのまま |
| `game/Game.ts` | `src/application/Game.ts` | |
| `game/GameLoop.ts` | `src/application/GameLoop.ts` | |
| `ui/HUD.ts` | `src/presentation/Hud.ts` | |
| `ui/DebugHUD.ts` | `src/presentation/DebugHud.ts` | |
| `device/CapabilityDetector.ts` | `src/infrastructure/device/CapabilityDetector.ts` ＋ `application/CapabilityService.ts` | 検出（API 依存）と判断（ロジック）に分割 |
| `assets/models/ghost.glb` | `public/models/ghost.glb` | Vite の静的アセット規約に合わせた |
| `assets/textures/` | — | プレースホルダ方針によりテクスチャを使用しない |

### 新規に追加したもの

| 追加先 | 理由 |
| --- | --- |
| `src/domain/config/GameConfig.ts` | チューニング値の集約。実機調整を 1 ファイルで完結させるため |
| `src/domain/math/Spherical.ts` | 方位・距離と直交座標の相互変換。テスト対象 |
| `src/domain/math/BeamCone.ts` | 光錐判定。コアメカニクスの中核であり単体テストの価値が高い |
| `src/domain/light/LightState.ts` | 物理 Torch からゲーム上の照射を分離するため（#8） |
| `src/domain/session/SessionResult.ts` | 勝敗の追加により必要になった（#4） |
| `src/application/ports/` | 層の反転を成立させるインターフェース群 |
| `src/infrastructure/audio/` | 空間音響の追加による（#7） |
| `src/infrastructure/device/ScreenAdapter.ts` | 全画面・向きロック・Wake Lock（#10） |
| `src/infrastructure/device/VibrationAdapter.ts` | 振動フィードバック（#9） |
| `src/infrastructure/storage/` | クリアタイムの保存（#21） |
| `src/infrastructure/**/Mock*.ts` | PC 検証のためのモック（#15） |
| `src/presentation/TitleScreen.ts` 他 | リトライ導線に必要な画面（#16） |
| `src/shared/RuntimeOptions.ts` | URL クエリの解釈（#15） |
| `tests/domain/` | 品質ゲートの追加による（#11） |

---

## 9.4 原典の記述を採用しなかった箇所

原典に明示的に書かれているにもかかわらず、本設計で採らなかった判断。

### §12「Torch ON → Ghost stops」の全体適用

**採らなかった理由。**
照射 ON で全ゴーストが静止すると、「照射を点けっぱなしにする」が支配的最適解となり、
プレイヤーに意思決定が残らない。

原典 §13 は「Torch ON **かつ** FOV 内」を可視条件としており、方向依存の思想が既に含まれている。
また §37 は「スマートフォンをどちらへ向けたか」を中心に設計すると明言している。
本設計はこの 2 つに整合する形で、**静止条件も方向依存**とした。

原典 §12 が描いた「暗闇の中で何かが近づいている」体験は失われていない。
照射を切らなくとも、光錐の外では常にそれが起きている。

### §13 の Optional「random visibility」

**採らなかった理由。**
判定に乱数が入るとドメイン関数の純粋性が失われ、テストが不安定になる。
また「照らしているのに見えない」という挙動は、恐怖ではなく不具合として受け取られる可能性が高い。

見え方の揺らぎは、光錐の縁での濃度勾配（[03.5](./03-domain-model.md#視認判定描画の可否)）と
方位の揺らぎ（#20）で表現する。こちらは決定論的でテスト可能である。

### §34「GAME_OVER」という状態名

**採らなかった理由。**
クリア条件を追加した（#4）ため、終端状態が勝敗の 2 種類になった。
`GAME_OVER` という名前では両方を表せないため、`RESULT` に改名し、
勝敗は `SessionResult.outcome` で表現する。

### §18 のアニメーション 5 種の必須化

**扱いを変えた理由。**
プレースホルダ先行（#6）のため、初期実装では GLB が存在しない。
`Appear` / `Disappear` はプレースホルダではシェーダによる表現に置き換える。

GLB を導入する際の規約としては §18 をそのまま維持する
（[05.6](./05-infrastructure.md#glb-の規約)）。
アニメーション名が一致しない GLB については、マッピングテーブルで吸収し、
見つからない場合は `Idle` にフォールバックする。

---

## 9.5 本設計で追加した制約

原典に記述がなく、本設計が新たに課した制約。

| 制約 | 根拠 |
| --- | --- |
| `domain` 層はブラウザ API・乱数・時刻を参照しない | テスト可能性の確保（#11、#13）。ESLint で強制 |
| `domain` 層で使える `three` は数学クラスのみ | 同上。`Object3D` を境界とする |
| ゲームロジックは `LightState` のみを参照し `TorchState` を見ない | Torch 非対応端末と PC での動作保証（#8） |
| 画面・LED とも 3Hz を超える明滅を行わない | 光過敏性発作のリスク回避（#17） |
| LED の点滅演出を実装しない | 同上。現実のハードウェアを制御するため配慮の重みが異なる |
| 全白フラッシュを使わない | 暗所で至近距離の画面であるため |
| `fetch` / `XMLHttpRequest` を使用しない | プライバシー方針（原典 §31）の機械的強制 |
| 静的アセットの参照に `import.meta.env.BASE_URL` を必須とする | Pages の base path 問題の回避（#2） |
| 毎フレーム実行箇所でのオブジェクト生成を禁止 | 原典 §27 の 60 FPS 目標との整合 |
| 振動は 200ms を上限とする | 長い振動は驚きではなく不快感になるため |

---

## 9.6 実装によって判明し、設計を修正した点

設計書だけでは気づけず、実装して動かしたことで判明した事項。いずれも本書に反映済み。

| 事項 | 内容 | 反映先 |
| --- | --- | --- |
| **光錐が視野より広かった** | `PerspectiveCamera` の FOV は垂直値であり、縦持ちでは水平半視野が約 15° しかない。当初の `beamHalfAngle = 20°` では画面外のゴーストを捕捉できてしまい、コアメカニクスが無効化されていた。8° へ修正 | [03.5](./03-domain-model.md#縦持ちでは水平視野が制約になる)、[04.4](./04-game-rules.md#44-チューニング値gameconfig) |
| **較正の回転方向が逆だった** | 本設計の方位は `atan2(x, -z)` による時計回り正であり、Three.js の Y 軸回転とは符号が逆。`-yaw` で打ち消すと yaw が 2 倍になる。テストが検出した | [03.4](./03-domain-model.md#34-キャリブレーション) |
| **棄却サンプリングが成立しなかった** | 最小分離角 100° では実行可能領域が狭く、試行が頻繁に失敗してフォールバックへ落ち、そのフォールバックが分離制約を破っていた。隙間そのものを構成する方式へ変更 | [04.7](./04-game-rules.md#47-ゴーストの出現) |
| **TypeScript を最新にできない** | `typescript-eslint` の peer 依存が TypeScript 7 を許さない | [07.2](./07-build-deploy.md#typescript-のバージョン上限) |

### 同時出現から逐次出現への変更

実機で遊んだ結果、**3 体が同時に声を出すと空間音響が用をなさない**ことが判明した。
`PannerNode` が定位した複数の音源が混ざり、どの方向から何が近づいているのかを
聞き分けられない。Q7 で空間音響を採用した目的そのものが失われていた。

そこで**同時に存在するのは常に 1 体**とし、浄化するたびに次が別方向に現れる
逐次出現へ変更した（[04.1](./04-game-rules.md#同時に存在するのは-1-体だけ)）。

この変更に伴い、以下が連動して変わっている。

| 変更前 | 変更後 | 理由 |
| --- | --- | --- |
| `minSeparationAzimuth`（個体間の最小方位差） | `spawnMinAngleFromView`（視線からの最小角） | 同時に 1 体なので個体間の距離に意味がない。守るべきは「見ている方向に出さない」こと |
| `speedByRemaining`（残存数で倍率） | `speedByWave`（進行度で倍率） | 生存数が常に 1 なので倍率が一定に張り付き、難易度カーブが作れなくなる |
| `spawn()`（全体を一括生成） | `spawnOne()`（1 体ずつ生成） | 出現のたびに現在の視線を参照する必要がある |
| — | `nextSpawnDelayMs` を追加 | 浄化後に無音の間を置き、次の声が鳴り始めた方向を際立たせる |
| HUD の残数 = 画面内の生存数 | HUD の残数 = セッションの残り総数 | 生存数は常に 1 で情報量がない |

同時出現が持っていた「一体を処理する間に他が詰めてくる」圧力は失われるため、
ウェーブごとの速度上昇（最終 1.6 倍）と、視線から 90° 以上離して出す制約で置き換えた。

---

## 9.7 実装時に判断が必要な残件

本設計書で決め切らず、実装・実機検証の中で確定すべき事項。

| 項目 | 判断の材料 | 記載箇所 |
| --- | --- | --- |
| シェイク検出の閾値 | 実機での加速度ピーク値。デバッグ HUD に表示済み | [05.4](./05-infrastructure.md#閾値の調整) |
| `GameConfig` の各値 | 実機でのプレイ感。1 プレイ 60〜120 秒を目安 | [04.8](./04-game-rules.md#48-未解決事項とバランス調整の指針) |
| 音の定位精度 | イヤホン有無での方向特定の可否 | [08](./08-mvp-roadmap.md#mvp-8空間音響) の受け入れ基準 |
| 依存パッケージのバージョン | 実装着手時点の最新安定版を固定する | [07.2](./07-build-deploy.md#バージョン固定について) |
| プレースホルダの見た目 | 実機の暗所での視認性 | [05.6](./05-infrastructure.md#proceduralghostviewglb-不在時) |
| GLB モデルの調達 | 必要になった時点で選定。規約は定義済み | [05.6](./05-infrastructure.md#glb-の規約) |

いずれも `GameConfig` とアダプタ内の定数の変更で対応でき、
ドメインロジックの構造には影響しない。

---

[← 08. MVP ロードマップ](./08-mvp-roadmap.md) | [目次](./README.md)
