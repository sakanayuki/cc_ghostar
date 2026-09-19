import type { SessionResult } from '@/domain/session/SessionResult';
import { formatDuration } from '@/domain/session/SessionResult';
import { button, el } from './dom';

export class ResultScreen {
  readonly root = el('div', 'panel');
  private readonly title = el('h1', 'panel__title');
  private readonly detail = el('p', 'panel__lead');
  private readonly record = el('div', 'panel__record');

  constructor(handlers: { onRetry: () => void }) {
    this.root.append(
      this.title,
      this.detail,
      this.record,
      button('もう一度', 'btn btn--primary', handlers.onRetry),
    );
  }

  update(result: SessionResult | null, bestTimeMs: number | null): void {
    if (result === null) return;

    const cleared = result.outcome === 'CLEARED';
    this.title.textContent = cleared ? 'CLEARED' : 'CAUGHT';
    this.detail.textContent = cleared
      ? `${formatDuration(result.elapsedMs)} で ${result.totalCount} 体すべてを浄化した。`
      : `${result.totalCount} 体中 ${result.purifiedCount} 体を浄化したところで捕まった。`;

    if (result.isNewBest) {
      this.record.textContent = '自己最短記録';
    } else if (cleared && bestTimeMs !== null) {
      this.record.textContent = `最短記録  ${formatDuration(bestTimeMs)}`;
    } else {
      this.record.textContent = '';
    }
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
