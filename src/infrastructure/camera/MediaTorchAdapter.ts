import type { TorchAvailability, TorchPort } from '@/application/ports';

/** 型定義に torch が無いため、この 1 箇所だけキャストを許可する */
interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}
interface TorchConstraint extends MediaTrackConstraintSet {
  torch?: boolean;
}

/**
 * 物理 LED の制御。
 *
 * ゲームの勝敗に一切関与しない。ゲームは LightState のみを参照し、
 * このアダプタはその状態を現実に反映しようと試みるだけの出力先である
 * （設計書 05.2 / 09.5）。
 */
export class MediaTorchAdapter implements TorchPort {
  private track: MediaStreamTrack | null = null;
  private available: TorchAvailability = 'UNAVAILABLE';
  private current: 'UNAVAILABLE' | 'OFF' | 'ON' | 'ERROR' = 'UNAVAILABLE';
  /** applyConstraints は連打されると競合する。直列化する */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly forceUnavailable = false) {}

  probe(track: MediaStreamTrack | null): Promise<TorchAvailability> {
    this.track = track;

    if (this.forceUnavailable || track === null) {
      this.available = 'UNAVAILABLE';
      this.current = 'UNAVAILABLE';
      return Promise.resolve(this.available);
    }

    try {
      const caps = track.getCapabilities() as TorchCapabilities;
      this.available = caps.torch === true ? 'AVAILABLE' : 'UNAVAILABLE';
    } catch {
      this.available = 'UNAVAILABLE';
    }
    this.current = this.available === 'AVAILABLE' ? 'OFF' : 'UNAVAILABLE';
    return Promise.resolve(this.available);
  }

  apply(on: boolean): Promise<boolean> {
    if (this.available !== 'AVAILABLE' || this.track === null) {
      return Promise.resolve(false);
    }

    const run = async (): Promise<boolean> => {
      try {
        await this.track?.applyConstraints({
          advanced: [{ torch: on } as TorchConstraint],
        });
        this.current = on ? 'ON' : 'OFF';
        return true;
      } catch {
        // 呼び出し側はゲームループであり、例外で止まってはならない
        this.current = 'ERROR';
        this.available = 'ERROR';
        return false;
      }
    };

    const next = this.queue.then(run, run);
    this.queue = next;
    return next;
  }

  availability(): TorchAvailability {
    return this.available;
  }

  state(): 'UNAVAILABLE' | 'OFF' | 'ON' | 'ERROR' {
    return this.current;
  }
}
