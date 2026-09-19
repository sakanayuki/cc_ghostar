import { Quaternion } from 'three';
import {
  applyCalibration,
  computeCalibration,
  extractYaw,
  recalibrationShift,
  toCameraQuaternion,
} from '@/domain/math/Attitude';
import type { DeviceAttitude } from '@/domain/math/Attitude';
import type { Radians } from '@/shared/types';
import { radians } from '@/shared/types';

/**
 * 端末姿勢からワールド姿勢を作る。較正は yaw のみを打ち消す（設計書 03.4）。
 */
export class CalibrationService {
  private readonly calibration = new Quaternion();
  private readonly raw = new Quaternion();
  private readonly world = new Quaternion();
  private calibrated = false;

  /** 現在の向きをワールド正面として記録する。ゴーストへ加えるべきずれ量を返す */
  calibrate(attitude: DeviceAttitude): Radians {
    const previousWorldYaw = this.calibrated
      ? extractYaw(this.toWorld(attitude))
      : radians(0);

    toCameraQuaternion(attitude, this.raw);
    computeCalibration(this.raw, this.calibration);
    this.calibrated = true;

    return recalibrationShift(previousWorldYaw);
  }

  toWorld(attitude: DeviceAttitude): Quaternion {
    toCameraQuaternion(attitude, this.raw);
    if (!this.calibrated) return this.world.copy(this.raw);
    return applyCalibration(this.raw, this.calibration, this.world);
  }

  worldYaw(attitude: DeviceAttitude): Radians {
    return extractYaw(this.toWorld(attitude));
  }

  get isCalibrated(): boolean {
    return this.calibrated;
  }

  calibrationYaw(): Radians {
    return extractYaw(this.calibration);
  }
}
