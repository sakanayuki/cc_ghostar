import type { MotionPort } from '@/application/ports';

/** 重力を除いた加速度がこの値を超えたらシェイクとみなす（設計書 05.4） */
const SHAKE_THRESHOLD = 18;
/** 重力込みの値から差分で検出する場合の閾値 */
const SHAKE_THRESHOLD_DELTA = 14;
/** 連続検出を防ぐ不応期 */
const SHAKE_REFRACTORY_MS = 400;
const PEAK_DECAY_PER_READ = 0.985;

export class DeviceMotionAdapter implements MotionPort {
  private pending = false;
  private available = false;
  private lastShakeAt = -Infinity;
  private current = 0;
  private peak = 0;

  private usePureAcceleration = true;
  private prev: { x: number; y: number; z: number } | null = null;

  start(): Promise<void> {
    window.addEventListener('devicemotion', this.onMotion);
    this.available = 'DeviceMotionEvent' in window;
    return Promise.resolve();
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.onMotion);
  }

  /** 読み取りで消費される。1 回の振りで複数回の猶予を使わないため */
  consumeShake(): boolean {
    const value = this.pending;
    this.pending = false;
    return value;
  }

  isAvailable(): boolean {
    return this.available;
  }

  debugMagnitudes(): { current: number; peak: number } {
    this.peak *= PEAK_DECAY_PER_READ;
    return { current: this.current, peak: this.peak };
  }

  private readonly onMotion = (event: DeviceMotionEvent): void => {
    const magnitude = this.magnitudeOf(event);
    if (magnitude === null) return;

    this.available = true;
    this.current = magnitude;
    if (magnitude > this.peak) this.peak = magnitude;

    const threshold = this.usePureAcceleration ? SHAKE_THRESHOLD : SHAKE_THRESHOLD_DELTA;
    if (magnitude < threshold) return;

    const now = performance.now();
    if (now - this.lastShakeAt < SHAKE_REFRACTORY_MS) return;

    this.lastShakeAt = now;
    this.pending = true;
  };

  /**
   * acceleration（重力を除いた値）を優先する。null を返す端末では
   * accelerationIncludingGravity の前フレーム差分で重力成分を打ち消す。
   */
  private magnitudeOf(event: DeviceMotionEvent): number | null {
    const a = event.acceleration;
    if (a && a.x !== null && a.y !== null && a.z !== null) {
      this.usePureAcceleration = true;
      return Math.hypot(a.x, a.y, a.z);
    }

    const g = event.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null || g.z === null) return null;

    this.usePureAcceleration = false;
    const previous = this.prev;
    this.prev = { x: g.x, y: g.y, z: g.z };
    if (previous === null) return null;

    return Math.hypot(g.x - previous.x, g.y - previous.y, g.z - previous.z);
  }
}
