import { SCHEMA_VERSION } from './types';
import { BoardValidationError, validateBoard } from './validate';
import type { BoardData } from './types';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** version n のデータを n + 1 に変換する関数の表 */
const MIGRATIONS: Record<number, Migration> = {
  // schemaVersion を持たない試作版のデータ
  0: (raw) => ({ ...raw, schemaVersion: 1 }),
};

export function migrateBoard(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  let data = raw as Record<string, unknown>;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new BoardValidationError([
      `schemaVersion ${version} はこのバージョンでは読み込めません (対応: ${SCHEMA_VERSION} 以下)`,
    ]);
  }
  while (version < SCHEMA_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new BoardValidationError([`schemaVersion ${version} からの移行方法がありません`]);
    data = m(data);
    version++;
  }
  return data;
}

/** 移行と検証を通して BoardData にする。不正なら BoardValidationError を投げる */
export function parseBoard(input: unknown): BoardData {
  const result = validateBoard(migrateBoard(input));
  if (!result.ok) throw new BoardValidationError(result.errors);
  return result.board;
}

export function parseBoardJson(json: string): BoardData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new BoardValidationError([`JSON として読めません: ${(e as Error).message}`]);
  }
  return parseBoard(raw);
}

export function serializeBoard(board: BoardData): string {
  return JSON.stringify(board, null, 2);
}
