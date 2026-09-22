import { h } from './dom';

/** 起動できないときのエラー画面 */
export function showFatalError(root: HTMLElement, title: string, detail: string): void {
  root.replaceChildren(
    h('div', { className: 'fatal' }, [
      h('h1', { textContent: title }),
      h('p', { textContent: detail }),
      h('p', {
        className: 'muted',
        textContent:
          '最新の Chrome / Edge / Firefox で開いてください。ハードウェアアクセラレーションが無効になっている場合は有効にしてください。',
      }),
    ]),
  );
}
