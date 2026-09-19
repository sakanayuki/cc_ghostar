import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  applyCalibration,
  computeCalibration,
  extractYaw,
  recalibrationShift,
  toCameraQuaternion,
} from '@/domain/math/Attitude';
import type { DeviceAttitude } from '@/domain/math/Attitude';
import { normalizeAngle } from '@/domain/math/Angles';
import { radians } from '@/shared/types';

const att = (p: Partial<DeviceAttitude>): DeviceAttitude => ({
  alpha: 0,
  beta: 90,
  gamma: 0,
  screenAngle: 0,
  absolute: false,
  ...p,
});

const forwardOf = (a: DeviceAttitude): Vector3 =>
  new Vector3(0, 0, -1).applyQuaternion(toCameraQuaternion(a));

const upOf = (a: DeviceAttitude): Vector3 =>
  new Vector3(0, 1, 0).applyQuaternion(toCameraQuaternion(a));

describe('toCameraQuaternion', () => {
  it('単位クォータニオンを返す', () => {
    for (const a of [att({}), att({ alpha: 37, beta: 12, gamma: -44 })]) {
      expect(toCameraQuaternion(a).length()).toBeCloseTo(1);
    }
  });

  it('端末を垂直に立てた姿勢ではワールド前方（-Z）を向く', () => {
    const f = forwardOf(att({ alpha: 0, beta: 90 }));
    expect(f.x).toBeCloseTo(0, 5);
    expect(f.y).toBeCloseTo(0, 5);
    expect(f.z).toBeCloseTo(-1, 5);
  });

  it('端末を水平に寝かせるとカメラは真下を向く', () => {
    const f = forwardOf(att({ beta: 0 }));
    expect(f.y).toBeCloseTo(-1, 5);
  });

  it('端末を裏返して寝かせるとカメラは真上を向く', () => {
    const f = forwardOf(att({ beta: 180 }));
    expect(f.y).toBeCloseTo(1, 5);
  });

  it('alpha を -90 にするとカメラは右（+X）を向く', () => {
    const f = forwardOf(att({ alpha: -90, beta: 90 }));
    expect(f.x).toBeCloseTo(1, 5);
    expect(f.z).toBeCloseTo(0, 5);
  });

  it('画面回転角は前方ベクトルを変えず、上方向だけを回す', () => {
    const base = att({ alpha: 20, beta: 80 });
    const rotated = att({ alpha: 20, beta: 80, screenAngle: 90 });

    const f0 = forwardOf(base);
    const f1 = forwardOf(rotated);
    expect(f1.x).toBeCloseTo(f0.x, 5);
    expect(f1.y).toBeCloseTo(f0.y, 5);
    expect(f1.z).toBeCloseTo(f0.z, 5);

    // 上方向は変化していなければならない（補正が効いている証拠）
    const u0 = upOf(base);
    const u1 = upOf(rotated);
    expect(u0.angleTo(u1)).toBeGreaterThan(1.0);
  });
});

describe('extractYaw', () => {
  it('gamma=0 の範囲では yaw が -alpha に一致する', () => {
    for (const alpha of [0, 30, 90, 170, 250, 359]) {
      const yaw = extractYaw(toCameraQuaternion(att({ alpha, beta: 90 })));
      expect(yaw).toBeCloseTo(normalizeAngle((-alpha * Math.PI) / 180), 5);
    }
  });

  it('ピッチ（beta）を変えても yaw は変わらない', () => {
    const reference = extractYaw(toCameraQuaternion(att({ alpha: 45, beta: 90 })));
    for (const beta of [20, 60, 90, 120, 160]) {
      const yaw = extractYaw(toCameraQuaternion(att({ alpha: 45, beta })));
      expect(yaw).toBeCloseTo(reference, 5);
    }
  });

  it('一周回すと元の yaw に戻る', () => {
    const start = extractYaw(toCameraQuaternion(att({ alpha: 12, beta: 90 })));
    const looped = extractYaw(toCameraQuaternion(att({ alpha: 12 + 360, beta: 90 })));
    expect(looped).toBeCloseTo(start, 5);
  });
});

describe('computeCalibration', () => {
  it('較正を適用すると yaw が 0 になる', () => {
    for (const alpha of [0, 33, 128, 271]) {
      const raw = toCameraQuaternion(att({ alpha, beta: 90 }));
      const calib = computeCalibration(raw);
      const world = applyCalibration(raw, calib);
      expect(extractYaw(world)).toBeCloseTo(0, 5);
    }
  });

  it('較正はピッチを変えない', () => {
    const raw = toCameraQuaternion(att({ alpha: 60, beta: 40 }));
    const world = applyCalibration(raw, computeCalibration(raw));

    const before = new Vector3(0, 0, -1).applyQuaternion(raw).y;
    const after = new Vector3(0, 0, -1).applyQuaternion(world).y;
    expect(after).toBeCloseTo(before, 5);
  });

  it('較正後に端末を回すと、その分だけ yaw が動く', () => {
    const calibRaw = toCameraQuaternion(att({ alpha: 100, beta: 90 }));
    const calib = computeCalibration(calibRaw);

    // 端末を alpha で 30 度動かす（= ワールド方位では +30 度）
    const movedRaw = toCameraQuaternion(att({ alpha: 70, beta: 90 }));
    const yaw = extractYaw(applyCalibration(movedRaw, calib));
    expect(yaw).toBeCloseTo((30 * Math.PI) / 180, 5);
  });
});

describe('recalibrationShift', () => {
  it('直前のワールド方位を打ち消す量を返す', () => {
    expect(recalibrationShift(radians(0.7))).toBeCloseTo(-0.7);
    expect(recalibrationShift(radians(-1.2))).toBeCloseTo(1.2);
  });

  it('結果は正規化されている', () => {
    const shifted = recalibrationShift(radians(Math.PI * 1.5));
    expect(shifted).toBeGreaterThan(-Math.PI);
    expect(shifted).toBeLessThanOrEqual(Math.PI);
  });
});

describe('Quaternion の再利用', () => {
  it('out 引数を渡すと同じインスタンスに書き込む', () => {
    const out = new Quaternion();
    const result = toCameraQuaternion(att({}), out);
    expect(result).toBe(out);
  });
});
