import type { HapticsPort } from '@/application/ports';

export class VibrationAdapter implements HapticsPort {
  vibrate(pattern: number | readonly number[]): void {
    if (!this.isAvailable()) return;
    try {
      navigator.vibrate(pattern as number | number[]);
    } catch {
      // 非致命。無視する
    }
  }

  isAvailable(): boolean {
    return typeof navigator.vibrate === 'function';
  }
}

/** 振動を出さない実装。?mute=1 や非対応端末で使う */
export class NullHapticsAdapter implements HapticsPort {
  vibrate(): void {
    // 何もしない
  }
  isAvailable(): boolean {
    return false;
  }
}
