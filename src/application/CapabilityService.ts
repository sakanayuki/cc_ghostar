import type { DeviceCapabilities } from './ports';

export type BootVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'WEBGL' | 'SENSOR' };

/**
 * 起動可否の判断。判定は User-Agent ではなく実 API の capability に対して
 * 行う（設計書 01.3 / 原典 §26）。
 */
export function judgeBoot(caps: DeviceCapabilities, allowMock: boolean): BootVerdict {
  if (!caps.webgl) return { ok: false, reason: 'WEBGL' };
  if (!caps.orientation && !allowMock) return { ok: false, reason: 'SENSOR' };
  return { ok: true };
}
