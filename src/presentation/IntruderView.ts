import { SOUND_KEYS } from '@/domain/multiplayer/NetMessages';
import type { SnapshotGhost, SoundKey } from '@/domain/multiplayer/NetMessages';
import { cooldownProgress, remainingMs } from '@/domain/multiplayer/Cooldown';
import type { CooldownState } from '@/domain/multiplayer/Cooldown';
import {
  azimuthToCanvasAngle,
  isInsideCircle,
  polarToScreen,
  screenToWorld,
} from '@/domain/multiplayer/TopDownView';
import type { ViewPort } from '@/domain/multiplayer/TopDownView';
import { button, el } from './dom';

/** 画面下部のボタン名。音の対応を直すならここだけ変えればよい */
export const SOUND_LABELS: Readonly<Record<SoundKey, string>> = {
  knock: 'ノック',
  drop: '落とす',
  footsteps: '足音',
  roll: '転がす',
  glass: 'ガラス',
};

/** 円の縁が表す距離 */
const RANGE_METERS = 12;

/** 光の扇の見た目の広がり（実際の捕捉角より広く描く。細すぎると見えないため） */
const BEAM_HALF_ANGLE = 0.42;

export interface IntruderViewState {
  readonly yaw: number;
  readonly light: boolean;
  readonly ghosts: readonly SnapshotGhost[];
  readonly remaining: number;
  readonly elapsedMs: number;
  readonly connected: boolean;
}

export interface SoundMarker {
  readonly x: number;
  readonly z: number;
  readonly atMs: number;
}

export interface IntruderViewHandlers {
  onPlace: (sound: SoundKey, x: number, z: number) => void;
}

/**
 * 妨害側の画面（設計書 10.7）。
 *
 * ホストを真上から見た視点。画面の 12 時がワールドの正面で、ホストが端末を
 * 右へ向ければ光の扇が時計回りに動く。
 *
 * Three.js は使わない。2D の図形しか描かないため Canvas 2D で十分軽く、
 * ホスト側の描画負荷とも競合しない。
 */
export class IntruderView {
  readonly root = el('div', 'intruder');

  private readonly canvas = el('canvas', 'intruder__canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly statusText = el('div', 'intruder__status hud-text');
  private readonly hint = el('div', 'intruder__hint hud-text');
  private readonly buttons = new Map<SoundKey, HTMLButtonElement>();

  private selected: SoundKey = 'knock';
  private cooldown: CooldownState = { lastAcceptedMs: null };
  private markers: SoundMarker[] = [];
  private state: IntruderViewState = {
    yaw: 0,
    light: true,
    ghosts: [],
    remaining: 0,
    elapsedMs: 0,
    connected: false,
  };

  constructor(private readonly handlers: IntruderViewHandlers) {
    this.ctx = this.canvas.getContext('2d');

    const bar = el('div', 'intruder__bar');
    for (const key of SOUND_KEYS) {
      const b = button(SOUND_LABELS[key], 'btn btn--sound', () => {
        this.select(key);
      });
      this.buttons.set(key, b);
      bar.append(b);
    }

    this.canvas.addEventListener('pointerdown', this.onTap);

    this.root.append(this.statusText, this.canvas, this.hint, bar);
    this.select('knock');
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) this.resize();
  }

  resize(): void {
    const ratio = Math.min(window.devicePixelRatio, 2);
    const size = Math.min(window.innerWidth, window.innerHeight * 0.62);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * ratio);
    this.canvas.height = Math.round(size * ratio);
  }

  update(state: IntruderViewState, nowMs: number): void {
    this.state = state;
    // 一定時間が過ぎた音の波紋は消す
    this.markers = this.markers.filter((m) => nowMs - m.atMs < 1800);
    this.draw(nowMs);
    this.updateButtons(nowMs);

    this.statusText.textContent = state.connected
      ? `残り ${state.remaining} ・ ${formatClock(state.elapsedMs)}`
      : '接続が切れました';
  }

  /** 自分と他の妨害者が鳴らした音の波紋 */
  addMarker(x: number, z: number, nowMs: number): void {
    this.markers.push({ x, z, atMs: nowMs });
  }

  /** クールダウンを開始する。ホストに受理された時点で呼ぶ */
  startCooldown(state: CooldownState): void {
    this.cooldown = state;
  }

  get cooldownState(): CooldownState {
    return this.cooldown;
  }

  private select(key: SoundKey): void {
    this.selected = key;
    for (const [k, b] of this.buttons) b.classList.toggle('btn--on', k === key);
    this.hint.textContent = `「${SOUND_LABELS[key]}」を鳴らす場所をタップ`;
  }

  private readonly onTap = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const view = this.viewPort();
    // CSS 上の座標を、Canvas の内部解像度へ合わせる
    const scale = this.canvas.width / rect.width;
    const p = {
      sx: (event.clientX - rect.left) * scale,
      sy: (event.clientY - rect.top) * scale,
    };

    if (!isInsideCircle(p, view)) return;
    if (remainingMs(this.cooldown, performance.now()) > 0) return;

    const world = screenToWorld(p, view);
    this.handlers.onPlace(this.selected, world.x, world.z);
  };

  private viewPort(): ViewPort {
    const size = this.canvas.width;
    return {
      cx: size / 2,
      cy: size / 2,
      radius: size * 0.44,
      rangeMeters: RANGE_METERS,
    };
  }

  private updateButtons(nowMs: number): void {
    const progress = cooldownProgress(this.cooldown, nowMs);
    const left = remainingMs(this.cooldown, nowMs);
    const locked = left > 0;

    for (const b of this.buttons.values()) {
      b.classList.toggle('btn--cooling', locked);
      // 進捗を背景のグラデーションで見せる。数字だけより残りが直感的に分かる
      b.style.setProperty('--cool', `${Math.round(progress * 100)}%`);
    }
    if (locked) {
      this.hint.textContent = `つぎに鳴らせるまで ${(left / 1000).toFixed(1)} 秒`;
    } else if (!this.hint.textContent?.includes('タップ')) {
      this.hint.textContent = `「${SOUND_LABELS[this.selected]}」を鳴らす場所をタップ`;
    }
  }

  private draw(nowMs: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    const view = this.viewPort();
    const size = this.canvas.width;
    ctx.clearRect(0, 0, size, size);

    // ── 部屋の輪郭 ──
    ctx.strokeStyle = '#3a424e';
    ctx.lineWidth = Math.max(2, size * 0.012);
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.radius, 0, Math.PI * 2);
    ctx.stroke();

    // ── 懐中電灯の光（12 時が正面） ──
    if (this.state.light) {
      const a = azimuthToCanvasAngle(this.state.yaw);
      const grad = ctx.createRadialGradient(
        view.cx,
        view.cy,
        0,
        view.cx,
        view.cy,
        view.radius,
      );
      grad.addColorStop(0, 'rgba(228, 220, 188, 0.85)');
      grad.addColorStop(1, 'rgba(228, 220, 188, 0.12)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(view.cx, view.cy);
      ctx.arc(view.cx, view.cy, view.radius, a - BEAM_HALF_ANGLE, a + BEAM_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
    }

    // ── 音の波紋 ──
    for (const m of this.markers) {
      const age = (nowMs - m.atMs) / 1800;
      const p = { sx: 0, sy: 0 };
      const scale = view.radius / view.rangeMeters;
      p.sx = view.cx + m.x * scale;
      p.sy = view.cy + m.z * scale;

      ctx.strokeStyle = `rgba(127, 212, 255, ${(1 - age) * 0.9})`;
      ctx.lineWidth = Math.max(1.5, size * 0.006);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size * 0.02 + age * size * 0.09, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── ゴースト ──
    for (const g of this.state.ghosts) {
      if (g.phase === 'BANISHED') continue;
      const p = polarToScreen(g.azimuth, Math.min(g.distance, view.rangeMeters), view);
      const r = size * (g.phase === 'GRABBING' ? 0.028 : 0.022);

      ctx.fillStyle =
        g.phase === 'HELD' ? 'rgba(127, 212, 255, 0.95)' : 'rgba(200, 65, 47, 0.95)';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();

      if (g.purify > 0.01) {
        ctx.strokeStyle = 'rgba(127, 212, 255, 0.95)';
        ctx.lineWidth = Math.max(2, size * 0.008);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 1.8, -Math.PI / 2, -Math.PI / 2 + g.purify * Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── ホスト（中心） ──
    ctx.fillStyle = '#262b33';
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
    // 向きが分かるよう、正面側に小さな印を置く
    const head = polarToScreen(this.state.yaw, RANGE_METERS * 0.055, view);
    ctx.fillStyle = '#4c5563';
    ctx.beginPath();
    ctx.arc(head.sx, head.sy, size * 0.016, 0, Math.PI * 2);
    ctx.fill();
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
