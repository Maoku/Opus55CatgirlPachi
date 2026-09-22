import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM } from '@/render/Camera';

function makeCamera() {
  const c = new Camera();
  c.padding = 0;
  c.setViewport(800, 700, 2);
  c.setBoardSize(1123, 1401);
  return c;
}

describe('Camera', () => {
  it('盤面全体がアスペクト比を保ってビューに収まる', () => {
    const c = makeCamera();
    // 縦長なので高さで決まる
    expect(c.scale).toBeCloseTo(700 / 1401);
    const tl = c.boardToScreen(0, 0);
    const br = c.boardToScreen(1123, 1401);
    expect(tl.y).toBeCloseTo(0);
    expect(br.y).toBeCloseTo(700);
    // 横方向は中央寄せ
    expect((tl.x + br.x) / 2).toBeCloseTo(400);
  });

  it('boardToScreen と screenToBoard は互いに逆変換', () => {
    const c = makeCamera();
    c.zoomAt(123, 456, 3.3);
    c.panBy(-40, 25);
    const p = { x: 512.5, y: 777.25 };
    const s = c.boardToScreen(p.x, p.y);
    const b = c.screenToBoard(s.x, s.y);
    expect(b.x).toBeCloseTo(p.x);
    expect(b.y).toBeCloseTo(p.y);
  });

  it('zoomAt はカーソル位置の盤面座標を保つ', () => {
    const c = makeCamera();
    const before = c.screenToBoard(300, 200);
    c.zoomAt(300, 200, 2);
    const after = c.screenToBoard(300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('ズームは上限で止まる', () => {
    const c = makeCamera();
    for (let i = 0; i < 50; i++) c.zoomAt(400, 350, 2);
    expect(c.zoom).toBe(MAX_ZOOM);
  });

  it('デバイス px の値は DPR 倍になる', () => {
    const c = makeCamera();
    expect(c.devScale).toBeCloseTo(c.scale * 2);
    expect(c.devOffsetX).toBeCloseTo(c.offsetX * 2);
  });
});
