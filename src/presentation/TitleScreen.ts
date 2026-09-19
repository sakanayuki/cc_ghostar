import { formatDuration } from '@/domain/session/SessionResult';
import { button, el } from './dom';

export interface TitleScreenHandlers {
  onStart: () => void;
}

/**
 * タイトル画面。START タップがユーザー操作を起点とする API の呼び出し点になる
 * （設計書 06.1）。注意書きを常時表示する（設計書 06.6）。
 */
export class TitleScreen {
  readonly root = el('div', 'panel');
  private readonly record = el('div', 'panel__record');

  constructor(handlers: TitleScreenHandlers) {
    const title = el('h1', 'panel__title', 'TORCH WEBAR HORROR');
    const lead = el(
      'p',
      'panel__lead',
      'この端末は、現実には見えないものを映し出す懐中電灯です。' +
        '暗い部屋を見回し、光を当てて幽霊を浄化してください。' +
        '光の届かない方向にいるものは、その間も近づいてきます。',
    );

    const notes = el('ul', 'panel__notes');
    for (const text of [
      '音が出ます。音量にご注意ください',
      '暗い場所での使用を想定しています。周囲の安全を確認してください',
      '驚かせる演出が含まれます',
    ]) {
      notes.append(el('li', undefined, text));
    }

    const start = button('探索を開始する', 'btn btn--primary', handlers.onStart);

    this.root.append(title, lead, notes, this.record, start);
  }

  update(bestTimeMs: number | null): void {
    this.record.textContent =
      bestTimeMs === null ? '' : `最短クリア記録  ${formatDuration(bestTimeMs)}`;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
