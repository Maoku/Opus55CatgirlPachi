import {
  AUTO_SPEEDS,
  normalizeConfig,
  type AutoPlayConfig,
  type AutoSpeed,
} from '@/auto/AutoPlayConfig';
import type { AutoPlayController } from '@/auto/AutoPlayController';
import { rotationRate } from '@/auto/AutoPlayStats';
import type { Game } from '@/game/Game';
import { fmt, h } from './dom';
import { StatRow } from './Hud';
import { ReportView } from './ReportView';

export interface AutoPlayHandlers {
  start(config: AutoPlayConfig): void;
  pause(): void;
  resume(): void;
  stop(): void;
  speed(speed: AutoSpeed): void;
}

const STATUS_LABELS = {
  idle: '待機中',
  running: '実行中',
  draining: '盤面の玉を待っています',
  paused: '一時停止中',
  finished: '終了',
} as const;

/** 自動プレイの設定・実行・結果レポート */
export class AutoPlayPanel {
  readonly el: HTMLElement;
  private readonly inputs;
  private readonly startButton = h('button', { className: 'primary', textContent: '開始' });
  private readonly pauseButton = h('button', { textContent: '一時停止' });
  private readonly stopButton = h('button', { textContent: '停止' });
  private readonly status = h('div', { className: 'auto-status' });
  private readonly shotBar = h('progress', { max: 1, value: 0 });
  private readonly timeBar = h('progress', { max: 1, value: 0 });
  private readonly shotText = h('span', { className: 'muted' });
  private readonly timeText = h('span', { className: 'muted' });
  private readonly live = {
    spins: new StatRow('回転数'),
    jackpots: new StatRow('大当り (初当り)'),
    net: new StatRow('差玉'),
    rotation: new StatRow('回転率 (千円あたり)'),
    invested: new StatRow('投資'),
  };
  private readonly reportBox = h('div');
  private lastReportShown: unknown = null;

  constructor(
    private readonly auto: AutoPlayController,
    private readonly game: Game,
    private config: AutoPlayConfig,
    handlers: AutoPlayHandlers,
  ) {
    const c = config;
    const num = (value: number | null, attrs: { min?: string; step?: string } = {}) =>
      h('input', {
        type: 'number',
        className: 'num',
        value: value === null ? '' : String(value),
        ...attrs,
      });
    const check = (checked: boolean) => h('input', { type: 'checkbox', checked });
    const range = (v: number) =>
      h('input', {
        type: 'range',
        min: '0',
        max: '100',
        step: '1',
        value: String(Math.round(v * 100)),
      });
    this.inputs = {
      useShots: check(c.maxShots !== null),
      shots: num(c.maxShots ?? 1000, { min: '1', step: '100' }),
      useTime: check(c.maxTime !== null),
      minutes: num(c.maxTime === null ? 10 : Math.round((c.maxTime / 60) * 100) / 100, {
        min: '0.1',
        step: '1',
      }),
      left: range(c.leftStrength),
      right: range(c.rightStrength),
      leftValue: h('span', { className: 'strength-value' }),
      rightValue: h('span', { className: 'strength-value' }),
      autoSwitch: check(c.autoSwitch),
      lend: h('input', { type: 'radio', name: 'auto-empty', checked: c.onEmpty === 'lend' }),
      stopOnEmpty: h('input', { type: 'radio', name: 'auto-empty', checked: c.onEmpty === 'stop' }),
      maxInvest: num(c.maxInvest, { min: '0', step: '1000' }),
      initialBalls: num(c.initialBalls, { min: '0', step: '50' }),
      speed: h(
        'select',
        {},
        AUTO_SPEEDS.map((s) =>
          h('option', { value: String(s), textContent: s === 'max' ? '最大' : `${s}x` }),
        ),
      ),
      fixedSeed: check(c.seed !== null),
      seed: num(c.seed ?? 12345, { min: '0', step: '1' }),
    };
    const i = this.inputs;
    i.speed.value = String(c.speed);
    const syncStrength = () => {
      i.leftValue.textContent = `${i.left.value}%`;
      i.rightValue.textContent = `${i.right.value}%`;
    };
    syncStrength();
    i.left.addEventListener('input', syncStrength);
    i.right.addEventListener('input', syncStrength);
    i.speed.addEventListener('change', () => {
      const speed = (i.speed.value === 'max' ? 'max' : Number(i.speed.value)) as AutoSpeed;
      this.config = { ...this.config, speed };
      if (this.auto.active) handlers.speed(speed);
    });

    this.startButton.addEventListener('click', () => {
      this.config = this.readConfig();
      handlers.start(this.config);
    });
    this.pauseButton.addEventListener('click', () =>
      this.auto.status === 'paused' ? handlers.resume() : handlers.pause(),
    );
    this.stopButton.addEventListener('click', () => handlers.stop());

    this.el = h('section', { className: 'panel auto-panel' }, [
      h('h2', { textContent: '自動プレイ' }),
      h('div', { className: 'auto-form' }, [
        h('div', { className: 'field' }, [
          h('label', { textContent: '停止条件 (先に達したほうで止める)' }),
          h('div', { className: 'row' }, [
            h('label', { className: 'check' }, [i.useShots, '発射数']),
            i.shots,
            '発',
          ]),
          h('div', { className: 'row' }, [
            h('label', { className: 'check' }, [i.useTime, 'ゲーム内時間']),
            i.minutes,
            '分',
          ]),
        ]),
        h('div', { className: 'field' }, [
          h('label', { textContent: 'ハンドル' }),
          h('div', { className: 'row' }, [
            h('span', { textContent: '左打ち' }),
            i.left,
            i.leftValue,
          ]),
          h('div', { className: 'row' }, [
            h('span', { textContent: '右打ち' }),
            i.right,
            i.rightValue,
          ]),
          h('label', { className: 'check' }, [
            i.autoSwitch,
            '大当り・電サポ中は右打ちに切り替える',
          ]),
        ]),
        h('div', { className: 'field' }, [
          h('label', { textContent: '持ち玉' }),
          h('div', { className: 'row' }, ['開始時', i.initialBalls, '個 (0 なら貸玉から)']),
          h('label', { className: 'check' }, [i.lend, '切れたら貸玉 (上限', i.maxInvest, '円)']),
          h('label', { className: 'check' }, [i.stopOnEmpty, '切れたら止める']),
        ]),
        h('div', { className: 'row' }, [
          h('span', { textContent: '速度' }),
          i.speed,
          h('label', { className: 'check' }, [i.fixedSeed, 'シード固定']),
          i.seed,
        ]),
      ]),
      h('div', { className: 'row' }, [this.startButton, this.pauseButton, this.stopButton]),
      this.status,
      h('div', { className: 'progress-row' }, [
        h('span', { textContent: '発射' }),
        this.shotBar,
        this.shotText,
      ]),
      h('div', { className: 'progress-row' }, [
        h('span', { textContent: '時間' }),
        this.timeBar,
        this.timeText,
      ]),
      ...Object.values(this.live).map((r) => r.el),
      this.reportBox,
    ]);
    this.update();
  }

  /** 入力欄から設定を読む */
  readConfig(): AutoPlayConfig {
    const i = this.inputs;
    const speed = (i.speed.value === 'max' ? 'max' : Number(i.speed.value)) as AutoSpeed;
    return normalizeConfig({
      maxShots: i.useShots.checked ? Number(i.shots.value) : null,
      maxTime: i.useTime.checked ? Number(i.minutes.value) * 60 : null,
      leftStrength: Number(i.left.value) / 100,
      rightStrength: Number(i.right.value) / 100,
      autoSwitch: i.autoSwitch.checked,
      onEmpty: i.stopOnEmpty.checked ? 'stop' : 'lend',
      maxInvest: Number(i.maxInvest.value),
      speed,
      seed: i.fixedSeed.checked ? Number(i.seed.value) : null,
      initialBalls: Number(i.initialBalls.value),
    });
  }

  get currentConfig(): AutoPlayConfig {
    return this.config;
  }

  update(): void {
    const a = this.auto;
    const g = this.game;
    const active = a.active;
    this.startButton.disabled = active;
    this.pauseButton.disabled = !active || a.status === 'draining';
    this.pauseButton.textContent = a.status === 'paused' ? '再開' : '一時停止';
    this.stopButton.disabled = !active;
    for (const input of this.el.querySelectorAll<HTMLInputElement>('.auto-form input')) {
      input.disabled = active;
    }
    let status = STATUS_LABELS[a.status];
    if (active) status += ` (シード ${g.seed})`;
    this.status.textContent = status;
    const p = a.progress;
    const c = a.config;
    this.shotBar.value = p.shotRatio ?? 0;
    this.timeBar.value = p.timeRatio ?? 0;
    this.shotText.textContent = c?.maxShots ? `${fmt(p.shots)} / ${fmt(c.maxShots)}` : fmt(p.shots);
    this.timeText.textContent = c?.maxTime
      ? `${p.time.toFixed(0)} / ${c.maxTime.toFixed(0)} 秒`
      : `${p.time.toFixed(0)} 秒`;
    if (a.status !== 'idle') {
      this.live.spins.set(fmt(g.spins));
      this.live.jackpots.set(`${fmt(g.jackpots)} (${fmt(g.firstHits)})`);
      this.live.net.set(`${g.net > 0 ? '+' : ''}${fmt(g.net)}`);
      const rr = rotationRate(g);
      this.live.rotation.set(rr === null ? '—' : rr.toFixed(1));
      this.live.invested.set(`${fmt(g.invested)} 円`);
    }
    if (a.report !== this.lastReportShown) {
      this.lastReportShown = a.report;
      this.reportBox.replaceChildren(...(a.report ? [new ReportView(a.report).el] : []));
    }
  }
}
