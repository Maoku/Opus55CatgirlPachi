import { createDefaultBoard } from '@/board/defaultBoard';
import { parseBoardJson, serializeBoard } from '@/board/migrate';
import { downloadText, safeFileName, saveBoardLocal } from '@/board/storage';
import { BoardValidationError } from '@/board/validate';
import { h } from '@/ui/dom';
import { ReplaceBoard } from './commands';
import type { Editor } from './Editor';

/** 自動保存までの待ち時間 (ms) */
const AUTOSAVE_DELAY = 500;

/** 盤面の保存・読込 (localStorage への自動保存、JSON の書き出し・読み込み、リセット) */
export class FilePanel {
  readonly el: HTMLElement;
  private readonly status = h('div', { className: 'muted file-status' });
  private readonly message = h('div', { className: 'file-message' });
  private readonly fileInput = h('input', { type: 'file', accept: '.json,application/json' });
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly editor: Editor) {
    const exportButton = h('button', { textContent: 'JSON を書き出す' });
    const importButton = h('button', { textContent: 'JSON を読み込む' });
    const resetButton = h('button', { textContent: 'デフォルトに戻す' });
    this.fileInput.hidden = true;
    exportButton.addEventListener('click', () => this.exportJson());
    importButton.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.importFile(file);
    });
    resetButton.addEventListener('click', () => {
      if (confirm('盤面をデフォルトに戻しますか? (元に戻す で取り消せます)')) this.reset();
    });

    this.el = h('section', { className: 'panel' }, [
      h('h2', { textContent: 'ファイル' }),
      h('div', { className: 'row' }, [exportButton, importButton, resetButton]),
      this.fileInput,
      this.message,
      this.status,
      h('p', {
        className: 'help',
        textContent: '編集した盤面はブラウザに自動で保存され、再読み込みしても残ります。',
      }),
    ]);

    editor.bus.on('change', ({ preview }) => {
      if (!preview) this.scheduleSave();
    });
    this.status.textContent = '自動保存: 有効';
  }

  private scheduleSave(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), AUTOSAVE_DELAY);
  }

  /** すぐに保存する (ページを離れる前など) */
  saveNow(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const ok = saveBoardLocal(this.editor.board);
    const time = new Date().toLocaleTimeString('ja-JP');
    this.status.textContent = ok ? `自動保存しました (${time})` : '自動保存できませんでした';
  }

  get pending(): boolean {
    return this.timer !== null;
  }

  exportJson(): void {
    const board = this.editor.board;
    downloadText(`${safeFileName(board.name)}.json`, serializeBoard(board));
    this.show('JSON を書き出しました', 'ok');
  }

  async importFile(file: File): Promise<void> {
    try {
      const board = parseBoardJson(await file.text());
      this.editor.execute(new ReplaceBoard(this.editor.board, board, '盤面の読込'));
      this.editor.clearSelection();
      this.show(`「${board.name}」を読み込みました (${board.objects.length} 個)`, 'ok');
    } catch (e) {
      const msg =
        e instanceof BoardValidationError
          ? e.issues.slice(0, 5).join('\n') +
            (e.issues.length > 5 ? `\nほか ${e.issues.length - 5} 件` : '')
          : String(e);
      this.show(`読み込めませんでした:\n${msg}`, 'ng');
    }
  }

  reset(): void {
    this.editor.execute(
      new ReplaceBoard(this.editor.board, createDefaultBoard(), 'デフォルトに戻す'),
    );
    this.editor.clearSelection();
    this.show('デフォルトの盤面に戻しました', 'ok');
  }

  private show(text: string, kind: 'ok' | 'ng'): void {
    this.message.textContent = text;
    this.message.className = `file-message ${kind}`;
  }
}
