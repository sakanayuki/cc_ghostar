import type { GameConfig } from '@/domain/config/GameConfig';
import type { Ghost } from '@/domain/ghost/Ghost';
import { isAlive } from '@/domain/ghost/Ghost';
import type { DomainEvent } from '@/domain/ghost/GhostEvents';
import type { LightState } from '@/domain/light/LightState';
import { millis } from '@/shared/types';
import type { Millis } from '@/shared/types';
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
  readonly ghosts: readonly Ghost[];
  readonly light: LightState;
  readonly elapsedMs: Millis;
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

/** 新しいセッションを開始する。世界のみを作り直す（設計書 04.3） */
export function startSession(
  state: SessionState,
  ghosts: readonly Ghost[],
): SessionState {
  return {
    ...state,
    phase: 'PLAYING',
    ghosts,
    light: 'ON',
    elapsedMs: millis(0),
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
  const { state, ghosts, elapsedMs, config } = input;
  const emitted: DomainEvent[] = [];

  let pendingOutcome = state.pendingOutcome;
  let resultAt = state.resultAt;

  if (pendingOutcome === null) {
    const caught = input.events.some((e) => e.type === 'PLAYER_CAUGHT');
    const allBanished = ghosts.length > 0 && ghosts.every((g) => !isAlive(g));

    if (caught) {
      pendingOutcome = 'FAILED';
      resultAt = millis(elapsedMs + config.resultDelayMs);
      emitted.push({ type: 'SESSION_FAILED', elapsedMs });
    } else if (allBanished) {
      pendingOutcome = 'CLEARED';
      resultAt = millis(elapsedMs + config.resultDelayMs);
      emitted.push({ type: 'SESSION_CLEARED', elapsedMs });
    }
  }

  const purifiedCount = ghosts.filter((g) => !isAlive(g)).length;

  let phase = state.phase;
  let result = state.result;

  if (pendingOutcome !== null && resultAt !== null && elapsedMs >= resultAt) {
    phase = 'RESULT';
    result = {
      outcome: pendingOutcome,
      elapsedMs,
      purifiedCount,
      totalCount: ghosts.length,
      isNewBest: false,
    };
  }

  return {
    state: { ...state, phase, ghosts, elapsedMs, pendingOutcome, resultAt, result },
    events: emitted,
  };
}
