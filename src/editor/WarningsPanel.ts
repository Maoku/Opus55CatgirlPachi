import { analyzeBoard } from '@/board/analysis';
import { h } from '@/ui/dom';
import type { Editor } from './Editor';

const MAX_ITEMS = 50;

/** 盤面の警告 (遊技領域外・釘の重なりなど) の一覧 */
export class WarningsPanel {
  readonly el: HTMLElement;
  private readonly list = h('ul', { className: 'warnings' });
  private readonly title = h('h2');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly editor: Editor,
    /** 警告の対象を画面に映す */
    private readonly focus: (ids: string[]) => void,
  ) {
    this.el = h('section', { className: 'panel' }, [this.title, this.list]);
    editor.bus.on('change', ({ preview }) => {
      if (!preview) this.schedule();
    });
    this.refresh();
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 200);
  }

  refresh(): void {
    this.timer = null;
    const warnings = analyzeBoard(this.editor.board);
    this.title.textContent = `警告 (${warnings.length})`;
    if (warnings.length === 0) {
      this.list.replaceChildren(h('li', { className: 'ok', textContent: '問題は見つかりません' }));
      return;
    }
    this.list.replaceChildren(
      ...warnings.slice(0, MAX_ITEMS).map((w) => {
        const li = h('li', { textContent: w.message });
        if (w.ids.length > 0) {
          li.classList.add('link');
          li.addEventListener('click', () => {
            this.editor.select(w.ids);
            this.focus(w.ids);
          });
        }
        return li;
      }),
      ...(warnings.length > MAX_ITEMS
        ? [h('li', { className: 'muted', textContent: `ほか ${warnings.length - MAX_ITEMS} 件` })]
        : []),
    );
  }
}
