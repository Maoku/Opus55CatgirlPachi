import type {
  Collider,
  ColliderDesc,
  EventQueue,
  RigidBody,
  World,
} from '@dimforge/rapier2d-deterministic-compat';
import type {
  BoardData,
  GateObject,
  MaterialName,
  PhysicsParams,
  PocketKind,
  PocketObject,
  RotRect,
  WallObject,
  WindmillObject,
} from '@/board/types';
import { DEG, pointInPolygon } from '@/core/geometry';
import { Units } from '@/core/units';
import type { Vec2 } from '@/core/Vec2';
import type { Rapier } from './rapier';

export type LostReason = 'outside' | 'stall';

export type PhysicsEvent =
  | { type: 'pocket'; ballId: number; objectId: string; kind: PocketKind; payout: number }
  | { type: 'gate'; ballId: number; objectId: string }
  | { type: 'lost'; ballId: number; reason: LostReason };

export interface BallSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface BallState {
  id: number;
  body: RigidBody;
  collider: Collider;
  /** 遅い状態が続いている時間 (秒) */
  stall: number;
}

type SensorInfo = { role: 'pocket'; object: PocketObject } | { role: 'gate'; object: GateObject };

// 衝突グループ: 上位 16bit が所属、下位 16bit が衝突相手
const G_BALL = 0x0001;
const G_STATIC = 0x0002;
const G_WINDMILL = 0x0004;
const G_SENSOR = 0x0008;
const groups = (member: number, filter: number) => ((member << 16) | filter) >>> 0;
const BALL_GROUPS = groups(G_BALL, 0xffff);
const STATIC_GROUPS = groups(G_STATIC, G_BALL);
const WINDMILL_GROUPS = groups(G_WINDMILL, G_BALL);
const SENSOR_GROUPS = groups(G_SENSOR, G_BALL);

/** 滞留・範囲外の判定を何ステップごとに行うか */
const HOUSEKEEPING_INTERVAL = 8;
/** 風車の羽根の厚み (cm) */
const BLADE_THICKNESS = 0.14;
const WINDMILL_MASS = 2.5;

/**
 * Rapier のワールドを BoardData から組み立てて、玉の生成・回収と
 * 入賞などのイベント変換を受け持つ。外部とのやり取りは盤面座標 (px) で行う。
 */
export class PhysicsWorld {
  readonly world: World;
  readonly units: Units;
  readonly params: PhysicsParams;
  simTime = 0;
  stepCount = 0;

  private readonly eventQueue: EventQueue;
  private readonly balls = new Map<number, BallState>();
  private readonly ballByCollider = new Map<number, BallState>();
  private readonly sensors = new Map<number, SensorInfo>();
  private readonly lids = new Map<string, Collider>();
  private readonly windmills: { def: WindmillObject; body: RigidBody }[] = [];
  private readonly playfield: Vec2[];
  private events: PhysicsEvent[] = [];
  private nextBallId = 1;
  private disposed = false;

  constructor(
    private readonly R: Rapier,
    board: BoardData,
  ) {
    this.params = structuredClone(board.physics);
    this.units = new Units(board.scale.pxPerCm);
    this.playfield = board.playfield.map((p) => ({ ...p }));
    const p = this.params;
    this.world = new R.World({ x: 0, y: p.gravity * p.tilt });
    this.world.timestep = p.timestep;
    this.world.maxCcdSubsteps = 2;
    this.eventQueue = new R.EventQueue(true);

    for (const obj of board.objects) {
      switch (obj.type) {
        case 'nail':
          this.addFixed(
            R.ColliderDesc.ball(this.units.toCm(obj.r)).setTranslation(
              this.units.toCm(obj.x),
              this.units.toCm(obj.y),
            ),
            'nail',
          );
          break;
        case 'wall':
          this.addWall(obj);
          break;
        case 'windmill':
          this.addWindmill(obj);
          break;
        case 'pocket':
          this.addPocket(obj);
          break;
        case 'gate':
          this.addSensor(obj.rect, 0, { role: 'gate', object: obj });
          break;
        case 'display':
          break;
      }
    }
  }

  // ---- 組み立て ----

  /** 玉との組み合わせで material の係数になるように、各コライダの係数を決める */
  private coefficients(material: MaterialName): { restitution: number; friction: number } {
    const m = this.params.materials;
    const ballE = Math.sqrt(Math.max(m.ball.restitution, 1e-3));
    const ballF = Math.sqrt(Math.max(m.ball.friction, 1e-3));
    if (material === 'ball') return { restitution: ballE, friction: ballF };
    return {
      restitution: m[material].restitution / ballE,
      friction: m[material].friction / ballF,
    };
  }

  private withMaterial(desc: ColliderDesc, material: MaterialName): ColliderDesc {
    const c = this.coefficients(material);
    const rule = this.R.CoefficientCombineRule.Multiply;
    desc
      .setRestitution(c.restitution)
      .setFriction(c.friction)
      .setRestitutionCombineRule(rule)
      .setFrictionCombineRule(rule);
    return desc;
  }

  private addFixed(desc: ColliderDesc, material: MaterialName): Collider {
    this.withMaterial(desc, material).setCollisionGroups(STATIC_GROUPS);
    return this.world.createCollider(desc);
  }

  private addWall(wall: WallObject): void {
    const pts = wall.closed ? [...wall.points, wall.points[0]!] : wall.points;
    if (pts.length < 2) return;
    const verts = new Float32Array(pts.length * 2);
    pts.forEach((pt, i) => {
      verts[i * 2] = this.units.toCm(pt.x);
      verts[i * 2 + 1] = this.units.toCm(pt.y);
    });
    this.addFixed(this.R.ColliderDesc.polyline(verts), wall.material);
  }

  private rectDesc(rect: RotRect, shrink: number) {
    const u = this.units;
    const hx = Math.max(u.toCm(rect.w) / 2 - shrink, 0.05);
    const hy = Math.max(u.toCm(rect.h) / 2 - shrink, 0.05);
    return this.R.ColliderDesc.cuboid(hx, hy)
      .setTranslation(u.toCm(rect.x), u.toCm(rect.y))
      .setRotation(rect.angle * DEG);
  }

  private addSensor(rect: RotRect, shrink: number, info: SensorInfo): void {
    const desc = this.rectDesc(rect, shrink)
      .setSensor(true)
      .setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(SENSOR_GROUPS);
    const collider = this.world.createCollider(desc);
    this.sensors.set(collider.handle, info);
  }

  private addPocket(pocket: PocketObject): void {
    // 玉の中心が矩形に入ったときに重なるよう、センサーを玉の半径だけ縮める
    this.addSensor(pocket.rect, this.params.ballRadius, { role: 'pocket', object: pocket });
    if (pocket.lid) {
      const lid = this.addFixed(this.rectDesc(pocket.lid, 0), 'plastic');
      this.lids.set(pocket.id, lid);
    }
  }

  private addWindmill(def: WindmillObject): void {
    const R = this.R;
    const u = this.units;
    const x = u.toCm(def.x);
    const y = u.toCm(def.y);
    const len = u.toCm(def.r);
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y));
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setGravityScale(0)
        .setAngularDamping(def.damping)
        .setCanSleep(false),
    );
    const density = WINDMILL_MASS / (def.blades * len * BLADE_THICKNESS);
    for (let i = 0; i < def.blades; i++) {
      const a = (i / def.blades) * Math.PI * 2;
      const desc = R.ColliderDesc.cuboid(len / 2, BLADE_THICKNESS / 2)
        .setTranslation((Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2)
        .setRotation(a)
        .setDensity(density)
        .setCollisionGroups(WINDMILL_GROUPS);
      this.world.createCollider(this.withMaterial(desc, 'windmill'), body);
    }
    this.world.createImpulseJoint(
      R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }),
      anchor,
      body,
      true,
    );
    this.windmills.push({ def, body });
  }

  // ---- 玉 ----

  get ballCount(): number {
    return this.balls.size;
  }

  /**
   * 玉を置く。位置は盤面 px、速度は cm/s。
   * 同時に存在できる上限に達しているときは -1 を返す。
   */
  spawnBall(x: number, y: number, vx: number, vy: number): number {
    if (this.balls.size >= this.params.maxBalls) return -1;
    const R = this.R;
    const u = this.units;
    const p = this.params;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(u.toCm(x), u.toCm(y))
        .setLinvel(vx, vy)
        .setLinearDamping(p.linearDamping)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    // 慣性モーメントは中実球 (2/5 m r^2) とする
    const desc = R.ColliderDesc.ball(p.ballRadius)
      .setMassProperties(p.ballMass, { x: 0, y: 0 }, 0.4 * p.ballMass * p.ballRadius ** 2)
      .setCollisionGroups(BALL_GROUPS);
    const collider = this.world.createCollider(this.withMaterial(desc, 'ball'), body);
    const ball: BallState = { id: this.nextBallId++, body, collider, stall: 0 };
    this.balls.set(ball.id, ball);
    this.ballByCollider.set(collider.handle, ball);
    return ball.id;
  }

  removeBall(id: number): boolean {
    const ball = this.balls.get(id);
    if (!ball) return false;
    this.balls.delete(id);
    this.ballByCollider.delete(ball.collider.handle);
    this.world.removeRigidBody(ball.body);
    return true;
  }

  clearBalls(): void {
    for (const id of [...this.balls.keys()]) this.removeBall(id);
  }

  hasBall(id: number): boolean {
    return this.balls.has(id);
  }

  /** 玉の位置 (盤面 px) を列挙する */
  forEachBall(fn: (x: number, y: number, id: number) => void): void {
    const k = this.units.pxPerCm;
    for (const b of this.balls.values()) {
      const t = b.body.translation();
      fn(t.x * k, t.y * k, b.id);
    }
  }

  getBall(id: number): BallSnapshot | null {
    const b = this.balls.get(id);
    if (!b) return null;
    const t = b.body.translation();
    const v = b.body.linvel();
    const k = this.units.pxPerCm;
    return { x: t.x * k, y: t.y * k, vx: v.x, vy: v.y };
  }

  /** 盤面を作り直すときに玉を引き継ぐためのスナップショット */
  snapshotBalls(): BallSnapshot[] {
    return [...this.balls.keys()].map((id) => this.getBall(id)!);
  }

  restoreBalls(balls: readonly BallSnapshot[]): void {
    for (const b of balls) this.spawnBall(b.x, b.y, b.vx, b.vy);
  }

  // ---- 役物 ----

  setLidOpen(pocketId: string, open: boolean): void {
    const lid = this.lids.get(pocketId);
    if (lid && lid.isEnabled() === open) lid.setEnabled(!open);
  }

  isLidOpen(pocketId: string): boolean {
    const lid = this.lids.get(pocketId);
    return lid ? !lid.isEnabled() : true;
  }

  forEachWindmill(fn: (def: WindmillObject, angle: number) => void): void {
    for (const w of this.windmills) fn(w.def, w.body.rotation());
  }

  // ---- 進行 ----

  step(): void {
    if (this.disposed) return;
    const dt = this.params.timestep;
    this.world.step(this.eventQueue);
    this.simTime += dt;
    this.stepCount++;

    const hits: { ball: BallState; info: SensorInfo }[] = [];
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      let ball = this.ballByCollider.get(h1);
      let info = this.sensors.get(h2);
      if (!ball || !info) {
        ball = this.ballByCollider.get(h2);
        info = this.sensors.get(h1);
      }
      if (ball && info) hits.push({ ball, info });
    });
    for (const { ball, info } of hits) {
      if (!this.balls.has(ball.id)) continue; // 同じステップで別の入賞口に入った
      if (info.role === 'gate') {
        this.events.push({ type: 'gate', ballId: ball.id, objectId: info.object.id });
      } else {
        const o = info.object;
        this.removeBall(ball.id);
        this.events.push({
          type: 'pocket',
          ballId: ball.id,
          objectId: o.id,
          kind: o.kind,
          payout: o.payout,
        });
      }
    }

    if (this.stepCount % HOUSEKEEPING_INTERVAL === 0) this.housekeeping(dt * HOUSEKEEPING_INTERVAL);
  }

  /** 範囲外に出た玉と、動かなくなった玉を回収する */
  private housekeeping(elapsed: number): void {
    const p = this.params;
    const k = this.units.pxPerCm;
    const lost: { id: number; reason: LostReason }[] = [];
    for (const b of this.balls.values()) {
      const t = b.body.translation();
      if (!pointInPolygon({ x: t.x * k, y: t.y * k }, this.playfield)) {
        lost.push({ id: b.id, reason: 'outside' });
        continue;
      }
      const v = b.body.linvel();
      if (Math.hypot(v.x, v.y) < p.stallSpeed) {
        b.stall += elapsed;
        if (b.stall >= p.stallTime) lost.push({ id: b.id, reason: 'stall' });
      } else {
        b.stall = 0;
      }
    }
    for (const l of lost) {
      this.removeBall(l.id);
      this.events.push({ type: 'lost', ballId: l.id, reason: l.reason });
    }
  }

  drainEvents(): PhysicsEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.balls.clear();
    this.ballByCollider.clear();
    this.eventQueue.free();
    this.world.free();
  }
}
