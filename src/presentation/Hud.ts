import type { GameView } from '@/application/Game';
import type { GameConfig } from '@/domain/config/GameConfig';
import { formatDuration } from '@/domain/session/SessionResult';
import { button, el } from './dom';

export interface HudHandlers {
  onToggleLight: () => void;
  onRecalibrate: () => void;
}

/**
 * HUD はすべて DOM で構成する。Three.js 内に UI を描画しない。
 * 文字の品質が高く、描画負荷がフレーム予算を食わないため（設計書 06.3）。
 */
export class Hud {
  readonly root = el('div', 'layer');

  private readonly remaining = el('div', 'hud-text');
  private readonly timer = el('div', 'hud-text');
  private readonly reticle = el('div', 'reticle');
  private readonly gauge = el('div', 'gauge');
  private readonly gaugeFill = el('div', 'gauge__fill');
  private readonly warn = el('div', 'warn');
  private readonly blackout = el('div', 'blackout');
  private readonly lightButton: HTMLButtonElement;

  private lastPurify = 0;

  constructor(
    private readonly config: GameConfig,
    handlers: HudHandlers,
  ) {
    const top = el('div', 'hud__top');
    top.append(this.remaining, this.timer);

    const bottom = el('div', 'hud__bottom');
    this.lightButton = button('💡', 'btn btn--icon', handlers.onToggleLight);
    this.lightButton.setAttribute('aria-label', '照射の切り替え');
    const recalibrate = button('正面を再設定', 'btn', handlers.onRecalibrate);
    bottom.append(recalibrate, this.lightButton);

    this.gauge.append(this.gaugeFill);
    this.root.append(this.warn, this.blackout, top, this.reticle, this.gauge, bottom);

    this.layoutReticle(60);
    window.addEventListener('resize', () => {
      this.layoutReticle(60);
    });
  }

  /**
   * 照準の半径を FOV と光錐角から幾何的に算出する（設計書 06.4）。
   * 光錐が視野より狭いことを、プレイヤーに伝える唯一の手段である。
   */
  layoutReticle(fovDeg: number): void {
    const halfFov = (fovDeg / 2) * (Math.PI / 180);
    const radiusPx =
      (Math.tan(this.config.beamHalfAngle) / Math.tan(halfFov)) *
      (window.innerHeight / 2);

    // 画面からはみ出す照準は「狙う」という行為を伝えられない。
    // 設定が水平視野より広い場合の保険としてクランプする
    const limit = Math.min(window.innerWidth, window.innerHeight) * 0.45;
    const size = Math.max(32, Math.min(radiusPx, limit) * 2);

    this.reticle.style.width = `${size}px`;
    this.reticle.style.height = `${size}px`;
    this.gauge.style.transform = `translate(-50%, ${size / 2 + 18}px)`;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(view: GameView): void {
    const alive = view.state.ghosts.filter((g) => g.phase !== 'BANISHED').length;
    this.remaining.textContent = `残り ${alive}`;
    this.timer.textContent = formatDuration(view.state.elapsedMs);

    const lightOn = view.state.light === 'ON';
    this.lightButton.classList.toggle('btn--on', lightOn);
    this.reticle.classList.toggle('reticle--off', !lightOn);

    const purify = view.activePurify;
    this.reticle.classList.toggle('reticle--held', purify !== null);

    const shown = purify ?? this.lastPurify;
    const decaying = purify === null && shown > 0.01;
    this.gauge.classList.toggle('gauge--visible', shown > 0.01);
    this.gauge.classList.toggle('gauge--decaying', decaying);
    this.gaugeFill.style.width = `${Math.round(shown * 100)}%`;
    this.lastPurify = purify ?? decayToward(this.lastPurify);

    this.updateWarning(view);
  }

  /** 接近警告。方向は音の補助であり、精度は粗くてよい（設計書 06.4） */
  private updateWarning(view: GameView): void {
    const nearest = view.nearest;
    if (nearest === null || nearest.distance > this.config.visibleMaxDistance) {
      this.warn.style.opacity = '0';
      this.warn.classList.remove('warn--near');
      return;
    }

    const near = nearest.distance <= this.config.hapticWarnDistance;
    this.warn.classList.toggle('warn--near', near);
    if (!near) {
      const t =
        1 -
        (nearest.distance - this.config.hapticWarnDistance) /
          (this.config.visibleMaxDistance - this.config.hapticWarnDistance);
      this.warn.style.opacity = String(Math.max(0, Math.min(0.5, t * 0.5)));
    }

    // 方位を画面端の位置へ写す。背後は下端に寄せる
    const x = 50 + Math.sin(nearest.azimuth) * 50;
    const y = 50 - Math.cos(nearest.azimuth) * 45;
    this.warn.style.setProperty('--warn-x', `${x}%`);
    this.warn.style.setProperty('--warn-y', `${y}%`);
  }

  setBlackout(on: boolean): void {
    this.blackout.classList.toggle('blackout--on', on);
  }

  resetEffects(): void {
    this.setBlackout(false);
    this.lastPurify = 0;
    this.warn.style.opacity = '0';
    this.warn.classList.remove('warn--near');
  }
}

function decayToward(value: number): number {
  return value > 0.01 ? value * 0.9 : 0;
}
