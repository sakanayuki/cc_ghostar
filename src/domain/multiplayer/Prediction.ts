import { NET_TICK_MS } from './NetMessages';
import type { SnapshotGhost, SnapshotMessage } from './NetMessages';

/**
 * 妨害側がスナップショットの合間を埋めるための予測（設計書 10.5）。
 *
 * ホストからの権威は 20Hz でしか届かない。そのまま描くと表示が飛び飛びに
 * なるため、届いていない区間は手元で世界を進める。
 *
 * ロールバックの再シミュレートにもこの関数を使うので、純粋であることと、
 * ホスト側の挙動と食い違わないことが要件になる。
 */

/** 妨害側が保持する、予測込みの世界の状態 */
export interface PredictedWorld {
  readonly yaw: number;
  readonly light: boolean;
  readonly ghosts: readonly SnapshotGhost[];
  readonly elapsedMs: number;
  readonly remaining: number;
  readonly speed: number;
}

export function fromSnapshot(s: SnapshotMessage): PredictedWorld {
  return {
    yaw: s.yaw,
    light: s.light,
    ghosts: s.ghosts,
    elapsedMs: s.elapsedMs,
    remaining: s.remaining,
    speed: s.speed,
  };
}

/**
 * 1 tick 分だけ世界を進める。
 *
 * ホストの向き（yaw）は予測しない。センサー由来の値であり、外挿すると
 * 실際とずれた方向へ光が伸びて、かえって誤った情報を与えるため。
 * 届いた値を保持し、次のスナップショットで更新する。
 */
export function advanceWorld(world: PredictedWorld): PredictedWorld {
  const dt = NET_TICK_MS / 1000;

  const ghosts = world.ghosts.map((g): SnapshotGhost => {
    // 接近中の個体だけが動く。捕捉中は静止し、消滅済みは変化しない
    if (g.phase !== 'APPROACHING') return g;
    return { ...g, distance: Math.max(0, g.distance - world.speed * dt) };
  });

  return { ...world, ghosts, elapsedMs: world.elapsedMs + NET_TICK_MS };
}
