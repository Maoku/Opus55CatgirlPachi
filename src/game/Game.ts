import type { BoardData, PocketKind } from '@/board/types';
import { EventBus } from '@/core/EventBus';
import { SeededRng } from '@/core/SeededRng';
import type { LostReason, PhysicsEvent, PhysicsWorld } from '@/physics/PhysicsWorld';
import { BallManager } from './BallManager';
import { Launcher } from './Launcher';

export interface GameEvents {
  launch: { ballId: number; speed: number };
  pocket: { ballId: number; objectId: string; kind: PocketKind; payout: number };
  foul: { ballId: number };
  gate: { ballId: number; objectId: string };
  lost: { ballId: number; reason: LostReason };
}

export interface GameOptions {
  seed: number;
  initialBalls: number;
}

export type PocketCounts = Record<PocketKind, number>;

export function emptyPocketCounts(): PocketCounts {
  return { start: 0, electric: 0, attacker: 0, general: 0, out: 0, foul: 0 };
}

/**
 * ゲームの進行。発射・玉の管理・入賞の集計を行う。
 * 1 ステップの流れ: update (発射) → 物理を 1 ステップ → handle (イベント処理)
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly rng: SeededRng;
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

  constructor(
    public physics: PhysicsWorld,
    board: BoardData,
    readonly options: GameOptions,
  ) {
    this.rng = new SeededRng(options.seed);
    this.launcher = new Launcher(board.launcher, this.rng.fork('launcher'));
    this.testLauncher = new Launcher(board.launcher, this.rng.fork('test'));
    this.balls = new BallManager(physics);
    this.held = options.initialBalls;
  }

  /** 盤面を作り直したときに新しい物理ワールドへ切り替える */
  setBoard(physics: PhysicsWorld, board: BoardData): void {
    this.balls.rebind(physics);
    this.physics = physics;
    this.launcher.def = board.launcher;
    this.testLauncher.def = board.launcher;
  }

  /** 差玉 = 総賞球 − 発射数 */
  get net(): number {
    return this.payout - this.launched;
  }

  step(dt: number): void {
    this.update(dt);
    this.physics.step();
    this.handle(this.physics.drainEvents());
  }

  update(dt: number): void {
    this.time += dt;
    this.launcher.blocked = this.held <= 0 || this.balls.isFull;
    const order = this.launcher.update(dt);
    if (!order) return;
    const rec = this.balls.launch(order, this.time);
    if (!rec) return;
    this.held--;
    this.launched++;
    this.bus.emit('launch', { ballId: rec.id, speed: order.speed });
  }

  /**
   * エディタのテスト発射: 現在の強度で打ち続け、物理だけを進める。
   * 打った玉は発射数・賞球などの集計に含めない。
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

  /** 入賞の処理。賞球を払い出す */
  protected onPocket(_kind: PocketKind, payout: number): void {
    this.held += payout;
    this.payout += payout;
  }

  /** デバッグ用: 指定位置に玉を落とす (発射数には数えない) */
  dropBall(x: number, y: number): void {
    this.balls.spawn(x, y, 0, 0, 'debug', this.time);
  }
}
