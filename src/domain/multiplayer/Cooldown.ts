import { SOUND_COOLDOWN_MS } from './NetMessages';

/**
 * 妨害音の連打を防ぐクールダウン（設計書 10.6）。
 *
 * 手元だけで判定すると、改造した相手に連打されうる。ホスト側でも同じ判定を
 * 行い、通らなかった要求は捨てる。純粋関数なので両側で同じ実装を使える。
 */

export interface CooldownState {
  /** 直近に受理した時刻。まだ一度も無ければ null */
  readonly lastAcceptedMs: number | null;
}

export const initialCooldown: CooldownState = { lastAcceptedMs: null };

export interface CooldownVerdict {
  readonly accepted: boolean;
  readonly state: CooldownState;
  /** 次に押せるようになるまでの残り時間 */
  readonly remainingMs: number;
}

export function tryConsume(
  state: CooldownState,
  nowMs: number,
  cooldownMs: number = SOUND_COOLDOWN_MS,
): CooldownVerdict {
  const last = state.lastAcceptedMs;

  if (last !== null) {
    const elapsed = nowMs - last;
    // 相手の時計がずれて未来の値が来ても、こちらの判定は壊さない
    if (elapsed >= 0 && elapsed < cooldownMs) {
      return { accepted: false, state, remainingMs: cooldownMs - elapsed };
    }
  }

  return {
    accepted: true,
    state: { lastAcceptedMs: nowMs },
    remainingMs: cooldownMs,
  };
}

/** 表示用。0〜1 の進捗を返す。1 なら押せる */
export function cooldownProgress(
  state: CooldownState,
  nowMs: number,
  cooldownMs: number = SOUND_COOLDOWN_MS,
): number {
  const last = state.lastAcceptedMs;
  if (last === null) return 1;
  const elapsed = nowMs - last;
  if (elapsed < 0) return 1;
  return Math.min(1, elapsed / cooldownMs);
}

export function remainingMs(
  state: CooldownState,
  nowMs: number,
  cooldownMs: number = SOUND_COOLDOWN_MS,
): number {
  const last = state.lastAcceptedMs;
  if (last === null) return 0;
  const elapsed = nowMs - last;
  if (elapsed < 0 || elapsed >= cooldownMs) return 0;
  return cooldownMs - elapsed;
}
