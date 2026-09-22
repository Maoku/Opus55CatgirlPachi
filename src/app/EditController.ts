import type { Editor } from '@/editor/Editor';
import type { ToolId, ToolPointer } from '@/editor/tools/Tool';
import type { Camera } from '@/render/Camera';
import type { KeyHandler } from './input';

const TOOL_KEYS: Record<string, ToolId> = {
  KeyV: 'select',
  KeyN: 'nail',
  KeyL: 'nailLine',
  KeyW: 'wall',
  KeyA: 'vertex',
  KeyM: 'windmill',
  KeyP: 'pocket',
};

export interface EditActions {
  toggleTestFire(): void;
  copy(): void;
  paste(): void;
  duplicate(): void;
}

/** エディットモードの入力 (ポインタ → ツール、ズーム・パン、ショートカット) */
export class EditController implements KeyHandler {
  enabled = false;
  private spaceHeld = false;
  private pan: { pointerId: number; x: number; y: number } | null = null;
  private toolPointer: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly editor: Editor,
    private readonly actions: EditActions,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('dblclick', (e) => {
      if (this.enabled) this.editor.tool?.dblclick(this.pointer(e));
    });
    canvas.addEventListener('pointerleave', () => {
      if (this.enabled) this.editor.setHover(null);
    });
    canvas.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const factor = Math.pow(1.0015, -e.deltaY);
        camera.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
        this.editor.viewScale = camera.scale;
        this.editor.requestOverlay();
      },
      { passive: false },
    );
  }

  private pointer(e: MouseEvent): ToolPointer {
    const r = this.canvas.getBoundingClientRect();
    const raw = this.camera.screenToBoard(e.clientX - r.left, e.clientY - r.top);
    return {
      raw,
      p: this.editor.snap(raw),
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
      button: e.button,
    };
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    this.canvas.focus();
    if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
      e.preventDefault();
      this.pan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    this.toolPointer = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.editor.tool?.down(this.pointer(e));
  }

  private onMove(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.pan && this.pan.pointerId === e.pointerId) {
      this.camera.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan.x = e.clientX;
      this.pan.y = e.clientY;
      this.editor.requestOverlay();
      return;
    }
    this.editor.tool?.move(this.pointer(e));
  }

  private onUp(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.pan && this.pan.pointerId === e.pointerId) {
      this.pan = null;
      this.updateCursor();
      return;
    }
    if (this.toolPointer === e.pointerId) {
      this.toolPointer = null;
      this.editor.tool?.up(this.pointer(e));
    }
  }

  updateCursor(): void {
    this.canvas.style.cursor = !this.enabled
      ? ''
      : this.spaceHeld
        ? 'grab'
        : (this.editor.tool?.cursor ?? 'default');
  }

  keydown(e: KeyboardEvent): boolean {
    const ed = this.editor;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') {
      this.spaceHeld = true;
      this.updateCursor();
      return true;
    }
    if (ed.tool?.keydown(e)) return true;
    if (ctrl) {
      switch (e.code) {
        case 'KeyZ':
          if (e.shiftKey) ed.redo();
          else ed.undo();
          return true;
        case 'KeyY':
          ed.redo();
          return true;
        case 'KeyA':
          ed.selectAll();
          return true;
        case 'KeyC':
          this.actions.copy();
          return true;
        case 'KeyV':
          this.actions.paste();
          return true;
        case 'KeyD':
          this.actions.duplicate();
          return true;
        default:
          return false;
      }
    }
    if (e.altKey) return false;
    const step = e.shiftKey ? 10 : 1;
    switch (e.code) {
      case 'ArrowLeft':
        ed.nudge(-step, 0);
        return true;
      case 'ArrowRight':
        ed.nudge(step, 0);
        return true;
      case 'ArrowUp':
        ed.nudge(0, -step);
        return true;
      case 'ArrowDown':
        ed.nudge(0, step);
        return true;
      case 'Delete':
      case 'Backspace':
        ed.deleteSelected();
        return true;
      case 'Escape':
        ed.clearSelection();
        return true;
      case 'KeyG':
        ed.updateSettings({ snap: !ed.settings.snap });
        return true;
      case 'Home':
      case 'Digit0':
        this.camera.fit();
        ed.viewScale = this.camera.scale;
        ed.requestOverlay();
        return true;
      case 'KeyT':
        if (!e.repeat) this.actions.toggleTestFire();
        return true;
    }
    const tool = TOOL_KEYS[e.code];
    if (tool && ed.tools.has(tool)) {
      ed.setTool(tool);
      this.updateCursor();
      return true;
    }
    return false;
  }

  keyup(e: KeyboardEvent): boolean {
    if (e.code === 'Space') {
      this.spaceHeld = false;
      this.updateCursor();
      return true;
    }
    return false;
  }
}
