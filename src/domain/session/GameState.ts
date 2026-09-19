import type { GameConfig } from '@/domain/config/GameConfig';
import type { Ghost } from '@/domain/ghost/Ghost';
import { isAlive } from '@/domain/ghost/Ghost';
import type { DomainEvent } from '@/domain/ghost/GhostEvents';
import { spawnOne } from '@/domain/ghost/GhostSpawner';
import type { LightState } from '@/domain/light/LightState';
import { millis } from '@/shared/types';
import type { Millis, Radians } from '@/shared/types';
import type { Outcome, SessionResult } from './SessionResult';

export type GamePhase =
  | 'BOOT'
  | 'TITLE'
  | 'PERMISSION'
  | 'CAMERA_READY'
  | 'CALIBRATION'
  | 'PLAYING'
  | 'PAUSED'
  | 'RESULT'
  | 'ERROR_CAMERA'
  | 'ERROR_SENSOR'
  | 'ERROR_WEBGL';

export interface SessionState {
  readonly phase: GamePhase;
  /** 同時に存在するのは常に 1 体。浄化されると次が現れる（設計書 04.1） */
  readonly ghosts: readonly Ghost[];
  readonly light: LightState;
  readonly elapsedMs: Millis;
  /** これまでに出現させた総数。0 起点のウェーブ番号は spawnedCount - 1 */
  readonly spawnedCount: number;
  /** これまでに浄化した総数 */
  readonly purifiedCount: number;
  /** この時刻を過ぎたら次の個体を出現させる。待機中でなければ null */
  readonly nextSpawnAt: Millis | null;
  /** 勝敗が確定した結果。演出中は phase がまだ PLAYING のまま保持される */
  readonly pendingOutcome: Outcome | null;
  /** この時刻を過ぎたら RESULT へ遷移する */
  readonly resultAt: Millis | null;
  readonly result: SessionResult | null;
}

/** 許可された遷移のみを通す。設計書 04.3 の遷移表に対応する */
const ALLOWED: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  BOOT: ['TITLE', 'ERROR_WEBGL', 'ERROR_SENSOR'],
  TITLE: ['PERMISSION', 'CALIBRATION', 'ERROR_CAMERA'],
  PERMISSION: ['CAMERA_READY', 'ERROR_CAMERA'],
  CAMERA_READY: ['CALIBRATION', 'ERROR_SENSOR', 'ERROR_CAMERA'],
  CALIBRATION: ['PLAYING', 'TITLE', 'ERROR_CAMERA'],
  PLAYING: ['PAUSED', 'RESULT', 'ERROR_CAMERA'],
  PAUSED: ['PLAYING', 'RESULT', 'ERROR_CAMERA'],
  RESULT: ['TITLE'],
  ERROR_CAMERA: ['PERMISSION', 'TITLE'],
  ERROR_SENSOR: [],
  ERROR_WEBGL: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED[from].includes(to);
}

export function initialState(): SessionState {
  return {
    phase: 'BOOT',
    ghosts: [],
    light: 'OFF',
    elapsedMs: millis(0),
    spawnedCount: 0,
    purifiedCount: 0,
    nextSpawnAt: null,
    pendingOutcome: null,
    resultAt: null,
    result: null,
  };
}

/** 不正な遷移は状態を変えずに無視する */
export function transition(state: SessionState, to: GamePhase): SessionState {
  if (state.phase === to) return state;
  if (!canTransition(state.phase, to)) return state;
  return { ...state, phase: to };
}

/**
 * 新しいセッションを開始する。世界のみを作り直す（設計書 04.3）。
 * 1 体目だけをここで出現させ、以降は浄化のたびに reduce が補充する。
 */
export function startSession(state: SessionState, first: Ghost): SessionState {
  return {
    ...state,
    phase: 'PLAYING',
    ghosts: [first],
    light: 'ON',
    elapsedMs: millis(0),
    spawnedCount: 1,
    purifiedCount: 0,
    nextSpawnAt: null,
    pendingOutcome: null,
    resultAt: null,
    result: null,
  };
}

export interface ReduceInput {
  readonly state: SessionState;
  readonly ghosts: readonly Ghost[];
  readonly events: readonly DomainEvent[];
  readonly elapsedMs: Millis;
  /** 出現位置を現在の視線から離すために使う（設計書 04.7） */
  readonly viewYaw: Radians;
  /** 乱数は引数で受け取る。reduce も純粋関数である */
  readonly random: () => number;
  readonly config: GameConfig;
}

export interface ReduceOutput {
  readonly state: SessionState;
  readonly events: readonly DomainEvent[];
}

/**
 * ゴーストの遷移結果をセッション状態へ畳み込む（設計書 04.6）。
 *
 * 勝敗の確定と、結果画面への遷移は分離されている。確定してから
 * resultDelayMs の間は演出が表示され、ドメインは演出の存在を知らずに済む。
 */
export function reduce(input: ReduceInput): ReduceOutput {
  const { state, elapsedMs, config } = input;
  const emitted: DomainEvent[] = [];

  let ghosts = input.ghosts;
  let spawnedCount = state.spawnedCount;
  let nextSpawnAt = state.nextSpawnAt;
  let pendingOutcome = state.pendingOutcome;
  let resultAt = state.resultAt;

  const purifiedThisFrame = input.events.filter(
    (e) => e.type === 'GHOST_PURIFIED',
  ).length;
  const purifiedCount = state.purifiedCount + purifiedThisFrame;

  const caught = input.events.some((e) => e.type === 'PLAYER_CAUGHT');

  // ── 次の個体の予約 ──────────────────────────
  // 浄化したら、まだ残りがある場合にかぎり補充を予約する
  if (!caught && purifiedThisFrame > 0 && spawnedCount < config.ghostCount) {
    nextSpawnAt = millis(elapsedMs + config.nextSpawnDelayMs);
  }

  // ── 予約時刻に達したら出現させる ────────────
  if (
    pendingOutcome === null &&
    !caught &&
    nextSpawnAt !== null &&
    elapsedMs >= nextSpawnAt
  ) {
    const next = spawnOne(config, spawnedCount, input.viewYaw, input.random);
    // 浄化済みの個体はここで取り除く。常に 1 体だけを保つ
    ghosts = [next];
    spawnedCount += 1;
    nextSpawnAt = null;
    emitted.push({ type: 'GHOST_APPEARED', id: next.id });
  }

  // ── 勝敗の確定 ──────────────────────────────
  if (pendingOutcome === null) {
    const allSpawned = spawnedCount >= config.ghostCount;
    const noneAlive = ghosts.every((g) => !isAlive(g));
    const cleared = allSpawned && noneAlive && nextSpawnAt === null;

    if (caught) {
      pendingOutcome = 'FAILED';
      resultAt = millis(elapsedMs + config.resultDelayMs);
      emitted.push({ type: 'SESSION_FAILED', elapsedMs });
    } else if (cleared && config.ghostCount > 0) {
      pendingOutcome = 'CLEARED';
      resultAt = millis(elapsedMs + config.resultDelayMs);
      emitted.push({ type: 'SESSION_CLEARED', elapsedMs });
    }
  }

  let phase = state.phase;
  let result = state.result;

  if (pendingOutcome !== null && resultAt !== null && elapsedMs >= resultAt) {
    phase = 'RESULT';
    result = {
      outcome: pendingOutcome,
      elapsedMs,
      purifiedCount,
      totalCount: config.ghostCount,
      isNewBest: false,
    };
  }

  return {
    state: {
      ...state,
      phase,
      ghosts,
      elapsedMs,
      spawnedCount,
      purifiedCount,
      nextSpawnAt,
      pendingOutcome,
      resultAt,
      result,
    },
    events: emitted,
  };
}
