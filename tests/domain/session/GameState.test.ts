import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/domain/config/GameConfig';
import type { GameConfig } from '@/domain/config/GameConfig';
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
import { angleDelta } from '@/domain/math/Angles';
import { ghostId, meters, millis, radians } from '@/shared/types';

const C = DEFAULT_CONFIG;
const rng = () => 0.5;

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

const playing = (first: Ghost): SessionState =>
  startSession({ ...initialState(), phase: 'CALIBRATION' }, first);

const run = (
  state: SessionState,
  ghosts: readonly Ghost[],
  events: readonly DomainEvent[],
  elapsedMs: number,
  config: GameConfig = C,
) =>
  reduce({
    state,
    ghosts,
    events,
    elapsedMs: millis(elapsedMs),
    viewYaw: radians(0),
    random: rng,
    config,
  });

const purified = (id: string): DomainEvent => ({
  type: 'GHOST_PURIFIED',
  id: ghostId(id),
});

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
    for (const [from, to] of path) expect(canTransition(from, to)).toBe(true);
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
  it('1 体だけを出した状態で始まる', () => {
    const s = playing(mkGhost('a'));
    expect(s.phase).toBe('PLAYING');
    expect(s.ghosts).toHaveLength(1);
    expect(s.spawnedCount).toBe(1);
    expect(s.purifiedCount).toBe(0);
    expect(s.nextSpawnAt).toBeNull();
    expect(s.light).toBe('ON');
  });

  it('前回の結果と計時をリセットする', () => {
    const previous: SessionState = {
      ...initialState(),
      phase: 'CALIBRATION',
      elapsedMs: millis(9999),
      spawnedCount: 3,
      purifiedCount: 2,
      pendingOutcome: 'FAILED',
      resultAt: millis(1),
    };
    const next = startSession(previous, mkGhost('a'));
    expect(next.elapsedMs).toBe(0);
    expect(next.spawnedCount).toBe(1);
    expect(next.purifiedCount).toBe(0);
    expect(next.pendingOutcome).toBeNull();
    expect(next.result).toBeNull();
  });
});

describe('逐次出現', () => {
  it('浄化しても即座には次が出ず、遅延が予約される', () => {
    const banished = [mkGhost('ghost-0', 'BANISHED')];
    const out = run(playing(mkGhost('ghost-0')), banished, [purified('ghost-0')], 1000);

    expect(out.state.nextSpawnAt).toBe(1000 + C.nextSpawnDelayMs);
    expect(out.state.spawnedCount).toBe(1);
    expect(out.state.purifiedCount).toBe(1);
    expect(out.events.some((e) => e.type === 'GHOST_APPEARED')).toBe(false);
  });

  it('遅延が過ぎると次の 1 体が出現する', () => {
    const banished = [mkGhost('ghost-0', 'BANISHED')];
    const scheduled = run(
      playing(mkGhost('ghost-0')),
      banished,
      [purified('ghost-0')],
      1000,
    ).state;

    const out = run(scheduled, banished, [], 1000 + C.nextSpawnDelayMs);

    expect(out.state.spawnedCount).toBe(2);
    expect(out.state.nextSpawnAt).toBeNull();
    expect(out.events.some((e) => e.type === 'GHOST_APPEARED')).toBe(true);
  });

  it('同時に存在するのは常に 1 体', () => {
    const banished = [mkGhost('ghost-0', 'BANISHED')];
    const scheduled = run(
      playing(mkGhost('ghost-0')),
      banished,
      [purified('ghost-0')],
      0,
    ).state;
    const out = run(scheduled, banished, [], C.nextSpawnDelayMs);

    expect(out.state.ghosts).toHaveLength(1);
    expect(out.state.ghosts[0]!.phase).toBe('APPROACHING');
    expect(out.state.ghosts[0]!.id).toBe('ghost-1');
  });

  it('次の個体は現在の視線から離れた方向に出る', () => {
    const banished = [mkGhost('ghost-0', 'BANISHED')];
    const viewYaw = radians(2.0);
    const scheduled = reduce({
      state: playing(mkGhost('ghost-0')),
      ghosts: banished,
      events: [purified('ghost-0')],
      elapsedMs: millis(0),
      viewYaw,
      random: rng,
      config: C,
    }).state;

    const out = reduce({
      state: scheduled,
      ghosts: banished,
      events: [],
      elapsedMs: millis(C.nextSpawnDelayMs),
      viewYaw,
      random: rng,
      config: C,
    });

    const spawned = out.state.ghosts[0]!;
    expect(Math.abs(angleDelta(viewYaw, spawned.azimuth))).toBeGreaterThanOrEqual(
      C.spawnMinAngleFromView - 1e-9,
    );
  });

  it('最後の 1 体を浄化したら補充しない', () => {
    let state = playing(mkGhost('ghost-0'));
    state = { ...state, spawnedCount: C.ghostCount, purifiedCount: C.ghostCount - 1 };
    const banished = [mkGhost('ghost-2', 'BANISHED')];

    const out = run(state, banished, [purified('ghost-2')], 5000);
    expect(out.state.nextSpawnAt).toBeNull();
    expect(out.state.spawnedCount).toBe(C.ghostCount);
  });
});

describe('勝敗の確定', () => {
  it('全体を浄化しきるとクリアが確定する', () => {
    let state = playing(mkGhost('ghost-0'));
    state = { ...state, spawnedCount: C.ghostCount, purifiedCount: C.ghostCount - 1 };
    const banished = [mkGhost('ghost-2', 'BANISHED')];

    const out = run(state, banished, [purified('ghost-2')], 5000);
    expect(out.state.pendingOutcome).toBe('CLEARED');
    expect(out.events.some((e) => e.type === 'SESSION_CLEARED')).toBe(true);
  });

  it('補充待ちの間はクリアと誤判定しない', () => {
    const banished = [mkGhost('ghost-0', 'BANISHED')];
    const out = run(playing(mkGhost('ghost-0')), banished, [purified('ghost-0')], 100);
    expect(out.state.pendingOutcome).toBeNull();
  });

  it('捕まると敗北が確定する', () => {
    const ghosts = [mkGhost('ghost-0')];
    const out = run(
      playing(ghosts[0]!),
      ghosts,
      [{ type: 'PLAYER_CAUGHT', id: ghostId('ghost-0') }],
      4000,
    );
    expect(out.state.pendingOutcome).toBe('FAILED');
    expect(out.events.some((e) => e.type === 'SESSION_FAILED')).toBe(true);
  });

  it('捕まったら補充は起きない', () => {
    let state = playing(mkGhost('ghost-0'));
    state = { ...state, nextSpawnAt: millis(100) };
    const ghosts = [mkGhost('ghost-0')];

    const out = run(
      state,
      ghosts,
      [{ type: 'PLAYER_CAUGHT', id: ghostId('ghost-0') }],
      500,
    );
    expect(out.state.spawnedCount).toBe(1);
    expect(out.events.some((e) => e.type === 'GHOST_APPEARED')).toBe(false);
  });

  it('一度確定した勝敗は上書きされない', () => {
    const ghosts = [mkGhost('ghost-0')];
    const first = run(
      playing(ghosts[0]!),
      ghosts,
      [{ type: 'PLAYER_CAUGHT', id: ghostId('ghost-0') }],
      1000,
    );
    const second = run(first.state, [mkGhost('ghost-0', 'BANISHED')], [], 1100);

    expect(second.state.pendingOutcome).toBe('FAILED');
    expect(second.events).toHaveLength(0);
  });

  it('ゴースト 0 体の設定ではクリアと誤判定しない', () => {
    const config: GameConfig = { ...C, ghostCount: 0 };
    const state = { ...playing(mkGhost('a')), spawnedCount: 0, ghosts: [] };
    const out = run(state, [], [], 100, config);
    expect(out.state.pendingOutcome).toBeNull();
  });
});

describe('結果画面への遅延', () => {
  it('確定直後はまだ PLAYING のまま（演出のため）', () => {
    let state = playing(mkGhost('ghost-0'));
    state = { ...state, spawnedCount: C.ghostCount, purifiedCount: C.ghostCount - 1 };
    const out = run(state, [mkGhost('ghost-2', 'BANISHED')], [purified('ghost-2')], 1000);

    expect(out.state.phase).toBe('PLAYING');
    expect(out.state.result).toBeNull();
    expect(out.state.resultAt).toBe(1000 + C.resultDelayMs);
  });

  it('演出時間が過ぎると RESULT へ遷移し、総数と浄化数が入る', () => {
    let state = playing(mkGhost('ghost-0'));
    state = { ...state, spawnedCount: C.ghostCount, purifiedCount: C.ghostCount - 1 };
    const banished = [mkGhost('ghost-2', 'BANISHED')];

    const confirmed = run(state, banished, [purified('ghost-2')], 1000).state;
    const out = run(confirmed, banished, [], 1000 + C.resultDelayMs);

    expect(out.state.phase).toBe('RESULT');
    expect(out.state.result?.outcome).toBe('CLEARED');
    expect(out.state.result?.purifiedCount).toBe(C.ghostCount);
    expect(out.state.result?.totalCount).toBe(C.ghostCount);
  });

  it('敗北時は浄化済みの数がそのまま残る', () => {
    let state = playing(mkGhost('ghost-1'));
    state = { ...state, spawnedCount: 2, purifiedCount: 1 };
    const ghosts = [mkGhost('ghost-1')];

    const confirmed = run(
      state,
      ghosts,
      [{ type: 'PLAYER_CAUGHT', id: ghostId('ghost-1') }],
      2000,
    ).state;
    const out = run(confirmed, ghosts, [], 2000 + C.resultDelayMs);

    expect(out.state.result?.outcome).toBe('FAILED');
    expect(out.state.result?.purifiedCount).toBe(1);
    expect(out.state.result?.totalCount).toBe(C.ghostCount);
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
