import type { DeviceAttitude, OrientationPort } from '@/application/ports';

const KEY_STEP_DEG = 5;
const DRAG_SENSITIVITY = 0.35;

/**
 * マウスドラッグと矢印キーで視点を操作する（設計書 05.8）。
 *
 * 実センサーと同じ DeviceAttitude を返すため、上位層はモックであることを
 * 知らない。beta に +90 しているのは「端末を垂直に立てて前方を見る」姿勢が
 * beta = 90 に対応するという DeviceOrientation の定義に由来する。これを
 * 忘れると、モックでは真下を向いた状態から始まる。
 */
export class MockOrientationAdapter implements OrientationPort {
  private yawDeg = 0;
  private pitchDeg = 0;
  private dragging = false;

  start(): Promise<void> {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
    return Promise.resolve();
  }

  stop(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  read(): DeviceAttitude {
    return {
      // alpha は反時計回り正、ワールド方位は時計回り正なので符号が逆になる
      alpha: normalizeDeg(-this.yawDeg),
      beta: this.pitchDeg + 90,
      gamma: 0,
      screenAngle: 0,
      absolute: false,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    // UI のボタン操作をドラッグと誤認しない
    if ((event.target as HTMLElement | null)?.closest('button') !== null) return;
    this.dragging = true;
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.yawDeg = normalizeDeg(this.yawDeg + event.movementX * DRAG_SENSITIVITY);
    this.pitchDeg = clampDeg(this.pitchDeg - event.movementY * DRAG_SENSITIVITY);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowLeft':
        this.yawDeg = normalizeDeg(this.yawDeg - KEY_STEP_DEG);
        break;
      case 'ArrowRight':
        this.yawDeg = normalizeDeg(this.yawDeg + KEY_STEP_DEG);
        break;
      case 'ArrowUp':
        this.pitchDeg = clampDeg(this.pitchDeg + KEY_STEP_DEG);
        break;
      case 'ArrowDown':
        this.pitchDeg = clampDeg(this.pitchDeg - KEY_STEP_DEG);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
}

function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

function clampDeg(deg: number): number {
  return Math.max(-85, Math.min(85, deg));
}
