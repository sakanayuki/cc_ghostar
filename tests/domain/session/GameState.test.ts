import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/domain/config/GameConfig';
import type { Ghost } from '@/domain/ghost/Ghost';
import type { DomainEvent } from '@/domain/ghost/GhostEvents';
import {
  canTransition,
  initialState,
  reduce,
  startSession,
  transition,
} from '@/domain/session/GameState';
import type { GamePhase, SessionState } from '@/domain/session/GameState';
import { formatDuration } from '@/domain/session/SessionResult';
import { ghostId, meters, millis, radians } from '@/shared/types';

const C = DEFAULT_CONFIG;

const mkGhost = (id: string, phase: Ghost['phase'] = 'APPROACHING'): Ghost => ({
  id: ghostId(id),
  azimuth: radians(0),
  baseAzimuth: radians(0),
  distance: meters(5),
  heightOffset: meters(0),
  phase,
  purify: phase === 'BANISHED' ? 1 : 0,
  grabStartedAt: null,
  escapeCount: 0,
  wobbleSeed: 0,
  banishedAt: phase === 'BANISHED' ? millis(0) : null,
});

const playing = (ghosts: readonly Ghost[]): SessionState =>
  startSession({ ...initialState(), phase: 'CALIBRATION' }, ghosts);

describe('状態遷移', () => {
  it('設計書 04.3 の主要な経路を許可する', () => {
    const path: readonly [GamePhase, GamePhase][] = [
      ['BOOT', 'TITLE'],
      ['TITLE', 'PERMISSION'],
      ['PERMISSION', 'CAMERA_READY'],
      ['CAMERA_READY', 'CALIBRATION'],
      ['CALIBRATION', 'PLAYING'],
      ['PLAYING', 'PAUSED'],
      ['PAUSED', 'PLAYING'],
      ['PLAYING', 'RESULT'],
      ['RESULT', 'TITLE'],
    ];
    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('2 回目以降はタイトルから直接キャリブレーションへ行ける', () => {
    expect(canTransition('TITLE', 'CALIBRATION')).toBe(true);
  });

  it('不正な遷移は拒否する', () => {
    expect(canTransition('BOOT', 'PLAYING')).toBe(false);
    expect(canTransition('TITLE', 'RESULT')).toBe(false);
    expect(canTransition('RESULT', 'PLAYING')).toBe(false);
    expect(canTransition('PLAYING', 'TITLE')).toBe(false);
  });

  it('致命的エラーからは復帰できない', () => {
    expect(canTransition('ERROR_WEBGL', 'TITLE')).toBe(false);
    expect(canTransition('ERROR_SENSOR', 'TITLE')).toBe(false);
  });

  it('カメラエラーからは再試行できる', () => {
    expect(canTransition('ERROR_CAMERA', 'PERMISSION')).toBe(true);
  });

  it('transition は不正な遷移で状態を変えない', () => {
    const s = initialState();
    expect(transition(s, 'PLAYING')).toBe(s);
    expect(transition(s, 'TITLE').phase).toBe('TITLE');
  });
});

describe('startSession', () => {
  it('世界を作り直し、計時と結果をリセットする', () => {
    const previous: SessionState = {
      ...initialState(),
      phase: 'CALIBRATION',
      elapsedMs: millis(9999),
      pendingOutcome: 'FAILED',
      resultAt: millis(1),
      result: {
        outcome: 'FAILED',
        elapsedMs: millis(9999),
        purifiedCount: 1,
        totalCount: 3,
        isNewBest: false,
      },
    };
    const next = startSession(previous, [mkGhost('a')]);

    expect(next.phase).toBe('PLAYING');
    expect(next.elapsedMs).toBe(0);
    expect(next.pendingOutcome).toBeNull();
    expect(next.resultAt).toBeNull();
    expect(next.result).toBeNull();
    expect(next.light).toBe('ON');
  });
});

describe('reduce: 勝敗の確定', () => {
  it('全滅させるとクリアが確定する', () => {
    const ghosts = [mkGhost('a', 'BANISHED'), mkGhost('b', 'BANISHED')];
    const out = reduce({
      state: playing(ghosts),
      ghosts,
      events: [],
      elapsedMs: millis(5000),
      config: C,
    });

    expect(out.state.pendingOutcome).toBe('CLEARED');
    expect(out.events.some((e) => e.type === 'SESSION_CLEARED')).toBe(true);
  });

  it('捕まると敗北が確定する', () => {
    const ghosts = [mkGhost('a')];
    const events: DomainEvent[] = [{ type: 'PLAYER_CAUGHT', id: ghostId('a') }];
    const out = reduce({
      state: playing(ghosts),
      ghosts,
      events,
      elapsedMs: millis(4000),
      config: C,
    });

    expect(out.state.pendingOutcome).toBe('FAILED');
    expect(out.events.some((e) => e.type === 'SESSION_FAILED')).toBe(true);
  });

  it('捕獲はクリアより優先される', () => {
    const ghosts = [mkGhost('a', 'BANISHED')];
    const events: DomainEvent[] = [{ type: 'PLAYER_CAUGHT', id: ghostId('a') }];
    const out = reduce({
      state: playing(ghosts),
      ghosts,
      events,
      elapsedMs: millis(1000),
      config: C,
    });
    expect(out.state.pendingOutcome).toBe('FAILED');
  });

  it('ゴーストが 0 体のときにクリアと誤判定しない', () => {
    const out = reduce({
      state: playing([]),
      ghosts: [],
      events: [],
      elapsedMs: millis(100),
      config: C,
    });
    expect(out.state.pendingOutcome).toBeNull();
  });

  it('一度確定した勝敗は上書きされない', () => {
    const ghosts = [mkGhost('a')];
    const first = reduce({
      state: playing(ghosts),
      ghosts,
      events: [{ type: 'PLAYER_CAUGHT', id: ghostId('a') }],
      elapsedMs: millis(1000),
      config: C,
    });
    const second = reduce({
      state: first.state,
      ghosts: [mkGhost('a', 'BANISHED')],
      events: [],
      elapsedMs: millis(1100),
      config: C,
    });

    expect(second.state.pendingOutcome).toBe('FAILED');
    expect(second.events).toHaveLength(0);
  });
});

describe('reduce: 結果画面への遅延', () => {
  it('確定直後はまだ PLAYING のまま（演出のため）', () => {
    const ghosts = [mkGhost('a', 'BANISHED')];
    const out = reduce({
      state: playing(ghosts),
      ghosts,
      events: [],
      elapsedMs: millis(1000),
      config: C,
    });

    expect(out.state.phase).toBe('PLAYING');
    expect(out.state.result).toBeNull();
    expect(out.state.resultAt).toBe(1000 + C.resultDelayMs);
  });

  it('演出時間が過ぎると RESULT へ遷移する', () => {
    const ghosts = [mkGhost('a', 'BANISHED'), mkGhost('b', 'BANISHED')];
    const confirmed = reduce({
      state: playing(ghosts),
      ghosts,
      events: [],
      elapsedMs: millis(1000),
      config: C,
    }).state;

    const out = reduce({
      state: confirmed,
      ghosts,
      events: [],
      elapsedMs: millis(1000 + C.resultDelayMs),
      config: C,
    });

    expect(out.state.phase).toBe('RESULT');
    expect(out.state.result?.outcome).toBe('CLEARED');
    expect(out.state.result?.purifiedCount).toBe(2);
    expect(out.state.result?.totalCount).toBe(2);
  });

  it('敗北時の浄化数が正しく数えられる', () => {
    const ghosts = [mkGhost('a', 'BANISHED'), mkGhost('b'), mkGhost('c')];
    const confirmed = reduce({
      state: playing(ghosts),
      ghosts,
      events: [{ type: 'PLAYER_CAUGHT', id: ghostId('b') }],
      elapsedMs: millis(2000),
      config: C,
    }).state;

    const out = reduce({
      state: confirmed,
      ghosts,
      events: [],
      elapsedMs: millis(2000 + C.resultDelayMs),
      config: C,
    });

    expect(out.state.result?.outcome).toBe('FAILED');
    expect(out.state.result?.purifiedCount).toBe(1);
    expect(out.state.result?.totalCount).toBe(3);
  });
});

describe('formatDuration', () => {
  it('分と秒に整形する', () => {
    expect(formatDuration(0)).toBe('00:00.0');
    expect(formatDuration(5400)).toBe('00:05.4');
    expect(formatDuration(65_300)).toBe('01:05.3');
    expect(formatDuration(600_000)).toBe('10:00.0');
  });

  it('負の値でも壊れない', () => {
    expect(formatDuration(-100)).toBe('00:00.0');
  });
});
