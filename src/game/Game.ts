import type { BoardData, PocketKind } from '@/board/types';
import { EventBus } from '@/core/EventBus';
import { SeededRng } from '@/core/SeededRng';
import type { LostReason, PhysicsEvent, PhysicsWorld } from '@/physics/PhysicsWorld';
import { BallManager } from './BallManager';
import { DEFAULT_SPEC, type GameSpec } from './GameSpec';
import { GameStateMachine, type LidKind } from './GameStateMachine';
import { Launcher } from './Launcher';

export interface GameEvents {
  launch: { ballId: number; speed: number };
  pocket: { ballId: number; objectId: string; kind: PocketKind; payout: number };
  foul: { ballId: number };
  gate: { ballId: number; objectId: string };
  lost: { ballId: number; reason: LostReason };
  lend: { balls: number; yen: number };
}

export interface GameOptions {
  seed: number;
  initialBalls?: number;
  spec?: GameSpec;
}

export type PocketCounts = Record<PocketKind, number>;

export function emptyPocketCounts(): PocketCounts {
  return { start: 0, electric: 0, attacker: 0, general: 0, out: 0, foul: 0 };
}

/**
 * ゲームの進行。発射・玉の管理・入賞と賞球・抽選 (状態機械)・役物の開閉をつなぐ。
 * 1 ステップの流れ: update (状態機械と発射) → 物理を 1 ステップ → handle (イベント処理)
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly rng: SeededRng;
  readonly spec: GameSpec;
  readonly machine: GameStateMachine;
  readonly launcher: Launcher;
  /** エディタのテスト発射用 (集計に影響しない玉を打つ) */
  readonly testLauncher: Launcher;
  readonly balls: BallManager;
  /** シミュレーション時間 (秒) */
  time = 0;
  /** 持ち玉 */
  held: number;
  /** 発射数 (ファールで戻った玉は除く) */
  launched = 0;
  fouls = 0;
  /** 総賞球 */
  payout = 0;
  lost = 0;
  readonly pockets: PocketCounts = emptyPocketCounts();
  /** 入賞口の種類ごとの賞球 */
  readonly payoutByKind: PocketCounts = emptyPocketCounts();
  /** 投資額 (円) と、借りた玉の数 */
  invested = 0;
  lent = 0;
  jackpots = 0;
  /** 初当り (通常時に引いた大当り) の回数 */
  firstHits = 0;
  /** 前回の大当りからの回転数 */
  spinsSinceJackpot = 0;
  /** 回転率の集計用: 通常時の発射数・賞球・回転数 */
  normalLaunched = 0;
  normalPayout = 0;
  normalSpins = 0;

  private lidPockets: Record<LidKind, string[]> = { electric: [], attacker: [] };

  constructor(
    public physics: PhysicsWorld,
    board: BoardData,
    readonly options: GameOptions,
  ) {
    this.spec = options.spec ?? DEFAULT_SPEC;
    this.rng = new SeededRng(options.seed);
    this.machine = new GameStateMachine(this.spec, this.rng.fork('machine'));
    this.launcher = new Launcher(board.launcher, this.rng.fork('launcher'));
    this.testLauncher = new Launcher(board.launcher, this.rng.fork('test'));
    this.balls = new BallManager(physics);
    this.held = options.initialBalls ?? this.spec.initialBalls;
    this.collectLidPockets(board);

    const m = this.machine;
    m.bus.on('lid', ({ kind, open }) => this.applyLid(kind, open));
    m.bus.on('spinStart', (s) => {
      this.spinsSinceJackpot++;
      if (s.mode === 'normal') this.normalSpins++;
    });
    m.bus.on('jackpotStart', ({ fromMode }) => {
      this.jackpots++;
      if (fromMode === 'normal') this.firstHits++;
      this.spinsSinceJackpot = 0;
    });
  }

  private collectLidPockets(board: BoardData): void {
    this.lidPockets = { electric: [], attacker: [] };
    for (const o of board.objects) {
      if (o.type === 'pocket' && o.lid && (o.kind === 'electric' || o.kind === 'attacker')) {
        this.lidPockets[o.kind].push(o.id);
      }
    }
  }

  private applyLid(kind: LidKind, open: boolean): void {
    for (const id of this.lidPockets[kind]) this.physics.setLidOpen(id, open);
  }

  /** 盤面を作り直したときに新しい物理ワールドへ切り替える */
  setBoard(physics: PhysicsWorld, board: BoardData): void {
    this.balls.rebind(physics);
    this.physics = physics;
    this.launcher.def = board.launcher;
    this.testLauncher.def = board.launcher;
    this.collectLidPockets(board);
    // 作り直したワールドの蓋を今の状態に合わせる
    this.applyLid('electric', this.machine.lids.electric);
    this.applyLid('attacker', this.machine.lids.attacker);
  }

  /** 差玉 = 総賞球 − 発射数 */
  get net(): number {
    return this.payout - this.launched;
  }

  /** 累計の回転数 */
  get spins(): number {
    return this.machine.spinCount;
  }

  /** 貸玉: 1000 円で ballsPer1000Yen 個借りる */
  lend(): void {
    const balls = this.spec.ballsPer1000Yen;
    this.held += balls;
    this.lent += balls;
    this.invested += 1000;
    this.bus.emit('lend', { balls, yen: 1000 });
  }

  /** デバッグ用: 次の変動を大当りにする (保留がなければ 1 個足す) */
  forceJackpot(): void {
    this.machine.forceJackpot();
    if (this.machine.holds.length === 0 && !this.machine.spin) this.machine.enterStart(false);
  }

  step(dt: number): void {
    this.update(dt);
    this.physics.step();
    this.handle(this.physics.drainEvents());
  }

  update(dt: number): void {
    this.time += dt;
    this.machine.update(dt);
    this.launcher.blocked = this.held <= 0 || this.balls.isFull;
    const order = this.launcher.update(dt);
    if (!order) return;
    const normal = this.machine.mode === 'normal';
    const rec = this.balls.launch(order, this.time, normal);
    if (!rec) return;
    this.held--;
    this.launched++;
    if (normal) this.normalLaunched++;
    this.bus.emit('launch', { ballId: rec.id, speed: order.speed });
  }

  /**
   * エディタのテスト発射: 現在の強度で打ち続け、物理だけを進める。
   * 打った玉は発射数・賞球・抽選に影響しない。
   */
  testStep(dt: number, firing: boolean): void {
    const l = this.testLauncher;
    l.holding = firing;
    l.strength = this.launcher.strength;
    l.blocked = this.balls.isFull;
    const order = l.update(dt);
    if (order) this.balls.spawn(order.x, order.y, order.vx, order.vy, 'debug', this.time);
    this.physics.step();
    this.handle(this.physics.drainEvents());
  }

  handle(events: readonly PhysicsEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'pocket': {
          const rec = this.balls.release(e.ballId);
          // デバッグ用・テスト発射の玉は集計しない
          if (rec?.origin !== 'launch') break;
          this.pockets[e.kind]++;
          if (e.kind === 'foul') {
            // ファール玉は持ち玉に戻し、発射数からも除く
            this.held++;
            this.launched--;
            if (rec.normal) this.normalLaunched--;
            this.fouls++;
            this.bus.emit('foul', { ballId: e.ballId });
          } else {
            this.onPocket(e.kind, e.payout);
            this.bus.emit('pocket', {
              ballId: e.ballId,
              objectId: e.objectId,
              kind: e.kind,
              payout: e.payout,
            });
          }
          break;
        }
        case 'gate':
          if (this.balls.get(e.ballId)?.origin !== 'launch') break;
          this.machine.passGate();
          this.bus.emit('gate', { ballId: e.ballId, objectId: e.objectId });
          break;
        case 'lost': {
          const rec = this.balls.release(e.ballId);
          if (rec?.origin !== 'launch') break;
          this.lost++;
          this.bus.emit('lost', { ballId: e.ballId, reason: e.reason });
          break;
        }
      }
    }
  }

  /** 入賞の処理。賞球を払い出し、抽選・ラウンドに反映する */
  private onPocket(kind: PocketKind, payout: number): void {
    this.held += payout;
    this.payout += payout;
    this.payoutByKind[kind] += payout;
    if (this.machine.mode === 'normal') this.normalPayout += payout;
    switch (kind) {
      case 'start':
        this.machine.enterStart(false);
        break;
      case 'electric':
        this.machine.enterStart(true);
        break;
      case 'attacker':
        this.machine.enterAttacker();
        break;
      default:
        break;
    }
  }

  /** デバッグ用: 指定位置に玉を落とす (発射数には数えない) */
  dropBall(x: number, y: number): void {
    this.balls.spawn(x, y, 0, 0, 'debug', this.time);
  }
}
