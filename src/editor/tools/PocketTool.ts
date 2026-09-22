import type { Vec2 } from '@/core/Vec2';
import { POCKET_COLORS } from '@/render/SceneBuilder';
import { hex } from '@/render/color';
import { h } from '@/ui/dom';
import { AddObjects } from '../commands';
import {
  DEFAULT_RECT_SIZE,
  makeRectObject,
  RECT_KIND_LABELS,
  round1,
  type RectKind,
} from '../defaults';
import { rectFromPoints } from '../hitTest';
import { Tool, type OverlayDrawer, type ToolPointer } from './Tool';

const KINDS = Object.keys(RECT_KIND_LABELS) as RectKind[];

/** 入賞口・ゲート・液晶領域を矩形で描く */
export class PocketTool extends Tool {
  readonly id = 'pocket';
  readonly label = '入賞口・ゲート';
  readonly key = 'P';
  readonly hint =
    '種類を選んでドラッグで矩形を描きます。クリックだけなら既定の大きさで置きます。入賞判定は玉の中心が矩形に入ったときです。';
  kind: RectKind = 'start';
  private start: Vec2 | null = null;
  private cursor: Vec2 | null = null;

  override move(e: ToolPointer): void {
    this.cursor = e.p;
    this.editor.requestOverlay();
  }

  override down(e: ToolPointer): void {
    if (e.button !== 0) return;
    this.start = e.p;
    this.cursor = e.p;
  }

  override up(e: ToolPointer): void {
    const a = this.start;
    this.start = null;
    if (!a) return;
    const r = rectFromPoints(a, e.p);
    let w = r.maxX - r.minX;
    let hh = r.maxY - r.minY;
    let cx = (r.minX + r.maxX) / 2;
    let cy = (r.minY + r.maxY) / 2;
    if (w < 3 && hh < 3) {
      ({ w, h: hh } = DEFAULT_RECT_SIZE[this.kind]);
      cx = a.x;
      cy = a.y;
    }
    const ed = this.editor;
    const type = this.kind === 'gate' || this.kind === 'display' ? this.kind : 'pocket';
    const obj = makeRectObject(this.kind, ed.ids.allocate(type), {
      x: round1(cx),
      y: round1(cy),
      w: round1(Math.max(w, 2)),
      h: round1(Math.max(hh, 2)),
      angle: 0,
    });
    ed.execute(new AddObjects([obj], `${RECT_KIND_LABELS[this.kind]}の追加`));
    ed.select([obj.id]);
  }

  override deactivate(): void {
    this.start = null;
    this.cursor = null;
  }

  private color() {
    if (this.kind === 'gate') return hex('#ffe066');
    if (this.kind === 'display') return hex('#ffffff', 0.7);
    return POCKET_COLORS[this.kind];
  }

  override draw(d: OverlayDrawer): void {
    const c = this.cursor;
    if (!c) return;
    if (this.start) {
      const r = rectFromPoints(this.start, c);
      d.lines.rect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY, 1.5, this.color());
    } else {
      const s = DEFAULT_RECT_SIZE[this.kind];
      d.lines.rect(c.x - s.w / 2, c.y - s.h / 2, s.w, s.h, 1, this.color());
    }
  }

  override options(): HTMLElement {
    const select = h(
      'select',
      {},
      KINDS.map((k) => h('option', { value: k, textContent: RECT_KIND_LABELS[k] })),
    );
    select.value = this.kind;
    select.addEventListener('change', () => {
      this.kind = select.value as RectKind;
      this.editor.requestOverlay();
    });
    return h('div', { className: 'row' }, [select]);
  }
}
