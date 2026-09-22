import { describe, expect, it } from 'vitest';
import {
  cooldownProgress,
  initialCooldown,
  remainingMs,
  tryConsume,
} from '@/domain/multiplayer/Cooldown';
import { SOUND_COOLDOWN_MS } from '@/domain/multiplayer/NetMessages';

describe('tryConsume', () => {
  it('最初の 1 回は必ず通る', () => {
    const v = tryConsume(initialCooldown, 1000);
    expect(v.accepted).toBe(true);
    expect(v.state.lastAcceptedMs).toBe(1000);
  });

  it('クールダウン中は弾く', () => {
    const first = tryConsume(initialCooldown, 1000).state;
    const v = tryConsume(first, 1000 + SOUND_COOLDOWN_MS - 1);
    expect(v.accepted).toBe(false);
    expect(v.remainingMs).toBe(1);
  });

  it('ちょうど経過したら通る', () => {
    const first = tryConsume(initialCooldown, 1000).state;
    expect(tryConsume(first, 1000 + SOUND_COOLDOWN_MS).accepted).toBe(true);
  });

  it('弾かれたときは状態を変えない（連打で延長されない）', () => {
    const first = tryConsume(initialCooldown, 1000).state;
    let s = first;
    for (let t = 1100; t < 1000 + SOUND_COOLDOWN_MS; t += 100) {
      const v = tryConsume(s, t);
      expect(v.accepted).toBe(false);
      s = v.state;
    }
    // 連打しても、最初の受理から 5 秒で解ける
    expect(s.lastAcceptedMs).toBe(1000);
    expect(tryConsume(s, 1000 + SOUND_COOLDOWN_MS).accepted).toBe(true);
  });

  it('相手の時計が巻き戻っていても壊れない', () => {
    // 改造された相手が過去の時刻を送ってきた場合でも例外にせず、
    // 「経過が負」として素通りさせない判断に倒す
    const first = tryConsume(initialCooldown, 10_000).state;
    const v = tryConsume(first, 5000);
    expect(typeof v.accepted).toBe('boolean');
    expect(Number.isFinite(v.remainingMs)).toBe(true);
  });

  it('クールダウン時間を変えられる', () => {
    const first = tryConsume(initialCooldown, 0, 1000).state;
    expect(tryConsume(first, 500, 1000).accepted).toBe(false);
    expect(tryConsume(first, 1000, 1000).accepted).toBe(true);
  });

  it('5 秒が既定値である', () => {
    expect(SOUND_COOLDOWN_MS).toBe(5000);
  });
});

describe('cooldownProgress', () => {
  it('未使用なら 1', () => {
    expect(cooldownProgress(initialCooldown, 0)).toBe(1);
  });

  it('経過に応じて 0 から 1 へ進む', () => {
    const s = tryConsume(initialCooldown, 0).state;
    expect(cooldownProgress(s, 0)).toBeCloseTo(0, 5);
    expect(cooldownProgress(s, SOUND_COOLDOWN_MS / 2)).toBeCloseTo(0.5, 5);
    expect(cooldownProgress(s, SOUND_COOLDOWN_MS)).toBe(1);
  });

  it('1 を超えない', () => {
    const s = tryConsume(initialCooldown, 0).state;
    expect(cooldownProgress(s, SOUND_COOLDOWN_MS * 10)).toBe(1);
  });
});

describe('remainingMs', () => {
  it('未使用なら 0', () => {
    expect(remainingMs(initialCooldown, 0)).toBe(0);
  });

  it('残り時間を返す', () => {
    const s = tryConsume(initialCooldown, 1000).state;
    expect(remainingMs(s, 3000)).toBe(SOUND_COOLDOWN_MS - 2000);
  });

  it('経過後は 0', () => {
    const s = tryConsume(initialCooldown, 1000).state;
    expect(remainingMs(s, 1000 + SOUND_COOLDOWN_MS)).toBe(0);
  });
});
