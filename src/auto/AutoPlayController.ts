import { EventBus } from '@/core/EventBus';
import type { Game } from '@/game/Game';
import type { AutoPlayConfig } from './AutoPlayConfig';
import {
  makeReport,
  snapshot,
  type AutoPlayReport,
  type HistoryPoint,
  type StopReason,
} from './AutoPlayStats';

export type AutoPlayStatus = 'idle' | 'running' | 'draining' | 'paused' | 'finished';

export interface AutoPlayEvents {
  status: { status: AutoPlayStatus };
  finished: { report: AutoPlayReport };
  /** 実行中にハンドルの強度が変わった */
  strength: { leftStrength: number; rightStrength: number };
}

export type ShotSide = 'left' | 'right';

/** 発射数に達したあと、盤面に残った玉を待つ上限 (秒) */
const DRAIN_LIMIT = 20;
/** 持ち玉推移を記録する間隔 (ゲーム内時間の秒) */
const HISTORY_INTERVAL = 1;
/** 持ち玉推移の点数の上限。超えたら 1 つおきに間引いて記録の間隔を倍にする */
export const HISTORY_LIMIT = 4000;

/**
 * 自動プレイ。ステップごとに beforeStep / afterStep を呼ぶと、ハンドルの強度と発射を操作し、
 * 停止条件 (発射数・ゲーム内時間) を判定する。Game は開始前にリセットしておく。
 */
export class AutoPlayController {
  readonly bus = new EventBus<AutoPlayEvents>();
  status: AutoPlayStatus = 'idle';
  config: AutoPlayConfig | null = null;
  report: AutoPlayReport | null = null;
  readonly history: HistoryPoint[] = [];
  private boardName = '';
  private nextHistoryAt = 0;
  private historyInterval = HISTORY_INTERVAL;
  private drainTime = 0;
  private resumeStatus: AutoPlayStatus = 'running';
  /** 前のステップで打った側と、ハンドルに設定した強度 (手動で動かされたかの判定に使う) */
  private appliedSide: ShotSide | null = null;
  private appliedStrength = 0;

  constructor(private readonly game: Game) {}

  get active(): boolean {
    return this.status === 'running' || this.status === 'draining' || this.status === 'paused';
  }

  /** 開始する。game は reset 済みであること */
  begin(config: AutoPlayConfig, boardName: string): void {
    this.config = { ...config };
    this.boardName = boardName;
    this.appliedSide = null;
    this.report = null;
    this.history.length = 0;
    this.history.push(snapshot(this.game));
    this.historyInterval = HISTORY_INTERVAL;
    this.nextHistoryAt = HISTORY_INTERVAL;
    this.drainTime = 0;
    this.setStatus('running');
  }

  pause(): void {
    if (this.status !== 'running' && this.status !== 'draining') return;
    this.resumeStatus = this.status;
    this.game.launcher.holding = false;
    this.setStatus('paused');
  }

  resume(): void {
    if (this.status === 'paused') this.setStatus(this.resumeStatus);
  }

  stop(): void {
    if (this.active) this.finish('manual');
  }

  /** 実行中に左打ち・右打ちの強度を変える。次のステップから反映する */
  setStrength(side: ShotSide, strength: number): void {
    const c = this.config;
    if (!c) return;
    const v = Math.min(1, Math.max(0, strength));
    const key = side === 'right' ? 'rightStrength' : 'leftStrength';
    if (c[key] === v) return;
    c[key] = v;
    // いま打っている側ならハンドルにもすぐ反映する (一時停止中の表示のため)
    if (side === this.appliedSide) {
      this.game.launcher.setStrength(v);
      this.appliedStrength = this.game.launcher.strength;
    }
    this.bus.emit('strength', { leftStrength: c.leftStrength, rightStrength: c.rightStrength });
  }

  /** 進み具合 (0..1)。発射数と時間のうち進んでいるほう */
  get progress(): {
    shots: number;
    time: number;
    shotRatio: number | null;
    timeRatio: number | null;
  } {
    const c = this.config;
    const shots = this.game.launched;
    const time = this.game.time;
    return {
      shots,
      time,
      shotRatio: c?.maxShots ? Math.min(1, shots / c.maxShots) : null,
      timeRatio: c?.maxTime ? Math.min(1, time / c.maxTime) : null,
    };
  }

  /** 物理を 1 ステップ進める前に呼ぶ: ハンドル操作と貸玉 */
  beforeStep(): void {
    const c = this.config;
    const g = this.game;
    if (!c || (this.status !== 'running' && this.status !== 'draining')) return;
    const side: ShotSide = c.autoSwitch && g.machine.rightShot ? 'right' : 'left';
    // 実行中にハンドルを動かしたら、その側の強度として以後その値で打ち続ける
    if (side === this.appliedSide && g.launcher.strength !== this.appliedStrength) {
      this.setStrength(side, g.launcher.strength);
    }
    g.launcher.setStrength(side === 'right' ? c.rightStrength : c.leftStrength);
    this.appliedSide = side;
    this.appliedStrength = g.launcher.strength;
    g.launcher.locked = false;
    g.launcher.holding = this.status === 'running';
    if (this.status === 'running' && g.held <= 0) {
      if (c.onEmpty === 'lend' && g.invested + 1000 <= c.maxInvest) g.lend();
    }
  }

  /** 物理を 1 ステップ進めたあとに呼ぶ: 停止条件と記録 */
  afterStep(dt: number): void {
    const c = this.config;
    const g = this.game;
    if (!c || (this.status !== 'running' && this.status !== 'draining')) return;
    if (g.time >= this.nextHistoryAt) {
      this.history.push(snapshot(g));
      this.nextHistoryAt += this.historyInterval;
      if (this.history.length > HISTORY_LIMIT) this.thinHistory();
    }
    if (c.maxTime !== null && g.time >= c.maxTime - 1e-9) {
      this.finish('time');
      return;
    }
    const shotsDone = c.maxShots !== null && g.launched >= c.maxShots;
    if (this.status === 'running') {
      if (shotsDone) {
        this.drainTime = 0;
        this.setStatus('draining');
      } else if (g.held <= 0 && g.balls.count === 0) {
        // 貸玉もできず、戻ってくる玉もない
        const canLend = c.onEmpty === 'lend' && g.invested + 1000 <= c.maxInvest;
        if (!canLend) this.finish('empty');
      }
      return;
    }
    // draining: 発射をやめて盤面の玉がなくなるのを待つ。ファールで発射数が減ったら打ち直す
    if (!shotsDone) {
      this.setStatus('running');
      return;
    }
    this.drainTime += dt;
    if (g.balls.count === 0 || this.drainTime >= DRAIN_LIMIT) this.finish('shots');
  }

  /** 長時間の実行で記録が増えすぎないよう、1 つおきに間引く (最初の点は残す) */
  private thinHistory(): void {
    const h = this.history;
    let w = 1;
    for (let i = 2; i < h.length; i += 2) h[w++] = h[i]!;
    h.length = w;
    this.historyInterval *= 2;
  }

  private finish(reason: StopReason): void {
    const g = this.game;
    g.launcher.holding = false;
    this.history.push(snapshot(g));
    this.report = makeReport(g, this.boardName, this.config!, reason, this.history);
    this.setStatus('finished');
    this.bus.emit('finished', { report: this.report });
  }

  private setStatus(status: AutoPlayStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.bus.emit('status', { status });
  }
}
