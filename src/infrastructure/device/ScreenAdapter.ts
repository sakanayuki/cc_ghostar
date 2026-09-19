import type { ImmersiveResult, ScreenPort } from '@/application/ports';

interface OrientationLockable extends ScreenOrientation {
  lock?: (orientation: 'portrait-primary') => Promise<void>;
}

/**
 * 全画面・向きロック・Wake Lock。いずれも非致命であり、
 * 個別に try で囲んで 1 つが失敗しても他を試みる（設計書 05.7）。
 */
export class ScreenAdapter implements ScreenPort {
  private wakeLock: WakeLockSentinel | null = null;
  private wakeLockWanted = false;

  async enterImmersive(): Promise<ImmersiveResult> {
    const result: ImmersiveResult = {
      fullscreen: false,
      orientationLocked: false,
      wakeLock: false,
    };

    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      result.fullscreen = true;
    } catch {
      // 非致命
    }

    try {
      // 向きロックは全画面中でないと必ず失敗する
      const orientation = screen.orientation as OrientationLockable;
      await orientation.lock?.('portrait-primary');
      result.orientationLocked = true;
    } catch {
      // 非致命。横持ちはオーバーレイで促す
    }

    this.wakeLockWanted = true;
    result.wakeLock = await this.acquireWakeLock();

    return result;
  }

  async exitImmersive(): Promise<void> {
    this.wakeLockWanted = false;
    try {
      await this.wakeLock?.release();
    } catch {
      // 非致命
    }
    this.wakeLock = null;

    try {
      if (document.fullscreenElement !== null) await document.exitFullscreen();
    } catch {
      // 非致命
    }
  }

  /** Wake Lock はページが非表示になると解放される。復帰時に取り直す */
  async reacquireWakeLock(): Promise<void> {
    if (!this.wakeLockWanted) return;
    if (this.wakeLock !== null && !this.wakeLock.released) return;
    await this.acquireWakeLock();
  }

  isPortrait(): boolean {
    return window.innerHeight >= window.innerWidth;
  }

  screenAngle(): number {
    return screen.orientation?.angle ?? 0;
  }

  onOrientationChange(cb: (angle: number) => void): () => void {
    const handler = (): void => {
      cb(this.screenAngle());
    };
    screen.orientation?.addEventListener('change', handler);
    window.addEventListener('resize', handler);
    return () => {
      screen.orientation?.removeEventListener('change', handler);
      window.removeEventListener('resize', handler);
    };
  }

  private async acquireWakeLock(): Promise<boolean> {
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      this.wakeLock = null;
      return false;
    }
  }
}
