import { beforeEach, describe, expect, it } from 'vitest';
import { HostSession, IntruderSession } from '@/application/MultiplayerSession';
import type { NetworkPort, NetStatus } from '@/application/ports/NetworkPort';
import type { ClockPort } from '@/application/ports';
import { SOUND_COOLDOWN_MS, NET_TICK_MS } from '@/domain/multiplayer/NetMessages';
import type { NetMessage, SnapshotMessage } from '@/domain/multiplayer/NetMessages';

/**
 * 実際の P2P を張らずに、ホストと妨害側のやり取りだけを検証する。
 *
 * 公開シグナリングサーバーを使う結合確認は手元では行えないため、
 * プロトコルの論理はここで押さえる。
 */

class FakeClock implements ClockPort {
  ms = 0;
  now(): number {
    return this.ms;
  }
  advance(by: number): void {
    this.ms += by;
  }
}

/** 送信されたものを記録するだけの回線 */
class FakeNet implements NetworkPort {
  readonly sent: { to: string; message: NetMessage }[] = [];
  private members: string[] = [];

  setPeers(peers: string[]): void {
    this.members = peers;
  }
  host(): Promise<void> {
    return Promise.resolve();
  }
  join(): Promise<void> {
    return Promise.resolve();
  }
  broadcast(message: NetMessage): void {
    this.sent.push({ to: '*', message });
  }
  send(peerId: string, message: NetMessage): void {
    this.sent.push({ to: peerId, message });
  }
  disconnect(): void {
    /* 何もしない */
  }
  status(): NetStatus {
    return 'CONNECTED';
  }
  peers(): readonly string[] {
    return this.members;
  }
}

const snapshotBody = (
  over: Partial<Omit<SnapshotMessage, 'type' | 'tick'>> = {},
): Omit<SnapshotMessage, 'type' | 'tick'> => ({
  yaw: 0,
  light: true,
  ghosts: [{ id: 'ghost-0', azimuth: 1, distance: 8, phase: 'APPROACHING', purify: 0 }],
  elapsedMs: 0,
  remaining: 3,
  speed: 0.22,
  ...over,
});

describe('HostSession: 状態配信', () => {
  let net: FakeNet;
  let clock: FakeClock;
  let host: HostSession;

  beforeEach(() => {
    net = new FakeNet();
    clock = new FakeClock();
    host = new HostSession(net, clock);
  });

  it('tick が進んだときだけ送る', () => {
    host.publish(snapshotBody(), 0);
    host.publish(snapshotBody(), 10); // 同じ tick
    host.publish(snapshotBody(), 20); // まだ同じ tick
    expect(net.sent).toHaveLength(1);

    host.publish(snapshotBody(), NET_TICK_MS);
    expect(net.sent).toHaveLength(2);
  });

  it('描画のフレームレートに関係なく 20Hz に収まる', () => {
    // 1 秒ぶんを 60fps で回しても、送信は 20 回で頭打ちになる
    for (let ms = 0; ms < 1000; ms += 1000 / 60) host.publish(snapshotBody(), ms);
    expect(net.sent.length).toBeLessThanOrEqual(20);
    expect(net.sent.length).toBeGreaterThanOrEqual(19);
  });

  it('送るのは向きとゴーストだけで、カメラ映像は含まない', () => {
    host.publish(snapshotBody(), 0);
    const first = net.sent[0]?.message;
    expect(first?.type).toBe('SNAPSHOT');
    const keys = Object.keys(first ?? {});
    expect(keys).toEqual(
      expect.arrayContaining(['type', 'tick', 'yaw', 'light', 'ghosts']),
    );
    // 映像に類するものが混ざっていないこと
    expect(keys.join(',')).not.toMatch(/image|frame|video|camera/i);
  });
});

describe('HostSession: 妨害音の受理', () => {
  let net: FakeNet;
  let clock: FakeClock;
  let host: HostSession;

  const sound = (tick = 0): NetMessage => ({
    type: 'SOUND',
    tick,
    sound: 'glass',
    x: 1,
    z: -2,
    from: '',
  });

  beforeEach(() => {
    net = new FakeNet();
    clock = new FakeClock();
    host = new HostSession(net, clock);
  });

  it('最初の 1 回は受理する', () => {
    expect(host.acceptSound('p1', sound() as never)).toBe(true);
  });

  it('クールダウン中の連打は弾く', () => {
    host.acceptSound('p1', sound() as never);
    clock.advance(100);
    expect(host.acceptSound('p1', sound() as never)).toBe(false);
    clock.advance(SOUND_COOLDOWN_MS);
    expect(host.acceptSound('p1', sound() as never)).toBe(true);
  });

  it('相手が申告した tick ではなくホストの時計で判定する', () => {
    // 改造した相手が古い tick を送ってきても、クールダウンは回避できない
    host.acceptSound('p1', sound(0) as never);
    clock.advance(100);
    expect(host.acceptSound('p1', sound(-99999) as never)).toBe(false);
  });

  it('クールダウンは相手ごとに独立している', () => {
    host.acceptSound('p1', sound() as never);
    // p1 が使い切っても p2 は鳴らせる
    expect(host.acceptSound('p2', sound() as never)).toBe(true);
  });

  it('受理した音は他の妨害者へ中継し、送り主へは返さない', () => {
    net.setPeers(['p1', 'p2', 'p3']);
    host.acceptSound('p1', sound() as never);

    const relayed = net.sent.filter((s) => s.message.type === 'SOUND');
    expect(relayed.map((s) => s.to).sort()).toEqual(['p2', 'p3']);
    expect(
      relayed.every((s) => s.message.type === 'SOUND' && s.message.from === 'p1'),
    ).toBe(true);
  });

  it('弾かれた音は中継しない', () => {
    net.setPeers(['p1', 'p2']);
    host.acceptSound('p1', sound() as never);
    net.sent.length = 0;
    host.acceptSound('p1', sound() as never);
    expect(net.sent).toHaveLength(0);
  });

  it('離脱した相手のクールダウンは忘れる', () => {
    host.acceptSound('p1', sound() as never);
    host.forget('p1');
    // 同じ id で入り直した別人を、前の人のクールダウンで縛らない
    expect(host.acceptSound('p1', sound() as never)).toBe(true);
  });
});

describe('IntruderSession: 受信と予測', () => {
  let net: FakeNet;
  let clock: FakeClock;
  let intruder: IntruderSession;

  const snapshot = (tick: number, distance: number): SnapshotMessage => ({
    type: 'SNAPSHOT',
    tick,
    ...snapshotBody({
      ghosts: [{ id: 'ghost-0', azimuth: 1, distance, phase: 'APPROACHING', purify: 0 }],
    }),
  });

  beforeEach(() => {
    net = new FakeNet();
    clock = new FakeClock();
    intruder = new IntruderSession(net, clock);
  });

  it('スナップショットが届くまでは何も描けない', () => {
    expect(intruder.predict()).toBeNull();
  });

  it('届いた状態をそのまま持つ', () => {
    intruder.onSnapshot(snapshot(0, 8));
    expect(intruder.predict()?.ghosts[0]?.distance).toBeCloseTo(8, 6);
  });

  it('次が来ない間は手元で世界を進める', () => {
    intruder.onSnapshot(snapshot(0, 8));
    clock.advance(NET_TICK_MS * 4); // 200ms ぶん進む
    const world = intruder.predict();
    // 0.22 m/s で 0.2 秒ぶん近づく
    expect(world?.ghosts[0]?.distance).toBeCloseTo(8 - 0.22 * 0.2, 4);
  });

  it('遅れて届いた権威で巻き戻して直す', () => {
    intruder.onSnapshot(snapshot(0, 8));
    clock.advance(NET_TICK_MS * 6);
    intruder.predict();

    // tick 2 の真の値は 5m だった、という権威が遅れて届く
    intruder.onSnapshot(snapshot(2, 5));
    expect(intruder.debug.rolledBack).toBeGreaterThan(0);

    const world = intruder.predict();
    // 5m から 4 tick ぶん進んだ位置に落ち着く
    expect(world?.ghosts[0]?.distance).toBeCloseTo(
      5 - (0.22 * (NET_TICK_MS * 4)) / 1000,
      3,
    );
  });

  it('捕捉中のゴーストは予測で動かさない', () => {
    intruder.onSnapshot({
      type: 'SNAPSHOT',
      tick: 0,
      ...snapshotBody({
        ghosts: [{ id: 'g', azimuth: 0, distance: 6, phase: 'HELD', purify: 0.5 }],
      }),
    });
    clock.advance(NET_TICK_MS * 10);
    expect(intruder.predict()?.ghosts[0]?.distance).toBeCloseTo(6, 6);
  });

  it('ホストの向きは予測で外挿しない', () => {
    intruder.onSnapshot({ type: 'SNAPSHOT', tick: 0, ...snapshotBody({ yaw: 1.5 }) });
    clock.advance(NET_TICK_MS * 8);
    // センサー由来の値を外挿すると、実際と違う方向へ光が伸びてしまう
    expect(intruder.predict()?.yaw).toBeCloseTo(1.5, 6);
  });
});

describe('IntruderSession: 音の送信', () => {
  let net: FakeNet;
  let clock: FakeClock;
  let intruder: IntruderSession;

  beforeEach(() => {
    net = new FakeNet();
    clock = new FakeClock();
    intruder = new IntruderSession(net, clock);
  });

  it('送信するとメッセージが流れる', () => {
    expect(intruder.requestSound('glass', 2, -3)).toBe(true);
    const m = net.sent[0]?.message;
    expect(m).toMatchObject({ type: 'SOUND', sound: 'glass', x: 2, z: -3 });
  });

  it('クールダウン中は送信しない（通信を無駄に使わない）', () => {
    intruder.requestSound('glass', 0, 0);
    clock.advance(1000);
    expect(intruder.requestSound('knock', 0, 0)).toBe(false);
    expect(net.sent).toHaveLength(1);
  });

  it('5 秒経てばまた送れる', () => {
    intruder.requestSound('glass', 0, 0);
    clock.advance(SOUND_COOLDOWN_MS);
    expect(intruder.requestSound('knock', 0, 0)).toBe(true);
    expect(net.sent).toHaveLength(2);
  });
});

describe('ホストと妨害側をつないだ流れ', () => {
  it('ホストの状態が妨害側へ伝わり、音が返ってくる', () => {
    const hostNet = new FakeNet();
    const hostClock = new FakeClock();
    const host = new HostSession(hostNet, hostClock);

    const intruderNet = new FakeNet();
    const intruderClock = new FakeClock();
    const intruder = new IntruderSession(intruderNet, intruderClock);

    // ホストが配信 → 妨害側が受信
    host.publish(snapshotBody({ yaw: 0.8, remaining: 2 }), 0);
    const published = hostNet.sent[0]?.message;
    expect(published?.type).toBe('SNAPSHOT');
    if (published?.type === 'SNAPSHOT') intruder.onSnapshot(published);

    const world = intruder.predict();
    expect(world?.yaw).toBeCloseTo(0.8, 6);
    expect(world?.remaining).toBe(2);

    // 妨害側が音を送る → ホストが受理する
    expect(intruder.requestSound('footsteps', 3, 1)).toBe(true);
    const request = intruderNet.sent.find((s) => s.message.type === 'SOUND')?.message;
    expect(request?.type).toBe('SOUND');
    if (request?.type === 'SOUND') {
      expect(host.acceptSound('intruder-1', request)).toBe(true);
      // 直後の 2 回目はホスト側で弾かれる
      expect(host.acceptSound('intruder-1', request)).toBe(false);
    }
  });
});
