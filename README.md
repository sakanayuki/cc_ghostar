# cc_ghostar — Torch WebAR Horror

Android Chrome 上で動作する、インストール不要の WebAR ホラー体験。

スマートフォンを「現実には見えない存在を映し出す特殊な懐中電灯」として使い、
背面カメラと背面 LED で暗い部屋を照らしながら、周囲に潜む幽霊を探して浄化する。

**現在のステータス: 設計フェーズ（実装未着手）**

---

## 設計書

実装に先立つ設計は [`docs/`](./docs/README.md) にある。

| 章 | 内容 |
| --- | --- |
| [01. 概要とスコープ](./docs/01-overview.md) | プロダクト定義、対象環境、スコープ境界 |
| [02. アーキテクチャ](./docs/02-architecture.md) | 4 層構成、依存規則、ポート定義 |
| [03. ドメインモデル](./docs/03-domain-model.md) | 型定義、座標系、姿勢計算 |
| [04. ゲームルール](./docs/04-game-rules.md) | 勝敗条件、状態機械、チューニング値 |
| [05. インフラ層](./docs/05-infrastructure.md) | カメラ / Torch / センサー / 音響 / 描画 |
| [06. UI・UX・演出](./docs/06-ui-ux.md) | 画面遷移、HUD、安全配慮 |
| [07. ビルドとデプロイ](./docs/07-build-deploy.md) | Vite / CI / GitHub Pages |
| [08. MVP ロードマップ](./docs/08-mvp-roadmap.md) | 段階的な実装計画 |
| [09. 原典との対応表](./docs/09-design-md-mapping.md) | 設計判断の根拠 |

原典の要件定義は [`docs/original-design.md`](./docs/original-design.md)。

---

## 技術スタック（予定）

```text
TypeScript / Vite / Three.js
MediaDevices API      背面カメラ
MediaStreamTrack API  Torch 制御
DeviceOrientation API 視点追従
DeviceMotion API      シェイク検出
Web Audio API         空間音響
```

---

## 動作環境

| 項目 | 要件 |
| --- | --- |
| OS / ブラウザ | Android / Google Chrome |
| 必須 | 背面カメラ、WebGL 2、ジャイロ・加速度センサー、HTTPS |
| 任意 | 背面 LED（非対応でもプレイ可能）、振動、Wake Lock |

iOS Safari は初期スコープ外。

---

## 公開先

```text
https://sakanayuki.github.io/cc_ghostar/
```

`main` への push で GitHub Actions がビルド・検証・デプロイを行う。
型チェック・Lint・テストのいずれかが失敗した場合、デプロイは行われない。

### 起動オプション

| クエリ | 効果 |
| --- | --- |
| `?debug=1` | デバッグ HUD を表示 |
| `?mock=1` | センサーをマウス操作に、カメラを黒背景に差し替え（PC 検証用） |
| `?notorch=1` | Torch 非対応端末の挙動を擬似再現 |
| `?mute=1` | 音を止める |

---

## 開発（実装着手後）

```bash
npm ci
npm run dev        # 開発サーバー
npm run verify     # 型チェック + Lint + テスト + ビルド
```

実機での確認手順は [07.3](./docs/07-build-deploy.md#開発サーバーと-https) を参照。

---

## プライバシー

カメラ映像は端末内でのみ処理される。
録画・アップロード・フレームの取得・外部への送信は一切行わない。
端末に保存されるのはクリアタイムのみ。

---

## ライセンス

MIT License. 詳細は [LICENSE](./LICENSE) を参照。
