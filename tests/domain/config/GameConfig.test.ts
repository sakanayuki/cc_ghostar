import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, withOverrides } from '@/domain/config/GameConfig';

describe('withOverrides', () => {
  it('上書きが無ければ既定値のまま', () => {
    const c = withOverrides(DEFAULT_CONFIG, { ghosts: null, speed: null });
    expect(c.ghostCount).toBe(DEFAULT_CONFIG.ghostCount);
    expect(c.approachSpeed).toBe(DEFAULT_CONFIG.approachSpeed);
  });

  it('ゴースト数と速度を上書きできる', () => {
    const c = withOverrides(DEFAULT_CONFIG, { ghosts: 5, speed: 0.5 });
    expect(c.ghostCount).toBe(5);
    expect(c.approachSpeed).toBe(0.5);
  });

  it('不正な値は無視する', () => {
    const c = withOverrides(DEFAULT_CONFIG, { ghosts: 0, speed: -1 });
    expect(c.ghostCount).toBe(DEFAULT_CONFIG.ghostCount);
    expect(c.approachSpeed).toBe(DEFAULT_CONFIG.approachSpeed);
  });

  it('ゴースト数には上限がある', () => {
    expect(withOverrides(DEFAULT_CONFIG, { ghosts: 9999, speed: null }).ghostCount).toBe(
      12,
    );
  });

  it('小数のゴースト数は切り捨てる', () => {
    expect(withOverrides(DEFAULT_CONFIG, { ghosts: 4.9, speed: null }).ghostCount).toBe(
      4,
    );
  });

  it('他の設定値は変更しない', () => {
    const c = withOverrides(DEFAULT_CONFIG, { ghosts: 5, speed: 1 });
    expect(c.beamHalfAngle).toBe(DEFAULT_CONFIG.beamHalfAngle);
    expect(c.purifyDurationSec).toBe(DEFAULT_CONFIG.purifyDurationSec);
  });
});

describe('DEFAULT_CONFIG の整合性', () => {
  it('光錐は視認範囲より狭い', () => {
    expect(DEFAULT_CONFIG.beamHalfAngle).toBeLessThan(DEFAULT_CONFIG.visibleHalfAngle);
  });

  it('光錐は縦持ちの水平半視野（約 15 度）より狭い', () => {
    // FOV 60 度は垂直値。縦持ちでは水平がはるかに狭く、ここが実際の制約になる。
    // ここを超えると画面外のゴーストを捕捉できてしまう（設計書 03.5）
    const verticalHalfFov = (30 * Math.PI) / 180;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (390 / 844));
    expect(DEFAULT_CONFIG.beamHalfAngle).toBeLessThan(horizontalHalfFov);
    expect(DEFAULT_CONFIG.visibleHalfAngle).toBeLessThanOrEqual(horizontalHalfFov);
  });

  it('出現の禁止角は円周を食い尽くさない', () => {
    // 視線を中心とする禁止扇が 180 度以上になると、出現可能な弧が消える
    expect(DEFAULT_CONFIG.spawnMinAngleFromView).toBeLessThan(Math.PI);
  });

  it('出現の禁止角は光錐より十分広い（出た瞬間に捕捉されない）', () => {
    expect(DEFAULT_CONFIG.spawnMinAngleFromView).toBeGreaterThan(
      DEFAULT_CONFIG.visibleHalfAngle * 2,
    );
  });

  it('補充の間は演出時間より長い（無音の間が生まれる）', () => {
    expect(DEFAULT_CONFIG.nextSpawnDelayMs).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.banishAnimationMs,
    );
  });

  it('スポーン距離は掴みかかり距離より十分遠い', () => {
    expect(DEFAULT_CONFIG.spawnDistanceMin).toBeGreaterThan(
      DEFAULT_CONFIG.grabDistance * 3,
    );
  });

  it('ウェーブが進むほど速度倍率が上がる', () => {
    const t = DEFAULT_CONFIG.speedByWave;
    expect(t.length).toBeGreaterThan(0);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
    }
  });

  it('速度倍率のテーブルがゴースト総数をカバーしている', () => {
    expect(DEFAULT_CONFIG.speedByWave.length).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.ghostCount,
    );
  });
});
