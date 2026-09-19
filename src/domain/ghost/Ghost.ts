import type { GhostId, Meters, Millis, Radians } from '@/shared/types';

export type GhostPhase =
  /** 接近中。捕捉されていない */
  | 'APPROACHING'
  /** 光錐内に捕捉され静止。浄化が進行する */
  | 'HELD'
  /** 距離 0 に到達。シェイクによる振り払いの猶予中 */
  | 'GRABBING'
  /** 浄化完了。消滅演出中 */
  | 'BANISHED';

export type GhostAnimation = 'IDLE' | 'WALK' | 'ATTACK' | 'APPEAR' | 'DISAPPEAR';

/** すべてのフィールドが readonly。状態遷移は新しいオブジェクトを返す（設計書 03.2） */
export interface Ghost {
  readonly id: GhostId;
  readonly azimuth: Radians;
  /** スポーン時の方位。揺らぎの振れ幅を制限する基準 */
  readonly baseAzimuth: Radians;
  readonly distance: Meters;
  readonly heightOffset: Meters;
  readonly phase: GhostPhase;
  /** 浄化ゲージ。0〜1 */
  readonly purify: number;
  /** GRABBING に入った時刻。それ以外は null */
  readonly grabStartedAt: Millis | null;
  readonly escapeCount: number;
  /** 方位の揺らぎに用いる位相。個体ごとに固定 */
  readonly wobbleSeed: number;
  /** BANISHED になった時刻。消滅演出の進行に使う */
  readonly banishedAt: Millis | null;
}

export const isAlive = (g: Ghost): boolean => g.phase !== 'BANISHED';

export function animationOf(ghost: Ghost): GhostAnimation {
  switch (ghost.phase) {
    case 'BANISHED':
      return 'DISAPPEAR';
    case 'GRABBING':
      return 'ATTACK';
    case 'HELD':
      return 'IDLE';
    case 'APPROACHING':
      return 'WALK';
  }
}
