import type { BoardObject } from '@/board/types';
import type { Vec2 } from '@/core/Vec2';
import { hex } from '@/render/color';
import { ReplaceObjects } from '../commands';
import { hitTest, objectsInRect, rectFromPoints } from '../hitTest';
import { moveObject, objectAnchor } from '../objectOps';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

const MARQUEE = hex('#5fe0ff', 0.9);

type DragState =
  | {
      kind: 'move';
      start: Vec2;
      anchor: Vec2;
      before: BoardObject[];
      moved: boolean;
    }
  | { kind: 'marquee'; start: Vec2; end: Vec2; additive: boolean };

/** 選択・移動・矩形選択 */
export class SelectTool extends Tool {
  readonly id = 'select';
  readonly label = '選択・移動';
  readonly key = 'V';
  readonly hint =
    'クリックで選択、Shift で追加選択。ドラッグで移動、何もない所からドラッグで矩形選択';
  override cursor = 'default';
  private drag: DragState | null = null;

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    const ed = this.editor;
    const hit = hitTest(ed.board, e.raw, ed.tolerance());
    if (hit) {
      if (e.shift) {
        ed.select([hit.id], 'toggle');
        if (!ed.selection.has(hit.id)) return;
      } else if (!ed.selection.has(hit.id)) {
        ed.select([hit.id], 'replace');
      }
      const before = ed.selectedObjects();
      this.drag = { kind: 'move', start: e.raw, anchor: objectAnchor(hit), before, moved: false };
    } else {
      if (!e.shift) ed.clearSelection();
      this.drag = { kind: 'marquee', start: e.raw, end: e.raw, additive: e.shift };
    }
  }

  override move(e: ToolPointer): void {
    const ed = this.editor;
    const d = this.drag;
    if (!d) {
      const hit = hitTest(ed.board, e.raw, ed.tolerance());
      ed.setHover(hit?.id ?? null);
      return;
    }
    if (d.kind === 'marquee') {
      d.end = e.raw;
      ed.requestOverlay();
      return;
    }
    // 基準点がグリッドに乗るように移動量を決める
    const target = ed.snap({
      x: d.anchor.x + e.raw.x - d.start.x,
      y: d.anchor.y + e.raw.y - d.start.y,
    });
    const dx = target.x - d.anchor.x;
    const dy = target.y - d.anchor.y;
    if (!d.moved && Math.hypot(e.raw.x - d.start.x, e.raw.y - d.start.y) < ed.tolerance(3)) return;
    d.moved = true;
    ed.previewReplace(d.before.map((o) => moveObject(o, dx, dy)));
  }

  override up(_e: ToolPointer): void {
    const ed = this.editor;
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'marquee') {
      const r = rectFromPoints(d.start, d.end);
      if (r.maxX - r.minX > 1 || r.maxY - r.minY > 1) {
        const ids = objectsInRect(ed.board, r).map((o) => o.id);
        ed.select(ids, d.additive ? 'add' : 'replace');
      }
      ed.requestOverlay();
      return;
    }
    if (d.moved) {
      const after = d.before.map((o) => ed.get(o.id)!).filter(Boolean);
      ed.commitPreview(new ReplaceObjects(d.before, after, '移動'));
    }
  }

  override deactivate(): void {
    this.drag = null;
  }

  override draw(dr: OverlayDrawer): void {
    const d = this.drag;
    if (d?.kind !== 'marquee') return;
    const r = rectFromPoints(d.start, d.end);
    dr.lines.rect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY, 1, MARQUEE);
  }
}
