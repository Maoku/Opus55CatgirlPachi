import {
  DEFAULT_LAUNCHER,
  DEFAULT_PHYSICS,
  SCHEMA_VERSION,
  type BoardData,
  type BoardObject,
  type Vec2,
} from './types';

/** 楕円で近似した遊技領域 */
function ellipse(cx: number, cy: number, rx: number, ry: number, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) });
  }
  return pts;
}

/**
 * 動作確認用の仮の盤面 (外枠と数十本の釘)。
 * 画像に合わせたデフォルト盤面は src/assets/boards/default.json に置く。
 */
export function createSampleBoard(): BoardData {
  const frame = ellipse(562, 690, 466, 460, 64);
  const objects: BoardObject[] = [
    { id: 'wall-1', type: 'wall', points: frame, closed: true, material: 'rail' },
  ];
  let n = 1;
  for (let row = 0; row < 6; row++) {
    const y = 300 + row * 34;
    const offset = row % 2 === 0 ? 0 : 17;
    for (let x = 250 + offset; x <= 880; x += 34) {
      objects.push({ id: `nail-${n++}`, type: 'nail', x, y, r: 1.95 });
    }
  }
  objects.push({
    id: 'pocket-1',
    type: 'pocket',
    kind: 'out',
    rect: { x: 562, y: 1125, w: 260, h: 40, angle: 0 },
    payout: 0,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    name: '仮の盤面',
    image: { src: 'pachi.png', width: 1123, height: 1401 },
    scale: { pxPerCm: 21.6 },
    physics: structuredClone(DEFAULT_PHYSICS),
    playfield: ellipse(562, 690, 470, 464, 64),
    launcher: { ...DEFAULT_LAUNCHER },
    objects,
  };
}
