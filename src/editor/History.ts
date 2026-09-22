import type { BoardData } from '@/board/types';
import { ReplaceObjects, type Command } from './commands';

/** 連続した微調整を 1 つにまとめる時間 (ms) */
const MERGE_WINDOW_MS = 800;

/** Undo / Redo の履歴 */
export class History {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private lastPushAt = 0;
  /** 変更のたびに増える (保存済みかどうかの判定に使う) */
  version = 0;

  constructor(
    readonly limit = 300,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  /** 実行して履歴に積む */
  execute(cmd: Command, board: BoardData, mergeable = false): void {
    cmd.apply(board);
    this.push(cmd, mergeable);
  }

  /** 実行済みのコマンドを履歴に積む (ドラッグ中にプレビューしていた変更など) */
  push(cmd: Command, mergeable = false): void {
    const t = this.now();
    const top = this.undoStack.at(-1);
    if (
      mergeable &&
      top instanceof ReplaceObjects &&
      cmd instanceof ReplaceObjects &&
      t - this.lastPushAt < MERGE_WINDOW_MS
    ) {
      const merged = top.mergeWith(cmd);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        this.lastPushAt = t;
        this.redoStack.length = 0;
        this.version++;
        return;
      }
    }
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.lastPushAt = mergeable ? t : 0;
    this.version++;
  }

  undo(board: BoardData): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.revert(board);
    this.redoStack.push(cmd);
    this.lastPushAt = 0;
    this.version++;
    return cmd;
  }

  redo(board: BoardData): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.apply(board);
    this.undoStack.push(cmd);
    this.lastPushAt = 0;
    this.version++;
    return cmd;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.version++;
  }
}
