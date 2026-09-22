import { roundPoint } from '@/core/geometry';
import {
  DEFAULT_LAUNCHER,
  DEFAULT_PHYSICS,
  SCHEMA_VERSION,
  type BoardData,
  type BoardObject,
  type LauncherDef,
  type Vec2,
} from './types';

/**
 * レールの寸法 (盤面 px)。外レールは pachi.png の円形枠の内側に沿う円弧で、
 * 左右の下半分は枠に合わせてまっすぐ下ろす。
 */
export const RAIL = {
  cx: 560,
  cy: 700,
  /** 外レールの半径 */
  r: 470,
  /** 発射レールの幅 (外レールと内レールの間隔) */
  channel: 30,
  /** 発射レールの底 */
  floorY: 1030,
  /** 内レールの先端の角度 (度。180 が真左、270 が真上) */
  innerTipDeg: 212,
  /** 右側の外レールをまっすぐ下ろす長さ */
  rightStraight: 180,
};

const arc = (r: number, fromDeg: number, toDeg: number, stepDeg: number): Vec2[] => {
  const pts: Vec2[] = [];
  const n = Math.max(1, Math.round(Math.abs(toDeg - fromDeg) / stepDeg));
  for (let i = 0; i <= n; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180;
    pts.push(roundPoint({ x: RAIL.cx + Math.cos(a) * r, y: RAIL.cy + Math.sin(a) * r }));
  }
  return pts;
};

export interface RailLayout {
  walls: BoardObject[];
  foul: BoardObject;
  launcher: LauncherDef;
  playfield: Vec2[];
}

/** 外レール・内レール・発射位置・ファール口をまとめて作る */
export function buildRails(ballRadiusPx = 11.88): RailLayout {
  const { cx, cy, r, channel, floorY } = RAIL;
  const left = cx - r;
  const right = cx + r;
  const rightBottom = cy + RAIL.rightStraight;
  const outer: Vec2[] = [
    { x: left, y: floorY },
    ...arc(r, 180, 360, 2),
    { x: right, y: rightBottom },
    { x: right - 12, y: rightBottom + 90 },
    { x: right - 40, y: rightBottom + 170 },
    { x: right - 80, y: rightBottom + 225 },
  ];
  const inner: Vec2[] = [
    { x: left + channel, y: floorY },
    ...arc(r - channel, 180, RAIL.innerTipDeg, 2),
  ];
  const outHoleL = { x: 470, y: 1168 };
  const outHoleR = { x: 650, y: 1168 };
  const walls: BoardObject[] = [
    { id: 'wall-outer', type: 'wall', points: outer, closed: false, material: 'rail' },
    { id: 'wall-inner', type: 'wall', points: inner, closed: false, material: 'rail' },
    {
      id: 'wall-channel-floor',
      type: 'wall',
      points: [outer[0]!, inner[0]!],
      closed: false,
      material: 'rail',
    },
    {
      id: 'wall-bottom-left',
      type: 'wall',
      points: [
        inner[0]!,
        { x: left + channel + 45, y: floorY + 60 },
        { x: 250, y: 1135 },
        outHoleL,
        { x: outHoleL.x, y: 1200 },
      ],
      closed: false,
      material: 'plastic',
    },
    {
      id: 'wall-bottom-right',
      type: 'wall',
      points: [outer[outer.length - 1]!, outHoleR, { x: outHoleR.x, y: 1200 }],
      closed: false,
      material: 'plastic',
    },
  ];
  return {
    walls,
    foul: {
      id: 'pocket-foul',
      type: 'pocket',
      kind: 'foul',
      rect: { x: left + channel / 2, y: floorY - 15, w: channel, h: 30, angle: 0 },
      payout: 0,
    },
    // 外レールに接する位置から真上に打ち出す
    launcher: {
      ...DEFAULT_LAUNCHER,
      x: Math.round((left + ballRadiusPx + 0.5) * 10) / 10,
      y: floorY - 45,
      angle: -90,
    },
    playfield: [
      { x: left - 5, y: floorY + 15 },
      ...outer.slice(1),
      { x: 700, y: 1215 },
      { x: 420, y: 1215 },
    ],
  };
}

/**
 * 動作確認用の仮の盤面 (レールと数十本の釘)。
 * 画像に合わせたデフォルト盤面は src/assets/boards/default.json に置く。
 */
export function createSampleBoard(): BoardData {
  const rails = buildRails();
  const objects: BoardObject[] = [...rails.walls, rails.foul];
  let n = 1;
  for (let row = 0; row < 6; row++) {
    const y = 380 + row * 34;
    const offset = row % 2 === 0 ? 0 : 17;
    for (let x = 290 + offset; x <= 840; x += 34) {
      // レールの近くには置かない
      if (Math.hypot(x - RAIL.cx, y - RAIL.cy) > RAIL.r - 70) continue;
      objects.push({ id: `nail-${n++}`, type: 'nail', x, y, r: 1.95 });
    }
  }
  objects.push({
    id: 'pocket-out',
    type: 'pocket',
    kind: 'out',
    rect: { x: 560, y: 1185, w: 176, h: 34, angle: 0 },
    payout: 0,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    name: '仮の盤面',
    image: { src: 'pachi.png', width: 1123, height: 1401 },
    scale: { pxPerCm: 21.6 },
    physics: structuredClone(DEFAULT_PHYSICS),
    playfield: rails.playfield,
    launcher: rails.launcher,
    objects,
  };
}
