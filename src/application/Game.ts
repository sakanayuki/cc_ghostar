import { Vector3 } from 'three';
import type { GameConfig } from '@/domain/config/GameConfig';
import { animationOf, isAlive } from '@/domain/ghost/Ghost';
import type { Ghost } from '@/domain/ghost/Ghost';
import { step } from '@/domain/ghost/GhostBehavior';
import type { DomainEvent } from '@/domain/ghost/GhostEvents';
import { recalibrate, spawn } from '@/domain/ghost/GhostSpawner';
import { toggleLight } from '@/domain/light/LightState';
import { clamp01 } from '@/domain/math/Angles';
import { beamAxis, computeOpacity } from '@/domain/math/BeamCone';
import { directionTo, toPosition } from '@/domain/math/Spherical';
import {
  initialState,
  reduce,
  startSession,
  transition,
} from '@/domain/session/GameState';
import type { GamePhase, SessionState } from '@/domain/session/GameState';
import { millis } from '@/shared/types';
import type { Millis } from '@/shared/types';
import { CalibrationService } from './CalibrationService';
import { GameLoop } from './GameLoop';
import { judgeBoot } from './CapabilityService';
import type {
  AudioPort,
  CameraPort,
  ClockPort,
  DeviceCapabilities,
  GhostViewModel,
  HapticsPort,
  MotionPort,
  OrientationPort,
  ScenePort,
  ScreenPort,
  StoragePort,
  TorchPort,
} from './ports';

export interface GameDeps {
  readonly camera: CameraPort;
  readonly torch: TorchPort;
  readonly orientation: OrientationPort;
  readonly motion: MotionPort;
  readonly audio: AudioPort;
  readonly scene: ScenePort;
  readonly haptics: HapticsPort;
  readonly screen: ScreenPort;
  readonly storage: StoragePort;
  readonly clock: ClockPort;
  readonly config: GameConfig;
  readonly random: () => number;
  readonly capabilities: DeviceCapabilities;
  readonly allowMock: boolean;
}

export interface GameView {
  readonly state: SessionState;
  readonly views: readonly GhostViewModel[];
  readonly bestTimeMs: number | null;
  readonly torchAvailable: boolean;
  /** 捕捉中の個体の浄化ゲージ。なければ null */
  readonly activePurify: number | null;
  /** 画面端の警告に使う、最も近い個体の方位と距離 */
  readonly nearest: { azimuth: number; distance: number } | null;
}

export type GameListener = (view: GameView) => void;

const VIBRATE_WARN = 40;
const VIBRATE_GRAB = [0, 60, 40, 60] as const;
const VIBRATE_ESCAPE = 30;
const VIBRATE_GAME_OVER = 200;

const _pos = new Vector3();
const _dir = new Vector3();
const _axis = new Vector3();

export class Game {
  private state: SessionState = initialState();
  private readonly calibration = new CalibrationService();
  private readonly loop: GameLoop;
  private readonly listeners = new Set<GameListener>();

  private views: readonly GhostViewModel[] = [];
  private bestTimeMs: number | null = null;
  private cameraStarted = false;
  private sessionStartedAt = 0;
  private pausedElapsed: Millis = millis(0);
  private activePurify: number | null = null;
  private nearest: { azimuth: number; distance: number } | null = null;
  private lastImmersiveOk = false;
  private sessionFinalized = false;

  constructor(private readonly deps: GameDeps) {
    this.loop = new GameLoop(deps.clock, this.frame);
  }

  // ── 公開 API ────────────────────────────────────

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    listener(this.view());
    return () => this.listeners.delete(listener);
  }

  view(): GameView {
    return {
      state: this.state,
      views: this.views,
      bestTimeMs: this.bestTimeMs,
      torchAvailable: this.deps.torch.availability() === 'AVAILABLE',
      activePurify: this.activePurify,
      nearest: this.nearest,
    };
  }

  get phase(): GamePhase {
    return this.state.phase;
  }

  get loopStats(): { fps: number; minFps: number } {
    return { fps: this.loop.fps(), minFps: this.loop.minFps() };
  }

  get calibrationService(): CalibrationService {
    return this.calibration;
  }

  boot(): void {
    this.bestTimeMs = this.deps.storage.readBestTimeMs();
    const verdict = judgeBoot(this.deps.capabilities, this.deps.allowMock);

    if (!verdict.ok) {
      this.setPhase(verdict.reason === 'WEBGL' ? 'ERROR_WEBGL' : 'ERROR_SENSOR');
      return;
    }
    this.setPhase('TITLE');
  }

  /**
   * タイトルの START タップから呼ぶ。
   *
   * ユーザー操作を起点とする API はすべて同期的に呼び出しを開始し、
   * 結果をまとめて待つ（設計書 06.1）。await を挟んでから呼ぶと
   * 操作との関連が切れて失敗する端末がある。
   */
  async start(): Promise<void> {
    const immersive = this.deps.screen.enterImmersive();
    const audio = this.deps.audio.unlock();

    if (!this.cameraStarted) {
      this.setPhase('PERMISSION');
      const camera = this.deps.camera.start();

      const [immersiveResult, , cameraResult] = await Promise.allSettled([
        immersive,
        audio,
        camera,
      ]);

      this.lastImmersiveOk =
        immersiveResult.status === 'fulfilled' && immersiveResult.value.fullscreen;

      if (cameraResult.status === 'rejected') {
        this.setPhase('ERROR_CAMERA');
        this.emit();
        return;
      }

      this.setPhase('CAMERA_READY');
      await this.deps.torch.probe(this.deps.camera.getTrack());

      try {
        await this.deps.orientation.start();
        await this.deps.motion.start();
      } catch {
        // センサーの購読失敗は起動時 capability 判定で弾かれているはずだが、
        // 念のため致命扱いにする
        this.setPhase('ERROR_SENSOR');
        this.emit();
        return;
      }

      this.cameraStarted = true;
    } else {
      const [immersiveResult] = await Promise.allSettled([immersive, audio]);
      this.lastImmersiveOk =
        immersiveResult.status === 'fulfilled' && immersiveResult.value.fullscreen;
    }

    this.setPhase('CALIBRATION');
    this.emit();
  }

  /** キャリブレーション画面の確定ボタン */
  confirmCalibration(): void {
    const attitude = this.deps.orientation.read();
    if (attitude !== null) this.calibration.calibrate(attitude);

    const ghosts = spawn(this.deps.config, this.deps.random);
    this.state = startSession(this.state, ghosts);

    this.deps.audio.clearGhosts();
    for (const g of ghosts) this.deps.audio.attachGhost(g.id);

    this.sessionStartedAt = this.deps.clock.now();
    this.pausedElapsed = millis(0);
    this.sessionFinalized = false;
    void this.applyLight();

    this.loop.resetDelta();
    this.loop.start();
    this.emit();
  }

  /** プレイ中の再キャリブレーション。ゴーストの見かけの位置を保つ */
  recalibrateNow(): void {
    const attitude = this.deps.orientation.read();
    if (attitude === null) return;

    const shift = this.calibration.calibrate(attitude);
    this.state = { ...this.state, ghosts: recalibrate(this.state.ghosts, shift) };
    this.emit();
  }

  toggleLight(): void {
    this.state = { ...this.state, light: toggleLight(this.state.light) };
    void this.applyLight();
    this.emit();
  }

  pause(): void {
    if (this.state.phase !== 'PLAYING') return;

    this.pausedElapsed = this.state.elapsedMs;
    this.state = transition({ ...this.state, light: 'OFF' }, 'PAUSED');

    // ポケットの中で LED が点きっぱなしになるのは実害。最優先で消す
    void this.deps.torch.apply(false);
    this.deps.scene.setBeamEnabled(false);
    this.deps.audio.setMuted(true);
    this.loop.stop();
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.state.phase !== 'PAUSED') return;

    if (!this.deps.camera.isActive()) {
      this.setPhase('ERROR_CAMERA');
      this.emit();
      return;
    }

    await this.deps.screen.reacquireWakeLock();
    this.deps.audio.setMuted(false);

    // 復帰と同時に LED が点くと驚かせることになるため OFF のまま戻す
    this.sessionStartedAt = this.deps.clock.now() - this.pausedElapsed;
    this.state = transition(this.state, 'PLAYING');
    this.loop.resetDelta();
    this.loop.start();
    this.emit();
  }

  backToTitle(): void {
    this.loop.stop();
    this.deps.audio.clearGhosts();
    this.state = transition(this.state, 'TITLE');
    this.views = [];
    this.activePurify = null;
    this.nearest = null;
    this.emit();
  }

  retryCamera(): void {
    this.setPhase('PERMISSION');
    this.cameraStarted = false;
    void this.start();
  }

  dispose(): void {
    this.loop.stop();
    this.deps.camera.stop();
    this.deps.orientation.stop();
    this.deps.motion.stop();
    void this.deps.torch.apply(false);
    this.deps.scene.dispose();
  }

  get immersiveActive(): boolean {
    return this.lastImmersiveOk;
  }

  // ── 内部 ────────────────────────────────────────

  private setPhase(phase: GamePhase): void {
    const next = transition(this.state, phase);
    if (next !== this.state) {
      this.state = next;
      this.emit();
    }
  }

  private async applyLight(): Promise<void> {
    const on = this.state.light === 'ON';
    // 仮想スポットライトは必ず反映される。物理 LED は失敗しても無視する
    this.deps.scene.setBeamEnabled(on);
    await this.deps.torch.apply(on);
  }

  private emit(): void {
    const view = this.view();
    for (const listener of this.listeners) listener(view);
  }

  private readonly frame = (dtSec: number, nowMs: number): void => {
    if (this.state.phase !== 'PLAYING') return;

    const { config, scene, audio } = this.deps;

    // 1. 姿勢
    const attitude = this.deps.orientation.read() ?? FALLBACK_ATTITUDE;
    const world = this.calibration.toWorld(attitude);
    scene.setCameraQuaternion(world);
    beamAxis(world, _axis);

    // 2. ドメインの遷移
    const elapsedMs = millis(nowMs - this.sessionStartedAt);
    const stepped = step({
      ghosts: this.state.ghosts,
      beamAxis: _axis,
      light: this.state.light,
      shook: this.deps.motion.consumeShake(),
      dt: dtSec,
      elapsedMs,
      config,
    });

    const reduced = reduce({
      state: this.state,
      ghosts: stepped.ghosts,
      events: stepped.events,
      elapsedMs,
      config,
    });

    this.state = reduced.state;

    // 3. 副作用の配送
    this.dispatch(stepped.events);
    this.dispatch(reduced.events);

    // 4. 表示の同期
    this.updateViews(dtSec);

    audio.setListenerOrientation(scene.cameraForward(), scene.cameraUp());
    scene.render();

    if (this.state.phase === 'RESULT' && !this.sessionFinalized) {
      this.finishSession();
    }
    this.emit();
  };

  private updateViews(dtSec: number): void {
    const { config, scene, audio } = this.deps;
    const views: GhostViewModel[] = [];

    let activePurify: number | null = null;
    let nearest: { azimuth: number; distance: number } | null = null;

    for (const ghost of this.state.ghosts) {
      toPosition(
        ghost.azimuth,
        ghost.distance,
        config.eyeHeight,
        ghost.heightOffset,
        _pos,
      );
      directionTo(_pos, config.eyeHeight, _dir);

      const opacity =
        ghost.phase === 'BANISHED'
          ? 0
          : computeOpacity(_axis, _dir, ghost.distance, this.state.light, config);

      views.push({
        id: ghost.id,
        position: { x: _pos.x, y: _pos.y, z: _pos.z },
        opacity,
        animation: animationOf(ghost),
        purifyRatio: ghost.purify,
      });

      if (ghost.phase === 'HELD') {
        activePurify = ghost.purify;
      }
      if (isAlive(ghost) && (nearest === null || ghost.distance < nearest.distance)) {
        nearest = { azimuth: ghost.azimuth, distance: ghost.distance };
      }

      audio.updateGhost(
        ghost.id,
        { x: _pos.x, y: _pos.y, z: _pos.z },
        intensityOf(ghost, config),
      );
    }

    this.views = views;
    this.activePurify = activePurify;
    this.nearest = nearest;
    scene.syncGhosts(views, dtSec);
  }

  private dispatch(events: readonly DomainEvent[]): void {
    const { audio, haptics } = this.deps;

    for (const event of events) {
      switch (event.type) {
        case 'GHOST_PURIFIED':
          audio.playOneShot('PURIFY_COMPLETE');
          audio.detachGhost(event.id);
          break;
        case 'GHOST_GRABBING':
          audio.playOneShot('GRAB');
          haptics.vibrate(VIBRATE_GRAB);
          break;
        case 'GHOST_ESCAPED':
          audio.playOneShot('ESCAPE');
          haptics.vibrate(VIBRATE_ESCAPE);
          break;
        case 'GHOST_WARN':
          haptics.vibrate(VIBRATE_WARN);
          break;
        case 'SESSION_FAILED':
          audio.playOneShot('GAME_OVER');
          haptics.vibrate(VIBRATE_GAME_OVER);
          break;
        case 'SESSION_CLEARED':
          audio.playOneShot('GAME_CLEAR');
          break;
        case 'GHOST_HELD':
        case 'GHOST_RELEASED':
        case 'PLAYER_CAUGHT':
          break;
      }
    }
  }

  /** 結果の確定。最短記録の判定はここで行う（domain は Storage を知らない） */
  private finishSession(): void {
    this.sessionFinalized = true;
    this.loop.stop();
    void this.deps.torch.apply(false);

    const result = this.state.result;
    if (result === null) return;

    let isNewBest = false;
    if (result.outcome === 'CLEARED') {
      const best = this.deps.storage.readBestTimeMs();
      if (best === null || result.elapsedMs < best) {
        this.deps.storage.writeBestTimeMs(result.elapsedMs);
        this.bestTimeMs = result.elapsedMs;
        isNewBest = true;
      } else {
        this.bestTimeMs = best;
      }
    }

    this.state = { ...this.state, result: { ...result, isNewBest } };
  }
}

const FALLBACK_ATTITUDE = {
  alpha: 0,
  beta: 90,
  gamma: 0,
  screenAngle: 0,
  absolute: false,
} as const;

/** 距離とフェーズに応じた音量（設計書 05.5） */
function intensityOf(ghost: Ghost, config: GameConfig): number {
  if (ghost.phase === 'BANISHED') return 0;
  if (ghost.phase === 'HELD') return 0.3;
  if (ghost.phase === 'GRABBING') return 1;

  const far = config.visibleMaxDistance;
  const closeness = clamp01((far - ghost.distance) / far);
  return 0.15 + closeness * 0.85;
}
