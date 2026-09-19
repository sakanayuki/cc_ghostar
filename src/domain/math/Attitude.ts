import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { Radians } from '@/shared/types';
import { normalizeAngle } from './Angles';

/** デバイス姿勢。OrientationPort が供給する生の値（設計書 02.5） */
export interface DeviceAttitude {
  /** Z 軸回転（0〜360） */
  readonly alpha: number;
  /** X 軸回転（-180〜180） */
  readonly beta: number;
  /** Y 軸回転（-90〜90） */
  readonly gamma: number;
  /** screen.orientation.angle。姿勢補正に必須 */
  readonly screenAngle: number;
  /** 磁北基準の絶対方位か */
  readonly absolute: boolean;
}

const ZEE = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);

/** 画面が向く方向とカメラが向く方向の差（X 軸回り -90°） */
const SCREEN_TO_CAMERA = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

// 毎フレーム呼ばれるため作業用インスタンスを再利用する（設計書 07.9）
const _euler = new Euler();
const _screenQuat = new Quaternion();
const _forward = new Vector3();

/**
 * デバイス姿勢を Three.js のカメラ姿勢へ変換する（設計書 03.3）。
 *
 * 3 つの補正を順に適用する。
 *   1. オイラー角を YXZ 順で解釈し gamma の符号を反転する
 *   2. 画面が向く方向からカメラが向く方向へ回す
 *   3. 画面の回転角を打ち消す
 */
export function toCameraQuaternion(
  attitude: DeviceAttitude,
  out: Quaternion = new Quaternion(),
): Quaternion {
  const alpha = MathUtils.degToRad(attitude.alpha);
  const beta = MathUtils.degToRad(attitude.beta);
  const gamma = MathUtils.degToRad(attitude.gamma);
  const screen = MathUtils.degToRad(attitude.screenAngle);

  _euler.set(beta, alpha, -gamma, 'YXZ');
  out.setFromEuler(_euler);
  out.multiply(SCREEN_TO_CAMERA);
  out.multiply(_screenQuat.setFromAxisAngle(ZEE, -screen));

  return out;
}

/**
 * カメラ姿勢から水平方位（yaw）を取り出す。上下の傾きを無視する。
 *
 * atan2 の引数順に注意すること。-Z を 0 とし +X を正とする方位定義
 * （設計書 03.1）に対応している。
 */
export function extractYaw(q: Quaternion): Radians {
  _forward.set(0, 0, -1).applyQuaternion(q);
  return normalizeAngle(Math.atan2(_forward.x, -_forward.z)) as Radians;
}

/**
 * 現在の姿勢の yaw を打ち消す較正回転を求める（設計書 03.4）。
 *
 * 符号に注意すること。本プロジェクトの方位は atan2(x, -z) で定義した
 * 時計回り正（設計書 03.1）であり、Three.js の Y 軸回転とは向きが逆である。
 * そのため打ち消す回転は -yaw ではなく +yaw になる。
 * 較正後のワールド方位は rawYaw - calibYaw となる。
 */
export function computeCalibration(
  current: Quaternion,
  out: Quaternion = new Quaternion(),
): Quaternion {
  return out.setFromAxisAngle(UP, extractYaw(current));
}

/** 生の姿勢に較正を適用する。yaw のみが打ち消され、傾きは保たれる */
export function applyCalibration(
  raw: Quaternion,
  calibration: Quaternion,
  out: Quaternion = new Quaternion(),
): Quaternion {
  return out.multiplyQuaternions(calibration, raw);
}

/**
 * 較正をやり直したときに、ゴーストの方位へ加えるべきずれ量。
 *
 * 較正の瞬間、カメラのワールド方位は定義上 0 へ飛ぶ。直前のワールド方位が
 * yaw だったなら、カメラは -yaw だけ回ったことになるので、ゴーストにも
 * 同じ量を加えれば見かけの位置が保たれる（設計書 03.4）。
 */
export function recalibrationShift(previousWorldYaw: Radians): Radians {
  return normalizeAngle(-1 * previousWorldYaw) as Radians;
}
