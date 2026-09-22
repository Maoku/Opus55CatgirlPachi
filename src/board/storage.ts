import { parseBoardJson, serializeBoard } from './migrate';
import type { BoardData } from './types';

export const BOARD_STORAGE_KEY = 'pachi.board';

/** localStorage が使えない環境 (プライベートモードなど) でも落ちないようにする */
function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveBoardLocal(board: BoardData, storage = storageOrNull()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BOARD_STORAGE_KEY, serializeBoard(board));
    return true;
  } catch (e) {
    console.warn('盤面を保存できませんでした', e);
    return false;
  }
}

/** 保存済みの盤面を読む。無い・壊れているときは null */
export function loadBoardLocal(storage = storageOrNull()): BoardData | null {
  if (!storage) return null;
  let json: string | null;
  try {
    json = storage.getItem(BOARD_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!json) return null;
  try {
    return parseBoardJson(json);
  } catch (e) {
    console.warn('保存されていた盤面を読み込めませんでした', e);
    return null;
  }
}

export function clearBoardLocal(storage = storageOrNull()): void {
  try {
    storage?.removeItem(BOARD_STORAGE_KEY);
  } catch {
    // 消せなくても支障はない
  }
}

/** JSON などのテキストをファイルとしてダウンロードさせる */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

/** 設定値など小さな JSON を読み書きする */
export function loadJson<T>(key: string, fallback: T, storage = storageOrNull()): T {
  try {
    const s = storage?.getItem(key);
    return s ? { ...fallback, ...(JSON.parse(s) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown, storage = storageOrNull()): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても動作は続ける
  }
}

/** ファイル名に使えない文字を取り除く */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'board';
}
