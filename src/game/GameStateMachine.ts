import { EventBus } from '@/core/EventBus';
import type { SeededRng } from '@/core/SeededRng';
import type { GameSpec } from './GameSpec';
import { drawHold, isSupport, judge, type Hold, type Mode, type SpinResult } from './Lottery';

export type LidKind = 'electric' | 'attacker';
export type JackpotPhase = 'opening' | 'round' | 'interval' | 'ending';

export interface SpinState extends SpinResult {
  /** 変動を始めた時点の遊技状態 */
  mode: Mode;
  elapsed: number;
  stopped: boolean;
  /** 停止してから次へ進むまでの残り時間 */
  pause: number;
  /** 累計で何回目の変動か */
  index: number;
}

export interface JackpotState {
  phase: JackpotPhase;
  round: number;
  /** 現在のラウンドの入賞数 */
  count: number;
  /** 現在のフェーズの残り時間 */
  timer: number;
  toSt: boolean;
  /** 大当りを引いたときの遊技状態 */
  fromMode: Mode;
}

export interface FuzuState {
  holds: number;
  spinning: boolean;
  timer: number;
  win: boolean;
  /** 電チューが開いている残り時間 */
  openTimer: number;
}

export interface MachineEvents {
  hold: { holds: number; hold: Hold };
  /** 保留が満タンで取りこぼした */
  holdOverflow: { fromElectric: boolean };
  spinStart: SpinState;
  spinStop: SpinState;
  jackpotStart: { toSt: boolean; fromMode: Mode };
  roundStart: { round: number };
  roundEnd: { round: number; count: number };
  jackpotEnd: { next: Mode };
  mode: { from: Mode; to: Mode };
  fuzuStart: { win: boolean };
  fuzuStop: { win: boolean };
  lid: { kind: LidKind; open: boolean };
}

/**
 * 抽選・保留・大当りラウンド・普図を扱う状態機械。物理には依存せず、
 * 入賞などの入力と経過時間 (シミュレーション時間) だけで進む。
 *
 * 通常 → (1/199) → 大当り 10R → ST (1/39.9, 100 回) または 時短 (100 回) → 通常
 */
export class GameStateMachine {
  readonly bus = new EventBus<MachineEvents>();
  mode: Mode = 'normal';
  holds: Hold[] = [];
  spin: SpinState | null = null;
  jackpot: JackpotState | null = null;
  /** ST・時短の残り回数 */
  supportLeft = 0;
  spinCount = 0;
  readonly fuzu: FuzuState = { holds: 0, spinning: false, timer: 0, win: false, openTimer: 0 };
  readonly lids: Record<LidKind, boolean> = { electric: false, attacker: false };
  private forceNext = false;
  private holdRng!: SeededRng;
  private judgeRng!: SeededRng;
  private fuzuRng!: SeededRng;

  constructor(
    readonly spec: GameSpec,
    rng: SeededRng,
  ) {
    this.seed(rng);
  }

  private seed(rng: SeededRng): void {
    this.holdRng = rng.fork('holds');
    this.judgeRng = rng.fork('judge');
    this.fuzuRng = rng.fork('fuzu');
  }

  /** 初期状態 (通常・保留なし・役物は閉) に戻す。購読者はそのまま残る */
  reset(rng: SeededRng): void {
    this.seed(rng);
    this.holds = [];
    this.spin = null;
    this.jackpot = null;
    this.supportLeft = 0;
    this.spinCount = 0;
    this.forceNext = false;
    Object.assign(this.fuzu, { holds: 0, spinning: false, timer: 0, win: false, openTimer: 0 });
    this.setLid('electric', false);
    this.setLid('attacker', false);
    this.setMode('normal');
  }

  /** 電サポ中 (ST・時短) */
  get support(): boolean {
    return isSupport(this.mode);
  }

  /** 右打ちするべき状態 */
  get rightShot(): boolean {
    return this.mode === 'jackpot' || this.support;
  }

  // ---- 入力 ----

  /** ヘソまたは電チューに入賞した。保留が満タンでなければ保留を 1 個増やす */
  enterStart(fromElectric: boolean): boolean {
    if (this.holds.length >= this.spec.maxHolds) {
      this.bus.emit('holdOverflow', { fromElectric });
      return false;
    }
    const hold = drawHold(this.holdRng, fromElectric);
    this.holds.push(hold);
    this.bus.emit('hold', { holds: this.holds.length, hold });
    return true;
  }

  /** アタッカーに入賞した */
  enterAttacker(): void {
    const j = this.jackpot;
    if (j?.phase !== 'round') return;
    j.count++;
    if (j.count >= this.spec.roundMaxCount) this.endRound();
  }

  /** 普図ゲートを通過した */
  passGate(): void {
    this.fuzu.holds = Math.min(this.spec.fuzu.maxHolds, this.fuzu.holds + 1);
  }

  /** デバッグ用: 次の変動を大当りにする */
  forceJackpot(): void {
    this.forceNext = true;
  }

  // ---- 進行 ----

  update(dt: number): void {
    if (this.mode === 'jackpot') this.updateJackpot(dt);
    else this.updateSpin(dt);
    this.updateFuzu(dt);
  }

  private setMode(to: Mode): void {
    if (to === this.mode) return;
    const from = this.mode;
    this.mode = to;
    this.bus.emit('mode', { from, to });
  }

  private setLid(kind: LidKind, open: boolean): void {
    if (this.lids[kind] === open) return;
    this.lids[kind] = open;
    this.bus.emit('lid', { kind, open });
  }

  private updateSpin(dt: number): void {
    const s = this.spin;
    if (s) {
      if (!s.stopped) {
        s.elapsed += dt;
        if (s.elapsed >= s.duration) this.stopSpin(s);
        return;
      }
      s.pause -= dt;
      if (s.pause > 0) return;
      this.spin = null;
      if (s.jackpot) {
        this.startJackpot(s.toSt);
        return;
      }
    }
    if (this.holds.length > 0) this.startSpin();
  }

  private startSpin(): void {
    const hold = this.holds.shift()!;
    const result = judge(
      this.spec,
      this.mode,
      hold,
      this.holds.length,
      this.judgeRng,
      this.forceNext,
    );
    this.forceNext = false;
    this.spinCount++;
    this.spin = {
      ...result,
      mode: this.mode,
      elapsed: 0,
      stopped: false,
      pause: 0,
      index: this.spinCount,
    };
    this.bus.emit('spinStart', this.spin);
  }

  private stopSpin(s: SpinState): void {
    s.stopped = true;
    s.elapsed = s.duration;
    s.pause = this.spec.variation.stopPause;
    this.bus.emit('spinStop', s);
    // ST・時短は変動の回数で終わる
    if (!s.jackpot && isSupport(s.mode) && this.support) {
      this.supportLeft = Math.max(0, this.supportLeft - 1);
      if (this.supportLeft === 0) this.setMode('normal');
    }
  }

  private startJackpot(toSt: boolean): void {
    const fromMode = this.mode;
    this.supportLeft = 0;
    this.setMode('jackpot');
    this.jackpot = {
      phase: 'opening',
      round: 0,
      count: 0,
      timer: this.spec.openingTime,
      toSt,
      fromMode,
    };
    this.bus.emit('jackpotStart', { toSt, fromMode });
  }

  private updateJackpot(dt: number): void {
    const j = this.jackpot!;
    j.timer -= dt;
    if (j.timer > 0) return;
    switch (j.phase) {
      case 'opening':
        this.startRound(1);
        break;
      case 'round':
        this.endRound();
        break;
      case 'interval':
        this.startRound(j.round + 1);
        break;
      case 'ending': {
        const next: Mode = j.toSt ? 'st' : 'jitan';
        this.supportLeft = j.toSt ? this.spec.stSpins : this.spec.jitanSpins;
        this.jackpot = null;
        this.setMode(next);
        this.bus.emit('jackpotEnd', { next });
        break;
      }
    }
  }

  private startRound(round: number): void {
    const j = this.jackpot!;
    j.phase = 'round';
    j.round = round;
    j.count = 0;
    j.timer = this.spec.roundMaxTime;
    this.setLid('attacker', true);
    this.bus.emit('roundStart', { round });
  }

  private endRound(): void {
    const j = this.jackpot!;
    this.setLid('attacker', false);
    this.bus.emit('roundEnd', { round: j.round, count: j.count });
    if (j.round < this.spec.rounds) {
      j.phase = 'interval';
      j.timer = this.spec.roundInterval;
    } else {
      j.phase = 'ending';
      j.timer = this.spec.endingTime;
    }
  }

  private updateFuzu(dt: number): void {
    const f = this.fuzu;
    const cfg = this.support ? this.spec.fuzu.support : this.spec.fuzu.normal;
    if (f.openTimer > 0) {
      f.openTimer -= dt;
      if (f.openTimer <= 0) {
        f.openTimer = 0;
        this.setLid('electric', false);
      }
      return;
    }
    if (f.spinning) {
      f.timer -= dt;
      if (f.timer > 0) return;
      f.spinning = false;
      this.bus.emit('fuzuStop', { win: f.win });
      if (f.win) {
        f.openTimer = cfg.open;
        this.setLid('electric', true);
      }
      return;
    }
    if (f.holds > 0) {
      f.holds--;
      f.spinning = true;
      f.timer = cfg.time;
      f.win = this.fuzuRng.chance(cfg.prob);
      this.bus.emit('fuzuStart', { win: f.win });
    }
  }
}
