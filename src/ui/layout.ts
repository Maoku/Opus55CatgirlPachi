import { h } from './dom';

export interface Layout {
  root: HTMLElement;
  /** キャンバスを置く領域 */
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  /** キャンバスに重ねる DOM (寸法ラベル・ハンドル UI など) */
  overlay: HTMLElement;
  /** 右側 (狭い画面では下側) のパネル */
  side: HTMLElement;
}

export function createLayout(root: HTMLElement): Layout {
  const canvas = h('canvas', { id: 'view', tabIndex: 0 });
  const overlay = h('div', { className: 'overlay' });
  const stage = h('main', { className: 'stage' }, [canvas, overlay]);
  const side = h('aside', { className: 'side' });
  const layout = h('div', { className: 'layout' }, [stage, side]);
  root.replaceChildren(layout);
  return { root, stage, canvas, overlay, side };
}
