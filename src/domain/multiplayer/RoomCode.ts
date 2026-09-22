/**
 * 部屋コード。相手に口頭やチャットで伝えることを前提に短くする。
 *
 * PeerJS は既定で長い UUID を割り当てるが、それを人が読み上げるのは現実的で
 * ないため、自前の短いコードを PeerJS の ID として指定する（設計書 10.2）。
 */

/**
 * 紛らわしい文字を除いた英数字。
 *
 * 0/O、1/I/L は口頭でも表示でも取り違えるため使わない。
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const ROOM_CODE_LENGTH = 5;

/** PeerJS の ID 衝突を避けるための接頭辞 */
export const PEER_ID_PREFIX = 'ghostar-';

/**
 * 部屋コードを生成する。乱数は引数で受け取るため純粋関数である。
 */
export function generateRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length));
    code += ALPHABET[index] ?? '2';
  }
  return code;
}

/**
 * 入力されたコードを正規化する。
 *
 * 小文字入力と、空白やハイフンの混入だけを救う。
 *
 * 0 や O のようにアルファベットに含まれない文字は、正解が存在しない
 * 打ち間違いである。推測で別の文字へ寄せると、正しいコードを誤った
 * コードへ変えてしまう危険があるため、落として長さ不足で弾く。
 */
export function normalizeRoomCode(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) {
    if (ALPHABET.includes(ch)) out += ch;
    if (out.length === ROOM_CODE_LENGTH) break;
  }
  return out;
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

export const toPeerId = (code: string): string => `${PEER_ID_PREFIX}${code}`;

export function fromPeerId(peerId: string): string | null {
  if (!peerId.startsWith(PEER_ID_PREFIX)) return null;
  const code = peerId.slice(PEER_ID_PREFIX.length);
  return isValidRoomCode(code) ? code : null;
}
