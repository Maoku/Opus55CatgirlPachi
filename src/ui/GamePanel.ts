import type { Game } from '@/game/Game';
import type { Mode } from '@/game/Lottery';
import { fmt, h } from './dom';
import { StatRow } from './Hud';

export const MODE_LABELS: Record<Mode, string> = {
  normal: '通常',
  jackpot: '大当り',
  st: 'ST',
  jitan: '時短',
};

/** 抽選まわりの表示 (遊技状態・保留・回転数・大当り回数・投資) と貸玉ボタン */
export class GamePanel {
  readonly el: HTMLElement;
  /** キャンバスに重ねる「右打ち」表示 */
  readonly rightShotBadge: HTMLDivElement;
  private readonly mode = h('div', { className: 'mode-badge' });
  private readonly modeDetail = h('div', { className: 'mode-detail' });
  private readonly holdLamps: HTMLSpanElement[];
  private readonly fuzuLamps: HTMLSpanElement[];
  private readonly spins = new StatRow('回転数 (大当り後 / 累計)');
  private readonly jackpots = new StatRow('大当り (初当り)');
  private readonly invested = new StatRow('投資');
  private readonly lendButton = h('button', { textContent: '貸玉 (1000円 / 250玉)' });

  constructor(
    private readonly game: Game,
    overlay: HTMLElement,
    onChange: () => void,
  ) {
    this.holdLamps = Array.from({ length: game.spec.maxHolds }, () =>
      h('span', { className: 'lamp' }),
    );
    this.fuzuLamps = Array.from({ length: game.spec.fuzu.maxHolds }, () =>
      h('span', { className: 'lamp small' }),
    );
    this.lendButton.addEventListener('click', () => {
      game.lend();
      onChange();
    });
    const buttons: HTMLElement[] = [this.lendButton];
    if (import.meta.env.DEV) {
      const force = h('button', { textContent: '強制大当り (開発用)', className: 'debug' });
      force.addEventListener('click', () => {
        game.forceJackpot();
        onChange();
      });
      buttons.push(force);
    }
    this.el = h('div', { className: 'game-panel' }, [
      h('div', { className: 'mode-row' }, [this.mode, this.modeDetail]),
      h('div', { className: 'lamps-row' }, [
        h('span', { className: 'stat-label', textContent: '保留' }),
        h('span', { className: 'lamps' }, this.holdLamps),
        h('span', { className: 'stat-label', textContent: '普図' }),
        h('span', { className: 'lamps' }, this.fuzuLamps),
      ]),
      this.spins.el,
      this.jackpots.el,
      this.invested.el,
      h('div', { className: 'row buttons' }, buttons),
    ]);
    this.rightShotBadge = h('div', { className: 'right-shot', textContent: '右打ち →' });
    overlay.append(this.rightShotBadge);
  }

  /** @param showBadge 右打ち表示を出してよいか (エディット中は出さない) */
  update(showBadge = true): void {
    const g = this.game;
    const m = g.machine;
    this.mode.textContent = MODE_LABELS[m.mode];
    this.mode.dataset.mode = m.mode;
    let detail = '';
    if (m.jackpot) {
      const j = m.jackpot;
      detail =
        j.phase === 'round'
          ? `ROUND ${j.round}/${g.spec.rounds}  ${j.count}/${g.spec.roundMaxCount}カウント`
          : j.phase === 'opening'
            ? 'オープニング'
            : j.phase === 'ending'
              ? `終了 → ${j.toSt ? 'ST' : '時短'}`
              : `ROUND ${j.round} 終了`;
    } else if (m.support) {
      detail = `残り ${m.supportLeft} 回`;
    } else if (m.spin && !m.spin.stopped) {
      detail = m.spin.reach ? 'リーチ!' : '変動中';
    }
    this.modeDetail.textContent = detail;
    this.holdLamps.forEach((l, i) => l.classList.toggle('on', i < m.holds.length));
    this.fuzuLamps.forEach((l, i) => l.classList.toggle('on', i < m.fuzu.holds));
    this.spins.set(`${fmt(g.spinsSinceJackpot)} / ${fmt(g.spins)}`);
    this.jackpots.set(`${fmt(g.jackpots)} (${fmt(g.firstHits)})`);
    this.invested.set(`${fmt(g.invested)} 円`);
    this.rightShotBadge.classList.toggle('on', showBadge && m.rightShot);
    this.lendButton.classList.toggle('primary', g.held <= 0);
  }
}
