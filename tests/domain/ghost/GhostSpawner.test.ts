import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/domain/config/GameConfig';
import { recalibrate, spawn } from '@/domain/ghost/GhostSpawner';
import { angleDelta } from '@/domain/math/Angles';
import { radians } from '@/shared/types';

/** 決定論的な擬似乱数。テストを再現可能にする */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('spawn', () => {
  it('設定された数だけ生成する', () => {
    const ghosts = spawn(DEFAULT_CONFIG, seededRandom(1));
    expect(ghosts).toHaveLength(DEFAULT_CONFIG.ghostCount);
  });

  it('個体間の方位が最小分離角以上離れている', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ghosts = spawn(DEFAULT_CONFIG, seededRandom(seed));
      for (let i = 0; i < ghosts.length; i++) {
        for (let j = i + 1; j < ghosts.length; j++) {
          const a = ghosts[i]!.azimuth;
          const b = ghosts[j]!.azimuth;
          expect(Math.abs(angleDelta(a, b))).toBeGreaterThanOrEqual(
            DEFAULT_CONFIG.minSeparationAzimuth - 1e-9,
          );
        }
      }
    }
  });

  it('正面から一定以上離れた位置に配置される', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ghosts = spawn(DEFAULT_CONFIG, seededRandom(seed));
      const nearest = Math.min(...ghosts.map((g) => Math.abs(angleDelta(0, g.azimuth))));
      expect(nearest).toBeGreaterThanOrEqual(DEFAULT_CONFIG.spawnFrontClearance - 1e-6);
    }
  });

  it('距離が設定範囲に収まる', () => {
    const ghosts = spawn(DEFAULT_CONFIG, seededRandom(7));
    for (const g of ghosts) {
      expect(g.distance).toBeGreaterThanOrEqual(DEFAULT_CONFIG.spawnDistanceMin);
      expect(g.distance).toBeLessThanOrEqual(DEFAULT_CONFIG.spawnDistanceMax);
    }
  });

  it('初期状態は接近中でゲージは空', () => {
    for (const g of spawn(DEFAULT_CONFIG, seededRandom(3))) {
      expect(g.phase).toBe('APPROACHING');
      expect(g.purify).toBe(0);
      expect(g.escapeCount).toBe(0);
      expect(g.azimuth).toBe(g.baseAzimuth);
    }
  });

  it('ゴースト数を増やしても分離制約が壊れない', () => {
    const config = { ...DEFAULT_CONFIG, ghostCount: 5 };
    const ghosts = spawn(config, seededRandom(11));
    expect(ghosts).toHaveLength(5);
  });
});

describe('recalibrate', () => {
  it('全個体の方位が同じ量だけ回る', () => {
    const before = spawn(DEFAULT_CONFIG, seededRandom(5));
    const shift = radians(0.4);
    const after = recalibrate(before, shift);

    for (let i = 0; i < before.length; i++) {
      expect(angleDelta(before[i]!.azimuth, after[i]!.azimuth)).toBeCloseTo(0.4, 6);
    }
  });

  it('相対的な位置関係が保存される', () => {
    const before = spawn(DEFAULT_CONFIG, seededRandom(9));
    const after = recalibrate(before, radians(-1.1));

    const gapBefore = angleDelta(before[0]!.azimuth, before[1]!.azimuth);
    const gapAfter = angleDelta(after[0]!.azimuth, after[1]!.azimuth);
    expect(gapAfter).toBeCloseTo(gapBefore, 6);
  });

  it('距離やフェーズには触れない', () => {
    const before = spawn(DEFAULT_CONFIG, seededRandom(2));
    const after = recalibrate(before, radians(2.0));
    expect(after[0]!.distance).toBe(before[0]!.distance);
    expect(after[0]!.phase).toBe(before[0]!.phase);
  });
});
