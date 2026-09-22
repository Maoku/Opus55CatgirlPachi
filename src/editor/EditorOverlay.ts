import { gapBetween, nailGaps, type NailGap } from '@/board/analysis';
import type { BoardObject } from '@/board/types';
import { DEG, rotRectCorners } from '@/core/geometry';
import { CircleKind } from '@/render/CircleBatch';
import { hex, type RGBA } from '@/render/color';
import type { Renderer } from '@/render/Renderer';
import type { Editor } from './Editor';
import type { OverlayDrawer } from './tools/Tool';

const SELECT = hex('#ffe14d');
const HOVER = hex('#ffffff', 0.7);
const GRID = hex('#ffffff', 0.12);
const GRID_MAJOR = hex('#ffffff', 0.22);
const LAUNCHER = hex('#7dff9a');
const GAP_OK = hex('#5fe0a0', 0.85);
const GAP_NG = hex('#ff5566', 0.95);

let gapCache: { revision: number; gaps: NailGap[] } | null = null;

function drawGaps(editor: Editor, d: OverlayDrawer): void {
  if (gapCache?.revision !== editor.revision) {
    gapCache = { revision: editor.revision, gaps: nailGaps(editor.board) };
  }
  for (const g of gapCache.gaps) {
    d.lines.segment(g.a.x, g.a.y, g.b.x, g.b.y, 1.5, g.passable ? GAP_OK : GAP_NG);
  }
}

/** 釘を 2 本選んだときに、中心間の距離と隙間を mm で表示する */
function drawNailPair(editor: Editor, d: OverlayDrawer): void {
  const sel = editor.selectedObjects();
  if (sel.length !== 2 || sel[0]!.type !== 'nail' || sel[1]!.type !== 'nail') return;
  const g = gapBetween(editor.board, sel[0], sel[1]);
  const mm = (px: number) => ((px / editor.board.scale.pxPerCm) * 10).toFixed(1);
  d.lines.segment(g.a.x, g.a.y, g.b.x, g.b.y, 2, g.passable ? GAP_OK : GAP_NG);
  const verdict = g.passable ? '玉が通る' : '玉が通らない';
  d.label(
    `中心間 ${mm(g.dist)}mm / 隙間 ${mm(g.gap)}mm (${verdict})`,
    (g.a.x + g.b.x) / 2,
    Math.min(g.a.y, g.b.y) - 4,
    g.passable ? 'ok' : 'ng',
  );
}

/** キャンバスに重ねる文字ラベル (寸法など)。要素を使い回す */
export class OverlayLabels {
  private readonly pool: HTMLDivElement[] = [];
  private used = 0;

  constructor(private readonly container: HTMLElement) {}

  begin(): void {
    this.used = 0;
  }

  add(text: string, sx: number, sy: number, className = ''): void {
    let el = this.pool[this.used];
    if (!el) {
      el = document.createElement('div');
      this.container.append(el);
      this.pool.push(el);
    }
    this.used++;
    el.className = `overlay-label ${className}`;
    if (el.textContent !== text) el.textContent = text;
    el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    el.style.display = '';
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.style.display = 'none';
  }

  clear(): void {
    this.begin();
    this.end();
  }
}

/** オブジェクトを強調表示する */
export function highlightObject(d: OverlayDrawer, o: BoardObject, color: RGBA, width = 2): void {
  switch (o.type) {
    case 'nail':
      d.circles.push(o.x, o.y, Math.max(o.r * 1.5, 2.8) + 3, CircleKind.Ring, color);
      break;
    case 'windmill':
      d.circles.push(o.x, o.y, o.r + 3, CircleKind.Ring, color);
      break;
    case 'wall':
      d.lines.polyline(o.points, o.closed, width + 1, color);
      break;
    case 'pocket':
      d.lines.polyline(rotRectCorners(o.rect), true, width, color);
      if (o.lid) d.lines.polyline(rotRectCorners(o.lid), true, width, color);
      break;
    case 'gate':
    case 'display':
      d.lines.polyline(rotRectCorners(o.rect), true, width, color);
      break;
  }
}

function drawGrid(editor: Editor, r: Renderer): void {
  const cam = r.camera;
  const g = editor.settings.gridSize;
  let step = g;
  while (step * cam.scale < 8) step *= 2;
  const a = cam.screenToBoard(0, 0);
  const b = cam.screenToBoard(cam.viewW, cam.viewH);
  const x0 = Math.max(0, Math.floor(a.x / step) * step);
  const y0 = Math.max(0, Math.floor(a.y / step) * step);
  const x1 = Math.min(r.background.width, b.x);
  const y1 = Math.min(r.background.height, b.y);
  const lines = r.overlayLines;
  for (let x = x0; x <= x1; x += step) {
    lines.segment(x, Math.max(0, a.y), x, y1, 1, x % (step * 5) === 0 ? GRID_MAJOR : GRID);
  }
  for (let y = y0; y <= y1; y += step) {
    lines.segment(Math.max(0, a.x), y, x1, y, 1, y % (step * 5) === 0 ? GRID_MAJOR : GRID);
  }
}

/** エディタのオーバーレイ (グリッド・発射装置・選択枠・ツールのガイド) を描画バッチに積む */
export function drawEditorOverlay(editor: Editor, r: Renderer, labels: OverlayLabels): void {
  const lines = r.overlayLines;
  const circles = r.overlayCircles;
  lines.clear();
  circles.clear();
  labels.begin();
  const drawer: OverlayDrawer = {
    lines,
    circles,
    label: (text, x, y, className) => {
      const s = r.camera.boardToScreen(x, y);
      labels.add(text, s.x, s.y, className);
    },
  };

  if (editor.settings.showGrid) drawGrid(editor, r);
  if (editor.settings.showGaps) drawGaps(editor, drawer);

  // 発射位置と方向
  const l = editor.board.launcher;
  const a = l.angle * DEG;
  lines.segment(l.x, l.y, l.x + Math.cos(a) * 45, l.y + Math.sin(a) * 45, 2, LAUNCHER);
  circles.push(l.x, l.y, 12, CircleKind.Ring, LAUNCHER);

  if (editor.hoverId && !editor.selection.has(editor.hoverId)) {
    const o = editor.get(editor.hoverId);
    if (o) highlightObject(drawer, o, HOVER, 1.5);
  }
  for (const o of editor.selectedObjects()) highlightObject(drawer, o, SELECT, 2);
  drawNailPair(editor, drawer);

  editor.tool?.draw(drawer);
  labels.end();
}
