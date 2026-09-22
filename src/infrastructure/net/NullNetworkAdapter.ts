import type { NetStatus, NetworkPort } from '@/application/ports/NetworkPort';

/**
 * 何も送らない回線（設計書 10.9）。
 *
 * 妨害側の画面を 1 台で確認するプレビュー用。IntruderSession をそのまま
 * 使えるので、クールダウンや波紋の挙動が本番と同じになる。
 */
export class NullNetworkAdapter implements NetworkPort {
  host(): Promise<void> {
    return Promise.resolve();
  }
  join(): Promise<void> {
    return Promise.resolve();
  }
  broadcast(): void {
    /* 送らない */
  }
  send(): void {
    /* 送らない */
  }
  disconnect(): void {
    /* 何もしない */
  }
  status(): NetStatus {
    return 'CONNECTED';
  }
  peers(): readonly string[] {
    return [];
  }
}
