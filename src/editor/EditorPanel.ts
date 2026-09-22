import { h } from '@/ui/dom';
import type { Editor } from './Editor';
import type { ToolId } from './tools/Tool';

/** エディットモードのサイドパネル (ツール・表示オプション・履歴) */
export class EditorPanel {
  readonly el: HTMLElement;
  /** 後のフェーズでプロパティや警告の欄を足す場所 */
  readonly sections: HTMLDivElement = h('div');
  private readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  private readonly toolHint = h('p', { className: 'help' });
  private readonly toolOptions = h('div', { className: 'tool-options' });
  private readonly undoButton = h('button', { textContent: '↶ 元に戻す' });
  private readonly redoButton = h('button', { textContent: '↷ やり直し' });
  private readonly selectionInfo = h('div', { className: 'muted' });
  private readonly inputs: {
    showGrid: HTMLInputElement;
    snap: HTMLInputElement;
    gridSize: HTMLInputElement;
    showColliders: HTMLInputElement;
    showGaps: HTMLInputElement;
    bgOpacity: HTMLInputElement;
  };

  constructor(private readonly editor: Editor) {
    const toolbar = h('div', { className: 'toolbar' });
    for (const tool of editor.tools.values()) {
      const b = h('button', {
        className: 'tool-button',
        textContent: tool.label,
        title: `${tool.label} (${tool.key})`,
      });
      b.dataset.tool = tool.id;
      b.append(h('kbd', { textContent: tool.key }));
      b.addEventListener('click', () => editor.setTool(tool.id));
      toolbar.append(b);
      this.toolButtons.set(tool.id, b);
    }

    this.undoButton.addEventListener('click', () => editor.undo());
    this.redoButton.addEventListener('click', () => editor.redo());

    const s = editor.settings;
    const check = (checked: boolean) => h('input', { type: 'checkbox', checked });
    this.inputs = {
      showGrid: check(s.showGrid),
      snap: check(s.snap),
      gridSize: h('input', {
        type: 'number',
        min: '1',
        max: '100',
        step: '1',
        value: String(s.gridSize),
        className: 'narrow',
      }),
      showColliders: check(s.showColliders),
      showGaps: check(s.showGaps),
      bgOpacity: h('input', {
        type: 'range',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(s.bgOpacity),
      }),
    };
    const i = this.inputs;
    i.showGrid.addEventListener('change', () =>
      editor.updateSettings({ showGrid: i.showGrid.checked }),
    );
    i.snap.addEventListener('change', () => editor.updateSettings({ snap: i.snap.checked }));
    i.gridSize.addEventListener('change', () => {
      const v = Math.max(1, Math.round(Number(i.gridSize.value) || 5));
      editor.updateSettings({ gridSize: v });
    });
    i.showColliders.addEventListener('change', () =>
      editor.updateSettings({ showColliders: i.showColliders.checked }),
    );
    i.showGaps.addEventListener('change', () =>
      editor.updateSettings({ showGaps: i.showGaps.checked }),
    );
    i.bgOpacity.addEventListener('input', () =>
      editor.updateSettings({ bgOpacity: Number(i.bgOpacity.value) }),
    );

    this.el = h('div', { className: 'editor-panel' }, [
      h('section', { className: 'panel' }, [
        h('h2', { textContent: 'ツール' }),
        toolbar,
        this.toolHint,
        this.toolOptions,
      ]),
      h('section', { className: 'panel' }, [
        h('h2', { textContent: '編集' }),
        h('div', { className: 'row' }, [this.undoButton, this.redoButton]),
        this.selectionInfo,
        h('p', {
          className: 'help',
          innerHTML:
            '<kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd> 元に戻す・やり直し　<kbd>Del</kbd> 削除<br>' +
            '<kbd>Ctrl+C</kbd>/<kbd>Ctrl+V</kbd>/<kbd>Ctrl+D</kbd> コピー・貼り付け・複製<br>' +
            '<kbd>←↑→↓</kbd> 1px 移動 (<kbd>Shift</kbd> で 10px)　<kbd>G</kbd> グリッドスナップ<br>' +
            'ホイールでズーム、<kbd>Space</kbd>+ドラッグ / 中ボタンドラッグでパン、<kbd>Home</kbd> 全体表示<br>' +
            '<kbd>T</kbd> テスト発射　<kbd>E</kbd> プレイに戻る',
        }),
      ]),
      this.sections,
      h('section', { className: 'panel' }, [
        h('h2', { textContent: '表示' }),
        h('label', { className: 'check' }, [i.showColliders, '当たり判定を表示']),
        h('label', { className: 'check' }, [
          i.showGaps,
          '釘間隔を表示 (緑: 玉が通る / 赤: 通らない)',
        ]),
        h('label', { className: 'check' }, [i.showGrid, 'グリッドを表示']),
        h('label', { className: 'check' }, [
          i.snap,
          'グリッドにスナップ (G)　幅',
          i.gridSize,
          'px',
        ]),
        h('div', { className: 'field' }, [
          h('label', { textContent: '背景画像の不透明度' }),
          h('div', { className: 'row' }, [i.bgOpacity]),
        ]),
      ]),
    ]);

    editor.bus.on('tool', () => this.refreshTool());
    editor.bus.on('change', () => this.refresh());
    editor.bus.on('selection', () => this.refresh());
    editor.bus.on('settings', () => this.refreshSettings());
    this.refreshTool();
    this.refresh();
  }

  private refreshTool(): void {
    const tool = this.editor.tool;
    for (const [id, b] of this.toolButtons) b.classList.toggle('on', tool?.id === id);
    this.toolHint.textContent = tool?.hint ?? '';
    this.toolOptions.replaceChildren(...[tool?.options()].filter((e): e is HTMLElement => !!e));
  }

  private refreshSettings(): void {
    const s = this.editor.settings;
    const i = this.inputs;
    i.showGrid.checked = s.showGrid;
    i.snap.checked = s.snap;
    i.gridSize.value = String(s.gridSize);
    i.showColliders.checked = s.showColliders;
    i.showGaps.checked = s.showGaps;
    i.bgOpacity.value = String(s.bgOpacity);
  }

  refresh(): void {
    const hist = this.editor.history;
    this.undoButton.disabled = !hist.canUndo;
    this.redoButton.disabled = !hist.canRedo;
    this.undoButton.title = hist.undoLabel ? `元に戻す: ${hist.undoLabel}` : '';
    this.redoButton.title = hist.redoLabel ? `やり直し: ${hist.redoLabel}` : '';
    const n = this.editor.selection.size;
    this.selectionInfo.textContent =
      n > 0 ? `${n} 個選択中` : `オブジェクト ${this.editor.board.objects.length} 個`;
  }
}
