import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { LaunchOrder } from './Launcher';

export type BallOrigin = 'launch' | 'debug';

export interface BallRecord {
  id: number;
  origin: BallOrigin;
  /** 発射した時刻 (シミュレーション時間) */
  bornAt: number;
  speed: number;
}

/**
 * 盤面上の玉の生成から回収までを管理する。
 * 物理ワールドの玉 id と、発射した玉かどうかなどの付帯情報を対応付ける。
 */
export class BallManager {
  private readonly live = new Map<number, BallRecord>();
  private readonly pool: BallRecord[] = [];

  constructor(private physics: PhysicsWorld) {}

  get count(): number {
    return this.physics.ballCount;
  }

  get maxBalls(): number {
    return this.physics.params.maxBalls;
  }

  get isFull(): boolean {
    return this.physics.ballCount >= this.physics.params.maxBalls;
  }

  /** 盤面を作り直したときに、玉を新しいワールドへ移す */
  rebind(physics: PhysicsWorld): void {
    const snapshots = this.physics.snapshotBalls();
    const records = [...this.live.values()];
    this.live.clear();
    this.physics = physics;
    snapshots.forEach((s, i) => {
      const id = physics.spawnBall(s.x, s.y, s.vx, s.vy);
      const rec = records[i];
      if (id > 0 && rec) {
        rec.id = id;
        this.live.set(id, rec);
      }
    });
  }

  launch(order: LaunchOrder, time: number): BallRecord | null {
    return this.spawn(order.x, order.y, order.vx, order.vy, 'launch', time, order.speed);
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    origin: BallOrigin,
    time: number,
    speed = Math.hypot(vx, vy),
  ): BallRecord | null {
    const id = this.physics.spawnBall(x, y, vx, vy);
    if (id < 0) return null;
    const rec = this.pool.pop() ?? { id, origin, bornAt: time, speed };
    rec.id = id;
    rec.origin = origin;
    rec.bornAt = time;
    rec.speed = speed;
    this.live.set(id, rec);
    return rec;
  }

  get(id: number): BallRecord | undefined {
    return this.live.get(id);
  }

  /** 物理ワールドから消えた玉の記録を取り外す (記録は次の生成で使い回す) */
  release(id: number): BallRecord | undefined {
    const rec = this.live.get(id);
    if (!rec) return undefined;
    this.live.delete(id);
    this.pool.push(rec);
    return rec;
  }

  clear(): void {
    this.physics.clearBalls();
    for (const rec of this.live.values()) this.pool.push(rec);
    this.live.clear();
  }
}
