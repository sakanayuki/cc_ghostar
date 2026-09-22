import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@/domain/multiplayer/RoomCode';
import { button, el } from './dom';

export interface LobbyHandlers {
  onStart: () => void;
  onJoinSubmit: (code: string) => void;
  onCancel: () => void;
}

/**
 * 部屋の作成と参加（設計書 10.2）。
 *
 * 相手に伝えるのは 5 文字の部屋コードだけで済むようにしている。
 * PeerJS の既定の ID は長い UUID で、口頭では伝えられない。
 */
export class LobbyScreen {
  readonly root = el('div', 'panel');

  private readonly hostBox = el('div', 'panel__stack');
  private readonly joinBox = el('div', 'panel__stack');
  private readonly codeText = el('div', 'roomcode');
  private readonly members = el('div', 'panel__record');
  private readonly status = el('p', 'panel__note');
  private readonly input: HTMLInputElement;
  private readonly startButton: HTMLButtonElement;

  constructor(handlers: LobbyHandlers) {
    // ── ホスト側 ──
    this.startButton = button('探索を開始する', 'btn btn--primary', handlers.onStart);
    this.hostBox.append(
      el('p', 'panel__lead', 'この部屋コードを、邪魔をする人に伝えてください。'),
      this.codeText,
      this.members,
      this.startButton,
    );

    // ── 参加側 ──
    this.input = el('input', 'roomcode-input');
    this.input.type = 'text';
    this.input.inputMode = 'text';
    this.input.autocapitalize = 'characters';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.maxLength = ROOM_CODE_LENGTH + 4; // 区切り文字の入力を許す
    this.input.placeholder = '－'.repeat(ROOM_CODE_LENGTH);
    this.input.setAttribute('aria-label', '部屋コード');

    // 打った端から正規化する。小文字でもハイフン入りでも通る
    this.input.addEventListener('input', () => {
      const normalized = normalizeRoomCode(this.input.value);
      if (this.input.value !== normalized) this.input.value = normalized;
      submit.disabled = normalized.length !== ROOM_CODE_LENGTH;
    });

    const submit = button('この部屋に入る', 'btn btn--primary', () => {
      handlers.onJoinSubmit(normalizeRoomCode(this.input.value));
    });
    submit.disabled = true;

    this.joinBox.append(
      el('p', 'panel__lead', '探索する人から聞いた部屋コードを入力してください。'),
      this.input,
      submit,
    );

    this.root.append(
      el('h1', 'panel__title', 'へや'),
      this.hostBox,
      this.joinBox,
      this.status,
      button('やめる', 'btn btn--quiet', handlers.onCancel),
    );
  }

  showHost(code: string): void {
    this.hostBox.hidden = false;
    this.joinBox.hidden = true;
    // 読み上げやすいよう 1 文字ずつ離す
    this.codeText.textContent = code.split('').join(' ');
    this.root.hidden = false;
  }

  showJoin(): void {
    this.hostBox.hidden = true;
    this.joinBox.hidden = false;
    this.input.value = '';
    this.root.hidden = false;
    this.input.focus();
  }

  /** 参加人数の表示と、開始ボタンの可否 */
  setMembers(count: number): void {
    this.members.textContent =
      count === 0 ? '邪魔をする人を待っています…' : `邪魔をする人 ${count} 人が参加中`;
    // ひとりでも待たずに始められる。後から入ることもできる
    this.startButton.disabled = false;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
