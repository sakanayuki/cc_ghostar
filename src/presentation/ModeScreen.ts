import { button, el } from './dom';

export type GameMode = 'SINGLE' | 'MULTI';
export type MultiRole = 'HOST' | 'JOIN';

export interface ModeScreenHandlers {
  onSingle: () => void;
  onHost: () => void;
  onJoin: () => void;
  onBack: () => void;
}

/**
 * シングル／マルチの選択と、マルチでの役割選択（設計書 10.1）。
 *
 * 2 段構えにしているのは、シングルで遊ぶ人に通信の話を一切見せないため。
 */
export class ModeScreen {
  readonly root = el('div', 'panel');

  private readonly step1 = el('div', 'panel__stack');
  private readonly step2 = el('div', 'panel__stack');

  constructor(handlers: ModeScreenHandlers) {
    const title = el('h1', 'panel__title', 'TORCH WEBAR HORROR');

    // ── 1 段目: 遊び方 ──
    this.step1.append(
      el('p', 'panel__lead', '遊び方を選んでください。'),
      button('ひとりで遊ぶ', 'btn btn--primary', handlers.onSingle),
      button('みんなで遊ぶ', 'btn', () => {
        this.showStep(2);
      }),
    );

    // ── 2 段目: マルチの役割 ──
    this.step2.append(
      el('p', 'panel__lead', 'あなたの役割を選んでください。'),
      el(
        'p',
        'panel__note',
        '探索する人が 1 人、邪魔をする人が最大 3 人まで参加できます。',
      ),
      button('部屋を作る（探索する）', 'btn btn--primary', handlers.onHost),
      button('部屋を探す（邪魔をする）', 'btn', handlers.onJoin),
      button('もどる', 'btn btn--quiet', () => {
        this.showStep(1);
      }),
    );

    this.root.append(title, this.step1, this.step2);
    this.showStep(1);
  }

  showStep(step: 1 | 2): void {
    this.step1.hidden = step !== 1;
    this.step2.hidden = step !== 2;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) this.showStep(1);
  }
}
