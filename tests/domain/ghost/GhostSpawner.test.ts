import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/domain/config/GameConfig';
import { pickSpawnAzimuth, recalibrate, spawnOne } from '@/domain/ghost/GhostSpawner';
import { angleDelta } from '@/domain/math/Angles';
import { radians } from '@/shared/types';

/**
 * 決定論的な擬似乱数。テストを再現可能にする。
 *
 * 注意: 連続したシードの「1 個目の出力」は極端に近い値になる（LCG の
 * 増分が 2^32 に対して小さいため）。分布を見たいときは毎回シードを
 * 変えるのではなく、1 つの生成器から続けて引くこと。
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('pickSpawnAzimuth', () => {
  it('視線方向から最小角度以上離れた方位を返す', () => {
    const min = DEFAULT_CONFIG.spawnMinAngleFromView;
    const rng = seededRandom(1);
    for (const viewYaw of [0, 0.7, -1.4, 3.0, -2.6]) {
      for (let i = 0; i < 200; i++) {
        const a = pickSpawnAzimuth(radians(viewYaw), min, rng);
        expect(Math.abs(angleDelta(viewYaw, a))).toBeGreaterThanOrEqual(min - 1e-9);
      }
    }
  });

  it('乱数の端（0 と 1 近傍）でも制約を満たす', () => {
    const min = DEFAULT_CONFIG.spawnMinAngleFromView;
    for (const r of [0, 0.0001, 0.5, 0.9999]) {
      const a = pickSpawnAzimuth(radians(0), min, () => r);
      expect(Math.abs(angleDelta(0, a))).toBeGreaterThanOrEqual(min - 1e-9);
    }
  });

  it('左右どちらにも出現しうる', () => {
    const min = DEFAULT_CONFIG.spawnMinAngleFromView;
    const rng = seededRandom(1);
    const signs = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const a = pickSpawnAzimuth(radians(0), min, rng);
      signs.add(Math.sign(angleDelta(0, a)));
    }
    expect(signs.has(1)).toBe(true);
    expect(signs.has(-1)).toBe(true);
  });

  it('禁止角が極端でも円周を食い尽くさない', () => {
    const a = pickSpawnAzimuth(radians(0), radians(Math.PI), seededRandom(3));
    expect(Number.isFinite(a)).toBe(true);
  });
});

describe('spawnOne', () => {
  it('通し番号が ID に反映される', () => {
    for (const i of [0, 1, 2]) {
      expect(spawnOne(DEFAULT_CONFIG, i, radians(0), seededRandom(1)).id).toBe(
        `ghost-${i}`,
      );
    }
  });

  it('初期状態は接近中でゲージは空', () => {
    const g = spawnOne(DEFAULT_CONFIG, 0, radians(0), seededRandom(4));
    expect(g.phase).toBe('APPROACHING');
    expect(g.purify).toBe(0);
    expect(g.escapeCount).toBe(0);
    expect(g.azimuth).toBe(g.baseAzimuth);
    expect(g.banishedAt).toBeNull();
  });

  it('距離が設定範囲に収まる', () => {
    const rng = seededRandom(1);
    for (let i = 0; i < 200; i++) {
      const g = spawnOne(DEFAULT_CONFIG, 0, radians(0), rng);
      expect(g.distance).toBeGreaterThanOrEqual(DEFAULT_CONFIG.spawnDistanceMin);
      expect(g.distance).toBeLessThanOrEqual(DEFAULT_CONFIG.spawnDistanceMax);
    }
  });

  it('プレイヤーが向いている方向には出現しない', () => {
    const rng = seededRandom(1);
    const viewYaw = radians(1.2);
    for (let i = 0; i < 200; i++) {
      const g = spawnOne(DEFAULT_CONFIG, 0, viewYaw, rng);
      expect(Math.abs(angleDelta(viewYaw, g.azimuth))).toBeGreaterThanOrEqual(
        DEFAULT_CONFIG.spawnMinAngleFromView - 1e-9,
      );
    }
  });
});

describe('recalibrate', () => {
  it('方位が同じ量だけ回る', () => {
    const before = [spawnOne(DEFAULT_CONFIG, 0, radians(0), seededRandom(5))];
    const after = recalibrate(before, radians(0.4));
    expect(angleDelta(before[0]!.azimuth, after[0]!.azimuth)).toBeCloseTo(0.4, 6);
    expect(angleDelta(before[0]!.baseAzimuth, after[0]!.baseAzimuth)).toBeCloseTo(0.4, 6);
  });

  it('距離やフェーズには触れない', () => {
    const before = [spawnOne(DEFAULT_CONFIG, 0, radians(0), seededRandom(2))];
    const after = recalibrate(before, radians(2.0));
    expect(after[0]!.distance).toBe(before[0]!.distance);
    expect(after[0]!.phase).toBe(before[0]!.phase);
  });
});
