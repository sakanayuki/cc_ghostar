import { button, el } from './dom';

export interface OverlayContent {
  readonly title: string;
  readonly lines: readonly string[];
  readonly retry?: (() => void) | undefined;
}

/** エラー・告知の表示（設計書 06.7） */
export class OverlayMessage {
  readonly root = el('div', 'panel');
  private readonly title = el('h1', 'panel__title');
  private readonly body = el('p', 'panel__lead');
  private readonly actions = el('div');

  constructor() {
    this.root.append(this.title, this.body, this.actions);
    this.root.hidden = true;
  }

  show(content: OverlayContent): void {
    this.title.textContent = content.title;
    this.body.innerHTML = '';
    content.lines.forEach((line, index) => {
      if (index > 0) this.body.append(el('br'));
      this.body.append(document.createTextNode(line));
    });

    this.actions.innerHTML = '';
    if (content.retry !== undefined) {
      this.actions.append(button('再試行', 'btn btn--primary', content.retry));
    }
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}

/** 一時的なトースト。Torch 非対応の告知などに使う */
export class Toast {
  readonly root = el('div', 'panel');
  private timer: number | null = null;

  constructor() {
    this.root.hidden = true;
    this.root.style.background = 'transparent';
    this.root.style.pointerEvents = 'none';
    this.root.style.justifyContent = 'flex-end';
    this.root.style.paddingBottom = '18vh';
  }

  show(lines: readonly string[], durationMs = 4200): void {
    this.root.innerHTML = '';
    const box = el('p', 'panel__lead');
    box.style.background = 'rgba(8, 12, 18, 0.9)';
    box.style.padding = '0.9rem 1.2rem';
    box.style.borderRadius = '10px';
    lines.forEach((line, index) => {
      if (index > 0) box.append(el('br'));
      box.append(document.createTextNode(line));
    });
    this.root.append(box);
    this.root.hidden = false;

    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.root.hidden = true;
    }, durationMs);
  }
}
