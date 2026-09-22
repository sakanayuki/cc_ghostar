import { describe, expect, it } from 'vitest';
import {
  azimuthToCanvasAngle,
  isInsideCircle,
  polarToScreen,
  screenToAzimuth,
  screenToDistance,
  screenToWorld,
  worldToScreen,
} from '@/domain/multiplayer/TopDownView';
import type { ViewPort } from '@/domain/multiplayer/TopDownView';

const view: ViewPort = { cx: 200, cy: 200, radius: 100, rangeMeters: 10 };

describe('worldToScreen', () => {
  it('原点は円の中心', () => {
    expect(worldToScreen({ x: 0, z: 0 }, view)).toEqual({ sx: 200, sy: 200 });
  });

  it('正面（-Z）は画面の上（12 時方向）', () => {
    const p = worldToScreen({ x: 0, z: -10 }, view);
    expect(p.sx).toBeCloseTo(200, 6);
    expect(p.sy).toBeCloseTo(100, 6); // 中心より上
  });

  it('右（+X）は画面の右', () => {
    const p = worldToScreen({ x: 10, z: 0 }, view);
    expect(p.sx).toBeCloseTo(300, 6);
    expect(p.sy).toBeCloseTo(200, 6);
  });

  it('背後（+Z）は画面の下', () => {
    expect(worldToScreen({ x: 0, z: 10 }, view).sy).toBeCloseTo(300, 6);
  });
});

describe('screenToWorld', () => {
  it('worldToScreen の逆変換になっている', () => {
    for (const p of [
      { x: 0, z: 0 },
      { x: 3, z: -4 },
      { x: -7.5, z: 2.25 },
      { x: 10, z: 10 },
    ]) {
      const back = screenToWorld(worldToScreen(p, view), view);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.z).toBeCloseTo(p.z, 6);
    }
  });

  it('画面中心はワールド原点', () => {
    const w = screenToWorld({ sx: 200, sy: 200 }, view);
    expect(w.x).toBeCloseTo(0, 6);
    expect(w.z).toBeCloseTo(0, 6);
  });
});

describe('polarToScreen', () => {
  it('方位 0 は真上', () => {
    const p = polarToScreen(0, 10, view);
    expect(p.sx).toBeCloseTo(200, 6);
    expect(p.sy).toBeCloseTo(100, 6);
  });

  it('方位 +90 度は右（ワールドの時計回り正と一致）', () => {
    const p = polarToScreen(Math.PI / 2, 10, view);
    expect(p.sx).toBeCloseTo(300, 6);
    expect(p.sy).toBeCloseTo(200, 6);
  });

  it('方位 180 度は下', () => {
    expect(polarToScreen(Math.PI, 10, view).sy).toBeCloseTo(300, 6);
  });

  it('距離 0 は中心', () => {
    const p = polarToScreen(1.234, 0, view);
    expect(p.sx).toBeCloseTo(200, 6);
    expect(p.sy).toBeCloseTo(200, 6);
  });
});

describe('screenToAzimuth', () => {
  it('polarToScreen と往復できる', () => {
    for (const az of [0, 0.5, 1.57, 3.0, -0.8, -2.4]) {
      const p = polarToScreen(az, 5, view);
      expect(screenToAzimuth(p, view)).toBeCloseTo(az, 5);
    }
  });

  it('真上をタップすると方位 0', () => {
    expect(screenToAzimuth({ sx: 200, sy: 120 }, view)).toBeCloseTo(0, 6);
  });

  it('右をタップすると方位 +90 度', () => {
    expect(screenToAzimuth({ sx: 280, sy: 200 }, view)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('左をタップすると方位 -90 度', () => {
    expect(screenToAzimuth({ sx: 120, sy: 200 }, view)).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('screenToDistance', () => {
  it('中心は 0、縁は range と一致する', () => {
    expect(screenToDistance({ sx: 200, sy: 200 }, view)).toBeCloseTo(0, 6);
    expect(screenToDistance({ sx: 300, sy: 200 }, view)).toBeCloseTo(10, 6);
  });

  it('半分の位置は range の半分', () => {
    expect(screenToDistance({ sx: 250, sy: 200 }, view)).toBeCloseTo(5, 6);
  });
});

describe('isInsideCircle', () => {
  it('中心と縁の内側は true', () => {
    expect(isInsideCircle({ sx: 200, sy: 200 }, view)).toBe(true);
    expect(isInsideCircle({ sx: 299, sy: 200 }, view)).toBe(true);
  });

  it('縁の外は false', () => {
    expect(isInsideCircle({ sx: 301, sy: 200 }, view)).toBe(false);
    expect(isInsideCircle({ sx: 280, sy: 280 }, view)).toBe(false);
  });
});

describe('azimuthToCanvasAngle', () => {
  it('方位 0 は Canvas の -90 度（12 時）', () => {
    expect(azimuthToCanvasAngle(0)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('方位 +90 度は Canvas の 0 度（3 時）', () => {
    expect(azimuthToCanvasAngle(Math.PI / 2)).toBeCloseTo(0, 6);
  });

  it('polarToScreen と同じ向きを指す', () => {
    // Canvas 角度から座標を起こし、polarToScreen と一致するか
    for (const az of [0, 0.7, 2.2, -1.1]) {
      const a = azimuthToCanvasAngle(az);
      const fromAngle = {
        sx: view.cx + Math.cos(a) * view.radius,
        sy: view.cy + Math.sin(a) * view.radius,
      };
      const fromPolar = polarToScreen(az, view.rangeMeters, view);
      expect(fromAngle.sx).toBeCloseTo(fromPolar.sx, 5);
      expect(fromAngle.sy).toBeCloseTo(fromPolar.sy, 5);
    }
  });
});
