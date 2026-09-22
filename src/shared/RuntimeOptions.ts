/** URL クエリで与えられる起動オプション（設計書 06.5） */
export interface RuntimeOptions {
  /** ?debug=1 デバッグ HUD を表示する */
  readonly debug: boolean;
  /** ?mock=1 センサーとカメラをモックに差し替える */
  readonly mock: boolean;
  /** ?notorch=1 Torch 非対応端末の挙動を擬似再現する */
  readonly noTorch: boolean;
  /** ?mute=1 音を止める */
  readonly mute: boolean;
  /** ?ghosts=N ゴースト数を上書きする */
  readonly ghosts: number | null;
  /** ?speed=N 接近速度を上書きする */
  readonly speed: number | null;
  /**
   * ?intruder=1 妨害側の画面を単体で表示する。
   *
   * 通信を張らずに合成データで動かす。2 台用意しなくても真上からの視点を
   * 確認・調整できる（設計書 10.9）。
   */
  readonly intruderPreview: boolean;
}

const isOn = (value: string | null): boolean =>
  value !== null && value !== '0' && value !== 'false';

const toNumber = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function parseRuntimeOptions(search: string): RuntimeOptions {
  const q = new URLSearchParams(search);
  return {
    debug: isOn(q.get('debug')),
    mock: isOn(q.get('mock')),
    noTorch: isOn(q.get('notorch')),
    mute: isOn(q.get('mute')),
    ghosts: toNumber(q.get('ghosts')),
    speed: toNumber(q.get('speed')),
    intruderPreview: isOn(q.get('intruder')),
  };
}
