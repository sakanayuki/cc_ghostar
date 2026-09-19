/**
 * 外部の音声ファイルを「空間音響に載せられる形」へ整える。
 *
 * PannerNode(HRTF) は入力をモノラルとして扱うのが前提である。ステレオを
 * そのまま渡すと、ファイルが持つ左右の音像と HRTF の定位が干渉し、方向が
 * 曖昧になる（設計書 05.5）。そのため読み込み時にモノラルへ落とす。
 */

/** クリップの後ろに入れる無音の長さ。台詞が途切れなく続くのを避ける */
export const VOICE_GAP_SEC = 1.5;

/**
 * 複数チャンネルを 1 本へ平均化する。純粋関数。
 *
 * 入力が実質デュアルモノ（左右同一）であれば結果は元と一致する。
 */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (first === undefined) return new Float32Array(0);
  if (channels.length === 1) return first;

  const out = new Float32Array(first.length);
  for (const channel of channels) {
    const n = Math.min(channel.length, out.length);
    for (let i = 0; i < n; i++) out[i] = (out[i] as number) + (channel[i] as number);
  }
  const scale = 1 / channels.length;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) * scale;
  return out;
}

/** AudioBuffer の全チャンネルを取り出す */
function channelsOf(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  return channels;
}

/**
 * モノラル化し、末尾に無音を足した 1 本のバッファを返す。
 *
 * 無音を含めた全体をループさせることで、「鳴る → 間 → また鳴る」を
 * タイマーなしのサンプル精度で実現できる。
 */
export function toLoopableMonoBuffer(
  ctx: BaseAudioContext,
  decoded: AudioBuffer,
  gapSec = VOICE_GAP_SEC,
): AudioBuffer {
  const mono = mixToMono(channelsOf(decoded));
  const gapFrames = Math.max(0, Math.round(gapSec * decoded.sampleRate));
  const out = ctx.createBuffer(1, mono.length + gapFrames, decoded.sampleRate);
  out.getChannelData(0).set(mono, 0);
  return out;
}

/**
 * 同梱の音声を読み込む。存在しなければ null を返し、呼び出し側は
 * 手続き生成の音へフォールバックする（設計書 05.5）。
 */
export async function loadVoiceBuffer(
  ctx: BaseAudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  try {
    // 同一オリジンの同梱アセットのみ。外部送信は行わない（設計書 01.5）
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(url);
    if (!response.ok) return null;
    const encoded = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(encoded);
    return toLoopableMonoBuffer(ctx, decoded);
  } catch {
    return null;
  }
}
