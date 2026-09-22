import type { Vec2 } from '@/core/Vec2';
import { CircleKind } from '@/render/CircleBatch';
import { hex } from '@/render/color';
import { AddObjects } from '../commands';
import { makeNail } from '../defaults';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

export const GHOST = hex('#7dff9a', 0.9);

/** クリックした位置に釘を 1 本置く */
export class NailTool extends Tool {
  readonly id = 'nail';
  readonly label = '釘';
  readonly key = 'N';
  readonly hint = 'クリックした位置に釘を置きます。';
  private ghost: Vec2 | null = null;

  override move(e: ToolPointer): void {
    this.ghost = e.p;
    this.editor.requestOverlay();
  }

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    const ed = this.editor;
    const nail = makeNail(ed.board, ed.ids.allocate('nail'), e.p);
    ed.execute(new AddObjects([nail], '釘の追加'));
    ed.select([nail.id]);
  }

  override deactivate(): void {
    this.ghost = null;
  }

  override draw(d: OverlayDrawer): void {
    if (!this.ghost) return;
    d.circles.push(this.ghost.x, this.ghost.y, 3, CircleKind.Ring, GHOST);
  }
}
