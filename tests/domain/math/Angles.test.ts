import { describe, expect, it } from 'vitest';
import { angleDelta, clamp, clamp01, lerp, normalizeAngle } from '@/domain/math/Angles';

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;

describe('normalizeAngle', () => {
  it('範囲内の角度はそのまま返す', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(1)).toBeCloseTo(1);
    expect(normalizeAngle(-1)).toBeCloseTo(-1);
  });

  it('π をちょうど含み -π を含まない', () => {
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });

  it('多重周回でも (-π, π] に収まる', () => {
    for (const k of [-5, -3, -1, 0, 1, 2, 7]) {
      for (const base of [0, 1, -1, 2.5, -2.5, 3.1]) {
        const result = normalizeAngle(base + k * TAU);
        expect(result).toBeGreaterThan(-Math.PI - 1e-9);
        expect(result).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});

describe('angleDelta', () => {
  it('周回を跨ぐ最短経路を返す', () => {
    // 179° から -179° への最短経路は +2°
    expect(angleDelta(deg(179), deg(-179))).toBeCloseTo(deg(2), 6);
    // その逆は -2°
    expect(angleDelta(deg(-179), deg(179))).toBeCloseTo(deg(-2), 6);
  });

  it('同じ角度の差は 0', () => {
    expect(angleDelta(deg(42), deg(42))).toBeCloseTo(0);
    expect(angleDelta(deg(42), deg(42) + TAU)).toBeCloseTo(0);
  });
});

describe('clamp / lerp', () => {
  it('clamp は範囲に収める', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamp01 は 0〜1 に収める', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
  });

  it('lerp は端点を再現する', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
  });
});
