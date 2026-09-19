# DESIGN.md

# Torch WebAR Horror

## 1. Overview

Android Chrome上で動作する、インストール不要のWebARホラー体験を開発する。

プレイヤーはスマートフォンを「特殊な懐中電灯」として使用する。

背面カメラの映像をリアルタイム表示しながらスマートフォン背面LED（Torch）を点灯し、現実空間を照らして探索する。

画面上にはThree.jsで描画された幽霊・ゾンビなどの3Dオブジェクトが現実空間に存在するように合成される。

本PoCではARCoreレベルのSLAMや平面認識を必須とせず、

- 背面カメラ
- Torch API
- Device Orientation / Device Motion
- Three.js
- 簡易的な空間アンカー

を組み合わせてAR風の体験を成立させる。

---

# 2. Product Concept

## Core Fantasy

> スマートフォンは、現実世界には見えない存在を映し出す特殊な懐中電灯である。

肉眼では何も見えない。

しかしスマートフォンを通して暗い部屋を探索すると、現実空間に幽霊やゾンビが存在している。

背面LEDは単なる補助照明ではなく、ゲーム世界における「探索装置」の一部として扱う。

---

# 3. Target Environment

## Primary Target

- Android smartphone
- Google Chrome
- HTTPS
- WebGL 2
- JavaScript / TypeScript

対象ブラウザはPoC段階ではAndroid Chromeに限定する。

iOS Safariへの対応は初期スコープに含めない。

## Required Hardware

- Rear Camera
- Rear LED / Torch
- Gyroscope
- Accelerometer
- WebGL対応GPU

端末によってTorchやセンサーAPIの実装差があるため、起動時にFeature Detectionを行う。

---

# 4. Technology Stack

Recommended stack:

```text
TypeScript
Vite
Three.js
WebGL
MediaDevices API
MediaStreamTrack API
DeviceOrientation API
DeviceMotion API
```

必要になった場合のみ追加ライブラリを導入する。

PoCでは依存ライブラリを増やしすぎない。

---

# 5. System Architecture

```text
Android Chrome
      |
      +-- getUserMedia()
      |       |
      |       +-- Rear Camera
      |       |
      |       +-- MediaStreamTrack
      |                |
      |                +-- Torch ON/OFF
      |
      +-- DeviceOrientation
      |
      +-- DeviceMotion
      |
      +-- Three.js
              |
              +-- PerspectiveCamera
              |
              +-- Ghost / Zombie Model
              |
              +-- Effects
              |
              +-- WebGLRenderer
```

画面構成：

```text
Camera Video
     ↓
Background Layer

Three.js Canvas
     ↓
Transparent WebGL Layer

UI
     ↓
HUD / Interaction Layer
```

最終表示：

```text
Camera
+
3D Objects
+
HUD
```

---

# 6. Camera System

## Camera Acquisition

背面カメラを使用する。

Example:

```javascript
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: {
            ideal: "environment"
        }
    },
    audio: false
});
```

取得したMediaStreamをHTMLVideoElementへ接続する。

Videoは画面全体に表示する。

Recommended:

```text
playsinline
autoplay
muted
```

---

# 7. Torch System

カメラのMediaStreamTrackからTorch capabilityを取得する。

Concept:

```javascript
const track = stream.getVideoTracks()[0];

const capabilities = track.getCapabilities();

if (capabilities.torch) {
    await track.applyConstraints({
        advanced: [
            { torch: true }
        ]
    });
}
```

Torch ON/OFFは必ず同一Camera Trackに対して行う。

## Torch States

```text
UNAVAILABLE
OFF
ON
ERROR
```

UIとゲームロジックから直接MediaStreamTrackを操作せず、TorchController経由で制御する。

Example architecture:

```text
TorchController

isSupported()
turnOn()
turnOff()
toggle()
getState()
```

---

# 8. AR Strategy

本プロジェクトでは初期段階から本格的なSLAMを実装しない。

PoCでは、

```text
Gyroscope
+
DeviceOrientation
+
Virtual World Coordinates
```

によって簡易ARを構築する。

## Basic Idea

起動時のスマートフォン方向を、

```text
World Forward = 0°
```

としてキャリブレーションする。

その後、

```text
alpha
beta
gamma
```

等の端末姿勢情報からThree.js CameraのRotationを更新する。

これによって、

```text
ユーザーが右を向く
↓
Three.js Cameraも右を向く
↓
左側に存在するGhostが画面外へ移動
```

というAR的な挙動を実現する。

---

# 9. Important Limitation

DeviceOrientationだけでは位置移動を正確に取得できない。

つまり、

```text
Rotation
○

Position
△ / ×
```

となる。

そのためPoCでは、「スマートフォンの向き」を主要なインタラクションとして設計する。

プレイヤーが実際に数メートル歩いた位置を高精度に追跡することは初期スコープ外とする。

---

# 10. Virtual World

プレイヤーをWorld Originに配置する。

```text
Player

position:
0, 0, 0
```

Ghostを仮想球面上に配置する。

Example:

```text
Ghost A
distance = 3m
angle = 30°

Ghost B
distance = 5m
angle = -90°

Ghost C
distance = 2m
angle = 170°
```

実際の距離というより、「ユーザーから見た方向」を中心にゲームを成立させる。

---

# 11. Ghost Placement

GhostManagerを作成する。

Responsibilities:

```text
spawnGhost()
removeGhost()
updateGhosts()
hideGhost()
showGhost()
```

Ghost Definition:

```typescript
interface Ghost {
    id: string;
    angle: number;
    distance: number;
    height: number;
    visible: boolean;
    behavior: GhostBehavior;
}
```

---

# 12. Horror Mechanic

TorchとGhostをゲームロジック上で連動させる。

```text
Torch ON
↓
Ghost visible
↓
Ghost stops moving
```

```text
Torch OFF
↓
Ghost invisible
↓
Ghost approaches player
```

再点灯：

```text
Torch ON
↓
Ghost appears closer
```

これによりSLAMなしでも「暗闇の中で何かが近づいている」という体験を作る。

---

# 13. Visibility System

Ghostは常時表示しない。

```text
Torch ON
AND
Ghost inside camera FOV
```

の場合のみレンダリングする。

Optional:

```text
distance
view angle
random visibility
```

も判定に追加する。

---

# 14. Encounter Example

```text
Ghost Distance
5m
```

Torch OFF後：

```text
4m
3m
2m
1m
```

Torch ON：

```text
Ghost appears at 1m
```

画面いっぱいにGhostが表示される。

---

# 15. Game Loop

```text
requestAnimationFrame()
    ↓
Read DeviceOrientation
    ↓
Update Three Camera
    ↓
Update Ghost AI
    ↓
Calculate Visibility
    ↓
Update Animation
    ↓
Render Three.js
```

---

# 16. Coordinate System

```text
Y
↑

Player
●────→ X

Z = depth
```

Player height:

```text
cameraHeight ≈ 1.6m
```

PoCでは実際のユーザー身長との一致は要求しない。

---

# 17. Camera FOV

```javascript
new THREE.PerspectiveCamera(
    60,
    width / height,
    0.1,
    100
);
```

実カメラとの完全なFOV一致はPoCでは必須ではない。

後続フェーズでCamera FOV calibrationを実装可能な構造にする。

---

# 18. 3D Assets

Format:

```text
glTF / GLB
```

推奨：

```text
.glb
```

Ghost / Zombie model requirements:

```text
Low Poly / Mobile optimized
Triangles: < 50k recommended
Texture: <= 2048

Animation:
Idle
Walk
Attack
Appear
Disappear
```

Three.jsのGLTFLoader / AnimationMixerを使用する。

---

# 19. Lighting

初期実装：

```text
AmbientLight
+
DirectionalLight
```

必要であればThree Camera付近にPointLightを置き、Torchから照射されているように見せる。

---

# 20. Virtual Flashlight

```text
Phone
 |
 +-- Real Torch
 |
 +-- Virtual SpotLight
```

Virtual SpotLight：

```text
position = Camera Position
direction = Camera Forward
```

Real Torchは現実世界を照らし、Virtual SpotLightは3Dオブジェクトを照らす。

---

# 21. UX Flow

```text
START
↓
Camera Permission
↓
Camera Start
↓
Torch Capability Check
↓
Sensor Initialization
↓
Calibration
↓
Game Start
```

ブラウザのPermission要求はユーザー操作をトリガーとして実行する。

---

# 22. Calibration

現在のDeviceOrientationを基準方向として保存する。

```text
currentYaw → worldYaw = 0
```

---

# 23. UI

必要UI：

```text
Torch Button
Calibration Button
Debug Button
```

---

# 24. Debug Mode

Display:

```text
FPS
Camera: active / inactive
Torch: supported / ON / OFF
Orientation: alpha / beta / gamma
Three Camera: rotation X / Y / Z
Ghost: count / angle / distance / visible
```

Productionでは非表示にできること。

---

# 25. Error Handling

Camera denied:

```text
カメラへのアクセスが必要です。
```

Torch unsupported:

```text
この端末ではライト制御に対応していません。
```

TorchなしでもDebug可能にする。

Sensor unavailable:

```text
端末の方向センサーを利用できません。
```

WebGL unavailableの場合はゲーム起動不可。

---

# 26. Device Compatibility

```typescript
interface DeviceCapabilities {
    camera: boolean;
    torch: boolean;
    orientation: boolean;
    motion: boolean;
    webgl: boolean;
}
```

Compatibility判定をUser-Agentだけに依存させず、実APIのCapabilityを確認する。

---

# 27. Performance Target

```text
30 FPS minimum
60 FPS preferred
```

Performance priorities:

1. Camera rendering
2. DeviceOrientation
3. Three.js rendering
4. Ghost animation
5. Effects

---

# 28. Performance Constraints

Avoid:

```text
大量Particle
高解像度Shadow
大量Dynamic Light
巨大Texture
高Poly Model
Post Processing多用
```

---

# 29. Screen Wake Lock

ゲーム中は可能な環境でScreen Wake Lock APIを利用する。

ゲーム終了・ページ非表示時にはWake Lockを解放する。

---

# 30. Lifecycle Management

`visibilitychange` 等を監視する。

Background：

```text
Torch OFF
Pause Game
Pause Animation
```

Foreground：

```text
Camera Check
Sensor Check
Resume
```

---

# 31. Privacy

```text
Camera recording: NO
Camera upload: NO
Image upload: NO
```

Camera映像は端末内でのみ処理する。

---

# 32. Recommended Directory Structure

```text
src/
  main.ts
  app/App.ts
  camera/CameraController.ts
  camera/TorchController.ts
  sensors/OrientationController.ts
  sensors/MotionController.ts
  ar/ARCamera.ts
  ar/CalibrationManager.ts
  world/World.ts
  ghost/Ghost.ts
  ghost/GhostManager.ts
  ghost/GhostBehavior.ts
  rendering/Renderer.ts
  rendering/Lighting.ts
  game/Game.ts
  game/GameLoop.ts
  ui/HUD.ts
  ui/DebugHUD.ts
  device/CapabilityDetector.ts

assets/
  models/ghost.glb
  textures/

public/
```

---

# 33. Architecture Rules

各ブラウザAPIをGameロジックから直接呼び出さない。

```text
Game
 ↓
CameraController
 ↓
Browser API
```

Torch、OrientationについてもControllerを介する。

---

# 34. State Machine

```text
BOOT
↓
PERMISSION
↓
CAMERA_READY
↓
CALIBRATION
↓
PLAYING
↓
PAUSED
↓
GAME_OVER
```

Errors:

```text
ERROR_CAMERA
ERROR_SENSOR
ERROR_WEBGL
```

Torch unsupportedはFatal Errorとしない。

---

# 35. MVP

### MVP-1
Camera Preview

### MVP-2
Camera + Torch ON/OFF

### MVP-3
Camera + Torch + Three.js Cube

### MVP-4
DeviceOrientation + Three Camera Rotation

### MVP-5
CubeをGhost GLBへ置換

### MVP-6
Torch Gameplay

```text
Torch OFF → Ghost approaches
Torch ON  → Ghost visible
```

ここまで完成すればPoC成功とする。

---

# 36. Do NOT Implement Initially

Codexは初期PoCに以下を追加しないこと。

```text
ARCore
WebXR依存
SLAM
Plane Detection
Image Recognition
GPS
Multiplayer
Backend
Account System
Database
Cloud Camera Processing
AI Object Recognition
Spatial Mesh
Physics Engine
Complex Post Processing
```

---

# 37. Key Technical Risk

最大の技術リスクは、

```text
現実空間と3D空間の位置ズレ
```

DeviceOrientationだけではユーザーの回転は追跡できても、ユーザーの移動は正確に追跡できない。

ゲームデザイン自体を「歩行位置の精密追跡」ではなく「スマートフォンをどちらへ向けたか」を中心に成立させる。

---

# 38. Design Principle

技術的制約を隠そうとしない。

制約をゲームルールとして利用する。
