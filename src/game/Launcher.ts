import type { LauncherDef } from '@/board/types';
import { DEG } from '@/core/geometry';
import type { SeededRng } from '@/core/SeededRng';

export interface LaunchOrder {
  /** 盤面 px */
  x: number;
  y: number;
  /** cm/s */
  vx: number;
  vy: number;
  speed: number;
}

/**
 * 発射装置。強度 (0..1) を初速に変換し、発射間隔ごとに玉を 1 個打ち出す。
 * 時間はシミュレーション時間で数える。
 */
export class Launcher {
  /** ハンドルの強度 0..1 */
  strength = 0.5;
  /** ハンドルを握っている (Space を押している) */
  holding = false;
  /** 発射固定 */
  locked = false;
  /** 発射を止める (持ち玉切れ・玉数の上限など) */
  blocked = false;
  /** 次に打てるまでの時間 (秒) */
  private cooldown = 0;

  constructor(
    public def: LauncherDef,
    private readonly rng: SeededRng,
  ) {}

  get interval(): number {
    return 60 / this.def.rate;
  }

  get active(): boolean {
    return this.holding || this.locked;
  }

  setStrength(v: number): void {
    this.strength = Math.min(1, Math.max(0, v));
  }

  /** 強度に対する初速の中央値 (cm/s) */
  speedFor(strength: number): number {
    const d = this.def;
    const s = Math.min(1, Math.max(0, strength));
    return d.speedMin + (d.speedMax - d.speedMin) * Math.pow(s, d.curve);
  }

  /** 強度にばらつきを加えた初速で発射する玉を作る */
  makeOrder(strength = this.strength): LaunchOrder {
    const d = this.def;
    const speed = this.speedFor(strength) * (1 + (this.rng.next() * 2 - 1) * d.spread);
    const a = d.angle * DEG;
    return { x: d.x, y: d.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed };
  }

  /**
   * dt 秒進める。発射のタイミングが来たら LaunchOrder を返す。
   * blocked のあいだはタイミングを保留する (解除後すぐに打てる)。
   */
  update(dt: number): LaunchOrder | null {
    let order: LaunchOrder | null = null;
    if (!this.active) {
      this.cooldown = Math.max(this.cooldown - dt, 0);
      return null;
    }
    if (this.cooldown <= 1e-9) {
      if (this.blocked) {
        this.cooldown = 0;
        return null;
      }
      // 間隔ぶんを足す (遅れは次に持ち越すので、長い目で見て発射間隔が正確になる)
      this.cooldown += this.interval;
      order = this.makeOrder();
    }
    this.cooldown -= dt;
    return order;
  }

  reset(): void {
    this.cooldown = 0;
  }
}
