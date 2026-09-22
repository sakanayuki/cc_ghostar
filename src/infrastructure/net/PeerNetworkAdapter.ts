import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type {
  NetError,
  NetEvents,
  NetStatus,
  NetworkPort,
} from '@/application/ports/NetworkPort';
import { parseMessage } from '@/domain/multiplayer/NetMessages';
import type { NetMessage } from '@/domain/multiplayer/NetMessages';
import { toPeerId } from '@/domain/multiplayer/RoomCode';

/** ホスト 1 人 + 妨害 3 人 = 合計 4 人 */
export const MAX_INTRUDERS = 3;

/** 接続確立を待つ上限 */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * PeerJS による P2P 実装（設計書 10.3）。
 *
 * PeerJS の公開サーバーは「相手の居場所を教え合う」ためだけに使う（シグナリング）。
 * 確立後の通信は端末どうしの直接接続で、ゲームのデータが公開サーバーを
 * 経由することはない。
 *
 * ただし公開サーバーは無保証であり、落ちていれば接続できない。その場合は
 * ERROR を返し、シングルプレイは従来どおり遊べるようにしてある。
 */
export class PeerNetworkAdapter implements NetworkPort {
  private peer: Peer | null = null;
  private readonly connections = new Map<string, DataConnection>();
  private events: NetEvents | null = null;
  private current: NetStatus = 'IDLE';
  private isHost = false;

  host(code: string, events: NetEvents): Promise<void> {
    this.events = events;
    this.isHost = true;
    return this.createPeer(toPeerId(code), 'WAITING', (peer) => {
      peer.on('connection', (conn) => {
        if (this.connections.size >= MAX_INTRUDERS) {
          // 満室。相手に理由を伝えてから閉じる
          conn.on('open', () => {
            conn.close();
          });
          return;
        }
        this.register(conn);
      });
    });
  }

  join(code: string, events: NetEvents): Promise<void> {
    this.events = events;
    this.isHost = false;
    // 参加側の ID は衝突を避けるため PeerJS に任せる
    return this.createPeer(undefined, 'CONNECTING', (peer) => {
      const conn = peer.connect(toPeerId(code), { reliable: true });
      const timer = window.setTimeout(() => {
        if (!this.connections.has(conn.peer)) {
          this.fail({
            kind: 'ROOM_NOT_FOUND',
            message: 'その部屋は見つかりませんでした。',
          });
        }
      }, CONNECT_TIMEOUT_MS);

      conn.on('open', () => {
        window.clearTimeout(timer);
      });
      this.register(conn);
    });
  }

  broadcast(message: NetMessage): void {
    for (const conn of this.connections.values()) {
      this.trySend(conn, message);
    }
  }

  send(peerId: string, message: NetMessage): void {
    const conn = this.connections.get(peerId);
    if (conn !== undefined) this.trySend(conn, message);
  }

  disconnect(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        // すでに閉じている場合は無視する
      }
    }
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
    this.setStatus('CLOSED');
  }

  status(): NetStatus {
    return this.current;
  }

  peers(): readonly string[] {
    return [...this.connections.keys()];
  }

  // ── 内部 ────────────────────────────────────

  private createPeer(
    id: string | undefined,
    pending: NetStatus,
    wire: (peer: Peer) => void,
  ): Promise<void> {
    this.setStatus('CONNECTING');

    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      // 既定の公開シグナリングサーバーを使う
      const peer = id === undefined ? new Peer() : new Peer(id);
      this.peer = peer;

      peer.on('open', () => {
        this.setStatus(pending);
        wire(peer);
        finish();
      });

      peer.on('error', (err: Error & { type?: string }) => {
        this.fail(classify(err));
        finish();
      });

      peer.on('disconnected', () => {
        this.setStatus('CLOSED');
      });
    });
  }

  private register(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.setStatus('CONNECTED');
      this.events?.onPeerJoin(conn.peer);
    });

    conn.on('data', (raw) => {
      // 回線の向こうから来た値は信用しない。検証を通ったものだけ渡す
      const message = parseMessage(raw);
      if (message === null) return;
      this.events?.onMessage(conn.peer, message);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.events?.onPeerLeave(conn.peer);
      if (this.connections.size === 0) {
        this.setStatus(this.isHost ? 'WAITING' : 'CLOSED');
      }
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
      this.events?.onPeerLeave(conn.peer);
    });
  }

  private trySend(conn: DataConnection, message: NetMessage): void {
    try {
      // send は Promise を返すが待たない。取りこぼしても次の tick で
      // 新しいスナップショットが送られるため、再送を追う必要がない
      if (conn.open) void conn.send(message);
    } catch {
      // 送信失敗でゲームを止めない
    }
  }

  private setStatus(status: NetStatus): void {
    if (this.current === status) return;
    this.current = status;
    this.events?.onStatus(status);
  }

  private fail(error: NetError): void {
    this.setStatus('ERROR');
    this.events?.onError(error);
  }
}

function classify(err: Error & { type?: string }): NetError {
  switch (err.type) {
    case 'unavailable-id':
      return {
        kind: 'ROOM_TAKEN',
        message: 'その部屋コードは使用中です。作り直してください。',
      };
    case 'peer-unavailable':
      return { kind: 'ROOM_NOT_FOUND', message: 'その部屋は見つかりませんでした。' };
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return {
        kind: 'NETWORK',
        message: '接続サーバーに繋がりません。時間をおいて試してください。',
      };
    default:
      return { kind: 'UNKNOWN', message: '接続できませんでした。' };
  }
}
