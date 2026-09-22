import type { BoardData, PocketKind } from '@/board/types';
import { rotRectCorners } from '@/core/geometry';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { CircleKind } from './CircleBatch';
import { hex, type RGBA } from './color';
import type { Renderer } from './Renderer';

export const POCKET_COLORS: Record<PocketKind, RGBA> = {
  start: hex('#ffd24a'),
  electric: hex('#5fe0ff'),
  attacker: hex('#ff5f5f'),
  general: hex('#9dff6a'),
  out: hex('#b0b0b0'),
  foul: hex('#c08aff'),
};

const NAIL_COLOR = hex('#e6d7a8');
const BALL_COLOR = hex('#dfe4ec');
const WALL_COLOR = hex('#5fe0ff', 0.9);
const GATE_COLOR = hex('#ffe066');
const LID_COLOR = hex('#ff9a3c');
const DISPLAY_COLOR = hex('#ffffff', 0.5);
const PLAYFIELD_COLOR = hex('#ffffff', 0.35);
const WINDMILL_COLOR = hex('#ff8fc8');
const NAIL_COLLIDER_COLOR = hex('#ff3d8b');

export interface StaticSceneOptions {
  /** 当たり判定 (壁・センサー・遊技領域) を描く */
  showColliders: boolean;
  /** 釘の当たり判定の輪郭も描く */
  showNailColliders?: boolean;
}

/** 盤面の静的な部分 (釘・壁・入賞口の枠) を描画バッチに積む */
export function buildStaticScene(r: Renderer, board: BoardData, opts: StaticSceneOptions): void {
  r.nails.clear();
  r.nailShadows.clear();
  r.walls.clear();
  for (const o of board.objects) {
    if (o.type === 'nail') {
      const head = Math.max(o.r * 1.5, 2.8);
      r.nailShadows.push(o.x + 1.6, o.y + 2.2, head * 1.7, CircleKind.Shadow, [0, 0, 0, 0.55]);
      r.nails.push(o.x, o.y, head, CircleKind.Nail, NAIL_COLOR);
      if (opts.showColliders && opts.showNailColliders) {
        r.nails.push(o.x, o.y, o.r, CircleKind.Ring, NAIL_COLLIDER_COLOR);
      }
    }
  }
  if (!opts.showColliders) return;

  r.walls.polyline(board.playfield, true, 1, PLAYFIELD_COLOR);
  for (const o of board.objects) {
    switch (o.type) {
      case 'wall':
        r.walls.polyline(o.points, o.closed, 2.5, WALL_COLOR);
        break;
      case 'pocket':
        r.walls.polyline(rotRectCorners(o.rect), true, 2, POCKET_COLORS[o.kind]);
        if (o.lid) r.walls.polyline(rotRectCorners(o.lid), true, 2, LID_COLOR);
        break;
      case 'gate':
        r.walls.polyline(rotRectCorners(o.rect), true, 2, GATE_COLOR);
        break;
      case 'display':
        r.walls.polyline(rotRectCorners(o.rect), true, 1, DISPLAY_COLOR);
        break;
      default:
        break;
    }
  }
}

/** 玉と風車 (毎フレーム変わる部分) を描画バッチに積む */
export function buildDynamicScene(r: Renderer, physics: PhysicsWorld): void {
  const radius = physics.units.toPx(physics.params.ballRadius);
  r.balls.clear();
  r.ballShadows.clear();
  physics.forEachBall((x, y) => {
    r.ballShadows.push(x + 3, y + 4.5, radius * 1.35, CircleKind.Shadow, [0, 0, 0, 0.45]);
    r.balls.push(x, y, radius, CircleKind.Ball, BALL_COLOR);
  });
  r.windmills.clear();
  physics.forEachWindmill((def, angle) => {
    for (let i = 0; i < def.blades; i++) {
      const a = angle + (i / def.blades) * Math.PI * 2;
      r.windmills.push(
        def.x + Math.cos(a) * def.r * 0.55,
        def.y + Math.sin(a) * def.r * 0.55,
        def.r * 0.42,
        CircleKind.Flat,
        WINDMILL_COLOR,
      );
    }
    r.windmills.push(def.x, def.y, def.r * 0.25, CircleKind.Nail, NAIL_COLOR);
  });
}
