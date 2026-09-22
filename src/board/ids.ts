import type { BoardData, BoardObjectType } from './types';

/** 盤面内で重複しない id を払い出す (`nail-12` のような形式) */
export class IdAllocator {
  private readonly used = new Set<string>();
  private readonly next = new Map<string, number>();

  constructor(board?: BoardData) {
    if (board) this.reset(board);
  }

  reset(board: BoardData): void {
    this.used.clear();
    this.next.clear();
    for (const o of board.objects) this.reserve(o.id);
  }

  reserve(id: string): void {
    this.used.add(id);
    const m = /^(.*)-(\d+)$/.exec(id);
    if (m) {
      const prefix = m[1]!;
      const n = Number(m[2]);
      this.next.set(prefix, Math.max(this.next.get(prefix) ?? 1, n + 1));
    }
  }

  allocate(type: BoardObjectType | string): string {
    let n = this.next.get(type) ?? 1;
    let id = `${type}-${n}`;
    while (this.used.has(id)) id = `${type}-${++n}`;
    this.next.set(type, n + 1);
    this.used.add(id);
    return id;
  }
}
