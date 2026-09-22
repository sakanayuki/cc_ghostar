import './presentation/styles.css';

import { Game } from '@/application/Game';
import type { GameView } from '@/application/Game';
import { HostSession, IntruderSession } from '@/application/MultiplayerSession';
import type {
  AudioPort,
  CameraPort,
  HapticsPort,
  MotionPort,
  OrientationPort,
} from '@/application/ports';
import type { NetError, NetStatus } from '@/application/ports/NetworkPort';
import { DEFAULT_CONFIG, withOverrides } from '@/domain/config/GameConfig';
import { generateRoomCode } from '@/domain/multiplayer/RoomCode';
import type { NetMessage } from '@/domain/multiplayer/NetMessages';

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
import { NullNetworkAdapter } from '@/infrastructure/net/NullNetworkAdapter';
import { PeerNetworkAdapter } from '@/infrastructure/net/PeerNetworkAdapter';
import { createGhostViewFactory } from '@/infrastructure/rendering/GltfGhostView';
import { ThreeSceneAdapter } from '@/infrastructure/rendering/ThreeSceneAdapter';
import { LocalStorageAdapter } from '@/infrastructure/storage/LocalStorageAdapter';

import { CalibrationScreen } from '@/presentation/CalibrationScreen';
import { DebugHud } from '@/presentation/DebugHud';
import { Hud } from '@/presentation/Hud';
import { IntruderView } from '@/presentation/IntruderView';
import { LobbyScreen } from '@/presentation/LobbyScreen';
import { ModeScreen } from '@/presentation/ModeScreen';
import { OverlayMessage, Toast } from '@/presentation/OverlayMessage';
import { ResultScreen } from '@/presentation/ResultScreen';
import { TitleScreen } from '@/presentation/TitleScreen';
import { require as requireEl } from '@/presentation/dom';

import { parseRuntimeOptions } from '@/shared/RuntimeOptions';

type Flow = 'MODE' | 'LOBBY' | 'SOLO' | 'INTRUDER';

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

  const { factory, usingGlb } = await createGhostViewFactory();
  const scene = new ThreeSceneAdapter(canvas, config, factory);

  const net = new PeerNetworkAdapter();

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

  let flow: Flow = 'MODE';
  let multiplayer = false;
  let hostSession: HostSession | null = null;
  let intruder: IntruderSession | null = null;
  let intruderLoop = 0;

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

  const mode = new ModeScreen({
    onSingle: () => {
      multiplayer = false;
      setFlow('SOLO');
    },
    onHost: () => {
      multiplayer = true;
      void startHosting();
    },
    onJoin: () => {
      multiplayer = true;
      setFlow('LOBBY');
      lobby.showJoin();
      lobby.setStatus('');
    },
    onBack: () => setFlow('MODE'),
  });

  const lobby = new LobbyScreen({
    onStart: () => {
      setFlow('SOLO');
    },
    onJoinSubmit: (code) => {
      void joinRoom(code);
    },
    onCancel: () => {
      net.disconnect();
      hostSession = null;
      intruder = null;
      setFlow('MODE');
    },
  });

  const intruderView = new IntruderView({
    onPlace: (sound, x, z) => {
      if (intruder === null) return;
      if (intruder.requestSound(sound, x, z)) {
        intruderView.startCooldown(intruder.cooldownState);
        intruderView.addMarker(x, z, clock.now());
      }
    },
  });

  ui.append(
    hud.root,
    title.root,
    calibration.root,
    result.root,
    mode.root,
    lobby.root,
    intruderView.root,
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

  function setFlow(next: Flow): void {
    flow = next;
    mode.setVisible(next === 'MODE');
    lobby.setVisible(next === 'LOBBY');
    intruderView.setVisible(next === 'INTRUDER');
    // SOLO のときだけ、従来のゲーム画面群が表示対象になる
    if (next !== 'SOLO') {
      title.setVisible(false);
      calibration.setVisible(false);
      result.setVisible(false);
      hud.setVisible(false);
    } else {
      render(game.view());
    }
  }

  // ── ホストになる ──────────────────────────────
  async function startHosting(): Promise<void> {
    const code = generateRoomCode(() => Math.random());
    setFlow('LOBBY');
    lobby.showHost(code);
    lobby.setMembers(0);
    lobby.setStatus('部屋を準備しています…');

    hostSession = new HostSession(net, clock);

    await net.host(code, {
      onStatus: (s: NetStatus) => {
        if (s === 'WAITING')
          lobby.setStatus('部屋ができました。コードを伝えてください。');
      },
      onMessage: (peerId, message: NetMessage) => {
        if (message.type !== 'SOUND') return;
        // ホストの時計で判定する。相手の申告した時刻は信用しない
        if (hostSession?.acceptSound(peerId, message) !== true) return;
        audio.playInterference(message.sound, { x: message.x, y: 0, z: message.z });
      },
      onPeerJoin: () => {
        lobby.setMembers(net.peers().length);
      },
      onPeerLeave: (peerId) => {
        hostSession?.forget(peerId);
        lobby.setMembers(net.peers().length);
      },
      onError: (e: NetError) => {
        lobby.setStatus(e.message);
      },
    });

    // 音源はホストだけが読み込む（400KB 超あるため）
    void audio.loadInterferenceSounds();
  }

  // ── 妨害側として参加する ──────────────────────
  async function joinRoom(code: string): Promise<void> {
    lobby.setStatus('接続しています…');
    intruder = new IntruderSession(net, clock);

    await net.join(code, {
      onStatus: (s: NetStatus) => {
        if (s === 'CONNECTED') {
          lobby.setStatus('接続しました。');
          setFlow('INTRUDER');
          startIntruderLoop();
        }
        if (s === 'CLOSED' && flow === 'INTRUDER') {
          stopIntruderLoop();
          overlay.show({
            title: '接続が切れました',
            lines: ['探索する人との接続が切れました。'],
          });
        }
      },
      onMessage: (_peerId, message: NetMessage) => {
        if (intruder === null) return;
        switch (message.type) {
          case 'SNAPSHOT':
            intruder.onSnapshot(message);
            break;
          case 'SOUND':
            // 他の妨害者が鳴らした音。波紋だけ見せる
            intruderView.addMarker(message.x, message.z, clock.now());
            break;
          case 'RESULT':
            intruder.setOutcome(message.outcome);
            stopIntruderLoop();
            overlay.show({
              title: message.outcome === 'FAILED' ? 'あなたの勝ち' : 'あなたの負け',
              lines: [
                message.outcome === 'FAILED'
                  ? '探索する人は捕まりました。'
                  : `探索する人は ${message.totalCount} 体すべてを浄化しました。`,
              ],
            });
            break;
          default:
            break;
        }
      },
      onPeerJoin: () => {
        /* ホストとの 1 本だけなので特に何もしない */
      },
      onPeerLeave: () => {
        stopIntruderLoop();
        overlay.show({
          title: '接続が切れました',
          lines: ['探索する人との接続が切れました。'],
        });
      },
      onError: (e: NetError) => {
        lobby.setStatus(e.message);
      },
    });
  }

  function startIntruderLoop(): void {
    if (intruderLoop !== 0) return;
    const tick = (): void => {
      const world = intruder?.predict() ?? null;
      if (world !== null) {
        intruderView.update(
          {
            yaw: world.yaw,
            light: world.light,
            ghosts: world.ghosts,
            remaining: world.remaining,
            elapsedMs: world.elapsedMs,
            connected: net.status() === 'CONNECTED',
          },
          clock.now(),
        );
      }
      intruderLoop = requestAnimationFrame(tick);
    };
    intruderLoop = requestAnimationFrame(tick);
  }

  function stopIntruderLoop(): void {
    if (intruderLoop === 0) return;
    cancelAnimationFrame(intruderLoop);
    intruderLoop = 0;
  }

  let torchNoticeShown = false;
  let resultAnnounced = false;

  function render(view: GameView): void {
    if (flow !== 'SOLO') return;
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

    // ── 妨害側へ状態を配る ──
    if (multiplayer && hostSession !== null) {
      if (playing) {
        resultAnnounced = false;
        hostSession.publish(game.snapshotData(), view.state.elapsedMs);
      }
      const finished = view.state.result;
      if (phase === 'RESULT' && finished !== null && !resultAnnounced) {
        resultAnnounced = true;
        hostSession.announceResult(
          finished.outcome,
          finished.elapsedMs,
          finished.purifiedCount,
          finished.totalCount,
        );
      }
    }

    debug?.update();
  }

  game.subscribe(render);

  // ── ライフサイクル（設計書 05.9）─────────────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      game.pause();
    } else {
      void game.resume();
    }
  });

  window.addEventListener('pagehide', () => {
    net.disconnect();
    game.dispose();
  });

  window.addEventListener('resize', () => {
    scene.resize(window.innerWidth, window.innerHeight);
    hud.layoutReticle(scene.fieldOfView());
    intruderView.resize();
  });

  screen.onOrientationChange(() => {
    scene.resize(window.innerWidth, window.innerHeight);
    hud.layoutReticle(scene.fieldOfView());
    intruderView.resize();
  });

  game.boot();

  if (options.intruderPreview) {
    startIntruderPreview();
  } else {
    setFlow('MODE');
  }

  /**
   * 妨害側の画面を合成データで動かす（設計書 10.9）。
   * 通信を張らないので、1 台だけで見た目と操作感を確認できる。
   */
  function startIntruderPreview(): void {
    // 本番と同じ IntruderSession を使う。回線だけを無効なものに差し替えるので、
    // クールダウンや波紋の挙動は本番とまったく同じになる
    intruder = new IntruderSession(new NullNetworkAdapter(), clock);
    setFlow('INTRUDER');
    const started = clock.now();
    const tick = (): void => {
      const t = (clock.now() - started) / 1000;
      intruderView.update(
        {
          // ゆっくり見回している様子を作る
          yaw: Math.sin(t * 0.35) * 2.2,
          light: true,
          ghosts: [
            {
              id: 'g0',
              azimuth: 2.1 + Math.sin(t * 0.2) * 0.3,
              distance: Math.max(1, 9 - (t % 30) * 0.25),
              phase: t % 10 < 3 ? 'HELD' : 'APPROACHING',
              purify: t % 10 < 3 ? ((t % 10) / 3) * 0.8 : 0,
            },
          ],
          remaining: 2,
          elapsedMs: clock.now() - started,
          connected: true,
        },
        clock.now(),
      );
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

void bootstrap();
