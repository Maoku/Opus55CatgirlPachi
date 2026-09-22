export interface LoopHooks {
  /** 固定タイムステップで 1 ステップ進める */
  step(dt: number): void;
  /** 描画する。steps はこのフレームで進めたステップ数 */
  render(info: FrameInfo): void;
}

export interface FrameInfo {
  steps: number;
  /** 前のフレームからの実時間 (秒) */
  realDt: number;
  /** 描画を間引くフレームなら false */
  draw: boolean;
}

export const SPEED_MAX = Infinity;

/**
 * 固定タイムステップのゲームループ。
 * speed 倍でシミュレーション時間を進め、1 フレームの処理時間が予算を超えたら
 * 残りを捨てて処理落ちの連鎖を防ぐ。speed = SPEED_MAX のときは予算いっぱいまで進める。
 */
export class GameLoop {
  speed = 1;
  paused = false;
  /** 1 フレームで進めるステップ数の上限 */
  maxStepsPerFrame = 2400;
  /** 1 フレームで物理に使ってよい時間 (ms) */
  stepBudgetMs = 12;
  /** 最大速度のときの予算。描画を間引くぶん多めに使う */
  maxSpeedBudgetMs = 14;
  /** 最大速度のとき何フレームに 1 回描くか */
  maxSpeedRenderInterval = 3;

  /** 直近フレームで予算か上限に達したか */
  saturated = false;
  frameCount = 0;
  private acc = 0;
  private last = -1;
  private rafId = 0;

  constructor(
    private readonly hooks: LoopHooks,
    public fixedDt: number,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** 1 フレーム分進める。戻り値はこのフレームで進めたステップ数 */
  tick(nowMs: number): number {
    const realDt = this.last < 0 ? 0 : Math.min(Math.max((nowMs - this.last) / 1000, 0), 0.1);
    this.last = nowMs;
    this.frameCount++;
    let steps = 0;
    this.saturated = false;

    if (!this.paused) {
      const t0 = this.clock();
      const unlimited = this.speed === SPEED_MAX;
      if (!unlimited) this.acc += realDt * this.speed;
      const eps = this.fixedDt * 1e-6;
      const budget = unlimited ? this.maxSpeedBudgetMs : this.stepBudgetMs;
      while (steps < this.maxStepsPerFrame) {
        // ステップの中で一時停止・減速されたら (大当りで等倍に戻すなど)、すぐに反映する
        if (this.paused || (unlimited && this.speed !== SPEED_MAX)) break;
        if (!unlimited && this.acc < this.fixedDt - eps) break;
        if (this.clock() - t0 >= budget) {
          this.saturated = true;
          break;
        }
        this.hooks.step(this.fixedDt);
        if (!unlimited) this.acc -= this.fixedDt;
        steps++;
      }
      if (steps >= this.maxStepsPerFrame) this.saturated = true;
      // 処理が追いつかなかった分は捨てる
      if (this.saturated) this.acc = 0;
    } else {
      this.acc = 0;
    }

    const draw =
      this.speed !== SPEED_MAX ||
      this.paused ||
      this.frameCount % this.maxSpeedRenderInterval === 0;
    this.hooks.render({ steps, realDt, draw });
    return steps;
  }

  start(): void {
    if (this.rafId) return;
    const frame = (now: number) => {
      this.rafId = requestAnimationFrame(frame);
      this.tick(now);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.last = -1;
  }

  /** 次のフレームの経過時間を 0 として扱う (一時停止からの復帰など) */
  resetClock(): void {
    this.last = -1;
    this.acc = 0;
  }
}
