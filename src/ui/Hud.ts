import type { Game } from '@/game/Game';
import { fmt, h } from './dom';

export interface HudHandlers {
  onStrength(v: number): void;
  onToggleLock(): void;
}

/** 数値を表示する 1 行 */
export class StatRow {
  readonly el: HTMLDivElement;
  private readonly value: HTMLSpanElement;
  private last = '';

  constructor(label: string, className = '') {
    this.value = h('span', { className: 'stat-value' });
    this.el = h('div', { className: `stat ${className}` }, [
      h('span', { className: 'stat-label', textContent: label }),
      this.value,
    ]);
  }

  set(text: string): void {
    if (text !== this.last) {
      this.value.textContent = text;
      this.last = text;
    }
  }
}

/** プレイ中の HUD (持ち玉・発射数・ハンドル) */
export class Hud {
  readonly el: HTMLElement;
  readonly strength: HTMLInputElement;
  private readonly strengthValue: HTMLSpanElement;
  private readonly lockButton: HTMLButtonElement;
  private readonly held = new StatRow('持ち玉', 'big');
  private readonly launched = new StatRow('発射数');
  private readonly payout = new StatRow('総賞球');
  private readonly net = new StatRow('差玉');
  /** 後のフェーズで項目を追加する場所 */
  readonly extra: HTMLDivElement = h('div');

  constructor(
    private readonly game: Game,
    handlers: HudHandlers,
  ) {
    this.strength = h('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      className: 'strength',
    });
    this.strength.addEventListener('input', () =>
      handlers.onStrength(Number(this.strength.value) / 100),
    );
    this.strengthValue = h('span', { className: 'strength-value' });
    this.lockButton = h('button', { className: 'toggle', textContent: '発射固定 (F)' });
    this.lockButton.addEventListener('click', () => handlers.onToggleLock());

    this.el = h('section', { className: 'panel hud' }, [
      h('h2', { textContent: 'プレイ' }),
      this.held.el,
      this.launched.el,
      this.payout.el,
      this.net.el,
      this.extra,
      h('div', { className: 'field' }, [
        h('label', { textContent: 'ハンドル強度' }),
        h('div', { className: 'row' }, [this.strength, this.strengthValue]),
      ]),
      h('div', { className: 'row' }, [this.lockButton]),
      h('p', {
        className: 'help',
        innerHTML:
          '<kbd>Space</kbd> 押している間発射 / <kbd>F</kbd> 発射固定<br>' +
          '<kbd>↑</kbd><kbd>↓</kbd> またはホイールで強度調整',
      }),
    ]);
  }

  update(): void {
    const g = this.game;
    this.held.set(fmt(g.held));
    this.launched.set(fmt(g.launched));
    this.payout.set(fmt(g.payout));
    this.net.set((g.net > 0 ? '+' : '') + fmt(g.net));
    const s = Math.round(g.launcher.strength * 100);
    if (this.strength.value !== String(s) && document.activeElement !== this.strength) {
      this.strength.value = String(s);
    }
    this.strengthValue.textContent = `${s}%`;
    this.lockButton.classList.toggle('on', g.launcher.locked);
  }
}
