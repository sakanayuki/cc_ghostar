import type { GhostId, Millis } from '@/shared/types';

/**
 * ドメインが発するイベント。副作用は application が実行する。
 * ドメインは「何が起きたか」だけを宣言し、その結果どう鳴らすかを知らない（設計書 02.7）。
 */
export type DomainEvent =
  | { readonly type: 'GHOST_HELD'; readonly id: GhostId }
  | { readonly type: 'GHOST_RELEASED'; readonly id: GhostId }
  | { readonly type: 'GHOST_PURIFIED'; readonly id: GhostId }
  | { readonly type: 'GHOST_GRABBING'; readonly id: GhostId }
  | { readonly type: 'GHOST_ESCAPED'; readonly id: GhostId }
  | { readonly type: 'GHOST_WARN'; readonly id: GhostId }
  | { readonly type: 'PLAYER_CAUGHT'; readonly id: GhostId }
  | { readonly type: 'SESSION_CLEARED'; readonly elapsedMs: Millis }
  | { readonly type: 'SESSION_FAILED'; readonly elapsedMs: Millis };
