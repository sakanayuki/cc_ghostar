import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { beamAxis, computeOpacity, isInsideCone } from '@/domain/math/BeamCone';
import { DEFAULT_CONFIG } from '@/domain/config/GameConfig';
import { meters, radians } from '@/shared/types';

const FORWARD = new Vector3(0, 0, -1);
const dirAt = (deg: number): Vector3 =>
  new Vector3(Math.sin((deg * Math.PI) / 180), 0, -Math.cos((deg * Math.PI) / 180));

describe('beamAxis', () => {
  it('無回転では -Z を返す', () => {
    const axis = beamAxis(new Quaternion(), new Vector3());
    expect(axis.z).toBeCloseTo(-1);
  });

  it('単位ベクトルを返す', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.8);
    const axis = beamAxis(q, new Vector3());
    expect(axis.length()).toBeCloseTo(1, 3);
  });
});

describe('isInsideCone', () => {
  const half = radians((20 * Math.PI) / 180);

  it('境界のわずか内側は true、わずか外側は false', () => {
    expect(isInsideCone(FORWARD, dirAt(19.5), half)).toBe(true);
    expect(isInsideCone(FORWARD, dirAt(20.5), half)).toBe(false);
  });

  it('正面は常に含まれる', () => {
    expect(isInsideCone(FORWARD, dirAt(0), half)).toBe(true);
  });

  it('背後は含まれない', () => {
    expect(isInsideCone(FORWARD, dirAt(180), half)).toBe(false);
  });
});

describe('computeOpacity', () => {
  const c = DEFAULT_CONFIG;

  it('照射 OFF では常に 0', () => {
    expect(computeOpacity(FORWARD, dirAt(0), meters(1), 'OFF', c)).toBe(0);
  });

  it('視認限界の外では 0', () => {
    expect(computeOpacity(FORWARD, dirAt(50), meters(1), 'ON', c)).toBe(0);
  });

  it('光錐の内側では距離減衰のみが効く', () => {
    const near = computeOpacity(FORWARD, dirAt(0), meters(1), 'ON', c);
    const far = computeOpacity(FORWARD, dirAt(0), meters(10), 'ON', c);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
  });

  it('角度が開くほど薄くなる（単調減少）', () => {
    let previous = Infinity;
    for (const deg of [0, 10, 20, 25, 30, 34]) {
      const value = computeOpacity(FORWARD, dirAt(deg), meters(5), 'ON', c);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      previous = value;
    }
  });

  it('視認最大距離を超えると 0 になる', () => {
    expect(computeOpacity(FORWARD, dirAt(0), meters(c.visibleMaxDistance), 'ON', c)).toBe(
      0,
    );
  });

  it('出力は必ず 0〜1 に収まる', () => {
    for (const deg of [0, 15, 30, 40]) {
      for (const d of [0.5, 3, 8, 13]) {
        const v = computeOpacity(FORWARD, dirAt(deg), meters(d), 'ON', c);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
