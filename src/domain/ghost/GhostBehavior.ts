import { Vector3 } from 'three';
import type { GameConfig } from '@/domain/config/GameConfig';
import type { LightState } from '@/domain/light/LightState';
import { clamp01, normalizeAngle } from '@/domain/math/Angles';
import { isInsideCone } from '@/domain/math/BeamCone';
import { directionTo, toPosition } from '@/domain/math/Spherical';
import type { Meters, Millis, Radians } from '@/shared/types';
import type { Ghost } from './Ghost';
import { isAlive } from './Ghost';
import type { DomainEvent } from './GhostEvents';

export interface StepInput {
  readonly ghosts: readonly Ghost[];
  /** 光軸（単位ベクトル、ワールド座標） */
  readonly beamAxis: Vector3;
  readonly light: LightState;
  /** このフレームでシェイクが検出されたか */
  readonly shook: boolean;
  /** 前フレームからの経過秒。上限でクランプ済み */
  readonly dt: number;
  /** セッション開始からの経過ミリ秒 */
  readonly elapsedMs: Millis;
  readonly config: GameConfig;
}

export interface StepOutput {
  readonly ghosts: readonly Ghost[];
  readonly events: readonly DomainEvent[];
}

// 毎フレーム呼ばれるため作業用インスタンスを再利用する（設計書 07.9）
const _pos = new Vector3();
const _dir = new Vector3();

/**
 * 初期方位を中心に、低周波で緩やかに揺らぐ方位を返す（設計書 04.5）。
 *
 * baseAzimuth からの相対量として毎フレーム再計算する。現在値に加算していく
 * 方式だと誤差が蓄積し、振れ幅の上限を保証できなくなる。
 */
export function wobbleAzimuth(
  baseAzimuth: Radians,
  seed: number,
  elapsedMs: Millis,
  config: GameConfig,
): Radians {
  const t = (elapsedMs / 1000) * config.wobbleFrequencyHz * Math.PI * 2;
  const wave = Math.sin(t + seed) * 0.7 + Math.sin(t * 0.37 + seed * 2.1) * 0.3;
  return normalizeAngle(baseAzimuth + wave * config.wobbleAmplitude) as Radians;
}

/** 接近速度。残存数と照射状態で倍率が掛かる（設計書 04.5） */
export function approachSpeedOf(input: StepInput): number {
  const table = input.config.speedByRemaining;
  const remaining = input.ghosts.filter(isAlive).length;

  let byRemaining = 1;
  if (table.length > 0) {
    const idx = Math.min(Math.max(remaining, 1), table.length) - 1;
    byRemaining = table[idx] ?? 1;
  }

  const byLight = input.light === 'OFF' ? input.config.lightOffSpeedMultiplier : 1;

  return input.config.approachSpeed * byRemaining * byLight;
}

/** ゴーストが光錐に捕捉されているか */
function isHeld(ghost: Ghost, azimuth: Radians, input: StepInput): boolean {
  if (input.light === 'OFF') return false;
  toPosition(azimuth, ghost.distance, input.config.eyeHeight, ghost.heightOffset, _pos);
  directionTo(_pos, input.config.eyeHeight, _dir);
  return isInsideCone(input.beamAxis, _dir, input.config.beamHalfAngle);
}

/**
 * 1 フレーム分の状態遷移。
 *
 * 評価の順序が結果を変えるため、設計書 04.5 の順序を守ること。
 */
export function step(input: StepInput): StepOutput {
  const { config, dt, elapsedMs } = input;
  const events: DomainEvent[] = [];
  const speed = approachSpeedOf(input);

  const ghosts = input.ghosts.map((ghost): Ghost => {
    // 1. BANISHED なら何もしない
    if (ghost.phase === 'BANISHED') return ghost;

    // 2. 方位を更新する。静止中と掴みかかり中は揺らさない
    const azimuth =
      ghost.phase === 'APPROACHING'
        ? wobbleAzimuth(ghost.baseAzimuth, ghost.wobbleSeed, elapsedMs, config)
        : ghost.azimuth;

    // 3. 捕捉判定
    const held = isHeld(ghost, azimuth, input);

    // 4-1. 掴みかかり中
    if (ghost.phase === 'GRABBING') {
      if (input.shook && ghost.escapeCount < config.maxEscapes) {
        events.push({ type: 'GHOST_ESCAPED', id: ghost.id });
        return {
          ...ghost,
          azimuth,
          phase: 'APPROACHING',
          distance: (ghost.distance + config.escapePushback) as Meters,
          escapeCount: ghost.escapeCount + 1,
          grabStartedAt: null,
        };
      }

      const grabbedFor = elapsedMs - (ghost.grabStartedAt ?? elapsedMs);
      if (grabbedFor >= config.grabGraceMs) {
        events.push({ type: 'PLAYER_CAUGHT', id: ghost.id });
      }
      return { ...ghost, azimuth };
    }

    // 4-2. 捕捉されている
    if (held) {
      const purify = clamp01(ghost.purify + dt / config.purifyDurationSec);

      if (ghost.phase !== 'HELD') {
        events.push({ type: 'GHOST_HELD', id: ghost.id });
      }

      if (purify >= 1) {
        events.push({ type: 'GHOST_PURIFIED', id: ghost.id });
        return {
          ...ghost,
          azimuth,
          phase: 'BANISHED',
          purify: 1,
          banishedAt: elapsedMs,
        };
      }

      // 静止するため距離は変化しない
      return { ...ghost, azimuth, phase: 'HELD', purify };
    }

    // 4-3. 接近中
    if (ghost.phase === 'HELD') {
      events.push({ type: 'GHOST_RELEASED', id: ghost.id });
    }

    const purify = Math.max(0, ghost.purify - config.purifyDecayPerSec * dt);
    const nextDistance = ghost.distance - speed * dt;

    const crossedWarn =
      ghost.distance > config.hapticWarnDistance &&
      nextDistance <= config.hapticWarnDistance;
    if (crossedWarn) {
      events.push({ type: 'GHOST_WARN', id: ghost.id });
    }

    if (nextDistance <= config.grabDistance) {
      if (ghost.escapeCount >= config.maxEscapes) {
        events.push({ type: 'PLAYER_CAUGHT', id: ghost.id });
      } else {
        events.push({ type: 'GHOST_GRABBING', id: ghost.id });
      }
      return {
        ...ghost,
        azimuth,
        phase: 'GRABBING',
        purify,
        distance: config.grabDistance,
        grabStartedAt: elapsedMs,
      };
    }

    return {
      ...ghost,
      azimuth,
      phase: 'APPROACHING',
      purify,
      distance: nextDistance as Meters,
    };
  });

  return { ghosts, events };
}
