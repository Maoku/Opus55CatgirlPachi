/** 乗算前の RGBA (各 0..1) */
export type RGBA = readonly [number, number, number, number];

/** '#rgb' / '#rrggbb' を RGBA に変換する */
export function hex(color: string, alpha = 1): RGBA {
  let h = color.startsWith('#') ? color.slice(1) : color;
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

export function withAlpha(c: RGBA, alpha: number): RGBA {
  return [c[0], c[1], c[2], alpha];
}
