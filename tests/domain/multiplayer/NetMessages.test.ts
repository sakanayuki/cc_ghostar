import { describe, expect, it } from 'vitest';
import {
  NET_TICK_MS,
  SOUND_KEYS,
  parseMessage,
  toTick,
} from '@/domain/multiplayer/NetMessages';

const snapshot = {
  type: 'SNAPSHOT',
  tick: 12,
  yaw: 1.2,
  light: true,
  ghosts: [
    { id: 'ghost-0', azimuth: 0.5, distance: 4, phase: 'APPROACHING', purify: 0.3 },
  ],
  elapsedMs: 600,
  remaining: 2,
};

describe('parseMessage: 正常系', () => {
  it('SNAPSHOT を読める', () => {
    const m = parseMessage(snapshot);
    expect(m?.type).toBe('SNAPSHOT');
    expect(m).toMatchObject({ tick: 12, yaw: 1.2, light: true });
  });

  it('SOUND を読める', () => {
    const m = parseMessage({
      type: 'SOUND',
      tick: 3,
      sound: 'glass',
      x: 1,
      z: -2,
      from: 'a',
    });
    expect(m).toEqual({ type: 'SOUND', tick: 3, sound: 'glass', x: 1, z: -2, from: 'a' });
  });

  it('すべての音キーを受け付ける', () => {
    for (const sound of SOUND_KEYS) {
      expect(parseMessage({ type: 'SOUND', tick: 0, sound, x: 0, z: 0 })).not.toBeNull();
    }
  });

  it('JOIN / ROSTER / RESULT を読める', () => {
    expect(parseMessage({ type: 'JOIN', name: 'x' })?.type).toBe('JOIN');
    expect(parseMessage({ type: 'ROSTER', members: ['a', 'b'] })?.type).toBe('ROSTER');
    expect(
      parseMessage({
        type: 'RESULT',
        outcome: 'FAILED',
        elapsedMs: 1,
        purifiedCount: 1,
        totalCount: 3,
      })?.type,
    ).toBe('RESULT');
  });
});

describe('parseMessage: 壊れた入力を弾く', () => {
  it('オブジェクトでなければ null', () => {
    for (const v of [null, undefined, 1, 'x', true, []]) {
      expect(parseMessage(v)).toBeNull();
    }
  });

  it('未知の type は null', () => {
    expect(parseMessage({ type: 'EVIL' })).toBeNull();
  });

  it('数値が数値でなければ null', () => {
    expect(parseMessage({ ...snapshot, tick: 'x' })).toBeNull();
    expect(parseMessage({ ...snapshot, yaw: null })).toBeNull();
  });

  it('NaN や Infinity を弾く', () => {
    // 描画や座標計算へ流れ込むと画面が壊れるため、入口で止める
    expect(parseMessage({ ...snapshot, yaw: NaN })).toBeNull();
    expect(parseMessage({ ...snapshot, yaw: Infinity })).toBeNull();
    expect(
      parseMessage({ type: 'SOUND', tick: 0, sound: 'glass', x: NaN, z: 0 }),
    ).toBeNull();
  });

  it('未知の phase を弾く', () => {
    expect(
      parseMessage({
        ...snapshot,
        ghosts: [{ id: 'a', azimuth: 0, distance: 1, phase: 'EVIL', purify: 0 }],
      }),
    ).toBeNull();
  });

  it('未知の音キーを弾く', () => {
    expect(
      parseMessage({ type: 'SOUND', tick: 0, sound: 'explosion', x: 0, z: 0 }),
    ).toBeNull();
  });

  it('ghosts が配列でなければ null', () => {
    expect(parseMessage({ ...snapshot, ghosts: 'x' })).toBeNull();
  });

  it('未知の outcome を弾く', () => {
    expect(parseMessage({ type: 'RESULT', outcome: 'WIN' })).toBeNull();
  });
});

describe('parseMessage: 値の手当て', () => {
  it('purify を 0〜1 に収める', () => {
    const m = parseMessage({
      ...snapshot,
      ghosts: [{ id: 'a', azimuth: 0, distance: 1, phase: 'HELD', purify: 99 }],
    });
    expect(m).toMatchObject({ type: 'SNAPSHOT' });
    if (m?.type === 'SNAPSHOT') expect(m.ghosts[0]?.purify).toBe(1);
  });

  it('tick は整数にする', () => {
    const m = parseMessage({ ...snapshot, tick: 12.9 });
    if (m?.type === 'SNAPSHOT') expect(m.tick).toBe(12);
  });

  it('ROSTER の非文字列要素は捨てる', () => {
    const m = parseMessage({ type: 'ROSTER', members: ['a', 1, null, 'b'] });
    if (m?.type === 'ROSTER') expect(m.members).toEqual(['a', 'b']);
  });

  it('欠けた任意項目は既定値で埋める', () => {
    const m = parseMessage({ type: 'SOUND', tick: 0, sound: 'knock', x: 0, z: 0 });
    if (m?.type === 'SOUND') expect(m.from).toBe('');
  });
});

describe('toTick', () => {
  it('経過時間を tick へ変換する', () => {
    expect(toTick(0)).toBe(0);
    expect(toTick(NET_TICK_MS)).toBe(1);
    expect(toTick(NET_TICK_MS * 3 + 10)).toBe(3);
  });

  it('20Hz である', () => {
    expect(NET_TICK_MS).toBe(50);
    expect(1000 / NET_TICK_MS).toBe(20);
  });
});
