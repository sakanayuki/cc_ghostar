/**
 * 音源をすべて手続き的に生成する。外部ファイルを一切持たない（設計書 05.5）。
 */

const NOISE_SECONDS = 2;

let noiseBuffer: AudioBuffer | null = null;

/** ピンクノイズに近い雑音。生成は 1 回だけ行い使い回す */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer !== null && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }

  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Voss-McCartney の簡易版でピンクノイズに寄せる
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }

  noiseBuffer = buffer;
  return buffer;
}

export interface Voice {
  readonly output: AudioNode;
  stop(): void;
}

/**
 * 幽霊の呻き声。ノイズをバンドパスで絞り、低周波 LFO で揺らすことで
 * 人の声とも風ともつかない不安定な音を作る。
 *
 * 個体ごとに seed を変え、帯域と揺らぎの周期をずらす。3 体の声が同一だと
 * 音で個体を区別できず、方向探索が成立しない。
 */
export function createVoice(ctx: AudioContext, seed: number): Voice {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 220 + seed * 80;
  band.Q.value = 6;

  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.55;

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18 + seed * 0.1;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.45;
  lfo.connect(lfoGain).connect(tremolo.gain);

  source.connect(band).connect(tremolo);
  source.start();
  lfo.start();

  return {
    output: tremolo,
    stop(): void {
      try {
        source.stop();
        lfo.stop();
      } catch {
        // 二重停止は無視する
      }
      source.disconnect();
      band.disconnect();
      tremolo.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
    },
  };
}

export interface OneShotSpec {
  readonly type: OscillatorType;
  readonly startHz: number;
  readonly endHz: number;
  readonly durationSec: number;
  readonly peak: number;
  readonly noise: boolean;
}

/**
 * 効果音の仕様。
 *
 * ピーク音量は通常の 1.4 倍までに抑える。イヤホン使用時に不快・有害な
 * 音量になることを避けるため（設計書 06.6）。
 */
export const ONE_SHOT_SPECS = {
  PURIFY_COMPLETE: {
    type: 'sine',
    startHz: 440,
    endHz: 1320,
    durationSec: 0.7,
    peak: 0.5,
    noise: false,
  },
  GRAB: {
    type: 'sawtooth',
    startHz: 180,
    endHz: 70,
    durationSec: 0.45,
    peak: 0.8,
    noise: true,
  },
  ESCAPE: {
    type: 'triangle',
    startHz: 120,
    endHz: 320,
    durationSec: 0.25,
    peak: 0.45,
    noise: true,
  },
  GAME_OVER: {
    type: 'sawtooth',
    startHz: 300,
    endHz: 55,
    durationSec: 0.4,
    peak: 1.0,
    noise: true,
  },
  GAME_CLEAR: {
    type: 'sine',
    startHz: 330,
    endHz: 990,
    durationSec: 1.1,
    peak: 0.6,
    noise: false,
  },
} as const satisfies Record<string, OneShotSpec>;

export function playOneShot(
  ctx: AudioContext,
  destination: AudioNode,
  spec: OneShotSpec,
): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(spec.peak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.durationSec);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.startHz, now);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(20, spec.endHz),
    now + spec.durationSec,
  );
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + spec.durationSec + 0.05);

  if (spec.noise) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(spec.peak * 0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + spec.durationSec);
    noise.connect(noiseGain).connect(destination);
    noise.start(now);
    noise.stop(now + spec.durationSec + 0.05);
    noise.onended = (): void => {
      noise.disconnect();
      noiseGain.disconnect();
    };
  }

  osc.onended = (): void => {
    osc.disconnect();
    gain.disconnect();
  };
}
