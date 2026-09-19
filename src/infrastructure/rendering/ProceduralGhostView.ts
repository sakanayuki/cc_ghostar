import {
  AdditiveBlending,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import type { GhostAnimation } from '@/domain/ghost/Ghost';
import type { GhostView } from './GhostView';

/**
 * GLB 不在時の実装（設計書 05.6）。
 *
 * MeshBasicMaterial を使いライティング計算を行わない。加法合成により
 * カメラ映像の上で「発光して浮かぶ」表現になる。暗所のホラー表現として
 * 十分に機能し、かつ極めて軽量である。
 */

// ジオメトリは全個体で共有する。生成コストとメモリを抑えるため
const BODY_GEOMETRY = new CapsuleGeometry(0.28, 0.95, 4, 12);
const EYE_GEOMETRY = new SphereGeometry(0.045, 8, 8);

const ANIMATION_PARAMS: Record<
  GhostAnimation,
  { amplitude: number; frequency: number; scale: number }
> = {
  IDLE: { amplitude: 0.035, frequency: 0.9, scale: 1 },
  WALK: { amplitude: 0.07, frequency: 1.6, scale: 1 },
  ATTACK: { amplitude: 0.16, frequency: 5.5, scale: 1.18 },
  APPEAR: { amplitude: 0.02, frequency: 0.6, scale: 0.9 },
  DISAPPEAR: { amplitude: 0.05, frequency: 3.2, scale: 0.8 },
};

export class ProceduralGhostView implements GhostView {
  readonly object = new Group();

  private readonly bodyMaterial: MeshBasicMaterial;
  private readonly eyeMaterial: MeshBasicMaterial;
  private readonly body: Mesh;
  private time = 0;
  private opacity = 0;

  constructor() {
    this.bodyMaterial = new MeshBasicMaterial({
      color: 0xaaccdd,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      // 半透明の重なり順の破綻を避ける
      depthWrite: false,
    });

    this.eyeMaterial = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.body = new Mesh(BODY_GEOMETRY, this.bodyMaterial);
    this.body.position.y = 0.75;

    const leftEye = new Mesh(EYE_GEOMETRY, this.eyeMaterial);
    leftEye.position.set(-0.09, 1.12, 0.23);
    const rightEye = new Mesh(EYE_GEOMETRY, this.eyeMaterial);
    rightEye.position.set(0.09, 1.12, 0.23);

    this.object.add(this.body, leftEye, rightEye);
    this.object.visible = false;
  }

  setOpacity(value: number): void {
    this.opacity = value;
    this.bodyMaterial.opacity = value * 0.85;
    // 眼窩は周囲より暗く抜く。加法合成を使わない
    this.eyeMaterial.opacity = value;
  }

  playAnimation(name: GhostAnimation, dtSec: number): void {
    this.time += dtSec;
    const p = ANIMATION_PARAMS[name];

    // 浮遊の上下動
    this.object.position.y = Math.sin(this.time * p.frequency) * p.amplitude;
    // 裾の揺れを縦方向のスケールで代用する
    const wobble = 1 + Math.sin(this.time * p.frequency * 1.7) * p.amplitude * 0.5;
    this.body.scale.set(p.scale, p.scale * wobble, p.scale);
  }

  dispose(): void {
    this.bodyMaterial.dispose();
    this.eyeMaterial.dispose();
    this.object.clear();
  }

  get currentOpacity(): number {
    return this.opacity;
  }
}
