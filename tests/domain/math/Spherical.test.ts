import { describe, expect, it } from 'vitest';
import { azimuthOf, directionTo, toPosition } from '@/domain/math/Spherical';
import { meters, radians } from '@/shared/types';

const EYE = 1.6;

describe('toPosition', () => {
  it('方位 0 は正面（-Z）に配置される', () => {
    const p = toPosition(radians(0), meters(5), EYE, meters(0));
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(EYE);
    expect(p.z).toBeCloseTo(-5);
  });

  it('方位 +90° は右手側（+X）に配置される', () => {
    const p = toPosition(radians(Math.PI / 2), meters(3), EYE, meters(0));
    expect(p.x).toBeCloseTo(3);
    expect(p.z).toBeCloseTo(0);
  });

  it('方位 180° は背後（+Z）に配置される', () => {
    const p = toPosition(radians(Math.PI), meters(4), EYE, meters(0));
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(4);
  });

  it('高さオフセットが目の高さに加算される', () => {
    const p = toPosition(radians(0), meters(1), EYE, meters(-0.3));
    expect(p.y).toBeCloseTo(EYE - 0.3);
  });
});

describe('azimuthOf', () => {
  it('toPosition の逆変換になっている', () => {
    for (const a of [0, 0.5, 1.7, -2.2, Math.PI / 2, -Math.PI / 2]) {
      const p = toPosition(radians(a), meters(6), EYE, meters(0));
      expect(azimuthOf(p)).toBeCloseTo(a, 6);
    }
  });
});

describe('directionTo', () => {
  it('単位ベクトルを返す', () => {
    const p = toPosition(radians(1.1), meters(7), EYE, meters(0.4));
    const d = directionTo(p, EYE);
    expect(d.length()).toBeCloseTo(1);
  });

  it('正面のゴーストへの方向は -Z', () => {
    const p = toPosition(radians(0), meters(5), EYE, meters(0));
    const d = directionTo(p, EYE);
    expect(d.z).toBeCloseTo(-1);
  });
});
