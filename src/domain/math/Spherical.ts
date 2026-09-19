import { Vector3 } from 'three';
import type { Meters, Radians, Vector3Like } from '@/shared/types';

/**
 * 方位と距離から直交座標へ変換する（設計書 03.1）。
 *
 * ワールド前方は -Z、方位は上から見て時計回りが正。
 *   x = sin(azimuth) * distance
 *   z = -cos(azimuth) * distance
 */
export function toPosition(
  azimuth: Radians,
  distance: Meters,
  eyeHeight: number,
  heightOffset: Meters,
  out: Vector3 = new Vector3(),
): Vector3 {
  return out.set(
    Math.sin(azimuth) * distance,
    eyeHeight + heightOffset,
    -Math.cos(azimuth) * distance,
  );
}

/** 原点（目の高さ）から対象へ向かう単位ベクトル */
export function directionTo(
  position: Vector3Like,
  eyeHeight: number,
  out: Vector3 = new Vector3(),
): Vector3 {
  return out.set(position.x, position.y - eyeHeight, position.z).normalize();
}

/** 直交座標から方位を取り出す。toPosition の逆変換 */
export function azimuthOf(position: Vector3Like): number {
  return Math.atan2(position.x, -position.z);
}
