import type { Millis } from '@/shared/types';

export type Outcome = 'CLEARED' | 'FAILED';

export interface SessionResult {
  readonly outcome: Outcome;
  readonly elapsedMs: Millis;
  readonly purifiedCount: number;
  readonly totalCount: number;
  /** 自己最短記録を更新したか。application が StoragePort を見て確定させる */
  readonly isNewBest: boolean;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100) / 10);
  const minutes = Math.floor(total / 60);
  const seconds = (total - minutes * 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${seconds}`;
}
