import { describe, expect, it } from 'vitest';
import { IdAllocator } from '@/board/ids';
import { migrateBoard, parseBoard, parseBoardJson, serializeBoard } from '@/board/migrate';
import { createSampleBoard } from '@/board/sampleBoard';
import { BoardValidationError, validateBoard } from '@/board/validate';
import { Units } from '@/core/units';

describe('座標換算', () => {
  it('px と cm を相互に変換する', () => {
    const u = new Units(21.6);
    expect(u.toCm(21.6)).toBeCloseTo(1);
    expect(u.toPx(0.55)).toBeCloseTo(11.88);
    expect(u.toCm(u.toPx(3.3))).toBeCloseTo(3.3);
    expect(u.toMm(21.6)).toBeCloseTo(10);
  });
});

describe('BoardData の検証', () => {
  it('仮の盤面は検証を通る', () => {
    const result = validateBoard(createSampleBoard());
    expect(result.ok).toBe(true);
  });

  it('シリアライズして読み直すと同じ盤面になる', () => {
    const board = createSampleBoard();
    expect(parseBoardJson(serializeBoard(board))).toEqual(board);
  });

  it('不正な値を検出する', () => {
    const board = createSampleBoard() as unknown as Record<string, unknown>;
    const objects = board.objects as Record<string, unknown>[];
    objects.push({ id: 'nail-1', type: 'nail', x: 'a', y: 0, r: 1 });
    objects.push({ id: 'x-1', type: 'unknown' });
    const result = validateBoard(board);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('.x: 数値ではありません'))).toBe(true);
    expect(result.errors.some((e) => e.includes('id が重複'))).toBe(true);
    expect(result.errors.some((e) => e.includes('不明な種類'))).toBe(true);
  });

  it('JSON として読めない文字列は BoardValidationError', () => {
    expect(() => parseBoardJson('{ broken')).toThrow(BoardValidationError);
  });

  it('物理パラメータの欠けた項目は既定値で補う', () => {
    const board = createSampleBoard() as unknown as Record<string, unknown>;
    board.physics = { gravity: 500 };
    const parsed = parseBoard(board);
    expect(parsed.physics.gravity).toBe(500);
    expect(parsed.physics.ballRadius).toBe(0.55);
    expect(parsed.physics.materials.nail.restitution).toBe(0.55);
  });
});

describe('スキーマ移行', () => {
  it('schemaVersion のない試作版を version 1 に移行する', () => {
    const board = createSampleBoard() as unknown as Record<string, unknown>;
    delete board.schemaVersion;
    const migrated = migrateBoard(board) as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(1);
    expect(parseBoard(board).objects.length).toBeGreaterThan(0);
  });

  it('未来のバージョンは読み込みを拒否する', () => {
    const board = { ...createSampleBoard(), schemaVersion: 99 };
    expect(() => parseBoard(board)).toThrow(/schemaVersion 99/);
  });
});

describe('IdAllocator', () => {
  it('既存の id と重ならない連番を払い出す', () => {
    const board = createSampleBoard();
    const ids = new IdAllocator(board);
    const nailCount = board.objects.filter((o) => o.type === 'nail').length;
    expect(ids.allocate('nail')).toBe(`nail-${nailCount + 1}`);
    expect(ids.allocate('nail')).toBe(`nail-${nailCount + 2}`);
    expect(ids.allocate('gate')).toBe('gate-1');
  });
});
