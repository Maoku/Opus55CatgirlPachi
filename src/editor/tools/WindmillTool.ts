import type { Vec2 } from '@/core/Vec2';
import { CircleKind } from '@/render/CircleBatch';
import { AddObjects } from '../commands';
import { round1 } from '../defaults';
import { GHOST } from './NailTool';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

const DEFAULT_RADIUS = 26;

/** クリックした位置に風車を置く */
export class WindmillTool extends Tool {
  readonly id = 'windmill';
  readonly label = '風車';
  readonly key = 'M';
  readonly hint = 'クリックした位置に風車を置きます。';
  private ghost: Vec2 | null = null;

  override move(e: ToolPointer): void {
    this.ghost = e.p;
    this.editor.requestOverlay();
  }

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    const ed = this.editor;
    const windmill = {
      id: ed.ids.allocate('windmill'),
      type: 'windmill' as const,
      x: round1(e.p.x),
      y: round1(e.p.y),
      r: DEFAULT_RADIUS,
      blades: 4,
      damping: 0.5,
    };
    ed.execute(new AddObjects([windmill], '風車の追加'));
    ed.select([windmill.id]);
  }

  override deactivate(): void {
    this.ghost = null;
  }

  override draw(d: OverlayDrawer): void {
    if (this.ghost)
      d.circles.push(this.ghost.x, this.ghost.y, DEFAULT_RADIUS, CircleKind.Ring, GHOST);
  }
}
