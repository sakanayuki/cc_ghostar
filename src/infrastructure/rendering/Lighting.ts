import { AmbientLight, PerspectiveCamera, SpotLight } from 'three';
import type { GameConfig } from '@/domain/config/GameConfig';

export interface Lighting {
  readonly ambient: AmbientLight;
  readonly beam: SpotLight;
  setBeamEnabled(enabled: boolean): void;
  dispose(): void;
}

/**
 * 原典 §19・§20 に従う。影は一切使わない。シャドウマップはモバイル GPU で
 * 最も高価な処理の一つであり、原典 §28 の方針に反する（設計書 05.6）。
 */
export function createLighting(camera: PerspectiveCamera, config: GameConfig): Lighting {
  // 完全な暗闇ではシルエットも見えないため、最低限の環境光を置く
  const ambient = new AmbientLight(0x223344, 0.35);

  const beam = new SpotLight(0xffffff, 3.0);
  beam.angle = config.visibleHalfAngle;
  beam.penumbra = 0.6;
  beam.distance = config.visibleMaxDistance;
  beam.decay = 1.5;
  beam.castShadow = false;
  beam.position.set(0, 0, 0);

  // スポットライトはカメラの子として配置し、向きに自動で追従させる。
  // target をシーンへ直接追加すると追従しない
  camera.add(beam);
  camera.add(beam.target);
  beam.target.position.set(0, 0, -1);

  return {
    ambient,
    beam,
    setBeamEnabled(enabled: boolean): void {
      beam.visible = enabled;
    },
    dispose(): void {
      ambient.dispose();
      beam.dispose();
    },
  };
}
