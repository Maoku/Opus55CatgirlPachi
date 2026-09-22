import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeBoard, gapBetween, nailGaps } from '@/board/analysis';
import { createSampleBoard } from '@/board/sampleBoard';
import type { BoardData, NailObject, PocketObject, WallObject } from '@/board/types';
import { Editor } from '@/editor/Editor';
import { NailLineTool, nailPositions } from '@/editor/tools/NailLineTool';
import { NailTool } from '@/editor/tools/NailTool';
import { PocketTool } from '@/editor/tools/PocketTool';
import type { ToolPointer } from '@/editor/tools/Tool';
import { VertexTool } from '@/editor/tools/VertexTool';
import { snap45, WallTool } from '@/editor/tools/WallTool';

const ptr = (x: number, y: number, extra: Partial<ToolPointer> = {}): ToolPointer => ({
  p: { x, y },
  raw: { x, y },
  shift: false,
  ctrl: false,
  alt: false,
  button: 0,
  ...extra,
});
const key = (code: string) => ({ code }) as KeyboardEvent;

let board: BoardData;
let ed: Editor;
beforeEach(() => {
  board = createSampleBoard();
  ed = new Editor(board);
});

describe('釘列の配置', () => {
  it('本数を指定すると両端を含めて等間隔に並ぶ', () => {
    const pts = nailPositions({ x: 0, y: 0 }, { x: 100, y: 0 }, null, {
      spacing: 'count',
      count: 5,
      pitch: 0,
    });
    expect(pts.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
  });

  it('ピッチを指定すると始点からその間隔で並ぶ', () => {
    const pts = nailPositions({ x: 0, y: 0 }, { x: 0, y: 95 }, null, {
      spacing: 'pitch',
      count: 0,
      pitch: 30,
    });
    expect(pts.map((p) => Math.round(p.y))).toEqual([0, 30, 60, 90]);
  });

  it('円弧は 3 点を通り、端点から等距離に並ぶ', () => {
    const a = { x: -100, y: 0 };
    const b = { x: 100, y: 0 };
    const pass = { x: 0, y: -100 };
    const pts = nailPositions(a, b, pass, { spacing: 'count', count: 5, pitch: 0 });
    expect(pts[0]!.x).toBeCloseTo(-100);
    expect(pts[4]!.x).toBeCloseTo(100);
    expect(pts[2]!.x).toBeCloseTo(0);
    expect(pts[2]!.y).toBeCloseTo(-100);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100);
  });

  it('ツールで 2 点クリックすると釘列が追加され、1 回の Undo で消える', () => {
    const tool = new NailLineTool(ed);
    ed.registerTool(tool);
    ed.setTool('nailLine');
    const before = board.objects.length;
    tool.opts.count = 4;
    tool.down(ptr(300, 700));
    tool.down(ptr(390, 700));
    expect(board.objects.length).toBe(before + 4);
    expect(ed.selection.size).toBe(4);
    ed.undo();
    expect(board.objects.length).toBe(before);
  });
});

describe('配置ツール', () => {
  it('釘ツールは物理パラメータの半径で釘を置く', () => {
    const tool = new NailTool(ed);
    ed.registerTool(tool);
    ed.setTool('nail');
    tool.down(ptr(400.04, 800));
    const n = board.objects.at(-1) as NailObject;
    expect(n.type).toBe('nail');
    expect(n.x).toBe(400);
    expect(n.r).toBeCloseTo(board.physics.nailRadius * board.scale.pxPerCm, 2);
  });

  it('壁ツールは Enter で確定し、Esc で取り消す', () => {
    const tool = new WallTool(ed);
    ed.registerTool(tool);
    ed.setTool('wall');
    const before = board.objects.length;
    tool.down(ptr(100, 100));
    tool.down(ptr(200, 100));
    tool.down(ptr(200, 100)); // ダブルクリックの 2 回目は無視される
    tool.down(ptr(200, 200));
    expect(tool.keydown(key('Enter'))).toBe(true);
    const wall = board.objects.at(-1) as WallObject;
    expect(wall.points).toHaveLength(3);
    expect(board.objects.length).toBe(before + 1);
    tool.down(ptr(0, 0));
    tool.keydown(key('Escape'));
    expect(board.objects.length).toBe(before + 1);
  });

  it('Shift で 45° 単位に合わせる', () => {
    const p = snap45({ x: 0, y: 0 }, { x: 100, y: 12 });
    expect(p.y).toBeCloseTo(0);
    const q = snap45({ x: 0, y: 0 }, { x: 50, y: 58 });
    expect(q.x).toBeCloseTo(q.y);
  });

  it('入賞口ツールはドラッグした矩形で置き、電チューには蓋を付ける', () => {
    const tool = new PocketTool(ed);
    ed.registerTool(tool);
    ed.setTool('pocket');
    tool.kind = 'electric';
    tool.down(ptr(500, 800));
    tool.up(ptr(540, 830));
    const p = board.objects.at(-1) as PocketObject;
    expect(p).toMatchObject({ type: 'pocket', kind: 'electric', payout: 1 });
    expect(p.rect).toMatchObject({ x: 520, y: 815, w: 40, h: 30 });
    expect(p.lid).toBeDefined();
  });

  it('頂点編集: 頂点をドラッグし、辺をダブルクリックで頂点を足し、Delete で消す', () => {
    const tool = new VertexTool(ed);
    ed.registerTool(tool);
    ed.setTool('vertex');
    ed.viewScale = 1;
    const wall: WallObject = {
      id: 'wall-t',
      type: 'wall',
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      closed: false,
      material: 'rail',
    };
    board.objects.push(wall);
    ed.select(['wall-t']);
    tool.down(ptr(200, 100));
    tool.move(ptr(210, 120));
    tool.up(ptr(210, 120));
    expect((ed.get('wall-t') as WallObject).points[1]).toEqual({ x: 210, y: 120 });
    tool.dblclick(ptr(155, 110));
    expect((ed.get('wall-t') as WallObject).points).toHaveLength(3);
    tool.keydown(key('Delete'));
    expect((ed.get('wall-t') as WallObject).points).toHaveLength(2);
    ed.undo();
    ed.undo();
    ed.undo();
    expect((ed.get('wall-t') as WallObject).points[1]).toEqual({ x: 200, y: 100 });
  });
});

describe('コピー・貼り付け・複製', () => {
  it('新しい id でずらして追加し、貼り付けるたびにずれが増える', () => {
    const n = board.objects.find((o) => o.type === 'nail') as NailObject;
    ed.select([n.id]);
    ed.copySelection();
    ed.paste();
    const p1 = ed.selectedObjects()[0] as NailObject;
    expect(p1.id).not.toBe(n.id);
    expect(p1.x).toBe(n.x + 10);
    ed.paste();
    const p2 = ed.selectedObjects()[0] as NailObject;
    expect(p2.x).toBe(n.x + 20);
    ed.duplicate();
    const d = ed.selectedObjects()[0] as NailObject;
    expect(d.x).toBe(p2.x + 10);
    expect(new Set(board.objects.map((o) => o.id)).size).toBe(board.objects.length);
  });
});

describe('盤面の解析', () => {
  const nail = (id: string, x: number, y: number): NailObject => ({
    id,
    type: 'nail',
    x,
    y,
    r: 1.95,
  });

  it('釘の隙間と、玉が通れるかを判定する', () => {
    // 玉の直径は 0.55 * 2 * 21.6 = 23.76px
    const wide = gapBetween(board, nail('a', 0, 0), nail('b', 28, 0));
    expect(wide.gap).toBeCloseTo(28 - 3.9);
    expect(wide.passable).toBe(true);
    const narrow = gapBetween(board, nail('a', 0, 0), nail('b', 26, 0));
    expect(narrow.passable).toBe(false);
  });

  it('近くの釘の組だけを列挙する', () => {
    board.objects = [nail('a', 0, 0), nail('b', 30, 0), nail('c', 200, 0)];
    const gaps = nailGaps(board);
    expect(gaps).toHaveLength(1);
    expect([gaps[0]!.a.id, gaps[0]!.b.id]).toEqual(['a', 'b']);
  });

  it('遊技領域外のオブジェクトと重なった釘を警告する', () => {
    board.objects.push(
      nail('nail-out', 5, 5),
      nail('nail-o1', 500, 800),
      nail('nail-o2', 502, 800),
    );
    const w = analyzeBoard(board);
    expect(w.some((x) => x.ids.includes('nail-out') && x.message.includes('遊技領域の外'))).toBe(
      true,
    );
    expect(w.some((x) => x.message.includes('重なっています'))).toBe(true);
    expect(w.some((x) => x.message.includes('ヘソ'))).toBe(true);
  });
});
