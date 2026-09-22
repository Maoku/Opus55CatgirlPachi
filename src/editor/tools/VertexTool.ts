import type { WallObject } from '@/board/types';
import { distPointSegment } from '@/core/geometry';
import type { Vec2 } from '@/core/Vec2';
import { CircleKind } from '@/render/CircleBatch';
import { hex } from '@/render/color';
import { h } from '@/ui/dom';
import { ReplaceObjects, SetBoardField, type Command } from '../commands';
import { roundVec } from '../defaults';
import { distanceTo } from '../hitTest';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

const HANDLE = hex('#ffe14d');
const PLAYFIELD = hex('#ffffff', 0.8);

type Target = { kind: 'wall'; id: string } | { kind: 'playfield' };

interface VertexRef {
  target: Target;
  index: number;
}

/** 壁 (または遊技領域) の頂点をドラッグ・追加・削除する */
export class VertexTool extends Tool {
  readonly id = 'vertex';
  readonly label = '頂点編集';
  readonly key = 'A';
  readonly hint =
    '壁を選んで頂点をドラッグ。辺をダブルクリックで頂点を追加、頂点をクリックして Delete で削除。';
  override cssCursor = 'default';
  /** 壁ではなく遊技領域の多角形を編集する */
  editPlayfield = false;
  private active: VertexRef | null = null;
  private drag: { ref: VertexRef; before: Vec2[]; moved: boolean } | null = null;

  private targets(): Target[] {
    if (this.editPlayfield) return [{ kind: 'playfield' }];
    return this.editor
      .selectedObjects()
      .filter((o): o is WallObject => o.type === 'wall')
      .map((o) => ({ kind: 'wall', id: o.id }));
  }

  private points(t: Target): Vec2[] {
    if (t.kind === 'playfield') return this.editor.board.playfield;
    const wall = this.editor.get(t.id);
    return wall?.type === 'wall' ? wall.points : [];
  }

  private closed(t: Target): boolean {
    if (t.kind === 'playfield') return true;
    const wall = this.editor.get(t.id);
    return wall?.type === 'wall' && wall.closed;
  }

  /** 頂点を置き換えたコマンドを作る */
  private command(t: Target, before: Vec2[], after: Vec2[], label: string): Command {
    if (t.kind === 'playfield') return new SetBoardField('playfield', before, after, label);
    const wall = this.editor.get(t.id) as WallObject;
    return new ReplaceObjects([{ ...wall, points: before }], [{ ...wall, points: after }], label);
  }

  private findVertex(p: Vec2): VertexRef | null {
    const tol = this.editor.tolerance(7);
    let best: VertexRef | null = null;
    let bestD = tol;
    for (const target of this.targets()) {
      this.points(target).forEach((v, index) => {
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d <= bestD) {
          bestD = d;
          best = { target, index };
        }
      });
    }
    return best;
  }

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    const ref = this.findVertex(e.raw);
    if (ref) {
      this.active = ref;
      this.drag = { ref, before: this.points(ref.target).map((v) => ({ ...v })), moved: false };
      this.editor.requestOverlay();
      return;
    }
    this.active = null;
    if (!this.editPlayfield) {
      // 頂点の外をクリックしたら、その位置の壁を選ぶ
      const tol = this.editor.tolerance();
      const wall = this.editor.board.objects.find(
        (o) => o.type === 'wall' && distanceTo(o, e.raw) <= tol,
      );
      if (wall) this.editor.select([wall.id], e.shift ? 'add' : 'replace');
      else if (!e.shift) this.editor.clearSelection();
    }
    this.editor.requestOverlay();
  }

  override move(e: ToolPointer): void {
    const d = this.drag;
    if (!d) return;
    d.moved = true;
    const pts = d.before.map((v, i) => (i === d.ref.index ? roundVec(e.p) : { ...v }));
    this.preview(d.ref.target, pts);
  }

  private preview(t: Target, pts: Vec2[]): void {
    const ed = this.editor;
    if (t.kind === 'playfield') {
      ed.previewField('playfield', pts);
    } else {
      const wall = ed.get(t.id) as WallObject;
      ed.previewReplace([{ ...wall, points: pts }]);
    }
  }

  override up(_e: ToolPointer): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moved) return;
    const after = this.points(d.ref.target).map((v) => ({ ...v }));
    this.editor.commitPreview(this.command(d.ref.target, d.before, after, '頂点の移動'));
  }

  override dblclick(e: ToolPointer): void {
    const tol = this.editor.tolerance(7);
    for (const target of this.targets()) {
      const pts = this.points(target);
      const n = pts.length;
      const segs = this.closed(target) ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        if (distPointSegment(e.raw, a, b) > tol) continue;
        const after = [...pts.slice(0, i + 1), roundVec(e.p), ...pts.slice(i + 1)];
        this.editor.execute(this.command(target, pts, after, '頂点の追加'));
        this.active = { target, index: i + 1 };
        return;
      }
    }
  }

  override keydown(e: KeyboardEvent): boolean {
    const a = this.active;
    if (!a || (e.code !== 'Delete' && e.code !== 'Backspace')) return false;
    const pts = this.points(a.target);
    const min = this.closed(a.target) ? 3 : 2;
    if (pts.length > min) {
      const after = pts.filter((_, i) => i !== a.index);
      this.editor.execute(this.command(a.target, pts, after, '頂点の削除'));
    }
    this.active = null;
    return true;
  }

  override activate(): void {
    this.active = null;
  }

  override deactivate(): void {
    this.active = null;
    this.drag = null;
  }

  override draw(d: OverlayDrawer): void {
    for (const target of this.targets()) {
      const pts = this.points(target);
      if (target.kind === 'playfield') d.lines.polyline(pts, true, 1.5, PLAYFIELD);
      pts.forEach((v, i) => {
        const on = this.active?.index === i && sameTarget(this.active.target, target);
        d.circles.push(v.x, v.y, on ? 5 : 4, on ? CircleKind.Flat : CircleKind.Ring, HANDLE);
      });
    }
  }

  override options(): HTMLElement {
    const pf = h('input', { type: 'checkbox', checked: this.editPlayfield });
    pf.addEventListener('change', () => {
      this.editPlayfield = pf.checked;
      this.active = null;
      this.editor.requestOverlay();
    });
    return h('label', { className: 'check' }, [pf, '遊技領域 (玉を回収する境界) を編集']);
  }
}

function sameTarget(a: Target, b: Target): boolean {
  return a.kind === b.kind && (a.kind === 'playfield' || a.id === (b as { id: string }).id);
}
