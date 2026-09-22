import type { DeviceAttitude } from '@/domain/math/Attitude';
import type { SoundKey } from '@/domain/multiplayer/NetMessages';
import type { GhostAnimation } from '@/domain/ghost/Ghost';
import type { GhostId, Vector3Like } from '@/shared/types';

export type { DeviceAttitude };

// ── カメラ ────────────────────────────────────────
export interface CameraPort {
  start(): Promise<HTMLVideoElement>;
  stop(): void;
  isActive(): boolean;
  getTrack(): MediaStreamTrack | null;
  /** デバッグ表示用 */
  describe(): string;
}

export class CameraError extends Error {
  constructor(
    override readonly message: string,
    readonly kind: 'DENIED' | 'BUSY' | 'MISSING' | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

// ── Torch ─────────────────────────────────────────
export type TorchAvailability = 'UNAVAILABLE' | 'AVAILABLE' | 'ERROR';

export interface TorchPort {
  probe(track: MediaStreamTrack | null): Promise<TorchAvailability>;
  /** 失敗しても throw せず false を返す */
  apply(on: boolean): Promise<boolean>;
  availability(): TorchAvailability;
  state(): 'UNAVAILABLE' | 'OFF' | 'ON' | 'ERROR';
}

// ── センサー ──────────────────────────────────────
export interface OrientationPort {
  start(): Promise<void>;
  stop(): void;
  read(): DeviceAttitude | null;
  isAvailable(): boolean;
}

export interface MotionPort {
  start(): Promise<void>;
  stop(): void;
  /** 読み取りで消費される。同じシェイクが二度返ることはない */
  consumeShake(): boolean;
  isAvailable(): boolean;
  /** デバッグ表示用の加速度の瞬間値とピーク値 */
  debugMagnitudes(): { current: number; peak: number };
}

// ── 音響 ──────────────────────────────────────────
export type OneShotSound =
  'PURIFY_COMPLETE' | 'GRAB' | 'ESCAPE' | 'GAME_OVER' | 'GAME_CLEAR';

export interface AudioPort {
  /** ユーザー操作のハンドラ内から呼ぶ必要がある */
  unlock(): Promise<void>;
  setListenerOrientation(forward: Vector3Like, up: Vector3Like): void;
  attachGhost(id: GhostId): void;
  updateGhost(id: GhostId, position: Vector3Like, intensity: number): void;
  detachGhost(id: GhostId): void;
  clearGhosts(): void;
  playOneShot(kind: OneShotSound): void;
  setMuted(muted: boolean): void;
  describe(): string;

  /**
   * 妨害音を読み込む。ホストになったときだけ呼ぶ。
   * 音源は 400KB 超あるため、妨害側の端末では読み込ませない（設計書 10.8）。
   */
  loadInterferenceSounds(): Promise<void>;

  /** 妨害音を指定位置から 1 回鳴らす */
  playInterference(key: SoundKey, position: Vector3Like): void;
}

// ── 描画 ──────────────────────────────────────────
export interface GhostViewModel {
  readonly id: GhostId;
  readonly position: Vector3Like;
  /** 0〜1。0 なら描画しない */
  readonly opacity: number;
  readonly animation: GhostAnimation;
  readonly purifyRatio: number;
}

export interface ScenePort {
  resize(width: number, height: number): void;
  setCameraQuaternion(q: { x: number; y: number; z: number; w: number }): void;
  syncGhosts(views: readonly GhostViewModel[], dtSec: number): void;
  setBeamEnabled(enabled: boolean): void;
  render(): void;
  dispose(): void;
  /** カメラの前方ベクトル。音響のリスナー向き同期に使う */
  cameraForward(): Vector3Like;
  cameraUp(): Vector3Like;
  fieldOfView(): number;
  setFieldOfView(deg: number): void;
}

// ── デバイス ──────────────────────────────────────
export interface HapticsPort {
  vibrate(pattern: number | readonly number[]): void;
  isAvailable(): boolean;
}

export interface ImmersiveResult {
  fullscreen: boolean;
  orientationLocked: boolean;
  wakeLock: boolean;
}

export interface ScreenPort {
  enterImmersive(): Promise<ImmersiveResult>;
  exitImmersive(): Promise<void>;
  reacquireWakeLock(): Promise<void>;
  isPortrait(): boolean;
  screenAngle(): number;
  onOrientationChange(cb: (angle: number) => void): () => void;
}

export interface StoragePort {
  readBestTimeMs(): number | null;
  writeBestTimeMs(ms: number): void;
}

/** 時刻を domain から締め出すためのポート */
export interface ClockPort {
  /** 単調増加するミリ秒 */
  now(): number;
}

export interface DeviceCapabilities {
  readonly camera: boolean;
  readonly torch: boolean;
  readonly orientation: boolean;
  readonly motion: boolean;
  readonly webgl: boolean;
}
