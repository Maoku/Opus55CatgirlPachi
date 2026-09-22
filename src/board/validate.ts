import {
  DEFAULT_LAUNCHER,
  DEFAULT_PHYSICS,
  POCKET_KINDS,
  SCHEMA_VERSION,
  WALL_MATERIALS,
  type BoardData,
  type BoardObject,
  type LauncherDef,
  type Material,
  type MaterialName,
  type PhysicsParams,
  type RotRect,
  type Vec2,
} from './types';

export class BoardValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`盤面データが不正です:\n${issues.slice(0, 10).join('\n')}`);
    this.name = 'BoardValidationError';
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 検証しながら値を取り出す。見つけた問題は errors に積む */
class Checker {
  readonly errors: string[] = [];

  fail(path: string, msg: string): void {
    this.errors.push(`${path}: ${msg}`);
  }

  obj(v: unknown, path: string): Obj {
    if (isObj(v)) return v;
    this.fail(path, 'オブジェクトではありません');
    return {};
  }

  num(v: unknown, path: string, opts: { min?: number; max?: number; fallback?: number } = {}) {
    if (!isNum(v)) {
      if (v === undefined && opts.fallback !== undefined) return opts.fallback;
      this.fail(path, '数値ではありません');
      return opts.fallback ?? 0;
    }
    if (opts.min !== undefined && v < opts.min) this.fail(path, `${opts.min} 以上にしてください`);
    if (opts.max !== undefined && v > opts.max) this.fail(path, `${opts.max} 以下にしてください`);
    return v;
  }

  str(v: unknown, path: string, fallback?: string): string {
    if (typeof v === 'string') return v;
    if (v === undefined && fallback !== undefined) return fallback;
    this.fail(path, '文字列ではありません');
    return fallback ?? '';
  }

  bool(v: unknown, path: string, fallback = false): boolean {
    if (typeof v === 'boolean') return v;
    if (v === undefined) return fallback;
    this.fail(path, '真偽値ではありません');
    return fallback;
  }

  oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
    if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
    this.fail(path, `${options.join(' / ')} のいずれかにしてください`);
    return options[0]!;
  }

  vec(v: unknown, path: string): Vec2 {
    const o = this.obj(v, path);
    return { x: this.num(o.x, `${path}.x`), y: this.num(o.y, `${path}.y`) };
  }

  vecs(v: unknown, path: string, minLength: number): Vec2[] {
    if (!Array.isArray(v)) {
      this.fail(path, '配列ではありません');
      return [];
    }
    if (v.length < minLength) this.fail(path, `${minLength} 点以上が必要です`);
    return v.map((p, i) => this.vec(p, `${path}[${i}]`));
  }

  rect(v: unknown, path: string): RotRect {
    const o = this.obj(v, path);
    return {
      x: this.num(o.x, `${path}.x`),
      y: this.num(o.y, `${path}.y`),
      w: this.num(o.w, `${path}.w`, { min: 0.1 }),
      h: this.num(o.h, `${path}.h`, { min: 0.1 }),
      angle: this.num(o.angle, `${path}.angle`, { fallback: 0 }),
    };
  }
}

function checkPhysics(c: Checker, v: unknown): PhysicsParams {
  const p = 'physics';
  const o = v === undefined ? {} : c.obj(v, p);
  const d = DEFAULT_PHYSICS;
  const mats = o.materials === undefined ? {} : c.obj(o.materials, `${p}.materials`);
  const materials = {} as Record<MaterialName, Material>;
  for (const name of Object.keys(d.materials) as MaterialName[]) {
    const m = mats[name] === undefined ? {} : c.obj(mats[name], `${p}.materials.${name}`);
    materials[name] = {
      restitution: c.num(m.restitution, `${p}.materials.${name}.restitution`, {
        min: 0,
        max: 1.5,
        fallback: d.materials[name].restitution,
      }),
      friction: c.num(m.friction, `${p}.materials.${name}.friction`, {
        min: 0,
        max: 5,
        fallback: d.materials[name].friction,
      }),
    };
  }
  return {
    ballRadius: c.num(o.ballRadius, `${p}.ballRadius`, { min: 0.05, fallback: d.ballRadius }),
    ballMass: c.num(o.ballMass, `${p}.ballMass`, { min: 0.01, fallback: d.ballMass }),
    nailRadius: c.num(o.nailRadius, `${p}.nailRadius`, { min: 0.01, fallback: d.nailRadius }),
    gravity: c.num(o.gravity, `${p}.gravity`, { min: 0, fallback: d.gravity }),
    tilt: c.num(o.tilt, `${p}.tilt`, { min: 0, max: 2, fallback: d.tilt }),
    linearDamping: c.num(o.linearDamping, `${p}.linearDamping`, {
      min: 0,
      fallback: d.linearDamping,
    }),
    materials,
    timestep: c.num(o.timestep, `${p}.timestep`, {
      min: 1 / 2000,
      max: 1 / 30,
      fallback: d.timestep,
    }),
    maxBalls: Math.round(c.num(o.maxBalls, `${p}.maxBalls`, { min: 1, fallback: d.maxBalls })),
    stallSpeed: c.num(o.stallSpeed, `${p}.stallSpeed`, { min: 0, fallback: d.stallSpeed }),
    stallTime: c.num(o.stallTime, `${p}.stallTime`, { min: 0.1, fallback: d.stallTime }),
  };
}

function checkLauncher(c: Checker, v: unknown): LauncherDef {
  const p = 'launcher';
  const o = c.obj(v, p);
  const d = DEFAULT_LAUNCHER;
  const launcher = {
    x: c.num(o.x, `${p}.x`),
    y: c.num(o.y, `${p}.y`),
    angle: c.num(o.angle, `${p}.angle`, { fallback: d.angle }),
    speedMin: c.num(o.speedMin, `${p}.speedMin`, { min: 0, fallback: d.speedMin }),
    speedMax: c.num(o.speedMax, `${p}.speedMax`, { min: 0, fallback: d.speedMax }),
    curve: c.num(o.curve, `${p}.curve`, { min: 0.1, max: 10, fallback: d.curve }),
    spread: c.num(o.spread, `${p}.spread`, { min: 0, max: 0.5, fallback: d.spread }),
    rate: c.num(o.rate, `${p}.rate`, { min: 1, max: 600, fallback: d.rate }),
  };
  if (launcher.speedMax < launcher.speedMin) c.fail(p, 'speedMax は speedMin 以上にしてください');
  return launcher;
}

function checkObject(c: Checker, v: unknown, path: string): BoardObject | null {
  const o = c.obj(v, path);
  const id = c.str(o.id, `${path}.id`);
  switch (o.type) {
    case 'nail':
      return {
        id,
        type: 'nail',
        x: c.num(o.x, `${path}.x`),
        y: c.num(o.y, `${path}.y`),
        r: c.num(o.r, `${path}.r`, { min: 0.1 }),
      };
    case 'wall':
      return {
        id,
        type: 'wall',
        points: c.vecs(o.points, `${path}.points`, 2),
        closed: c.bool(o.closed, `${path}.closed`),
        material: c.oneOf(o.material ?? 'rail', WALL_MATERIALS, `${path}.material`),
      };
    case 'windmill':
      return {
        id,
        type: 'windmill',
        x: c.num(o.x, `${path}.x`),
        y: c.num(o.y, `${path}.y`),
        r: c.num(o.r, `${path}.r`, { min: 1 }),
        blades: Math.round(c.num(o.blades, `${path}.blades`, { min: 2, max: 12, fallback: 4 })),
        damping: c.num(o.damping, `${path}.damping`, { min: 0, fallback: 0.5 }),
      };
    case 'pocket': {
      const pocket: BoardObject = {
        id,
        type: 'pocket',
        kind: c.oneOf(o.kind, POCKET_KINDS, `${path}.kind`),
        rect: c.rect(o.rect, `${path}.rect`),
        payout: Math.round(c.num(o.payout, `${path}.payout`, { min: 0, fallback: 0 })),
      };
      if (o.lid !== undefined) pocket.lid = c.rect(o.lid, `${path}.lid`);
      return pocket;
    }
    case 'gate':
      return { id, type: 'gate', rect: c.rect(o.rect, `${path}.rect`) };
    case 'display':
      return { id, type: 'display', rect: c.rect(o.rect, `${path}.rect`) };
    default:
      c.fail(`${path}.type`, `不明な種類です (${String(o.type)})`);
      return null;
  }
}

/** スキーマ移行済みの値を検証し、BoardData に整える */
export function validateBoard(
  input: unknown,
): { ok: true; board: BoardData } | { ok: false; errors: string[] } {
  const c = new Checker();
  const o = c.obj(input, '(root)');
  if (o.schemaVersion !== SCHEMA_VERSION) {
    c.fail('schemaVersion', `${SCHEMA_VERSION} である必要があります`);
  }
  const image = c.obj(o.image, 'image');
  const scale = c.obj(o.scale, 'scale');
  const objectsRaw = Array.isArray(o.objects) ? o.objects : [];
  if (!Array.isArray(o.objects)) c.fail('objects', '配列ではありません');

  const board: BoardData = {
    schemaVersion: SCHEMA_VERSION,
    name: c.str(o.name, 'name', '無題の盤面'),
    image: {
      src: c.str(image.src, 'image.src'),
      width: c.num(image.width, 'image.width', { min: 1 }),
      height: c.num(image.height, 'image.height', { min: 1 }),
    },
    scale: { pxPerCm: c.num(scale.pxPerCm, 'scale.pxPerCm', { min: 0.1 }) },
    physics: checkPhysics(c, o.physics),
    playfield: c.vecs(o.playfield, 'playfield', 3),
    launcher: checkLauncher(c, o.launcher),
    objects: objectsRaw
      .map((obj, i) => checkObject(c, obj, `objects[${i}]`))
      .filter((obj): obj is BoardObject => obj !== null),
  };

  const seen = new Set<string>();
  for (const obj of board.objects) {
    if (obj.id === '') c.fail('objects', 'id が空のオブジェクトがあります');
    if (seen.has(obj.id)) c.fail('objects', `id が重複しています (${obj.id})`);
    seen.add(obj.id);
  }

  return c.errors.length > 0 ? { ok: false, errors: c.errors } : { ok: true, board };
}
