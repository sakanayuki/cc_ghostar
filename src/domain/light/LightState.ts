/**
 * ゲームルール上の照射状態。
 * 物理 LED（TorchState）とは独立した概念であり、
 * ゲームロジックが参照してよいのはこちらだけである（設計書 02.5 / 09.5）。
 */
export type LightState = 'ON' | 'OFF';

/** 物理 Torch の状態。表示とデバッグのためだけに存在する（設計書 03.2） */
export type TorchState = 'UNAVAILABLE' | 'OFF' | 'ON' | 'ERROR';

export const toggleLight = (state: LightState): LightState =>
  state === 'ON' ? 'OFF' : 'ON';
