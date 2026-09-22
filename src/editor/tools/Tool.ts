import type { Vec2 } from '@/core/Vec2';
import type { CircleBatch } from '@/render/CircleBatch';
import type { LineBatch } from '@/render/LineBatch';
import type { Editor } from '../Editor';

export type ToolId = 'select' | 'nail' | 'nailLine' | 'wall' | 'vertex' | 'windmill' | 'pocket';

export interface ToolPointer {
  /** グリッドスナップ済みの盤面座標 */
  p: Vec2;
  /** スナップ前の盤面座標 */
  raw: Vec2;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  button: number;
}

export interface OverlayDrawer {
  lines: LineBatch;
  circles: CircleBatch;
  /** 盤面座標に文字ラベルを出す */
  label(text: string, x: number, y: number, className?: string): void;
}

/** エディタのツール。ポインタとキーの入力を受け、オーバーレイを描く */
export abstract class Tool {
  abstract readonly id: ToolId;
  abstract readonly label: string;
  /** 切り替えキー (表示用) */
  abstract readonly key: string;
  abstract readonly hint: string;
  cursor = 'crosshair';

  constructor(protected readonly editor: Editor) {}

  activate(): void {}
  deactivate(): void {}
  down(_e: ToolPointer): void {}
  move(_e: ToolPointer): void {}
  up(_e: ToolPointer): void {}
  dblclick(_e: ToolPointer): void {}
  /** 処理したら true */
  keydown(_e: KeyboardEvent): boolean {
    return false;
  }
  draw(_d: OverlayDrawer): void {}
  /** ツール固有の設定 UI (なければ null) */
  options(): HTMLElement | null {
    return null;
  }
}
