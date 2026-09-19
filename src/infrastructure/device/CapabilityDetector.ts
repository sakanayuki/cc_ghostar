import type { DeviceCapabilities } from '@/application/ports';

/**
 * 実 API の capability を確認する。User-Agent には依存しない
 * （設計書 01.3 / 原典 §26）。
 */
export function detectCapabilities(): DeviceCapabilities {
  return {
    camera: typeof navigator.mediaDevices?.getUserMedia === 'function',
    // Torch はカメラ起動後にトラックから調べるため、ここでは判定できない
    torch: false,
    orientation: 'DeviceOrientationEvent' in window,
    motion: 'DeviceMotionEvent' in window,
    webgl: hasWebGL2(),
  };
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
