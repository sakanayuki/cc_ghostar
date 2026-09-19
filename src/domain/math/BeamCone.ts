import { Quaternion, Vector3 } from 'three';
import type { GameConfig } from '@/domain/config/GameConfig';
import type { LightState } from '@/domain/light/LightState';
import type { Meters, Radians } from '@/shared/types';
import { clamp01 } from './Angles';

const _axis = new Vector3();

/** カメラ姿勢から光軸（単位ベクトル）を得る */
export function beamAxis(quaternion: Quaternion, out: Vector3 = _axis): Vector3 {
  return out.set(0, 0, -1).applyQuaternion(quaternion);
}

/**
 * 対象が光錐の内側にあるか。
 *
 * 内積と閾値の比較で済ませ、Math.acos を呼ばない。比較のためだけに
 * 角度へ戻す必要がなく、毎フレーム × ゴースト数だけ呼ばれるため。
 */
export function isInsideCone(
  axis: Vector3,
  targetDir: Vector3,
  halfAngle: Radians,
): boolean {
  return axis.dot(targetDir) >= Math.cos(halfAngle);
}

/**
 * 表示の濃さを返す。0 なら描画しない（設計書 03.5）。
 *
 * 捕捉できる範囲（beamHalfAngle）より広い範囲（visibleHalfAngle）で
 * 薄く見えるようにしている。「光の縁にぼんやり何かがいる」という表現。
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

  const heldCos = Math.cos(config.beamHalfAngle);
  const angular =
    cos >= heldCos ? 1 : clamp01((cos - visibleCos) / (heldCos - visibleCos));

  const far = config.visibleMaxDistance;
  const falloff = clamp01((far - distance) / far);

  return angular * falloff;
}
