import { circleThrough } from '@/core/geometry';
import type { Vec2 } from '@/core/Vec2';
import { CircleKind } from '@/render/CircleBatch';
import { h } from '@/ui/dom';
import { AddObjects } from '../commands';
import { makeNail } from '../defaults';
import { GHOST } from './NailTool';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

export type NailLineMode = 'line' | 'arc';
export type SpacingMode = 'count' | 'pitch';

export interface NailLineOptions {
  mode: NailLineMode;
  spacing: SpacingMode;
  count: number;
  /** 盤面 px */
  pitch: number;
}

/** 始点 a から終点 b まで、pass を通る円弧 (pass が null なら直線) 上に釘の位置を並べる */
export function nailPositions(
  a: Vec2,
  b: Vec2,
  pass: Vec2 | null,
  opts: Pick<NailLineOptions, 'spacing' | 'count' | 'pitch'>,
): Vec2[] {
  const circle = pass ? circleThrough(a, pass, b) : null;
  let length: number;
  let at: (t: number) => Vec2;
  if (circle) {
    const angA = Math.atan2(a.y - circle.y, a.x - circle.x);
    const angB = Math.atan2(b.y - circle.y, b.x - circle.x);
    const angP = Math.atan2(pass!.y - circle.y, pass!.x - circle.x);
    const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // a から正の向きに回って pass を通って b に着くか
    let sweep = norm(angB - angA);
    if (norm(angP - angA) > sweep) sweep -= 2 * Math.PI;
    length = Math.abs(sweep) * circle.r;
    at = (t) => {
      const ang = angA + sweep * t;
      return { x: circle.x + Math.cos(ang) * circle.r, y: circle.y + Math.sin(ang) * circle.r };
    };
  } else {
    length = Math.hypot(b.x - a.x, b.y - a.y);
    at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  if (length < 1e-6) return [{ ...a }];
  if (opts.spacing === 'count') {
    const n = Math.max(2, Math.round(opts.count));
    return Array.from({ length: n }, (_, i) => at(i / (n - 1)));
  }
  const pitch = Math.max(1, opts.pitch);
  const n = Math.floor(length / pitch + 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => at((i * pitch) / length));
}

/** 2 点 (直線) または 3 点 (円弧) を指定して、釘を等間隔に並べる */
export class NailLineTool extends Tool {
  readonly id = 'nailLine';
  readonly label = '釘列';
  readonly key = 'L';
  readonly hint =
    '直線: 始点と終点をクリック。円弧: 始点・終点・通過点をクリック。Enter で確定、Esc で取消。';
  opts: NailLineOptions = { mode: 'line', spacing: 'count', count: 6, pitch: 30 };
  private points: Vec2[] = [];
  private cursor: Vec2 | null = null;

  private preview(): Vec2[] {
    const [a, b] = this.points;
    const c = this.cursor;
    if (!a || !c) return [];
    if (!b) return nailPositions(a, c, null, this.opts);
    if (this.opts.mode === 'arc') return nailPositions(a, b, c, this.opts);
    return nailPositions(a, b, null, this.opts);
  }

  override move(e: ToolPointer): void {
    this.cursor = e.p;
    this.editor.requestOverlay();
  }

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    this.points.push(e.p);
    this.cursor = e.p;
    const needed = this.opts.mode === 'arc' ? 3 : 2;
    if (this.points.length >= needed) this.commit();
    this.editor.requestOverlay();
  }

  private commit(): void {
    const [a, b, c] = this.points;
    this.points = [];
    if (!a || !b) return;
    const pass = this.opts.mode === 'arc' && c ? c : null;
    const ed = this.editor;
    const nails = nailPositions(a, b, pass, this.opts).map((p) =>
      makeNail(ed.board, ed.ids.allocate('nail'), p),
    );
    ed.execute(new AddObjects(nails, '釘列の追加'));
    ed.select(nails.map((n) => n.id));
  }

  override keydown(e: KeyboardEvent): boolean {
    if (this.points.length === 0) return false;
    if (e.code === 'Escape') {
      this.points = [];
      this.editor.requestOverlay();
      return true;
    }
    if (e.code === 'Enter') {
      // 円弧モードで 2 点しかなければ直線で確定する
      if (this.points.length === 1 && this.cursor) this.points.push(this.cursor);
      this.commit();
      return true;
    }
    return false;
  }

  override deactivate(): void {
    this.points = [];
    this.cursor = null;
  }

  override draw(d: OverlayDrawer): void {
    const pts = this.preview();
    for (const p of pts) d.circles.push(p.x, p.y, 3, CircleKind.Ring, GHOST);
    const [a, b] = this.points;
    if (a && this.cursor) {
      const end = b ?? this.cursor;
      d.lines.segment(a.x, a.y, end.x, end.y, 1, GHOST);
      const last = pts.at(-1);
      if (last) d.label(`${pts.length} 本`, last.x, last.y - 8);
    }
  }

  override options(): HTMLElement {
    const mode = h('select', {}, [
      h('option', { value: 'line', textContent: '直線 (2 点)' }),
      h('option', { value: 'arc', textContent: '円弧 (3 点)' }),
    ]);
    mode.value = this.opts.mode;
    mode.addEventListener('change', () => {
      this.opts.mode = mode.value as NailLineMode;
      this.points = [];
    });
    const spacing = h('select', {}, [
      h('option', { value: 'count', textContent: '本数' }),
      h('option', { value: 'pitch', textContent: 'ピッチ (px)' }),
    ]);
    spacing.value = this.opts.spacing;
    const value = h('input', { type: 'number', min: '1', step: '1', className: 'narrow' });
    const sync = () => {
      value.value = String(this.opts.spacing === 'count' ? this.opts.count : this.opts.pitch);
    };
    sync();
    spacing.addEventListener('change', () => {
      this.opts.spacing = spacing.value as SpacingMode;
      sync();
    });
    value.addEventListener('change', () => {
      const v = Math.max(1, Number(value.value) || 1);
      if (this.opts.spacing === 'count') this.opts.count = Math.max(2, Math.round(v));
      else this.opts.pitch = v;
      sync();
      this.editor.requestOverlay();
    });
    return h('div', { className: 'row' }, [mode, spacing, value]);
  }
}
