import type { AudioPort, OneShotSound } from '@/application/ports';
import type { GhostId, Vector3Like } from '@/shared/types';
import { ONE_SHOT_SPECS, createVoice, playOneShot } from './ProceduralVoice';
import type { Voice } from './ProceduralVoice';

interface GhostNode {
  readonly voice: Voice;
  readonly panner: PannerNode;
  readonly gain: GainNode;
}

const EYE_HEIGHT = 1.6;

export class WebAudioAdapter implements AudioPort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private readonly nodes = new Map<GhostId, GhostNode>();
  private muted: boolean;
  private seedCounter = 0;
  private failed = false;

  constructor(initiallyMuted = false) {
    this.muted = initiallyMuted;
  }

  /**
   * モバイルでは AudioContext はユーザー操作なしに running にならない。
   * START タップのハンドラ内から呼ぶこと（設計書 05.5）。
   */
  async unlock(): Promise<void> {
    if (this.failed) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.master === null) {
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;

        // 音量のピークを抑えるリミッターを常時挿入する（設計書 06.6）
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -6;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.25;

        this.master.connect(this.limiter).connect(this.ctx.destination);
      }

      // リスナーの位置は常に原点（目の高さ）で固定し、向きだけを更新する。
      // プレイヤーは移動しないという世界モデルと一致する（設計書 05.5）
      const listener = this.ctx.listener;
      listener.positionX.value = 0;
      listener.positionY.value = EYE_HEIGHT;
      listener.positionZ.value = 0;

      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      // 初期化失敗は非致命。無音で続行する（設計書 02.7）
      this.failed = true;
    }
  }

  setListenerOrientation(forward: Vector3Like, up: Vector3Like): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    const listener = ctx.listener;
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  }

  attachGhost(id: GhostId): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || this.nodes.has(id)) return;

    const panner = ctx.createPanner();
    // HRTF は equalpower より高コストだが、前後・上下の定位に必要。
    // equalpower では背後からの接近に気づけない（設計書 05.5）
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 20;
    panner.rolloffFactor = 1.2;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const voice = createVoice(ctx, this.seedCounter++ % 7);
    voice.output.connect(panner).connect(gain).connect(master);

    this.nodes.set(id, { voice, panner, gain });
  }

  updateGhost(id: GhostId, position: Vector3Like, intensity: number): void {
    const node = this.nodes.get(id);
    const ctx = this.ctx;
    if (node === undefined || ctx === null) return;

    node.panner.positionX.value = position.x;
    node.panner.positionY.value = position.y;
    node.panner.positionZ.value = position.z;
    node.gain.gain.setTargetAtTime(intensity, ctx.currentTime, 0.08);
  }

  detachGhost(id: GhostId): void {
    const node = this.nodes.get(id);
    if (node === undefined) return;
    node.voice.stop();
    node.panner.disconnect();
    node.gain.disconnect();
    this.nodes.delete(id);
  }

  clearGhosts(): void {
    for (const id of [...this.nodes.keys()]) this.detachGhost(id);
  }

  playOneShot(kind: OneShotSound): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    playOneShot(ctx, master, ONE_SHOT_SPECS[kind]);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null && this.ctx !== null) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  describe(): string {
    if (this.failed) return 'failed';
    if (this.ctx === null) return 'locked';
    return `${this.ctx.state} ${this.ctx.sampleRate}Hz`;
  }
}

/** 音を一切出さない実装。?mute=1 で使う */
export class NullAudioAdapter implements AudioPort {
  unlock(): Promise<void> {
    return Promise.resolve();
  }
  setListenerOrientation(): void {
    /* 何もしない */
  }
  attachGhost(): void {
    /* 何もしない */
  }
  updateGhost(): void {
    /* 何もしない */
  }
  detachGhost(): void {
    /* 何もしない */
  }
  clearGhosts(): void {
    /* 何もしない */
  }
  playOneShot(): void {
    /* 何もしない */
  }
  setMuted(): void {
    /* 何もしない */
  }
  describe(): string {
    return 'disabled';
  }
}
