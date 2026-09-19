import type { Game } from '@/application/Game';
import type {
  AudioPort,
  CameraPort,
  MotionPort,
  OrientationPort,
  ScenePort,
  TorchPort,
} from '@/application/ports';
import { formatDuration } from '@/domain/session/SessionResult';
import type { DeviceAttitude } from '@/domain/math/Attitude';

/** DOM の更新は間引く。毎フレーム更新すると計測対象を歪める（設計書 06.5） */
const UPDATE_EVERY = 4;

export interface DebugSources {
  readonly game: Game;
  readonly camera: CameraPort;
  readonly torch: TorchPort;
  readonly orientation: OrientationPort;
  readonly motion: MotionPort;
  readonly audio: AudioPort;
  readonly scene: ScenePort;
  readonly usingGlb: boolean;
  readonly mock: boolean;
}

export class DebugHud {
  private frame = 0;
  private lastPhase: string | null = null;

  constructor(
    private readonly node: HTMLElement,
    private readonly sources: DebugSources,
  ) {
    this.node.hidden = false;
  }

  update(): void {
    const { game, camera, torch, orientation, motion, audio, scene } = this.sources;
    const view = game.view();

    // 状態が変わったフレームは必ず描く。ゲームループが止まる遷移
    // （RESULT や PAUSED）では、この更新を落とすと表示が固まって見える
    const phaseChanged = view.state.phase !== this.lastPhase;
    this.lastPhase = view.state.phase;
    if (!phaseChanged && this.frame++ % UPDATE_EVERY !== 0) return;
    const stats = game.loopStats;
    const attitude = orientation.read();
    const accel = motion.debugMagnitudes();

    const lines: string[] = [
      `FPS      ${stats.fps.toFixed(0).padStart(3)}  (min ${stats.minFps.toFixed(0)})`,
      `frame    ${(1000 / Math.max(1, stats.fps)).toFixed(1)}ms`,
      '',
      `phase    ${view.state.phase}`,
      `camera   ${camera.describe()}`,
      `torch    ${torch.availability()} / ${torch.state()}`,
      `light    ${view.state.light}`,
      `sensor   ${describeSensor(orientation, this.sources.mock)}`,
      `ghostGfx ${this.sources.usingGlb ? 'glb' : 'procedural'}`,
      '',
      `orient   ${formatAttitude(attitude)}`,
      `screen   ${attitude?.screenAngle ?? 0}deg`,
      `fov      ${scene.fieldOfView()}`,
      `yaw      ${formatDeg(attitude === null ? null : game.calibrationService.worldYaw(attitude))}`,
      `calib    ${formatDeg(game.calibrationService.calibrationYaw())}`,
      '',
      `accel    ${accel.current.toFixed(1)}  (peak ${accel.peak.toFixed(1)})`,
      '',
      `wave     ${view.state.spawnedCount}/${game.totalGhosts}  purified ${view.state.purifiedCount}`,
      `nextSpawn ${view.state.nextSpawnAt === null ? '-' : Math.max(0, view.state.nextSpawnAt - view.state.elapsedMs).toFixed(0) + 'ms'}`,
      `ghosts   ${view.state.ghosts.filter((g) => g.phase !== 'BANISHED').length} alive`,
    ];

    for (const [index, ghost] of view.state.ghosts.entries()) {
      const opacity = view.views.find((v) => v.id === ghost.id)?.opacity ?? 0;
      lines.push(
        ` #${index} az ${formatDeg(ghost.azimuth).padStart(8)}  d ${ghost.distance.toFixed(2).padStart(5)}  ${ghost.phase}`,
        `    purify ${ghost.purify.toFixed(2)}  esc ${ghost.escapeCount}  vis ${opacity.toFixed(2)}`,
      );
    }

    lines.push(
      '',
      `audio    ${audio.describe()}`,
      `elapsed  ${formatDuration(view.state.elapsedMs)}`,
    );

    this.node.textContent = lines.join('\n');
  }
}

function describeSensor(orientation: OrientationPort, mock: boolean): string {
  const kind =
    'describe' in orientation && typeof orientation.describe === 'function'
      ? (orientation as { describe(): string }).describe()
      : orientation.isAvailable()
        ? 'available'
        : 'unavailable';
  return `${kind}  (mock: ${mock ? 'on' : 'off'})`;
}

function formatAttitude(attitude: DeviceAttitude | null): string {
  if (attitude === null) return '(none)';
  return `a ${attitude.alpha.toFixed(1)}  b ${attitude.beta.toFixed(1)}  g ${attitude.gamma.toFixed(1)}`;
}

function formatDeg(rad: number | null): string {
  if (rad === null) return '--';
  const deg = (rad * 180) / Math.PI;
  return `${deg >= 0 ? '+' : ''}${deg.toFixed(1)}`;
}
