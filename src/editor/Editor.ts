import { IdAllocator } from '@/board/ids';
import type { BoardData, BoardObject } from '@/board/types';
import { EventBus } from '@/core/EventBus';
import type { Vec2 } from '@/core/Vec2';
import { ReplaceObjects, RemoveObjects, type Command } from './commands';
import { History } from './History';
import { moveObject } from './objectOps';
import type { Tool, ToolId } from './tools/Tool';

export interface EditorSettings {
  /** グリッドスナップ */
  snap: boolean;
  gridSize: number;
  showGrid: boolean;
  /** 当たり判定を表示する */
  showColliders: boolean;
  /** 釘間隔を表示する */
  showGaps: boolean;
  /** 背景画像の不透明度 */
  bgOpacity: number;
}

export interface EditorEvents {
  /** 盤面が変わった。preview はドラッグ中などの仮の変更 */
  change: { preview: boolean };
  selection: undefined;
  tool: undefined;
  settings: undefined;
  /** オーバーレイ (選択枠・ツールのガイド) を描き直す */
  overlay: undefined;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  snap: false,
  gridSize: 5,
  showGrid: false,
  showColliders: true,
  showGaps: false,
  bgOpacity: 1,
};

/**
 * 盤面エディタの状態。盤面の変更はすべて Command を通して行い、Undo/Redo できるようにする。
 * board は App と共有する (同一性を保つ)。
 */
export class Editor {
  readonly bus = new EventBus<EditorEvents>();
  readonly history = new History();
  readonly ids: IdAllocator;
  readonly selection = new Set<string>();
  readonly tools = new Map<ToolId, Tool>();
  settings: EditorSettings = { ...DEFAULT_EDITOR_SETTINGS };
  tool: Tool | null = null;
  hoverId: string | null = null;
  /** 盤面 px → スクリーン px の倍率 (カメラに合わせて App が更新する) */
  viewScale = 1;
  clipboard: BoardObject[] = [];

  constructor(readonly board: BoardData) {
    this.ids = new IdAllocator(board);
  }

  // ---- ツール ----

  registerTool(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  setTool(id: ToolId): void {
    const next = this.tools.get(id);
    if (!next || next === this.tool) return;
    this.tool?.deactivate();
    this.tool = next;
    next.activate();
    this.bus.emit('tool', undefined);
    this.requestOverlay();
  }

  // ---- 参照 ----

  get(id: string): BoardObject | undefined {
    return this.board.objects.find((o) => o.id === id);
  }

  selectedObjects(): BoardObject[] {
    return this.board.objects.filter((o) => this.selection.has(o.id));
  }

  /** スクリーン上の px を盤面 px に換算した許容距離 */
  tolerance(screenPx = 6): number {
    return screenPx / Math.max(this.viewScale, 1e-6);
  }

  snap(p: Vec2): Vec2 {
    if (!this.settings.snap) return p;
    const g = this.settings.gridSize;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  // ---- 変更 ----

  execute(cmd: Command, mergeable = false): void {
    this.history.execute(cmd, this.board, mergeable);
    this.afterChange();
  }

  /** プレビューで既に反映した変更を履歴に積む */
  commitPreview(cmd: Command): void {
    this.history.push(cmd);
    this.afterChange();
  }

  /** 履歴に積まずにオブジェクトを差し替える (ドラッグ中の表示用) */
  previewReplace(objects: readonly BoardObject[]): void {
    for (const o of objects) {
      const i = this.board.objects.findIndex((b) => b.id === o.id);
      if (i >= 0) this.board.objects[i] = o;
    }
    this.bus.emit('change', { preview: true });
    this.requestOverlay();
  }

  undo(): void {
    if (this.history.undo(this.board)) this.afterChange();
  }

  redo(): void {
    if (this.history.redo(this.board)) this.afterChange();
  }

  /** 盤面を外から差し替えた (読込など) あとの後始末 */
  resetState(): void {
    this.ids.reset(this.board);
    this.history.clear();
    this.selection.clear();
    this.afterChange();
  }

  private afterChange(): void {
    this.ids.reset(this.board);
    // 消えたオブジェクトを選択から外す
    let pruned = false;
    for (const id of [...this.selection]) {
      if (!this.get(id)) {
        this.selection.delete(id);
        pruned = true;
      }
    }
    this.bus.emit('change', { preview: false });
    if (pruned) this.bus.emit('selection', undefined);
    this.requestOverlay();
  }

  requestOverlay(): void {
    this.bus.emit('overlay', undefined);
  }

  // ---- 選択 ----

  select(ids: readonly string[], mode: 'replace' | 'add' | 'toggle' = 'replace'): void {
    if (mode === 'replace') this.selection.clear();
    for (const id of ids) {
      if (mode === 'toggle' && this.selection.has(id)) this.selection.delete(id);
      else this.selection.add(id);
    }
    this.bus.emit('selection', undefined);
    this.requestOverlay();
  }

  clearSelection(): void {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.bus.emit('selection', undefined);
    this.requestOverlay();
  }

  selectAll(): void {
    this.select(this.board.objects.map((o) => o.id));
  }

  setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.requestOverlay();
  }

  // ---- よく使う操作 ----

  deleteSelected(): void {
    if (this.selection.size === 0) return;
    this.execute(new RemoveObjects([...this.selection], '削除'));
  }

  /** 選択中のオブジェクトを dx, dy だけ動かす (連続した操作は 1 回の Undo で戻る) */
  nudge(dx: number, dy: number): void {
    const before = this.selectedObjects();
    if (before.length === 0) return;
    const after = before.map((o) => moveObject(o, dx, dy));
    this.execute(new ReplaceObjects(before, after, '微調整'), true);
  }

  updateSettings(patch: Partial<EditorSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.bus.emit('settings', undefined);
    this.requestOverlay();
  }
}
