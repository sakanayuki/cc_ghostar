import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { DEFAULT_CONFIG } from '@/domain/config/GameConfig';
import type { GameConfig } from '@/domain/config/GameConfig';
import type { Ghost } from '@/domain/ghost/Ghost';
import type { StepInput } from '@/domain/ghost/GhostBehavior';
import { approachSpeedOf, step, wobbleAzimuth } from '@/domain/ghost/GhostBehavior';
import type { DomainEvent } from '@/domain/ghost/GhostEvents';
import { angleDelta } from '@/domain/math/Angles';
import { ghostId, meters, millis, radians } from '@/shared/types';

const C = DEFAULT_CONFIG;

const mkGhost = (p: Partial<Ghost> = {}): Ghost => ({
  id: ghostId('g0'),
  azimuth: radians(0),
  baseAzimuth: radians(0),
  distance: meters(5),
  heightOffset: meters(0),
  phase: 'APPROACHING',
  purify: 0,
  grabStartedAt: null,
  escapeCount: 0,
  wobbleSeed: 0,
  banishedAt: null,
  ...p,
});

/** 指定方位を向く光軸 */
const axisAt = (rad: number): Vector3 => new Vector3(Math.sin(rad), 0, -Math.cos(rad));

// exactOptionalPropertyTypes の下では Partial のスプレッドが必須プロパティを
// optional に落とすため、各フィールドを明示的に解決する
const mkInput = (p: Partial<StepInput> = {}): StepInput => ({
  ghosts: p.ghosts ?? [mkGhost()],
  beamAxis: p.beamAxis ?? axisAt(0),
  light: p.light ?? 'ON',
  shook: p.shook ?? false,
  dt: p.dt ?? 1 / 60,
  elapsedMs: p.elapsedMs ?? millis(0),
  waveIndex: p.waveIndex ?? 0,
  config: p.config ?? C,
});

const has = (events: readonly DomainEvent[], type: DomainEvent['type']): boolean =>
  events.some((e) => e.type === type);

describe('step: 捕捉（光軸内）', () => {
  it('照射 ON かつ光軸内なら静止し、浄化が進む', () => {
    const out = step(mkInput({ ghosts: [mkGhost({ distance: meters(5) })] }));
    const g = out.ghosts[0]!;

    expect(g.phase).toBe('HELD');
    expect(g.distance).toBe(5);
    expect(g.purify).toBeGreaterThan(0);
    expect(has(out.events, 'GHOST_HELD')).toBe(true);
  });

  it('捕捉が続いている間は GHOST_HELD を再発火しない', () => {
    const held = mkGhost({ phase: 'HELD', purify: 0.4 });
    const out = step(mkInput({ ghosts: [held] }));
    expect(has(out.events, 'GHOST_HELD')).toBe(false);
  });

  it('浄化ゲージが満ちると BANISHED になる', () => {
    const almost = mkGhost({ phase: 'HELD', purify: 0.999 });
    const out = step(mkInput({ ghosts: [almost], elapsedMs: millis(1234) }));
    const g = out.ghosts[0]!;

    expect(g.phase).toBe('BANISHED');
    expect(g.banishedAt).toBe(1234);
    expect(has(out.events, 'GHOST_PURIFIED')).toBe(true);
  });

  it('浄化にはおよそ purifyDurationSec かかる', () => {
    let ghosts: readonly Ghost[] = [mkGhost()];
    const dt = 1 / 60;
    let elapsed = 0;

    while (ghosts[0]!.phase !== 'BANISHED' && elapsed < 30) {
      ghosts = step(mkInput({ ghosts, dt, elapsedMs: millis(elapsed * 1000) })).ghosts;
      elapsed += dt;
    }
    expect(elapsed).toBeGreaterThan(C.purifyDurationSec - 0.1);
    expect(elapsed).toBeLessThan(C.purifyDurationSec + 0.1);
  });

  it('BANISHED は以後変化しない', () => {
    const dead = mkGhost({ phase: 'BANISHED', purify: 1, banishedAt: millis(10) });
    const out = step(mkInput({ ghosts: [dead] }));
    expect(out.ghosts[0]).toBe(dead);
    expect(out.events).toHaveLength(0);
  });
});

describe('step: 接近（光軸外）', () => {
  it('光軸の外にいるゴーストは接近する', () => {
    const out = step(
      mkInput({ ghosts: [mkGhost({ distance: meters(5) })], beamAxis: axisAt(Math.PI) }),
    );
    expect(out.ghosts[0]!.phase).toBe('APPROACHING');
    expect(out.ghosts[0]!.distance).toBeLessThan(5);
  });

  it('照射 ON でも光軸の外なら接近を止めない（本設計の中核）', () => {
    const behind = mkGhost({ azimuth: radians(Math.PI), baseAzimuth: radians(Math.PI) });
    const out = step(mkInput({ ghosts: [behind], light: 'ON', beamAxis: axisAt(0) }));

    expect(out.ghosts[0]!.phase).toBe('APPROACHING');
    expect(out.ghosts[0]!.distance).toBeLessThan(behind.distance);
  });

  it('照射 OFF なら光軸内にいても接近する', () => {
    const out = step(mkInput({ light: 'OFF', beamAxis: axisAt(0) }));
    expect(out.ghosts[0]!.phase).toBe('APPROACHING');
  });

  it('捕捉が外れると GHOST_RELEASED が出てゲージが減る', () => {
    const held = mkGhost({ phase: 'HELD', purify: 0.5 });
    const out = step(mkInput({ ghosts: [held], beamAxis: axisAt(Math.PI) }));

    expect(has(out.events, 'GHOST_RELEASED')).toBe(true);
    expect(out.ghosts[0]!.purify).toBeLessThan(0.5);
  });

  it('ゲージは即リセットされず緩やかに減衰する', () => {
    const held = mkGhost({ phase: 'HELD', purify: 1.0 });
    let ghosts: readonly Ghost[] = [held];
    // 1 秒ぶん外す
    for (let i = 0; i < 60; i++) {
      ghosts = step(mkInput({ ghosts, beamAxis: axisAt(Math.PI), dt: 1 / 60 })).ghosts;
    }
    expect(ghosts[0]!.purify).toBeCloseTo(1 - C.purifyDecayPerSec, 2);
  });

  it('ゲージは 0 未満にならない', () => {
    let ghosts: readonly Ghost[] = [mkGhost({ purify: 0.05 })];
    for (let i = 0; i < 120; i++) {
      ghosts = step(mkInput({ ghosts, beamAxis: axisAt(Math.PI) })).ghosts;
    }
    expect(ghosts[0]!.purify).toBe(0);
  });
});

describe('approachSpeedOf', () => {
  it('照射 OFF で速度倍率が掛かる', () => {
    const on = approachSpeedOf(mkInput({ light: 'ON' }));
    const off = approachSpeedOf(mkInput({ light: 'OFF' }));
    expect(off / on).toBeCloseTo(C.lightOffSpeedMultiplier, 6);
  });

  it('後のウェーブほど速くなる', () => {
    const first = approachSpeedOf(mkInput({ waveIndex: 0 }));
    const last = approachSpeedOf(mkInput({ waveIndex: C.speedByWave.length - 1 }));
    expect(last).toBeGreaterThan(first);
  });

  it('同時に何体いても速度は変わらない（逐次出現のため残存数を見ない）', () => {
    const alone = approachSpeedOf(mkInput({ ghosts: [mkGhost()], waveIndex: 1 }));
    const crowd = approachSpeedOf(
      mkInput({ ghosts: [mkGhost(), mkGhost(), mkGhost()], waveIndex: 1 }),
    );
    expect(crowd).toBeCloseTo(alone, 6);
  });

  it('ウェーブ番号がテーブルより大きくても壊れない', () => {
    const clamped = approachSpeedOf(mkInput({ waveIndex: C.speedByWave.length - 1 }));
    expect(approachSpeedOf(mkInput({ waveIndex: 99 }))).toBeCloseTo(clamped, 6);
  });

  it('負のウェーブ番号でも壊れない', () => {
    expect(approachSpeedOf(mkInput({ waveIndex: -1 }))).toBeCloseTo(
      approachSpeedOf(mkInput({ waveIndex: 0 })),
      6,
    );
  });

  it('非有限値が来ても先頭の倍率にフォールバックする', () => {
    const first = approachSpeedOf(mkInput({ waveIndex: 0 }));
    expect(approachSpeedOf(mkInput({ waveIndex: NaN }))).toBeCloseTo(first, 6);
  });

  it('小数のウェーブ番号は切り捨てる', () => {
    expect(approachSpeedOf(mkInput({ waveIndex: 1.9 }))).toBeCloseTo(
      approachSpeedOf(mkInput({ waveIndex: 1 })),
      6,
    );
  });
});

describe('step: 掴みかかりと振り払い', () => {
  const near = (p: Partial<Ghost> = {}) =>
    mkGhost({
      azimuth: radians(Math.PI),
      baseAzimuth: radians(Math.PI),
      distance: meters(C.grabDistance + 0.001),
      ...p,
    });

  it('grabDistance まで詰められると GRABBING に入る', () => {
    const out = step(mkInput({ ghosts: [near()], elapsedMs: millis(500) }));
    const g = out.ghosts[0]!;

    expect(g.phase).toBe('GRABBING');
    expect(g.grabStartedAt).toBe(500);
    expect(g.distance).toBe(C.grabDistance);
    expect(has(out.events, 'GHOST_GRABBING')).toBe(true);
  });

  it('猶予時間内はまだ捕まらない', () => {
    const grabbing = near({ phase: 'GRABBING', grabStartedAt: millis(1000) });
    const out = step(
      mkInput({ ghosts: [grabbing], elapsedMs: millis(1000 + C.grabGraceMs - 1) }),
    );
    expect(has(out.events, 'PLAYER_CAUGHT')).toBe(false);
  });

  it('猶予時間を超えると PLAYER_CAUGHT になる', () => {
    const grabbing = near({ phase: 'GRABBING', grabStartedAt: millis(1000) });
    const out = step(
      mkInput({ ghosts: [grabbing], elapsedMs: millis(1000 + C.grabGraceMs) }),
    );
    expect(has(out.events, 'PLAYER_CAUGHT')).toBe(true);
  });

  it('シェイクで振り払える', () => {
    const grabbing = near({
      phase: 'GRABBING',
      grabStartedAt: millis(0),
      distance: meters(C.grabDistance),
    });
    const out = step(
      mkInput({ ghosts: [grabbing], shook: true, elapsedMs: millis(100) }),
    );
    const g = out.ghosts[0]!;

    expect(g.phase).toBe('APPROACHING');
    expect(g.distance).toBeCloseTo(C.grabDistance + C.escapePushback, 6);
    expect(g.escapeCount).toBe(1);
    expect(g.grabStartedAt).toBeNull();
    expect(has(out.events, 'GHOST_ESCAPED')).toBe(true);
  });

  it('振り払いは maxEscapes 回までしか成功しない', () => {
    const exhausted = near({
      phase: 'GRABBING',
      grabStartedAt: millis(0),
      escapeCount: C.maxEscapes,
    });
    const out = step(
      mkInput({ ghosts: [exhausted], shook: true, elapsedMs: millis(100) }),
    );
    expect(out.ghosts[0]!.phase).toBe('GRABBING');
    expect(has(out.events, 'GHOST_ESCAPED')).toBe(false);
  });

  it('振り払いを使い切った状態で詰められると即座に捕まる', () => {
    const out = step(
      mkInput({ ghosts: [near({ escapeCount: C.maxEscapes })], elapsedMs: millis(0) }),
    );
    expect(has(out.events, 'PLAYER_CAUGHT')).toBe(true);
    expect(has(out.events, 'GHOST_GRABBING')).toBe(false);
  });

  it('接近警告は閾値をまたいだフレームにだけ出る', () => {
    const justOutside = mkGhost({
      azimuth: radians(Math.PI),
      baseAzimuth: radians(Math.PI),
      distance: meters(C.hapticWarnDistance + 0.001),
    });
    const crossing = step(mkInput({ ghosts: [justOutside] }));
    expect(has(crossing.events, 'GHOST_WARN')).toBe(true);

    const after = step(mkInput({ ghosts: crossing.ghosts }));
    expect(has(after.events, 'GHOST_WARN')).toBe(false);
  });
});

describe('wobbleAzimuth', () => {
  it('振れ幅が上限を超えない', () => {
    for (let ms = 0; ms < 120_000; ms += 250) {
      for (const seed of [0, 1.3, 2.9, 5.5]) {
        const a = wobbleAzimuth(radians(0.4), seed, millis(ms), C);
        expect(Math.abs(angleDelta(0.4, a))).toBeLessThanOrEqual(
          C.wobbleAmplitude + 1e-9,
        );
      }
    }
  });

  it('時間が進むと値が変化する', () => {
    const a = wobbleAzimuth(radians(0), 1, millis(0), C);
    const b = wobbleAzimuth(radians(0), 1, millis(3000), C);
    expect(a).not.toBeCloseTo(b, 6);
  });

  it('同じ入力なら同じ出力（純粋関数）', () => {
    const a = wobbleAzimuth(radians(0.2), 2, millis(4321), C);
    const b = wobbleAzimuth(radians(0.2), 2, millis(4321), C);
    expect(a).toBe(b);
  });
});

describe('step: 揺らぎの適用範囲', () => {
  const wobbly: GameConfig = { ...C, wobbleAmplitude: radians(0.5) };

  it('接近中の個体は揺らぐ', () => {
    const g = mkGhost({ azimuth: radians(Math.PI), baseAzimuth: radians(Math.PI) });
    const out = step(
      mkInput({
        ghosts: [g],
        config: wobbly,
        elapsedMs: millis(2000),
        beamAxis: axisAt(0),
      }),
    );
    expect(out.ghosts[0]!.azimuth).not.toBe(g.azimuth);
  });

  it('捕捉中の個体は揺らがない（静止の表現）', () => {
    const g = mkGhost({ phase: 'HELD', purify: 0.3 });
    const out = step(
      mkInput({
        ghosts: [g],
        config: wobbly,
        elapsedMs: millis(2000),
        beamAxis: axisAt(0),
      }),
    );
    expect(out.ghosts[0]!.azimuth).toBe(g.azimuth);
  });

  it('掴みかかり中の個体は揺らがない', () => {
    const g = mkGhost({
      phase: 'GRABBING',
      grabStartedAt: millis(0),
      distance: meters(C.grabDistance),
      azimuth: radians(Math.PI),
      baseAzimuth: radians(Math.PI),
    });
    const out = step(mkInput({ ghosts: [g], config: wobbly, elapsedMs: millis(2000) }));
    expect(out.ghosts[0]!.azimuth).toBe(g.azimuth);
  });
});

describe('step: 純粋性', () => {
  it('入力のゴーストを破壊的に変更しない', () => {
    const original = mkGhost({ distance: meters(5), purify: 0 });
    const snapshot = { ...original };
    step(mkInput({ ghosts: [original] }));
    expect(original).toEqual(snapshot);
  });

  it('同じ入力なら同じ結果を返す', () => {
    const input = mkInput({ ghosts: [mkGhost()] });
    expect(step(input).ghosts[0]).toEqual(step(input).ghosts[0]);
  });
});
