declare const brand: unique symbol;

export type Brand<T, B> = T & { readonly [brand]: B };

/** ゴーストの識別子 */
export type GhostId = Brand<string, 'GhostId'>;
export const ghostId = (raw: string): GhostId => raw as GhostId;

/** ミリ秒。単調増加する時刻・経過時間の両方に用いる */
export type Millis = Brand<number, 'Millis'>;
export const millis = (raw: number): Millis => raw as Millis;

/** ラジアン。度と取り違えないための型 */
export type Radians = Brand<number, 'Radians'>;
export const radians = (raw: number): Radians => raw as Radians;

/** メートル */
export type Meters = Brand<number, 'Meters'>;
export const meters = (raw: number): Meters => raw as Meters;

/** three に依存せずにベクトルを受け渡すための最小の形 */
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}
