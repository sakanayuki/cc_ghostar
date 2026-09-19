import type { ClockPort } from './ports';

/** 復帰直後の巨大な dt でゴーストが瞬間移動するのを防ぐ（設計書 04.6） */
const MAX_DT_SEC = 1 / 30;

export type Frame = (dtSec: number, nowMs: number) => void;

export class GameLoop {
  private handle: number | null = null;
  private last = 0;
  private readonly fpsWindow: number[] = [];

  constructor(
    private readonly clock: ClockPort,
    private readonly frame: Frame,
  ) {}

  start(): void {
    if (this.handle !== null) return;
    this.last = this.clock.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.handle === null) return;
    cancelAnimationFrame(this.handle);
    this.handle = null;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  /** 復帰時に呼ぶ。次フレームの dt を 0 起点に戻す */
  resetDelta(): void {
    this.last = this.clock.now();
  }

  private readonly tick = (): void => {
    const now = this.clock.now();
    const dt = Math.min(MAX_DT_SEC, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    if (dt > 0) {
      this.fpsWindow.push(1 / dt);
      if (this.fpsWindow.length > 60) this.fpsWindow.shift();
    }

    this.frame(dt, now);
    this.handle = requestAnimationFrame(this.tick);
  };

  fps(): number {
    if (this.fpsWindow.length === 0) return 0;
    const sum = this.fpsWindow.reduce((a, b) => a + b, 0);
    return sum / this.fpsWindow.length;
  }

  minFps(): number {
    return this.fpsWindow.length === 0 ? 0 : Math.min(...this.fpsWindow);
  }
}
