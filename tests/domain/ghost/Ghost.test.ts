import { describe, expect, it } from 'vitest';
import { animationOf, isAlive } from '@/domain/ghost/Ghost';
import type { Ghost, GhostPhase } from '@/domain/ghost/Ghost';
import { toggleLight } from '@/domain/light/LightState';
import { ghostId, meters, radians } from '@/shared/types';

const mk = (phase: GhostPhase): Ghost => ({
  id: ghostId('g'),
  azimuth: radians(0),
  baseAzimuth: radians(0),
  distance: meters(5),
  heightOffset: meters(0),
  phase,
  purify: 0,
  grabStartedAt: null,
  escapeCount: 0,
  wobbleSeed: 0,
  banishedAt: null,
});

describe('isAlive', () => {
  it('BANISHED 以外は生存している', () => {
    expect(isAlive(mk('APPROACHING'))).toBe(true);
    expect(isAlive(mk('HELD'))).toBe(true);
    expect(isAlive(mk('GRABBING'))).toBe(true);
    expect(isAlive(mk('BANISHED'))).toBe(false);
  });
});

describe('animationOf', () => {
  it('フェーズごとに対応するアニメーションを返す', () => {
    expect(animationOf(mk('APPROACHING'))).toBe('WALK');
    expect(animationOf(mk('HELD'))).toBe('IDLE');
    expect(animationOf(mk('GRABBING'))).toBe('ATTACK');
    expect(animationOf(mk('BANISHED'))).toBe('DISAPPEAR');
  });
});

describe('toggleLight', () => {
  it('ON と OFF を入れ替える', () => {
    expect(toggleLight('ON')).toBe('OFF');
    expect(toggleLight('OFF')).toBe('ON');
  });
});
