import { normalizeAngle } from '@/domain/math/Angles';

/**
 * 妨害側が見る「真上からの視点」の座標変換（設計書 10.7）。
 *
 * 画面の 12 時方向がワールドの正面（方位 0）に対応する。ホストが右を向けば
 * 光の扇は時計回りに動く。
 *
 * 描画そのものは presentation 側が行うが、座標の対応づけは純粋な計算なので
 * ここに置き、テストできるようにしている。タップ位置の取り違えは
 * 「狙った場所と違うところで音が鳴る」という形で現れ、目視では気づきにくい。
 */

export interface ViewPort {
  /** 描画領域の中心（px） */
  readonly cx: number;
  readonly cy: number;
  /** 円の半径（px） */
  readonly radius: number;
  /** 円の縁が表す距離（メートル） */
  readonly rangeMeters: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

export interface ScreenPoint {
  readonly sx: number;
  readonly sy: number;
}

/**
 * ワールド座標を画面座標へ。
 *
 * ワールドの正面は -Z（設計書 03.1）であり、画面では上向き（-Y）に対応する。
 * ワールドの +X（右）は画面の +X（右）に対応する。
 */
export function worldToScreen(p: WorldPoint, view: ViewPort): ScreenPoint {
  const scale = view.radius / view.rangeMeters;
  return {
    sx: view.cx + p.x * scale,
    sy: view.cy + p.z * scale,
  };
}

/** 画面座標をワールド座標へ。worldToScreen の逆変換 */
export function screenToWorld(p: ScreenPoint, view: ViewPort): WorldPoint {
  const scale = view.radius / view.rangeMeters;
  return {
    x: (p.sx - view.cx) / scale,
    z: (p.sy - view.cy) / scale,
  };
}

/** 方位と距離から画面座標へ */
export function polarToScreen(
  azimuth: number,
  distance: number,
  view: ViewPort,
): ScreenPoint {
  return worldToScreen(
    { x: Math.sin(azimuth) * distance, z: -Math.cos(azimuth) * distance },
    view,
  );
}

/** 画面座標が円の内側か。外側のタップは無効にする */
export function isInsideCircle(p: ScreenPoint, view: ViewPort): boolean {
  const dx = p.sx - view.cx;
  const dy = p.sy - view.cy;
  return dx * dx + dy * dy <= view.radius * view.radius;
}

/**
 * ワールド方位を、画面上で描くときの角度（ラジアン）へ変換する。
 *
 * Canvas の角度は +X 軸から時計回りに増える。画面の 12 時は -Y 方向なので
 * -π/2 が起点になる。ワールド方位 0（正面）がそこへ対応する。
 */
export function azimuthToCanvasAngle(azimuth: number): number {
  return normalizeAngle(azimuth) - Math.PI / 2;
}

/** 画面上の点がプレイヤーから見てどの方位にあるか */
export function screenToAzimuth(p: ScreenPoint, view: ViewPort): number {
  const dx = p.sx - view.cx;
  const dy = p.sy - view.cy;
  // worldToScreen の対応（x→sx, z→sy）に合わせる。方位は atan2(x, -z)
  return normalizeAngle(Math.atan2(dx, -dy));
}

/** 画面上の点までの距離（メートル） */
export function screenToDistance(p: ScreenPoint, view: ViewPort): number {
  const dx = p.sx - view.cx;
  const dy = p.sy - view.cy;
  return (Math.hypot(dx, dy) / view.radius) * view.rangeMeters;
}
