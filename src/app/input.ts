/** 入力欄にフォーカスがあるときはショートカットを無視する */
export function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return (
    t.isContentEditable ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (tag === 'INPUT' &&
      !['range', 'checkbox', 'button', 'radio'].includes((t as HTMLInputElement).type))
  );
}

export interface KeyHandler {
  keydown?(e: KeyboardEvent): boolean | void;
  keyup?(e: KeyboardEvent): boolean | void;
}

/**
 * キー入力を現在のモードのハンドラに振り分ける。
 * ハンドラが true を返したら既定の動作 (スクロールなど) を止める。
 */
export class KeyRouter {
  handler: KeyHandler | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (this.handler?.keydown?.(e)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      if (this.handler?.keyup?.(e)) e.preventDefault();
    });
    // フォーカスが外れたらキーを離したことにする
    target.addEventListener('blur', () => {
      this.handler?.keyup?.(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
    });
  }
}
