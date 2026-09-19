import { MathUtils } from 'three';
import type { Meters, Radians } from '@/shared/types';

const deg = (d: number): Radians => MathUtils.degToRad(d) as Radians;
const m = (v: number): Meters => v as Meters;

/** 調整可能な値の集約。他のファイルにマジックナンバーを置かないこと（設計書 04.4） */
export interface GameConfig {
  // ── 世界構成 ──────────────────────────────
  readonly ghostCount: number;
  readonly spawnDistanceMin: Meters;
  readonly spawnDistanceMax: Meters;
  /** 個体間の最小方位差。固まって出現するのを防ぐ */
  readonly minSeparationAzimuth: Radians;
  /** スポーン時、正面から最低これだけ離す */
  readonly spawnFrontClearance: Radians;
  readonly heightOffsetMin: Meters;
  readonly heightOffsetMax: Meters;
  /** プレイヤーの目の高さ */
  readonly eyeHeight: number;

  // ── 光 ────────────────────────────────────
  /**
   * 捕捉できる光錐の半頂角。
   *
   * 縦持ちでの制約は水平方向の視野である。カメラ FOV 60 度は「垂直」の
   * 値であり、アスペクト比 390:844 では水平の半視野はおよそ 15 度しかない。
   * ここを 15 度より広く取ると、画面の外にいるゴーストを捕捉できてしまい、
   * 「狙って当てる」というルールが成立しなくなる。
   */
  readonly beamHalfAngle: Radians;
  /**
   * 薄く視認できる限界の半頂角。beamHalfAngle より広く、
   * 水平の半視野（約 15 度）に収まる値にする。
   */
  readonly visibleHalfAngle: Radians;
  readonly visibleMaxDistance: Meters;

  // ── 接近 ──────────────────────────────────
  /** 基準接近速度（m/s） */
  readonly approachSpeed: number;
  /** 照射 OFF 中に掛かる速度倍率 */
  readonly lightOffSpeedMultiplier: number;
  /** 残存数に応じた速度倍率。index = 残り体数 - 1 */
  readonly speedByRemaining: readonly number[];

  // ── 方位の揺らぎ ──────────────────────────
  readonly wobbleAmplitude: Radians;
  readonly wobbleFrequencyHz: number;

  // ── 浄化 ──────────────────────────────────
  readonly purifyDurationSec: number;
  readonly purifyDecayPerSec: number;
  readonly banishAnimationMs: number;

  // ── 掴みかかりと振り払い ──────────────────
  readonly grabDistance: Meters;
  readonly grabGraceMs: number;
  readonly maxEscapes: number;
  readonly escapePushback: Meters;

  // ── 演出 ──────────────────────────────────
  readonly resultDelayMs: number;
  readonly hapticWarnDistance: Meters;
}

export const DEFAULT_CONFIG: GameConfig = {
  ghostCount: 3,
  spawnDistanceMin: m(6),
  spawnDistanceMax: m(10),
  minSeparationAzimuth: deg(100),
  spawnFrontClearance: deg(60),
  heightOffsetMin: m(-0.25),
  heightOffsetMax: m(0.15),
  eyeHeight: 1.6,

  beamHalfAngle: deg(8),
  visibleHalfAngle: deg(14),
  visibleMaxDistance: m(12),

  approachSpeed: 0.22,
  lightOffSpeedMultiplier: 1.6,
  speedByRemaining: [1.7, 1.35, 1.0],

  wobbleAmplitude: deg(30),
  wobbleFrequencyHz: 0.08,

  purifyDurationSec: 3.5,
  purifyDecayPerSec: 0.15,
  banishAnimationMs: 1200,

  grabDistance: m(0.8),
  grabGraceMs: 1500,
  maxEscapes: 2,
  escapePushback: m(2.0),

  resultDelayMs: 1400,
  hapticWarnDistance: m(2.5),
};

/** 起動オプションによる上書き（設計書 06.5） */
export function withOverrides(
  base: GameConfig,
  overrides: { ghosts?: number | null; speed?: number | null },
): GameConfig {
  const ghostCount =
    overrides.ghosts !== null && overrides.ghosts !== undefined && overrides.ghosts > 0
      ? Math.min(Math.floor(overrides.ghosts), 12)
      : base.ghostCount;
  const approachSpeed =
    overrides.speed !== null && overrides.speed !== undefined && overrides.speed > 0
      ? overrides.speed
      : base.approachSpeed;

  return { ...base, ghostCount, approachSpeed };
}
