import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_LENGTH,
  fromPeerId,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  toPeerId,
} from '@/domain/multiplayer/RoomCode';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('generateRoomCode', () => {
  it('決められた長さのコードを作る', () => {
    expect(generateRoomCode(seeded(1))).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('生成したコードは必ず妥当である', () => {
    const rng = seeded(1);
    for (let i = 0; i < 500; i++) {
      expect(isValidRoomCode(generateRoomCode(rng))).toBe(true);
    }
  });

  it('紛らわしい文字を含まない', () => {
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(rng);
      // 0/O、1/I/L は口頭でも表示でも取り違える
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('乱数が端の値でも壊れない', () => {
    expect(isValidRoomCode(generateRoomCode(() => 0))).toBe(true);
    expect(isValidRoomCode(generateRoomCode(() => 0.9999999))).toBe(true);
    expect(isValidRoomCode(generateRoomCode(() => 1))).toBe(true);
  });

  it('十分に散らばる', () => {
    const rng = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(generateRoomCode(rng));
    expect(seen.size).toBeGreaterThan(290);
  });
});

describe('normalizeRoomCode', () => {
  it('小文字を大文字にする', () => {
    expect(normalizeRoomCode('abcde')).toBe('ABCDE');
  });

  it('空白やハイフンを取り除く', () => {
    expect(normalizeRoomCode(' AB-CD E ')).toBe('ABCDE');
  });

  it('長すぎる入力は切り詰める', () => {
    expect(normalizeRoomCode('ABCDEFGH')).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('アルファベットに無い文字は落とす', () => {
    // 0/O/1/I/L は正解が存在しない打ち間違いなので、推測で寄せない
    expect(normalizeRoomCode('A0BCD')).toBe('ABCD');
    expect(normalizeRoomCode('AIBCD')).toBe('ABCD');
  });

  it('落とした結果は長さ不足で弾かれる', () => {
    expect(isValidRoomCode(normalizeRoomCode('A0BCD'))).toBe(false);
  });

  it('妥当なコードはそのまま通る', () => {
    const code = generateRoomCode(seeded(11));
    expect(normalizeRoomCode(code)).toBe(code);
  });
});

describe('isValidRoomCode', () => {
  it('長さが違えば弾く', () => {
    expect(isValidRoomCode('ABCD')).toBe(false);
    expect(isValidRoomCode('ABCDEF')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });

  it('含まれない文字があれば弾く', () => {
    expect(isValidRoomCode('ABC0D')).toBe(false);
    expect(isValidRoomCode('abcde')).toBe(false);
  });
});

describe('peer id との往復', () => {
  it('コードから作った id は元のコードへ戻せる', () => {
    const rng = seeded(5);
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(rng);
      expect(fromPeerId(toPeerId(code))).toBe(code);
    }
  });

  it('接頭辞が無ければ null', () => {
    expect(fromPeerId('ABCDE')).toBeNull();
  });

  it('接頭辞があっても中身が不正なら null', () => {
    expect(fromPeerId(toPeerId('AB'))).toBeNull();
    expect(fromPeerId(toPeerId('ABC0D'))).toBeNull();
  });

  it('id には接頭辞が付く（公開サーバー上での衝突を避けるため）', () => {
    expect(toPeerId('ABCDE')).not.toBe('ABCDE');
    expect(toPeerId('ABCDE').endsWith('ABCDE')).toBe(true);
  });
});
