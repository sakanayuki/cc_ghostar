import type { MotionPort } from '@/application/ports';

/** Space キーでシェイクを発生させる（設計書 05.8） */
export class MockMotionAdapter implements MotionPort {
  private pending = false;

  start(): Promise<void> {
    window.addEventListener('keydown', this.onKeyDown);
    return Promise.resolve();
  }

  stop(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  consumeShake(): boolean {
    const value = this.pending;
    this.pending = false;
    return value;
  }

  isAvailable(): boolean {
    return true;
  }

  debugMagnitudes(): { current: number; peak: number } {
    return { current: 0, peak: 0 };
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return;
    this.pending = true;
    event.preventDefault();
  };
}
