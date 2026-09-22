import type { BoardData, BoardObject } from '@/board/types';

/** 盤面を変更する操作。apply と revert は互いに逆の変更をする */
export interface Command {
  readonly label: string;
  apply(board: BoardData): void;
  revert(board: BoardData): void;
}

const clone = <T>(v: T): T => structuredClone(v);

function indexOfId(board: BoardData, id: string): number {
  return board.objects.findIndex((o) => o.id === id);
}

/** オブジェクトを追加する */
export class AddObjects implements Command {
  readonly label: string;
  private readonly objects: BoardObject[];

  constructor(objects: readonly BoardObject[], label = '追加') {
    this.objects = objects.map(clone);
    this.label = label;
  }

  apply(board: BoardData): void {
    board.objects.push(...this.objects.map(clone));
  }

  revert(board: BoardData): void {
    const ids = new Set(this.objects.map((o) => o.id));
    board.objects = board.objects.filter((o) => !ids.has(o.id));
  }
}

/** オブジェクトを削除する (元に戻すときは元の位置に挿し直す) */
export class RemoveObjects implements Command {
  readonly label: string;
  private removed: { index: number; object: BoardObject }[] = [];

  constructor(
    private readonly ids: readonly string[],
    label = '削除',
  ) {
    this.label = label;
  }

  apply(board: BoardData): void {
    const ids = new Set(this.ids);
    this.removed = [];
    board.objects.forEach((o, index) => {
      if (ids.has(o.id)) this.removed.push({ index, object: clone(o) });
    });
    board.objects = board.objects.filter((o) => !ids.has(o.id));
  }

  revert(board: BoardData): void {
    for (const { index, object } of this.removed) {
      board.objects.splice(Math.min(index, board.objects.length), 0, clone(object));
    }
  }
}

/** オブジェクトを差し替える (移動・プロパティの変更) */
export class ReplaceObjects implements Command {
  readonly label: string;
  private readonly before: BoardObject[];
  private readonly after: BoardObject[];

  constructor(before: readonly BoardObject[], after: readonly BoardObject[], label = '変更') {
    this.before = before.map(clone);
    this.after = after.map(clone);
    this.label = label;
  }

  private put(board: BoardData, objects: readonly BoardObject[]): void {
    for (const o of objects) {
      const i = indexOfId(board, o.id);
      if (i >= 0) board.objects[i] = clone(o);
    }
  }

  apply(board: BoardData): void {
    this.put(board, this.after);
  }

  revert(board: BoardData): void {
    this.put(board, this.before);
  }

  /** 同じオブジェクト群への連続した変更を 1 つにまとめる (矢印キーでの微調整など) */
  mergeWith(next: ReplaceObjects): ReplaceObjects | null {
    const a = this.after.map((o) => o.id).join(',');
    const b = next.before.map((o) => o.id).join(',');
    if (a !== b || this.label !== next.label) return null;
    return new ReplaceObjects(this.before, next.after, this.label);
  }
}

type BoardField = 'name' | 'scale' | 'physics' | 'playfield' | 'launcher' | 'image';

/** オブジェクト以外の盤面の項目 (発射装置・遊技領域など) を変更する */
export class SetBoardField<K extends BoardField> implements Command {
  readonly label: string;
  private readonly before: BoardData[K];
  private readonly after: BoardData[K];

  constructor(
    private readonly key: K,
    before: BoardData[K],
    after: BoardData[K],
    label = '盤面設定の変更',
  ) {
    this.before = clone(before);
    this.after = clone(after);
    this.label = label;
  }

  apply(board: BoardData): void {
    board[this.key] = clone(this.after);
  }

  revert(board: BoardData): void {
    board[this.key] = clone(this.before);
  }
}

/** 盤面全体を差し替える (読込・デフォルトへのリセット)。board の同一性は保つ */
export class ReplaceBoard implements Command {
  readonly label: string;
  private readonly before: BoardData;
  private readonly after: BoardData;

  constructor(before: BoardData, after: BoardData, label = '盤面の読込') {
    this.before = clone(before);
    this.after = clone(after);
    this.label = label;
  }

  private assign(board: BoardData, src: BoardData): void {
    Object.assign(board, clone(src));
  }

  apply(board: BoardData): void {
    this.assign(board, this.after);
  }

  revert(board: BoardData): void {
    this.assign(board, this.before);
  }
}

/** 複数のコマンドを 1 つの操作として扱う */
export class CompositeCommand implements Command {
  constructor(
    private readonly commands: readonly Command[],
    readonly label: string,
  ) {}

  apply(board: BoardData): void {
    for (const c of this.commands) c.apply(board);
  }

  revert(board: BoardData): void {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i]!.revert(board);
  }
}
