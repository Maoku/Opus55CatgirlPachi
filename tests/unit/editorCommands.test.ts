import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleBoard } from '@/board/sampleBoard';
import type { BoardData, NailObject } from '@/board/types';
import {
  AddObjects,
  CompositeCommand,
  RemoveObjects,
  ReplaceBoard,
  ReplaceObjects,
  SetBoardField,
} from '@/editor/commands';
import { Editor } from '@/editor/Editor';
import { History } from '@/editor/History';
import { hitTest, objectsInRect } from '@/editor/hitTest';
import { moveObject } from '@/editor/objectOps';
import { SelectTool } from '@/editor/tools/SelectTool';
import type { ToolPointer } from '@/editor/tools/Tool';

const nail = (id: string, x: number, y: number): NailObject => ({ id, type: 'nail', x, y, r: 2 });

let board: BoardData;
beforeEach(() => {
  board = createSampleBoard();
});

/** 実行 → 取消 → やり直しで、盤面が期待どおりに行き来することを確かめる */
function roundTrip(cmd: { apply(b: BoardData): void; revert(b: BoardData): void }) {
  const original = structuredClone(board);
  cmd.apply(board);
  const applied = structuredClone(board);
  cmd.revert(board);
  expect(board).toEqual(original);
  cmd.apply(board);
  expect(board).toEqual(applied);
  return { original, applied };
}

describe('コマンド', () => {
  it('AddObjects は追加し、取り消すと消える', () => {
    const { applied } = roundTrip(new AddObjects([nail('nail-x', 10, 20)]));
    expect(applied.objects.at(-1)).toEqual(nail('nail-x', 10, 20));
  });

  it('RemoveObjects は取り消すと元の位置に戻る', () => {
    const ids = [board.objects[1]!.id, board.objects[5]!.id, board.objects[6]!.id];
    const { applied } = roundTrip(new RemoveObjects(ids));
    expect(applied.objects.some((o) => ids.includes(o.id))).toBe(false);
  });

  it('ReplaceObjects は差し替え、取り消すと元に戻る', () => {
    const n = board.objects.find((o) => o.type === 'nail')!;
    const { applied } = roundTrip(new ReplaceObjects([n], [moveObject(n, 5, -3)]));
    const moved = applied.objects.find((o) => o.id === n.id) as NailObject;
    expect(moved.x).toBe((n as NailObject).x + 5);
  });

  it('SetBoardField は発射装置などを変更できる', () => {
    const after = { ...board.launcher, angle: -80 };
    const { applied } = roundTrip(new SetBoardField('launcher', board.launcher, after));
    expect(applied.launcher.angle).toBe(-80);
  });

  it('ReplaceBoard は盤面オブジェクトの同一性を保つ', () => {
    const ref = board;
    const next = { ...structuredClone(board), name: '別の盤面', objects: [] };
    roundTrip(new ReplaceBoard(board, next));
    expect(board).toBe(ref);
  });

  it('CompositeCommand は逆順に取り消す', () => {
    const a = nail('nail-a', 1, 1);
    roundTrip(
      new CompositeCommand(
        [new AddObjects([a]), new ReplaceObjects([a], [moveObject(a, 10, 10)])],
        '追加して移動',
      ),
    );
  });
});

describe('History', () => {
  it('undo / redo と、新しい操作での redo の破棄', () => {
    const h = new History();
    h.execute(new AddObjects([nail('nail-a', 1, 1)]), board);
    h.execute(new AddObjects([nail('nail-b', 2, 2)]), board);
    h.undo(board);
    expect(board.objects.some((o) => o.id === 'nail-b')).toBe(false);
    expect(h.canRedo).toBe(true);
    h.redo(board);
    expect(board.objects.some((o) => o.id === 'nail-b')).toBe(true);
    h.undo(board);
    h.execute(new AddObjects([nail('nail-c', 3, 3)]), board);
    expect(h.canRedo).toBe(false);
  });

  it('上限を超えた古い履歴は捨てる', () => {
    const h = new History(3);
    for (let i = 0; i < 5; i++) h.execute(new AddObjects([nail(`nail-z${i}`, i, i)]), board);
    let n = 0;
    while (h.undo(board)) n++;
    expect(n).toBe(3);
  });

  it('続けて行った微調整は 1 つにまとまる', () => {
    let t = 0;
    const h = new History(100, () => t);
    const n = nail('nail-a', 0, 0);
    h.execute(new AddObjects([n]), board);
    let cur = n;
    for (let i = 0; i < 5; i++) {
      const next = moveObject(cur, 1, 0);
      h.execute(new ReplaceObjects([cur], [next], '微調整'), board, true);
      cur = next;
      t += 100;
    }
    h.undo(board);
    expect(board.objects.find((o) => o.id === 'nail-a')).toEqual(n);
  });
});

describe('Editor', () => {
  it('選択したオブジェクトを削除し、Undo で戻す', () => {
    const ed = new Editor(board);
    const id = board.objects.find((o) => o.type === 'nail')!.id;
    ed.select([id]);
    ed.deleteSelected();
    expect(ed.get(id)).toBeUndefined();
    expect(ed.selection.size).toBe(0);
    ed.undo();
    expect(ed.get(id)).toBeDefined();
  });

  it('グリッドスナップ', () => {
    const ed = new Editor(board);
    ed.updateSettings({ snap: true, gridSize: 10 });
    expect(ed.snap({ x: 14, y: 26 })).toEqual({ x: 10, y: 30 });
  });

  it('選択ツールでドラッグすると移動し、Undo で戻る', () => {
    const ed = new Editor(board);
    const tool = new SelectTool(ed);
    ed.registerTool(tool);
    ed.setTool('select');
    const n = board.objects.find((o) => o.type === 'nail') as NailObject;
    const ptr = (x: number, y: number): ToolPointer => ({
      p: { x, y },
      raw: { x, y },
      shift: false,
      ctrl: false,
      alt: false,
      button: 0,
    });
    tool.down(ptr(n.x, n.y));
    tool.move(ptr(n.x + 20, n.y + 10));
    tool.up(ptr(n.x + 20, n.y + 10));
    expect(ed.get(n.id)).toMatchObject({ x: n.x + 20, y: n.y + 10 });
    expect(ed.selection.has(n.id)).toBe(true);
    ed.undo();
    expect(ed.get(n.id)).toMatchObject({ x: n.x, y: n.y });
  });

  it('矩形選択は範囲に収まるオブジェクトを選ぶ', () => {
    const nails = objectsInRect(board, { minX: 280, minY: 370, maxX: 420, maxY: 400 });
    expect(nails.length).toBeGreaterThan(0);
    expect(nails.every((o) => o.type === 'nail')).toBe(true);
  });

  it('当たり判定の重なる所では釘を優先して選ぶ', () => {
    board.objects.push(nail('nail-top', 500, 600), {
      id: 'wall-x',
      type: 'wall',
      points: [
        { x: 400, y: 600 },
        { x: 600, y: 600 },
      ],
      closed: false,
      material: 'rail',
    });
    expect(hitTest(board, { x: 501, y: 600 }, 5)?.id).toBe('nail-top');
    expect(hitTest(board, { x: 450, y: 601 }, 5)?.id).toBe('wall-x');
  });
});
