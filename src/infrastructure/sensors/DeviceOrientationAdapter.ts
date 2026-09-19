import type { DeviceAttitude, OrientationPort, ScreenPort } from '@/application/ports';

/** この時間内にイベントが来なければ利用不可と判定する（設計書 05.3） */
const FIRST_EVENT_TIMEOUT_MS = 1500;

/**
 * 絶対方位イベントを優先して購読する。
 *
 * 絶対イベントは磁力計による補正が入るためドリフトが小さい。ただし得られた
 * 絶対方位はキャリブレーションで即座に相対化されるため、室内の地磁気歪みが
 * ワールドの向きを狂わせることはない。絶対イベントは「より安定した角速度の
 * 積分結果」としてのみ利用し、方角としては使わない（設計書 03.4 / 05.3）。
 */
export class DeviceOrientationAdapter implements OrientationPort {
  private latest: DeviceAttitude | null = null;
  private eventName: 'deviceorientation' | 'deviceorientationabsolute' =
    'deviceorientation';
  private available = false;
  private cachedScreenAngle = 0;
  private disposeOrientationListener: (() => void) | null = null;

  constructor(private readonly screen: ScreenPort) {}

  async start(): Promise<void> {
    this.cachedScreenAngle = this.screen.screenAngle();
    this.disposeOrientationListener = this.screen.onOrientationChange((angle) => {
      this.cachedScreenAngle = angle;
    });

    this.eventName =
      'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';

    window.addEventListener(this.eventName, this.onOrientation as EventListener);

    this.available = await this.waitForFirstEvent();
    if (!this.available && this.eventName === 'deviceorientationabsolute') {
      // 絶対イベントが流れない端末では相対イベントへ切り替える
      window.removeEventListener(this.eventName, this.onOrientation as EventListener);
      this.eventName = 'deviceorientation';
      window.addEventListener(this.eventName, this.onOrientation as EventListener);
      this.available = await this.waitForFirstEvent();
    }
  }

  stop(): void {
    window.removeEventListener(this.eventName, this.onOrientation as EventListener);
    this.disposeOrientationListener?.();
    this.disposeOrientationListener = null;
  }

  read(): DeviceAttitude | null {
    return this.latest;
  }

  isAvailable(): boolean {
    return this.available;
  }

  private waitForFirstEvent(): Promise<boolean> {
    if (this.latest !== null) return Promise.resolve(true);

    return new Promise((resolve) => {
      const started = performance.now();
      const poll = (): void => {
        if (this.latest !== null) {
          resolve(true);
          return;
        }
        if (performance.now() - started >= FIRST_EVENT_TIMEOUT_MS) {
          resolve(false);
          return;
        }
        requestAnimationFrame(poll);
      };
      poll();
    });
  }

  /**
   * ハンドラでは最新値を保存するだけとし、計算は行わない。
   * センサーイベントは 60Hz を超えて発火しうるため、ゲームループ側が
   * read() で引き取る pull 方式とする（設計書 05.3）。
   */
  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    // すべて null のイベントは「届いた」とみなさない。センサー非搭載端末では
    // null のイベントだけが流れ続ける場合がある
    if (event.alpha === null || event.beta === null || event.gamma === null) return;

    this.latest = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      screenAngle: this.cachedScreenAngle,
      absolute: event.absolute,
    };
  };

  describe(): string {
    if (!this.available) return 'unavailable';
    return this.eventName === 'deviceorientationabsolute' ? 'absolute' : 'relative';
  }
}
