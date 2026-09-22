import type { SoundKey } from '@/domain/multiplayer/NetMessages';
import { mixToMono } from './VoiceSample';

/**
 * 妨害音を空間音響で鳴らす（設計書 10.8）。
 *
 * 音源は base64 で埋め込まれており（mp3 をそのまま配置しない方針）、
 * 動的 import で取得する。音を鳴らすのはホストだけなので、妨害側の端末は
 * この 400KB 超のデータを読み込まない。
 *
 * 再生時は必ずモノラル化してから PannerNode へ渡す。ステレオのまま渡すと
 * ファイルの左右の音像と HRTF の定位が干渉し、方向が曖昧になる（設計書 05.5）。
 */

/** base64 を ArrayBuffer へ。fetch を使わないので同一オリジン取得も発生しない */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** デコード済みのモノラル音源を 1 本のバッファへ */
function toMonoBuffer(ctx: BaseAudioContext, decoded: AudioBuffer): AudioBuffer {
  const channels: Float32Array[] = [];
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    channels.push(decoded.getChannelData(c));
  }
  const mono = mixToMono(channels);
  const out = ctx.createBuffer(1, mono.length, decoded.sampleRate);
  out.getChannelData(0).set(mono, 0);
  return out;
}

export class SoundBank {
  private readonly buffers = new Map<SoundKey, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private failed = false;

  constructor(private readonly ctx: AudioContext) {}

  /**
   * 音源を読み込む。ホストになったときに一度だけ呼ぶ。
   * 失敗しても例外を投げない。鳴らないだけでゲームは続く。
   */
  load(): Promise<void> {
    this.loading ??= this.doLoad();
    return this.loading;
  }

  get ready(): boolean {
    return this.buffers.size > 0;
  }

  get broken(): boolean {
    return this.failed;
  }

  /**
   * 指定位置から 1 回鳴らす。
   *
   * @param position プレイヤーを原点とするワールド座標
   */
  play(
    key: SoundKey,
    position: { x: number; y: number; z: number },
    destination: AudioNode,
  ): void {
    const buffer = this.buffers.get(key);
    if (buffer === undefined) return;

    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1.1;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const gain = this.ctx.createGain();
    gain.gain.value = 1;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(panner).connect(gain).connect(destination);

    // 鳴り終わったノードは切り離す。鳴らしっぱなしで溜めない
    source.onended = (): void => {
      source.disconnect();
      panner.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  private async doLoad(): Promise<void> {
    try {
      // 動的 import。妨害側はここへ到達しないため読み込まれない
      const data = await import('./sounds/data');
      const entries: readonly (readonly [SoundKey, string])[] = [
        ['knock', data.knock],
        ['drop', data.drop],
        ['footsteps', data.footsteps],
        ['roll', data.roll],
        ['glass', data.glass],
      ];

      for (const [key, base64] of entries) {
        try {
          const decoded = await this.ctx.decodeAudioData(base64ToBuffer(base64));
          this.buffers.set(key, toMonoBuffer(this.ctx, decoded));
        } catch {
          // 1 つ壊れていても他は使えるようにする
        }
      }
      if (this.buffers.size === 0) this.failed = true;
    } catch {
      this.failed = true;
    }
  }
}
