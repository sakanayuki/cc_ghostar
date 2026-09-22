/**
 * ロールバック方式の状態同期（設計書 10.5）。
 *
 * 妨害側はホストのスナップショットを待たずに、手元で世界を進めて表示する。
 * あとから届いた権威のある状態がすでに過去のものだった場合、その時刻まで
 * 巻き戻し、権威の状態で置き換えてから現在まで再シミュレートする。
 *
 * これが成立するのは、世界を進める関数が純粋（同じ入力なら同じ出力）である
 * ためである。本プロジェクトのドメインはその条件を満たしている。
 *
 * ## 適用範囲についての注意
 *
 * ロールバックできるのは「再計算できる状態」だけである。すでに鳴らした音は
 * 巻き戻せない。本設計では妨害音がゴーストの挙動に影響しないため、音は
 * 共有シミュレーションの外側にあり、この制約は問題にならない。
 */

export interface Snapshot<S> {
  readonly tick: number;
  readonly state: S;
}

/** 1 tick 分だけ世界を進める純粋関数 */
export type Advance<S> = (state: S, tick: number) => S;

export interface RollbackResult<S> {
  /** 新しい履歴。古いものは maxHistory を超えた分だけ捨てられる */
  readonly history: readonly Snapshot<S>[];
  /** 現在 tick における状態 */
  readonly state: S;
  /** 何 tick 分を巻き戻して再計算したか。0 なら巻き戻しは起きていない */
  readonly rolledBack: number;
  /** 権威の状態が古すぎて履歴に残っていなかった場合に true */
  readonly dropped: boolean;
}

export const DEFAULT_MAX_HISTORY = 120; // 20Hz なら 6 秒ぶん

/** 履歴の末尾（最新）を取り出す */
export function latest<S>(history: readonly Snapshot<S>[]): Snapshot<S> | null {
  return history.length === 0 ? null : (history[history.length - 1] as Snapshot<S>);
}

/**
 * 予測だけで現在 tick まで進める。権威の情報が届いていない間に使う。
 */
export function predictTo<S>(
  history: readonly Snapshot<S>[],
  targetTick: number,
  advance: Advance<S>,
  maxHistory = DEFAULT_MAX_HISTORY,
): RollbackResult<S> {
  const head = latest(history);
  if (head === null) {
    return { history, state: undefined as never, rolledBack: 0, dropped: true };
  }
  if (targetTick <= head.tick) {
    return { history, state: head.state, rolledBack: 0, dropped: false };
  }

  const next = [...history];
  let state = head.state;
  for (let tick = head.tick + 1; tick <= targetTick; tick++) {
    state = advance(state, tick);
    next.push({ tick, state });
  }
  return { history: trim(next, maxHistory), state, rolledBack: 0, dropped: false };
}

/**
 * 権威のある状態を取り込み、現在 tick まで作り直す。
 *
 * authoritative.tick が現在より過去なら、そこまで巻き戻して再シミュレートする。
 * これがロールバックの本体である。
 */
export function reconcile<S>(
  history: readonly Snapshot<S>[],
  authoritative: Snapshot<S>,
  currentTick: number,
  advance: Advance<S>,
  maxHistory = DEFAULT_MAX_HISTORY,
): RollbackResult<S> {
  const head = latest(history);

  // 履歴がまだ無い、あるいは権威の方が新しいなら、そこから素直に始める
  if (head === null || authoritative.tick >= head.tick) {
    const seeded: Snapshot<S>[] = [authoritative];
    const forward = predictTo(seeded, currentTick, advance, maxHistory);
    return { ...forward, rolledBack: 0, dropped: false };
  }

  const oldest = history[0] as Snapshot<S>;
  if (authoritative.tick < oldest.tick) {
    // 履歴に残っていないほど古い。巻き戻せないので、現在の予測を維持する
    return { history, state: head.state, rolledBack: 0, dropped: true };
  }

  // 権威の tick より後の履歴を捨て、そこから再計算する
  const kept = history.filter((s) => s.tick < authoritative.tick);
  const rebuilt: Snapshot<S>[] = [...kept, authoritative];

  let state = authoritative.state;
  for (let tick = authoritative.tick + 1; tick <= currentTick; tick++) {
    state = advance(state, tick);
    rebuilt.push({ tick, state });
  }

  return {
    history: trim(rebuilt, maxHistory),
    state,
    rolledBack: Math.max(0, head.tick - authoritative.tick),
    dropped: false,
  };
}

function trim<S>(history: Snapshot<S>[], maxHistory: number): Snapshot<S>[] {
  return history.length <= maxHistory
    ? history
    : history.slice(history.length - maxHistory);
}
