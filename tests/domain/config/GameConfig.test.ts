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

  it('既定のゴースト数で分離制約が成立する', () => {
    expect(
      DEFAULT_CONFIG.minSeparationAzimuth * DEFAULT_CONFIG.ghostCount,
    ).toBeLessThanOrEqual(Math.PI * 2);
  });

  it('正面クリアランスは最大の隙間の半分から導かれる下限を満たす', () => {
    const minWidestGap = (Math.PI * 2) / DEFAULT_CONFIG.ghostCount;
    expect(DEFAULT_CONFIG.spawnFrontClearance).toBeLessThanOrEqual(
      minWidestGap / 2 + 1e-9,
    );
  });

  it('揺らぎの振幅は光錐より大きい（放置で捕捉されない）', () => {
    expect(DEFAULT_CONFIG.wobbleAmplitude).toBeGreaterThan(DEFAULT_CONFIG.beamHalfAngle);
  });

  it('スポーン距離は掴みかかり距離より十分遠い', () => {
    expect(DEFAULT_CONFIG.spawnDistanceMin).toBeGreaterThan(
      DEFAULT_CONFIG.grabDistance * 3,
    );
  });

  it('残存数の速度倍率は残りが少ないほど大きい', () => {
    const t = DEFAULT_CONFIG.speedByRemaining;
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!).toBeLessThanOrEqual(t[i - 1]!);
    }
  });
});
