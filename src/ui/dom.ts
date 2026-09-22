type Props<K extends keyof HTMLElementTagNameMap> = Partial<
  Omit<HTMLElementTagNameMap[K], 'style' | 'dataset'>
> & {
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
};

type Child = Node | string | null | undefined | false;

/** 小さな DOM 生成ヘルパ */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { style, dataset, ...rest } = props;
  Object.assign(el, rest);
  if (style) Object.assign(el.style, style);
  if (dataset) Object.assign(el.dataset, dataset);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** 数値を 3 桁区切りで表示する */
export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
