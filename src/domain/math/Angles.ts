import type { Radians } from '@/shared/types';

const TAU = Math.PI * 2;

/** 角度を (-π, π] に正規化する */
export function normalizeAngle(rad: number): number {
  let a = rad % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

/** 2 つの角度の最小差分。符号付きで (-π, π] */
export function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

export const normalizeRadians = (rad: number): Radians => normalizeAngle(rad) as Radians;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
