import type { GameStateMachine, JackpotState } from '@/game/GameStateMachine';
import { isReachShowing, reelFrames } from '@/game/ReelModel';

/** キャンバスの一辺 (px)。盤面の液晶領域に引き伸ばして貼る */
export const SCREEN_SIZE = 640;

const REEL_Y = 480;
const REEL_W = 150;
const REEL_H = 170;
const REEL_X = [165, 320, 475] as const;

const SYMBOL_COLORS = [
  '#ff5fa8',
  '#ffb13d',
  '#4fd8ff',
  '#8dff5a',
  '#c08aff',
  '#ff7a5f',
  '#ffe14d',
  '#5f9dff',
  '#ff4fd8',
];

const FONT = '"Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 肉球 (図柄の背景) */
function drawPaw(ctx: CanvasRenderingContext2D, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.14, size * 0.3, size * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y] of [
    [-0.3, -0.16],
    [-0.11, -0.32],
    [0.11, -0.32],
    [0.3, -0.16],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 数字の図柄を (cx, cy) を中心に描く */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  n: number,
  cx: number,
  cy: number,
  size: number,
  glow = 0,
) {
  const color = SYMBOL_COLORS[(n - 1) % SYMBOL_COLORS.length]!;
  ctx.save();
  ctx.translate(cx, cy);
  drawPaw(ctx, size, 'rgba(255, 170, 215, 0.35)');
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 24 * glow;
  }
  ctx.font = `900 ${Math.round(size * 0.78)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.09;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(String(n), 0, size * 0.04);
  const grad = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, '#40102a');
  ctx.fillStyle = grad;
  ctx.fillText(String(n), 0, size * 0.04);
  ctx.restore();
}

function bigText(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  size: number,
  colors: [string, string] = ['#fff6b0', '#ff9a1f'],
) {
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = 'rgba(80, 0, 40, 0.9)';
  ctx.strokeText(text, SCREEN_SIZE / 2, y);
  const grad = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad;
  ctx.shadowColor = colors[1];
  ctx.shadowBlur = size * 0.3;
  ctx.fillText(text, SCREEN_SIZE / 2, y);
  ctx.restore();
}

/**
 * 液晶の表示 (図柄のリール・リーチ・大当り・ラウンド・保留) を Canvas2D で描く。
 * 見た目が変わったときだけ描き直し、呼び出し側でテクスチャを更新する。
 */
export class DisplayScreen {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private key = '';
  /** 最後に止まった図柄 (変動していないときに表示する) */
  private lastSymbols: [number, number, number] = [3, 7, 5];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCREEN_SIZE;
    this.canvas.height = SCREEN_SIZE;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** 状態を描く。描き直したら true を返す */
  render(m: GameStateMachine, time: number): boolean {
    const key = this.stateKey(m, time);
    if (key === this.key) return false;
    this.key = key;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_SIZE, SCREEN_SIZE);
    if (m.jackpot) this.drawJackpot(m.jackpot, m.spec.rounds, m.spec.roundMaxCount, time);
    else this.drawReels(m, time);
    this.drawHolds(m.holds.length, m.spec.maxHolds);
    return true;
  }

  private stateKey(m: GameStateMachine, time: number): string {
    const flash = Math.floor(time * 6) % 2;
    const s = m.spin;
    const spin = s ? `${s.index}:${s.stopped ? 'S' : Math.round(s.elapsed * 60)}` : '-';
    const j = m.jackpot;
    const jk = j ? `${j.phase}:${j.round}:${j.count}` : '-';
    return `${m.mode}:${spin}:${jk}:${m.holds.length}:${m.supportLeft}:${flash}`;
  }

  private reelBox(i: number, highlight: boolean) {
    const ctx = this.ctx;
    const x = REEL_X[i]! - REEL_W / 2;
    const y = REEL_Y - REEL_H / 2;
    roundRect(ctx, x, y, REEL_W, REEL_H, 18);
    ctx.fillStyle = highlight ? 'rgba(120, 0, 70, 0.62)' : 'rgba(30, 0, 30, 0.5)';
    ctx.fill();
    ctx.lineWidth = highlight ? 6 : 3;
    ctx.strokeStyle = highlight ? '#ff5fa8' : 'rgba(255, 180, 220, 0.8)';
    ctx.stroke();
  }

  private drawReels(m: GameStateMachine, time: number) {
    const ctx = this.ctx;
    const flash = Math.floor(time * 6) % 2 === 0;
    const s = m.spin;
    if (m.support) {
      bigText(ctx, `${m.mode === 'st' ? 'ST' : '時短'} 残り ${m.supportLeft} 回`, 352, 34, [
        '#ffffff',
        '#ff5fa8',
      ]);
    }
    if (!s) {
      for (let i = 0; i < 3; i++) {
        this.reelBox(i, false);
        drawSymbol(ctx, this.lastSymbols[i]!, REEL_X[i]!, REEL_Y, 120);
      }
      return;
    }
    const frames = reelFrames(s);
    const reach = isReachShowing(s);
    if (s.stopped) this.lastSymbols = [...s.symbols];
    for (let i = 0; i < 3; i++) {
      const f = frames[i]!;
      const winning = s.stopped && s.jackpot;
      this.reelBox(i, (reach && i === 1) || (winning && flash));
      ctx.save();
      roundRect(ctx, REEL_X[i]! - REEL_W / 2, REEL_Y - REEL_H / 2, REEL_W, REEL_H, 18);
      ctx.clip();
      if (f.stopped) {
        drawSymbol(ctx, f.symbol, REEL_X[i]!, REEL_Y, 120, winning ? 1 : 0);
      } else {
        // 回転中は上から下へ流れる
        ctx.globalAlpha = 0.85;
        drawSymbol(ctx, f.symbol, REEL_X[i]!, REEL_Y + f.offset * REEL_H, 120);
        drawSymbol(ctx, f.next, REEL_X[i]!, REEL_Y + (f.offset - 1) * REEL_H, 120);
      }
      ctx.restore();
    }
    if (reach && flash) bigText(ctx, 'リーチ!', 330, 72, ['#ffffff', '#ff3d8b']);
    if (s.stopped && s.jackpot) bigText(ctx, '大当り!!', 330, 84);
  }

  private drawJackpot(j: JackpotState, rounds: number, maxCount: number, time: number) {
    const ctx = this.ctx;
    const flash = Math.floor(time * 6) % 2 === 0;
    switch (j.phase) {
      case 'opening':
        bigText(ctx, '大当り!!', 330, 96);
        bigText(ctx, `${rounds}R BONUS`, 430, 52, ['#ffffff', '#ff5fa8']);
        if (flash) bigText(ctx, '右打ちしてね →', 520, 36, ['#ffffff', '#ff3d8b']);
        break;
      case 'round':
      case 'interval': {
        bigText(ctx, `ROUND ${j.round}`, 360, 78);
        const done = j.phase === 'interval';
        bigText(ctx, done ? '' : `${j.count} / ${maxCount}`, 450, 48, ['#ffffff', '#ff5fa8']);
        // 入賞数のバー
        const w = 400;
        const x = (SCREEN_SIZE - w) / 2;
        roundRect(ctx, x, 500, w, 22, 11);
        ctx.fillStyle = 'rgba(30, 0, 30, 0.6)';
        ctx.fill();
        roundRect(ctx, x, 500, (w * Math.min(j.count, maxCount)) / maxCount, 22, 11);
        ctx.fillStyle = '#ff5fa8';
        ctx.fill();
        break;
      }
      case 'ending':
        bigText(
          ctx,
          j.toSt ? 'ST 突入!!' : '時短 突入',
          360,
          90,
          j.toSt ? undefined : ['#ffffff', '#5fb8ff'],
        );
        bigText(ctx, j.toSt ? '1/39.9 で 100 回' : '100 回 電サポ', 460, 40, [
          '#ffffff',
          '#ff5fa8',
        ]);
        break;
    }
  }

  private drawHolds(n: number, max: number) {
    const ctx = this.ctx;
    const r = 13;
    const gap = 36;
    const x0 = SCREEN_SIZE / 2 - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      ctx.beginPath();
      ctx.arc(x0 + i * gap, 606, r, 0, Math.PI * 2);
      ctx.fillStyle = i < n ? '#ff7ac0' : 'rgba(30, 0, 30, 0.45)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
    }
  }
}
