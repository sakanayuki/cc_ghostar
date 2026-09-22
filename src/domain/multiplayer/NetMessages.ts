import type { GhostPhase } from '@/domain/ghost/Ghost';
import type { Outcome } from '@/domain/session/SessionResult';

/**
 * P2P で流れるメッセージの定義。
 *
 * 受信データは相手の端末から来る。改変されていることも、こちらの想定と
 * 違うバージョンであることもありうるため、すべて検証してから使う
 * （設計書 10.4）。
 */

export type PlayerRole = 'HOST' | 'INTRUDER';

/** ネットワーク上の時間の刻み。1 tick = 50ms（20Hz） */
export const NET_TICK_MS = 50;

/** 妨害音の種類。表示名は presentation 側で解決する */
export type SoundKey = 'knock' | 'drop' | 'footsteps' | 'roll' | 'glass';

export const SOUND_KEYS: readonly SoundKey[] = [
  'knock',
  'drop',
  'footsteps',
  'roll',
  'glass',
];

/** 妨害音を 1 回鳴らしてから次を鳴らせるまでの時間 */
export const SOUND_COOLDOWN_MS = 5000;

/** ホストが一定間隔で配る、権威のある世界の状態 */
export interface SnapshotMessage {
  readonly type: 'SNAPSHOT';
  readonly tick: number;
  /** ホストが向いているワールド方位（ラジアン） */
  readonly yaw: number;
  /** 照射状態 */
  readonly light: boolean;
  readonly ghosts: readonly SnapshotGhost[];
  readonly elapsedMs: number;
  readonly remaining: number;
  /**
   * 現在の実効接近速度（m/s）。
   *
   * 妨害側が次のスナップショットまでを予測するために使う。ウェーブや照射で
   * 倍率が変わるため、クライアントに再計算させず、そのまま送る方が確実。
   */
  readonly speed: number;
}

export interface SnapshotGhost {
  readonly id: string;
  readonly azimuth: number;
  readonly distance: number;
  readonly phase: GhostPhase;
  readonly purify: number;
}

/** 妨害側が「この位置でこの音を鳴らす」と宣言する */
export interface SoundMessage {
  readonly type: 'SOUND';
  readonly tick: number;
  readonly sound: SoundKey;
  /** プレイヤーを原点とするワールド座標（メートル） */
  readonly x: number;
  readonly z: number;
  /** 発信者。ホストが他の妨害者へ中継するときに使う */
  readonly from: string;
}

/** 参加・離脱と、決着の通知 */
export interface JoinMessage {
  readonly type: 'JOIN';
  readonly name: string;
}

export interface RosterMessage {
  readonly type: 'ROSTER';
  readonly members: readonly string[];
}

export interface ResultMessage {
  readonly type: 'RESULT';
  readonly outcome: Outcome;
  readonly elapsedMs: number;
  readonly purifiedCount: number;
  readonly totalCount: number;
}

export type NetMessage =
  SnapshotMessage | SoundMessage | JoinMessage | RosterMessage | ResultMessage;

// ── 検証 ────────────────────────────────────────
//
// 相手から届いた値をそのまま信じない。型で守れるのは自分のコードの中だけで、
// 回線の向こうから来る値は any と同じである。

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isPhase = (v: unknown): v is GhostPhase =>
  v === 'APPROACHING' || v === 'HELD' || v === 'GRABBING' || v === 'BANISHED';

const isSoundKey = (v: unknown): v is SoundKey =>
  typeof v === 'string' && (SOUND_KEYS as readonly string[]).includes(v);

function parseGhost(v: unknown): SnapshotGhost | null {
  if (!isRecord(v)) return null;
  if (typeof v['id'] !== 'string') return null;
  if (!isFiniteNumber(v['azimuth']) || !isFiniteNumber(v['distance'])) return null;
  if (!isPhase(v['phase'])) return null;
  if (!isFiniteNumber(v['purify'])) return null;
  return {
    id: v['id'],
    azimuth: v['azimuth'],
    distance: v['distance'],
    phase: v['phase'],
    purify: Math.min(1, Math.max(0, v['purify'])),
  };
}

/**
 * 受信データをメッセージへ変換する。想定外なら null を返す。
 *
 * 呼び出し側は null を「無視してよい雑音」として扱えばよく、
 * 壊れた入力で例外が飛ぶことはない。
 */
export function parseMessage(raw: unknown): NetMessage | null {
  if (!isRecord(raw)) return null;

  switch (raw['type']) {
    case 'SNAPSHOT': {
      if (!isFiniteNumber(raw['tick']) || !isFiniteNumber(raw['yaw'])) return null;
      if (typeof raw['light'] !== 'boolean') return null;
      if (!Array.isArray(raw['ghosts'])) return null;
      const ghosts: SnapshotGhost[] = [];
      for (const g of raw['ghosts']) {
        const parsed = parseGhost(g);
        if (parsed === null) return null;
        ghosts.push(parsed);
      }
      return {
        type: 'SNAPSHOT',
        tick: Math.floor(raw['tick']),
        yaw: raw['yaw'],
        light: raw['light'],
        ghosts,
        elapsedMs: isFiniteNumber(raw['elapsedMs']) ? raw['elapsedMs'] : 0,
        remaining: isFiniteNumber(raw['remaining']) ? raw['remaining'] : 0,
        speed: isFiniteNumber(raw['speed']) ? Math.max(0, raw['speed']) : 0,
      };
    }

    case 'SOUND': {
      if (!isFiniteNumber(raw['tick'])) return null;
      if (!isSoundKey(raw['sound'])) return null;
      if (!isFiniteNumber(raw['x']) || !isFiniteNumber(raw['z'])) return null;
      return {
        type: 'SOUND',
        tick: Math.floor(raw['tick']),
        sound: raw['sound'],
        x: raw['x'],
        z: raw['z'],
        from: typeof raw['from'] === 'string' ? raw['from'] : '',
      };
    }

    case 'JOIN':
      return { type: 'JOIN', name: typeof raw['name'] === 'string' ? raw['name'] : '' };

    case 'ROSTER': {
      if (!Array.isArray(raw['members'])) return null;
      const members = raw['members'].filter((m): m is string => typeof m === 'string');
      return { type: 'ROSTER', members };
    }

    case 'RESULT': {
      if (raw['outcome'] !== 'CLEARED' && raw['outcome'] !== 'FAILED') return null;
      return {
        type: 'RESULT',
        outcome: raw['outcome'],
        elapsedMs: isFiniteNumber(raw['elapsedMs']) ? raw['elapsedMs'] : 0,
        purifiedCount: isFiniteNumber(raw['purifiedCount']) ? raw['purifiedCount'] : 0,
        totalCount: isFiniteNumber(raw['totalCount']) ? raw['totalCount'] : 0,
      };
    }

    default:
      return null;
  }
}

/** 経過ミリ秒を tick へ変換する */
export const toTick = (elapsedMs: number): number => Math.floor(elapsedMs / NET_TICK_MS);
