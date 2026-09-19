import type { StoragePort } from '@/application/ports';

const KEY = 'torch-webar-horror:best-time-ms';

/**
 * localStorage へのアクセスは必ず try で囲む。
 * ストレージが無効化された環境では読み取りだけでも例外になる（設計書 05.7）。
 */
export class LocalStorageAdapter implements StoragePort {
  readBestTimeMs(): number | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  writeBestTimeMs(ms: number): void {
    try {
      localStorage.setItem(KEY, String(Math.round(ms)));
    } catch {
      // 非致命。記録が残らないだけ
    }
  }
}
