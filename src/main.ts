import './presentation/styles.css';

import { Game } from '@/application/Game';
import type { GameView } from '@/application/Game';
import type {
  AudioPort,
  CameraPort,
  HapticsPort,
  MotionPort,
  OrientationPort,
} from '@/application/ports';
import { DEFAULT_CONFIG, withOverrides } from '@/domain/config/GameConfig';

import { MediaCameraAdapter } from '@/infrastructure/camera/MediaCameraAdapter';
import { MediaTorchAdapter } from '@/infrastructure/camera/MediaTorchAdapter';
import { MockCameraAdapter } from '@/infrastructure/camera/MockCameraAdapter';
import { DeviceMotionAdapter } from '@/infrastructure/sensors/DeviceMotionAdapter';
import { DeviceOrientationAdapter } from '@/infrastructure/sensors/DeviceOrientationAdapter';
import { MockMotionAdapter } from '@/infrastructure/sensors/MockMotionAdapter';
import { MockOrientationAdapter } from '@/infrastructure/sensors/MockOrientationAdapter';
import {
  NullAudioAdapter,
  WebAudioAdapter,
} from '@/infrastructure/audio/WebAudioAdapter';
import { detectCapabilities } from '@/infrastructure/device/CapabilityDetector';
import { PerformanceClock } from '@/infrastructure/device/PerformanceClock';
import { ScreenAdapter } from '@/infrastructure/device/ScreenAdapter';
import {
  NullHapticsAdapter,
  VibrationAdapter,
} from '@/infrastructure/device/VibrationAdapter';
import { createGhostViewFactory } from '@/infrastructure/rendering/GltfGhostView';
import { ThreeSceneAdapter } from '@/infrastructure/rendering/ThreeSceneAdapter';
import { LocalStorageAdapter } from '@/infrastructure/storage/LocalStorageAdapter';

import { CalibrationScreen } from '@/presentation/CalibrationScreen';
import { DebugHud } from '@/presentation/DebugHud';
import { Hud } from '@/presentation/Hud';
import { OverlayMessage, Toast } from '@/presentation/OverlayMessage';
import { ResultScreen } from '@/presentation/ResultScreen';
import { TitleScreen } from '@/presentation/TitleScreen';
import { require as requireEl } from '@/presentation/dom';

import { parseRuntimeOptions } from '@/shared/RuntimeOptions';

async function bootstrap(): Promise<void> {
  const options = parseRuntimeOptions(window.location.search);
  const config = withOverrides(DEFAULT_CONFIG, {
    ghosts: options.ghosts,
    speed: options.speed,
  });

  const video = requireEl<HTMLVideoElement>('#camera');
  const canvas = requireEl<HTMLCanvasElement>('#scene');
  const ui = requireEl<HTMLElement>('#ui');
  const debugNode = requireEl<HTMLElement>('#debug');

  const capabilities = detectCapabilities();
  const screen = new ScreenAdapter();
  const storage = new LocalStorageAdapter();
  const clock = new PerformanceClock();

  const camera: CameraPort = options.mock
    ? new MockCameraAdapter(video)
    : new MediaCameraAdapter(video);
  const torch = new MediaTorchAdapter(options.noTorch || options.mock);

  const orientation: OrientationPort = options.mock
    ? new MockOrientationAdapter()
    : new DeviceOrientationAdapter(screen);
  const motion: MotionPort = options.mock
    ? new MockMotionAdapter()
    : new DeviceMotionAdapter();

  const audio: AudioPort = options.mute ? new NullAudioAdapter() : new WebAudioAdapter();
  const haptics: HapticsPort = options.mute
    ? new NullHapticsAdapter()
    : new VibrationAdapter();

  // GLB があれば使い、なければプレースホルダへフォールバックする
  const { factory, usingGlb } = await createGhostViewFactory();
  const scene = new ThreeSceneAdapter(canvas, config, factory);

  const game = new Game({
    camera,
    torch,
    orientation,
    motion,
    audio,
    scene,
    haptics,
    screen,
    storage,
    clock,
    config,
    random: () => Math.random(),
    capabilities,
    allowMock: options.mock,
  });

  // ── UI の組み立て ────────────────────────────
  const title = new TitleScreen({
    onStart: () => {
      void game.start();
    },
  });
  const calibration = new CalibrationScreen({
    onConfirm: () => {
      hud.resetEffects();
      game.confirmCalibration();
    },
  });
  const result = new ResultScreen({ onRetry: () => game.backToTitle() });
  const overlay = new OverlayMessage();
  const toast = new Toast();
  const hud = new Hud(config, {
    onToggleLight: () => game.toggleLight(),
    onRecalibrate: () => game.recalibrateNow(),
  });

  ui.append(
    hud.root,
    title.root,
    calibration.root,
    result.root,
    overlay.root,
    toast.root,
  );
  hud.layoutReticle(scene.fieldOfView());

  const debug = options.debug
    ? new DebugHud(debugNode, {
        game,
        camera,
        torch,
        orientation,
        motion,
        audio,
        scene,
        usingGlb,
        mock: options.mock,
      })
    : null;

  let torchNoticeShown = false;

  game.subscribe((view: GameView) => {
    const phase = view.state.phase;

    title.setVisible(phase === 'TITLE');
    title.update(view.bestTimeMs);
    calibration.setVisible(phase === 'CALIBRATION');
    result.setVisible(phase === 'RESULT');
    result.update(view.state.result, view.bestTimeMs);

    const playing = phase === 'PLAYING' || phase === 'PAUSED';
    hud.setVisible(playing);
    if (playing) hud.update(view);
    hud.setBlackout(view.state.pendingOutcome === 'FAILED');

    document.body.classList.toggle('immersive', playing);

    switch (phase) {
      case 'ERROR_CAMERA':
        overlay.show({
          title: 'カメラを利用できません',
          lines: [
            'カメラへのアクセスが必要です。',
            'ブラウザの設定から許可してください。',
          ],
          retry: () => {
            overlay.hide();
            game.retryCamera();
          },
        });
        break;
      case 'ERROR_SENSOR':
        overlay.show({
          title: '起動できません',
          lines: ['端末の方向センサーを利用できません。'],
        });
        break;
      case 'ERROR_WEBGL':
        overlay.show({
          title: '起動できません',
          lines: [
            'お使いのブラウザでは動作しません。',
            'Android の Chrome でお試しください。',
          ],
        });
        break;
      default:
        overlay.hide();
        break;
    }

    // Torch 非対応は一度だけ告知する。ゲームは問題なく遊べることを明示する
    if (
      !torchNoticeShown &&
      phase === 'CALIBRATION' &&
      torch.availability() !== 'AVAILABLE'
    ) {
      torchNoticeShown = true;
      toast.show([
        'この端末ではライト制御に対応していません。',
        '画面内のライトだけで探索します。',
      ]);
    }

    debug?.update();
  });

  // ── ライフサイクル（設計書 05.9）─────────────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      game.pause();
    } else {
      void game.resume();
    }
  });

  window.addEventListener('pagehide', () => {
    game.dispose();
  });

  window.addEventListener('resize', () => {
    scene.resize(window.innerWidth, window.innerHeight);
    hud.layoutReticle(scene.fieldOfView());
  });

  screen.onOrientationChange(() => {
    scene.resize(window.innerWidth, window.innerHeight);
    hud.layoutReticle(scene.fieldOfView());
  });

  game.boot();
}

void bootstrap();
