import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_HISTORY,
  latest,
  predictTo,
  reconcile,
} from '@/domain/multiplayer/Rollback';
import type { Snapshot } from '@/domain/multiplayer/Rollback';

/** 検証しやすい決定論的な世界: 毎 tick で位置が速度ぶん進む */
interface World {
  readonly pos: number;
  readonly vel: number;
}

const advance = (s: World): World => ({ pos: s.pos + s.vel, vel: s.vel });

const snap = (tick: number, pos: number, vel = 1): Snapshot<World> => ({
  tick,
  state: { pos, vel },
});

describe('predictTo', () => {
  it('目標 tick まで手元で世界を進める', () => {
    const r = predictTo([snap(0, 0)], 5, advance);
    expect(r.state.pos).toBe(5);
    expect(latest(r.history)?.tick).toBe(5);
    expect(r.rolledBack).toBe(0);
  });

  it('すでに先に進んでいるなら何もしない', () => {
    const r = predictTo([snap(0, 0), snap(1, 1), snap(2, 2)], 1, advance);
    expect(r.state.pos).toBe(2);
    expect(r.history).toHaveLength(3);
  });

  it('履歴が空なら dropped を立てる', () => {
    expect(predictTo<World>([], 5, advance).dropped).toBe(true);
  });

  it('履歴は上限を超えない', () => {
    const r = predictTo([snap(0, 0)], 500, advance, 10);
    expect(r.history).toHaveLength(10);
    expect(latest(r.history)?.tick).toBe(500);
  });
});

describe('reconcile: 巻き戻しが要らない場合', () => {
  it('権威が未来なら、そこから前へ進める', () => {
    const history = [snap(0, 0), snap(1, 1)];
    const r = reconcile(history, snap(5, 100), 7, advance);

    expect(r.rolledBack).toBe(0);
    expect(r.state.pos).toBe(102);
    expect(latest(r.history)?.tick).toBe(7);
  });

  it('履歴が空でも権威から始められる', () => {
    const r = reconcile<World>([], snap(3, 30), 5, advance);
    expect(r.state.pos).toBe(32);
    expect(r.dropped).toBe(false);
  });
});

describe('reconcile: 巻き戻しが起きる場合', () => {
  it('過去の権威で置き換えて現在まで再計算する', () => {
    // 手元では 0→10 まで予測済み（pos は tick と同じ）
    const predicted = predictTo([snap(0, 0)], 10, advance).history;
    expect(latest(predicted)?.state.pos).toBe(10);

    // tick 4 の真の値は 100 だった、という権威が遅れて届く
    const r = reconcile(predicted, snap(4, 100), 10, advance);

    expect(r.rolledBack).toBe(6); // 10 - 4
    // 100 から 6 tick ぶん進んだ値になる
    expect(r.state.pos).toBe(106);
    expect(latest(r.history)?.tick).toBe(10);
  });

  it('巻き戻した後の履歴は権威の値で上書きされている', () => {
    const predicted = predictTo([snap(0, 0)], 10, advance).history;
    const r = reconcile(predicted, snap(4, 100), 10, advance);

    const at4 = r.history.find((s) => s.tick === 4);
    expect(at4?.state.pos).toBe(100);
    // 巻き戻し以前の履歴は保たれる
    expect(r.history.find((s) => s.tick === 3)?.state.pos).toBe(3);
  });

  it('権威と予測が一致していれば結果は変わらない', () => {
    const predicted = predictTo([snap(0, 0)], 10, advance).history;
    const r = reconcile(predicted, snap(4, 4), 10, advance);

    expect(r.rolledBack).toBe(6);
    expect(r.state.pos).toBe(10); // 予測と同じ値に落ち着く
  });

  it('同じ権威を二度適用しても結果が変わらない（冪等）', () => {
    const predicted = predictTo([snap(0, 0)], 10, advance).history;
    const once = reconcile(predicted, snap(4, 100), 10, advance);
    const twice = reconcile(once.history, snap(4, 100), 10, advance);

    expect(twice.state.pos).toBe(once.state.pos);
  });
});

describe('reconcile: 巻き戻せない場合', () => {
  it('履歴より古い権威は捨て、現在の予測を維持する', () => {
    // 履歴を 10 件に制限して 0..40 まで進める → 古い tick は残っていない
    const predicted = predictTo([snap(0, 0)], 40, advance, 10).history;
    expect((predicted[0] as Snapshot<World>).tick).toBe(31);

    const r = reconcile(predicted, snap(5, 999), 40, advance, 10);

    expect(r.dropped).toBe(true);
    expect(r.rolledBack).toBe(0);
    expect(r.state.pos).toBe(40); // 予測のまま
  });

  it('ちょうど履歴の先頭にある権威は適用できる', () => {
    const predicted = predictTo([snap(0, 0)], 40, advance, 10).history;
    const oldestTick = (predicted[0] as Snapshot<World>).tick;

    const r = reconcile(predicted, snap(oldestTick, 500), 40, advance, 10);
    expect(r.dropped).toBe(false);
    expect(r.rolledBack).toBeGreaterThan(0);
  });
});

describe('reconcile: 純粋性', () => {
  it('渡した履歴を破壊しない', () => {
    const predicted = predictTo([snap(0, 0)], 10, advance).history;
    const before = predicted.map((s) => ({ tick: s.tick, pos: s.state.pos }));

    reconcile(predicted, snap(4, 100), 10, advance);

    expect(predicted.map((s) => ({ tick: s.tick, pos: s.state.pos }))).toEqual(before);
  });

  it('既定の履歴上限は 20Hz で数秒ぶんを保持する', () => {
    // 遅延やパケットロスで数秒遅れて届いても巻き戻せる余裕が必要
    expect(DEFAULT_MAX_HISTORY).toBeGreaterThanOrEqual(60);
  });
});
