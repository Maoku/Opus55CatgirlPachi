import type { RotRect } from '@/core/geometry';
import type { Vec2 } from '@/core/Vec2';

export type { RotRect, Vec2 };

export const SCHEMA_VERSION = 1;

export type MaterialName = 'ball' | 'nail' | 'rail' | 'plastic' | 'rubber' | 'windmill';
export const WALL_MATERIALS = ['rail', 'plastic', 'rubber'] as const;
export type WallMaterial = (typeof WALL_MATERIALS)[number];

export interface Material {
  /** 玉とぶつかったときの反発係数 (ball は玉同士) */
  restitution: number;
  /** 玉とぶつかったときの摩擦係数 (ball は玉同士) */
  friction: number;
}

/** 物理パラメータ。長さは cm、時間は秒、質量は g */
export interface PhysicsParams {
  ballRadius: number;
  ballMass: number;
  /** 釘を新しく置くときの当たり判定の半径 */
  nailRadius: number;
  gravity: number;
  /** 盤面の傾きを表す重力の係数 */
  tilt: number;
  linearDamping: number;
  materials: Record<MaterialName, Material>;
  timestep: number;
  maxBalls: number;
  /** この速さ (cm/s) 未満が stallTime 秒続いた玉は回収する */
  stallSpeed: number;
  stallTime: number;
}

export interface LauncherDef {
  /** 発射位置 (盤面 px) */
  x: number;
  y: number;
  /** 発射方向 (度)。0 が右、-90 が真上 */
  angle: number;
  /** 強度 0% / 100% のときの初速 (cm/s) */
  speedMin: number;
  speedMax: number;
  /** 強度 → 初速の曲線の指数 (1 で直線) */
  curve: number;
  /** 初速の相対的なばらつき (0.015 = ±1.5%) */
  spread: number;
  /** 発射間隔 (発/分) */
  rate: number;
}

export const POCKET_KINDS = ['start', 'electric', 'attacker', 'general', 'out', 'foul'] as const;
export type PocketKind = (typeof POCKET_KINDS)[number];

export interface NailObject {
  id: string;
  type: 'nail';
  x: number;
  y: number;
  /** 当たり判定の半径 (盤面 px) */
  r: number;
}

export interface WallObject {
  id: string;
  type: 'wall';
  points: Vec2[];
  closed: boolean;
  material: WallMaterial;
}

export interface WindmillObject {
  id: string;
  type: 'windmill';
  x: number;
  y: number;
  /** 羽根の長さ (盤面 px) */
  r: number;
  blades: number;
  /** 回転の減衰 */
  damping: number;
}

export interface PocketObject {
  id: string;
  type: 'pocket';
  kind: PocketKind;
  /** 入賞判定の範囲。玉の中心がこの中に入ったら入賞 */
  rect: RotRect;
  /** 賞球数 */
  payout: number;
  /** 閉じているあいだ入賞を塞ぐ蓋 (電チュー・アタッカー) */
  lid?: RotRect;
}

export interface GateObject {
  id: string;
  type: 'gate';
  rect: RotRect;
}

export interface DisplayObject {
  id: string;
  type: 'display';
  rect: RotRect;
}

export type BoardObject =
  NailObject | WallObject | WindmillObject | PocketObject | GateObject | DisplayObject;

export type BoardObjectType = BoardObject['type'];
export const OBJECT_TYPES: readonly BoardObjectType[] = [
  'nail',
  'wall',
  'windmill',
  'pocket',
  'gate',
  'display',
];

export interface BoardData {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  image: { src: string; width: number; height: number };
  scale: { pxPerCm: number };
  physics: PhysicsParams;
  /** 遊技領域の多角形。外に出た玉は回収する */
  playfield: Vec2[];
  launcher: LauncherDef;
  objects: BoardObject[];
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  ballRadius: 0.55,
  ballMass: 5.5,
  nailRadius: 0.09,
  gravity: 980,
  tilt: 1,
  linearDamping: 0.1,
  materials: {
    ball: { restitution: 0.7, friction: 0.1 },
    nail: { restitution: 0.55, friction: 0.15 },
    rail: { restitution: 0.3, friction: 0.1 },
    plastic: { restitution: 0.3, friction: 0.2 },
    rubber: { restitution: 0.7, friction: 0.2 },
    windmill: { restitution: 0.4, friction: 0.2 },
  },
  timestep: 1 / 240,
  maxBalls: 300,
  stallSpeed: 1,
  stallTime: 5,
};

export const DEFAULT_LAUNCHER: LauncherDef = {
  x: 150,
  y: 1100,
  angle: -90,
  speedMin: 200,
  speedMax: 460,
  curve: 1,
  spread: 0.015,
  rate: 100,
};

export function cloneBoard(board: BoardData): BoardData {
  return structuredClone(board);
}
