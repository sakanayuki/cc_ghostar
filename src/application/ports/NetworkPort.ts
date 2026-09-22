import type { NetMessage } from '@/domain/multiplayer/NetMessages';

export type NetStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'WAITING' // ホストが参加者を待っている
  | 'CONNECTED'
  | 'ERROR'
  | 'CLOSED';

export interface NetError {
  readonly kind: 'ROOM_TAKEN' | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NETWORK' | 'UNKNOWN';
  readonly message: string;
}

export interface NetEvents {
  onStatus(status: NetStatus): void;
  /** 検証済みのメッセージだけが届く */
  onMessage(peerId: string, message: NetMessage): void;
  onPeerJoin(peerId: string): void;
  onPeerLeave(peerId: string): void;
  onError(error: NetError): void;
}

/**
 * P2P 通信の抽象（設計書 10.3）。
 *
 * application 層は PeerJS を知らない。接続の実体は infrastructure が持つ。
 */
export interface NetworkPort {
  /** 部屋を作る。成功すると相手に伝える部屋コードが返る */
  host(code: string, events: NetEvents): Promise<void>;
  /** 部屋へ入る */
  join(code: string, events: NetEvents): Promise<void>;
  /** 全員へ送る */
  broadcast(message: NetMessage): void;
  /** 特定の相手へ送る */
  send(peerId: string, message: NetMessage): void;
  disconnect(): void;
  status(): NetStatus;
  /** 自分を除く接続中の相手 */
  peers(): readonly string[];
}
