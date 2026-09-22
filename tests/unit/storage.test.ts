import { describe, expect, it } from 'vitest';
import { serializeBoard } from '@/board/migrate';
import { createSampleBoard } from '@/board/sampleBoard';
import {
  BOARD_STORAGE_KEY,
  clearBoardLocal,
  loadBoardLocal,
  loadJson,
  safeFileName,
  saveBoardLocal,
  saveJson,
} from '@/board/storage';

/** テスト用の localStorage */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

describe('盤面の保存', () => {
  it('保存して読み直すと同じ盤面になる', () => {
    const s = new MemoryStorage();
    const board = createSampleBoard();
    board.name = '保存テスト';
    expect(saveBoardLocal(board, s)).toBe(true);
    expect(loadBoardLocal(s)).toEqual(board);
    clearBoardLocal(s);
    expect(loadBoardLocal(s)).toBeNull();
  });

  it('壊れたデータは読まずに null を返す', () => {
    const s = new MemoryStorage();
    s.setItem(BOARD_STORAGE_KEY, '{"schemaVersion":1,"objects":"x"}');
    expect(loadBoardLocal(s)).toBeNull();
    s.setItem(BOARD_STORAGE_KEY, 'not json');
    expect(loadBoardLocal(s)).toBeNull();
  });

  it('保存できない環境でも例外を出さない', () => {
    const s = new MemoryStorage();
    s.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(saveBoardLocal(createSampleBoard(), s)).toBe(false);
    expect(saveBoardLocal(createSampleBoard(), null)).toBe(false);
  });

  it('JSON の書き出し形式は読み込みと往復できる', () => {
    const s = new MemoryStorage();
    const board = createSampleBoard();
    s.setItem(BOARD_STORAGE_KEY, serializeBoard(board));
    expect(loadBoardLocal(s)).toEqual(board);
  });
});

describe('設定の保存', () => {
  it('欠けた項目は既定値で補う', () => {
    const s = new MemoryStorage();
    saveJson('k', { a: 5 }, s);
    expect(loadJson('k', { a: 1, b: 2 }, s)).toEqual({ a: 5, b: 2 });
    expect(loadJson('missing', { a: 1 }, s)).toEqual({ a: 1 });
  });

  it('ファイル名に使えない文字を置き換える', () => {
    expect(safeFileName('a/b:c?')).toBe('a_b_c_');
    expect(safeFileName('  ')).toBe('board');
  });
});
