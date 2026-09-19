import { describe, expect, it } from 'vitest';
import { mixToMono } from '@/infrastructure/audio/VoiceSample';

const f32 = (...v: number[]): Float32Array => Float32Array.from(v);

describe('mixToMono', () => {
  it('モノラル入力はそのまま返す', () => {
    const mono = f32(0.1, -0.2, 0.3);
    expect(mixToMono([mono])).toBe(mono);
  });

  it('左右同一（デュアルモノ）なら値が変わらない', () => {
    // 本プロジェクトで使う素材は実測で L/R 相関 1.00000 のデュアルモノ
    const ch = [0.5, -0.5, 0.25, 0];
    const out = mixToMono([f32(...ch), f32(...ch)]);
    for (let i = 0; i < ch.length; i++) {
      expect(out[i]).toBeCloseTo(ch[i] as number, 6);
    }
  });

  it('左右が異なる場合は平均になる', () => {
    const out = mixToMono([f32(1, 0, -1), f32(0, 1, 1)]);
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });

  it('逆相の信号は打ち消し合う', () => {
    const out = mixToMono([f32(0.8, -0.4), f32(-0.8, 0.4)]);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(0, 6);
  });

  it('3 チャンネル以上でも平均される', () => {
    const out = mixToMono([f32(3), f32(0), f32(0)]);
    expect(out[0]).toBeCloseTo(1, 6);
  });

  it('入力が空なら空を返す', () => {
    expect(mixToMono([]).length).toBe(0);
  });

  it('入力の配列を破壊しない', () => {
    const l = f32(0.4, 0.2);
    const r = f32(0.2, 0.4);
    mixToMono([l, r]);
    expect(l[0]).toBeCloseTo(0.4, 6);
    expect(l[1]).toBeCloseTo(0.2, 6);
    expect(r[0]).toBeCloseTo(0.2, 6);
    expect(r[1]).toBeCloseTo(0.4, 6);
  });

  it('長さの違うチャンネルでも落ちない', () => {
    const out = mixToMono([f32(1, 1, 1), f32(1)]);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
  });
});
