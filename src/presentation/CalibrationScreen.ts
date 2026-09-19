import { button, el } from './dom';

export class CalibrationScreen {
  readonly root = el('div', 'panel');

  constructor(handlers: { onConfirm: () => void }) {
    this.root.append(
      el('h1', 'panel__title', '正面を決めます'),
      el(
        'p',
        'panel__lead',
        '端末をまっすぐ前に構えて、ボタンを押してください。' +
          'この向きが、ゲーム世界の正面になります。',
      ),
      button('この向きを正面にする', 'btn btn--primary', handlers.onConfirm),
    );
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
