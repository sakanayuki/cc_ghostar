import type { GameConfig } from '@/domain/config/GameConfig';
import { ghostId } from '@/shared/types';
import type { Meters, Radians } from '@/shared/types';
import { lerp, normalizeAngle } from '@/domain/math/Angles';
import type { Ghost } from './Ghost';

const TAU = Math.PI * 2;

/**
 * 現在の視線方向から一定以上離れた方位を選ぶ。
 *
 * 視線を中心とする「出現禁止の扇」の外側、すなわち残りの弧の中から
 * 一様に選ぶ。棄却サンプリングを使わないので必ず 1 回で決まる
 * （設計書 04.7）。
 */
export function pickSpawnAzimuth(
  viewYaw: Radians,
  minAngleFromView: Radians,
  random: () => number,
): Radians {
  // 禁止扇の半角。円周を食い尽くさないよう上限を設ける
  const forbidden = Math.min(Math.abs(minAngleFromView), Math.PI * 0.9);
  // 許される弧の長さ（視線の裏側を中心とする弧）
  const allowed = TAU - forbidden * 2;
  // 視線の反対側を起点に、許容弧の中から一様に選ぶ
  const offset = forbidden + random() * allowed;
  return normalizeAngle(viewYaw + offset) as Radians;
}

/**
 * ゴーストを 1 体生成する。乱数は引数で受け取るため純粋関数である。
 *
 * 同時に存在するのは常に 1 体であり、浄化されると次が呼ばれる
 * （設計書 04.1）。
 *
 * @param index 0 起点の通し番号。ID と速度倍率の決定に使う
 * @param viewYaw 生成時点でプレイヤーが向いているワールド方位
 */
export function spawnOne(
  config: GameConfig,
  index: number,
  viewYaw: Radians,
  random: () => number,
): Ghost {
  const azimuth = pickSpawnAzimuth(viewYaw, config.spawnMinAngleFromView, random);

  return {
    id: ghostId(`ghost-${index}`),
    azimuth,
    baseAzimuth: azimuth,
    distance: lerp(config.spawnDistanceMin, config.spawnDistanceMax, random()) as Meters,
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
  };
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
