import type { GameConfig } from '@/domain/config/GameConfig';
import { ghostId } from '@/shared/types';
import type { Meters, Radians } from '@/shared/types';
import { lerp, normalizeAngle } from '@/domain/math/Angles';
import type { Ghost } from './Ghost';

const TAU = Math.PI * 2;

/**
 * 円周を n 個の隙間に分割する。各隙間は必ず minSeparation 以上になる。
 *
 * 棄却サンプリングを使わない。最小分離角が大きいと実行可能領域が極端に
 * 狭くなり、試行が失敗してフォールバックへ落ちるため（設計書 04.7）。
 * 隙間そのものを構成すれば制約は定義上満たされる。
 */
function pickGaps(count: number, minSeparation: number, random: () => number): number[] {
  // 要求された分離角が円周に収まらない場合は等分まで緩める
  const base = Math.min(minSeparation, TAU / count);
  const slack = TAU - base * count;

  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const w = random();
    weights.push(w);
    total += w;
  }
  if (total <= 0) {
    return new Array<number>(count).fill(TAU / count);
  }

  return weights.map((w) => base + (w / total) * slack);
}

/**
 * 配置全体を回転させ、最も広い隙間の中心を正面（方位 0）へ持ってくる。
 *
 * キャリブレーション直後、プレイヤーは正面を向いている。そこにゴーストが
 * いると開始と同時に捕捉が始まり、探索の体験が失われる（設計書 04.7）。
 * 得られる正面クリアランスは「最大の隙間の半分」であり、ゴースト数が
 * 多いほど小さくなる。
 */
function frontClearingRotation(
  azimuths: readonly number[],
  gaps: readonly number[],
): number {
  let widestIndex = 0;
  let widest = -1;
  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i] as number;
    if (gap > widest) {
      widest = gap;
      widestIndex = i;
    }
  }
  // gaps[i] は azimuths[i] から次の個体までの隙間
  const start = azimuths[widestIndex] as number;
  return -(start + widest / 2);
}

export function spawn(config: GameConfig, random: () => number): readonly Ghost[] {
  const count = Math.max(0, Math.floor(config.ghostCount));
  if (count === 0) return [];

  const gaps = pickGaps(count, config.minSeparationAzimuth, random);

  const raw: number[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    raw.push(cursor);
    cursor += gaps[i] as number;
  }

  const rotation = frontClearingRotation(raw, gaps);

  return raw.map((azimuthRaw, i) => {
    const azimuth = normalizeAngle(azimuthRaw + rotation) as Radians;
    return {
      id: ghostId(`ghost-${i}`),
      azimuth,
      baseAzimuth: azimuth,
      distance: lerp(
        config.spawnDistanceMin,
        config.spawnDistanceMax,
        random(),
      ) as Meters,
      heightOffset: lerp(
        config.heightOffsetMin,
        config.heightOffsetMax,
        random(),
      ) as Meters,
      phase: 'APPROACHING',
      purify: 0,
      grabStartedAt: null,
      escapeCount: 0,
      wobbleSeed: random() * TAU,
      banishedAt: null,
    } satisfies Ghost;
  });
}

/** 較正のやり直しに合わせてゴーストの方位を回す（設計書 03.4） */
export function recalibrate(
  ghosts: readonly Ghost[],
  yawShift: Radians,
): readonly Ghost[] {
  return ghosts.map((g) => ({
    ...g,
    azimuth: normalizeAngle(g.azimuth + yawShift) as Radians,
    baseAzimuth: normalizeAngle(g.baseAzimuth + yawShift) as Radians,
  }));
}
