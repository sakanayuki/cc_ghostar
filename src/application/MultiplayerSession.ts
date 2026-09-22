import { initialCooldown, tryConsume } from '@/domain/multiplayer/Cooldown';
import type { CooldownState } from '@/domain/multiplayer/Cooldown';
import { NET_TICK_MS, toTick } from '@/domain/multiplayer/NetMessages';
import type {
  NetMessage,
  SnapshotMessage,
  SoundKey,
  SoundMessage,
} from '@/domain/multiplayer/NetMessages';
import { advanceWorld, fromSnapshot } from '@/domain/multiplayer/Prediction';
import type { PredictedWorld } from '@/domain/multiplayer/Prediction';
import { predictTo, reconcile } from '@/domain/multiplayer/Rollback';
import type { Snapshot } from '@/domain/multiplayer/Rollback';
import type { Outcome } from '@/domain/session/SessionResult';
import type { ClockPort } from './ports';
import type { NetworkPort } from './ports/NetworkPort';

/**
 * 妨害側のセッション（設計書 10.5）。
 *
 * ホストから 20Hz で届く権威のスナップショットと、手元の予測を突き合わせる。
 * 遅れて届いたスナップショットに対しては、その時刻まで巻き戻して再計算する
 * ――これがロールバックの本体である。
 */
export class IntruderSession {
  private history: readonly Snapshot<PredictedWorld>[] = [];
  private world: PredictedWorld | null = null;
  private baseTick = 0;
  private baseAtMs = 0;
  private cooldown: CooldownState = initialCooldown;
  private outcome: Outcome | null = null;

  /** 直近の巻き戻し量。デバッグ表示に使う */
  private lastRollback = 0;
  private droppedCount = 0;

  constructor(
    private readonly net: NetworkPort,
    private readonly clock: ClockPort,
  ) {}

  /** ホストからのスナップショットを取り込む */
  onSnapshot(message: SnapshotMessage): void {
    const authoritative: Snapshot<PredictedWorld> = {
      tick: message.tick,
      state: fromSnapshot(message),
    };

    // 受け取った tick を基準に、こちらの時計を合わせ直す
    if (this.world === null) {
      this.baseTick = message.tick;
      this.baseAtMs = this.clock.now();
    }

    const result = reconcile(
      this.history,
      authoritative,
      Math.max(this.currentTick(), message.tick),
      advanceWorld,
    );

    this.history = result.history;
    this.world = result.state;
    this.lastRollback = result.rolledBack;
    if (result.dropped) this.droppedCount += 1;
  }

  /** 毎フレーム呼ぶ。次のスナップショットが来るまでを手元で埋める */
  predict(): PredictedWorld | null {
    if (this.world === null) return null;
    const result = predictTo(this.history, this.currentTick(), advanceWorld);
    if (result.dropped) return this.world;
    this.history = result.history;
    this.world = result.state;
    return this.world;
  }

  /**
   * 音を鳴らす要求を送る。
   *
   * 手元でもクールダウンを判定して弾く。通信を待たずにボタンが反応するため
   * 操作感が良く、無駄な送信も減る。ただしホスト側でも同じ判定を行うので、
   * ここを改造しても連打はできない（設計書 10.6）。
   */
  requestSound(sound: SoundKey, x: number, z: number): boolean {
    const now = this.clock.now();
    const verdict = tryConsume(this.cooldown, now);
    if (!verdict.accepted) return false;

    this.cooldown = verdict.state;
    const message: SoundMessage = {
      type: 'SOUND',
      tick: this.currentTick(),
      sound,
      x,
      z,
      from: 'me',
    };
    this.net.broadcast(message);
    return true;
  }

  setOutcome(outcome: Outcome): void {
    this.outcome = outcome;
  }

  get result(): Outcome | null {
    return this.outcome;
  }

  get cooldownState(): CooldownState {
    return this.cooldown;
  }

  get debug(): { rolledBack: number; dropped: number; tick: number } {
    return {
      rolledBack: this.lastRollback,
      dropped: this.droppedCount,
      tick: this.currentTick(),
    };
  }

  private currentTick(): number {
    if (this.world === null) return 0;
    return this.baseTick + toTick(this.clock.now() - this.baseAtMs);
  }
}

/**
 * ホスト側のセッション（設計書 10.5）。
 *
 * 世界の権威はホストにある。妨害側から届いた要求は、こちらのクールダウン
 * 判定を通ったものだけを実行し、他の妨害者へ中継する。
 */
export class HostSession {
  private lastSentTick = -1;
  /** 相手ごとのクールダウン。1 人が連打しても他の人は妨げられない */
  private readonly cooldowns = new Map<string, CooldownState>();

  constructor(
    private readonly net: NetworkPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * 現在の状態を配る。tick が進んだときだけ送るので、
   * 描画のフレームレートに関係なく通信量は 20Hz で一定になる。
   */
  publish(snapshot: Omit<SnapshotMessage, 'type' | 'tick'>, elapsedMs: number): void {
    const tick = toTick(elapsedMs);
    if (tick === this.lastSentTick) return;
    this.lastSentTick = tick;
    this.net.broadcast({ type: 'SNAPSHOT', tick, ...snapshot });
  }

  /**
   * 妨害側の要求を検査する。受理したら true。
   *
   * 相手の申告した時刻ではなくホストの時計で判定する。相手の時計は
   * 信用できないため。
   */
  acceptSound(peerId: string, message: SoundMessage): boolean {
    const state = this.cooldowns.get(peerId) ?? initialCooldown;
    const verdict = tryConsume(state, this.clock.now());
    if (!verdict.accepted) return false;

    this.cooldowns.set(peerId, verdict.state);
    // 他の妨害者にも波紋を見せる。送り主には返さない
    for (const other of this.net.peers()) {
      if (other !== peerId) this.net.send(other, { ...message, from: peerId });
    }
    return true;
  }

  announceResult(
    outcome: Outcome,
    elapsedMs: number,
    purifiedCount: number,
    totalCount: number,
  ): void {
    this.net.broadcast({
      type: 'RESULT',
      outcome,
      elapsedMs,
      purifiedCount,
      totalCount,
    });
  }

  forget(peerId: string): void {
    this.cooldowns.delete(peerId);
  }
}

/** メッセージの種類で分岐するための小さな補助 */
export const isSnapshot = (m: NetMessage): m is SnapshotMessage => m.type === 'SNAPSHOT';
export const isSound = (m: NetMessage): m is SoundMessage => m.type === 'SOUND';

export { NET_TICK_MS };
