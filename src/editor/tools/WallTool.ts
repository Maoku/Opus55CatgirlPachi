import { WALL_MATERIALS, type WallMaterial } from '@/board/types';
import type { Vec2 } from '@/core/Vec2';
import { CircleKind } from '@/render/CircleBatch';
import { h } from '@/ui/dom';
import { AddObjects } from '../commands';
import { roundVec } from '../defaults';
import { GHOST } from './NailTool';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

export const MATERIAL_LABELS: Record<WallMaterial, string> = {
  rail: 'レール (金属)',
  plastic: 'プラスチック',
  rubber: 'ゴム (よく跳ねる)',
};

/** 直前の点から見て 45° 単位の方向に合わせる */
export function snap45(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}

/** クリックで頂点を足していき、Enter かダブルクリックで壁を確定する */
export class WallTool extends Tool {
  readonly id = 'wall';
  readonly label = '壁';
  readonly key = 'W';
  readonly hint =
    'クリックで頂点を追加、Enter またはダブルクリックで確定。Shift で 45° 単位、Backspace で 1 点戻す、Esc で取消。';
  material: WallMaterial = 'plastic';
  closed = false;
  private points: Vec2[] = [];
  private cursor: Vec2 | null = null;

  private target(e: ToolPointer): Vec2 {
    const last = this.points.at(-1);
    return last && e.shift ? snap45(last, e.p) : e.p;
  }

  override move(e: ToolPointer): void {
    this.cursor = this.target(e);
    this.editor.requestOverlay();
  }

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    const p = this.target(e);
    const last = this.points.at(-1);
    // ダブルクリックで同じ点が続けて入るのを防ぐ
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) this.points.push(p);
    this.editor.requestOverlay();
  }

  override dblclick(): void {
    this.commit();
  }

  private commit(): void {
    const pts = this.points.map(roundVec);
    this.points = [];
    this.editor.requestOverlay();
    if (pts.length < 2) return;
    const ed = this.editor;
    const wall = {
      id: ed.ids.allocate('wall'),
      type: 'wall' as const,
      points: pts,
      closed: this.closed && pts.length >= 3,
      material: this.material,
    };
    ed.execute(new AddObjects([wall], '壁の追加'));
    ed.select([wall.id]);
  }

  override keydown(e: KeyboardEvent): boolean {
    if (this.points.length === 0) return false;
    switch (e.code) {
      case 'Enter':
        this.commit();
        return true;
      case 'Escape':
        this.points = [];
        this.editor.requestOverlay();
        return true;
      case 'Backspace':
        this.points.pop();
        this.editor.requestOverlay();
        return true;
      default:
        return false;
    }
  }

  override deactivate(): void {
    this.points = [];
    this.cursor = null;
  }

  override draw(d: OverlayDrawer): void {
    const pts = [...this.points];
    if (this.cursor) pts.push(this.cursor);
    d.lines.polyline(pts, this.closed && pts.length >= 3, 2, GHOST);
    for (const p of this.points) d.circles.push(p.x, p.y, 3, CircleKind.Ring, GHOST);
  }

  override options(): HTMLElement {
    const material = h(
      'select',
      {},
      WALL_MATERIALS.map((m) => h('option', { value: m, textContent: MATERIAL_LABELS[m] })),
    );
    material.value = this.material;
    material.addEventListener('change', () => (this.material = material.value as WallMaterial));
    const closed = h('input', { type: 'checkbox', checked: this.closed });
    closed.addEventListener('change', () => (this.closed = closed.checked));
    return h('div', { className: 'row' }, [
      material,
      h('label', { className: 'check' }, [closed, '閉じた図形']),
    ]);
  }
}
