import type { BoardData, PocketKind } from '@/board/types';
import type { Vec2 } from '@/core/Vec2';
import type { GameStateMachine } from '@/game/GameStateMachine';
import { isReachShowing } from '@/game/ReelModel';
import { CircleKind, type CircleBatch } from './CircleBatch';
import { hex, type RGBA } from './color';
import type { Sprite, SpriteLayer } from './SpriteLayer';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: RGBA;
}

export const BURST_COLORS: Partial<Record<PocketKind, RGBA>> = {
  start: hex('#ffd24a'),
  electric: hex('#5fe0ff'),
  attacker: hex('#ff5f8f'),
  general: hex('#9dff6a'),
};

/** 盤面の枠 (LED のリング) に沿ったランプの位置 */
export function frameLamps(): Vec2[] {
  const pts: Vec2[] = [];
  for (let a = 150; a <= 390; a += 6) {
    const r = (a * Math.PI) / 180;
    pts.push({ x: 560 + Math.cos(r) * 522, y: 690 + Math.sin(r) * 560 });
  }
  return pts;
}

/** 0..1 の色相を RGB にする */
function hue(h: number, a: number): RGBA {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1), a];
}

const BONUS = { x: 540, y: 975 };
const LAMP_PINK = hex('#ff5fa8');
const LAMP_VIOLET = hex('#b36bff');
const LAMP_BLUE = hex('#5fb8ff');
const GOLD = hex('#ffcf4a');

/**
 * 演出エフェクト (加算合成)。入賞時のパーティクル、大当り時のフラッシュ、
 * 枠ランプ風の発光、アタッカー・電チュー・BONUS ロゴの発光。時刻はシミュレーション時間。
 */
export class Effects {
  enabled = true;
  maxParticles = 700;
  private readonly particles: Particle[] = [];
  private readonly pool: Particle[] = [];
  private readonly lamps = frameLamps();
  private readonly flashSprite: Sprite;
  /** 入賞口ごとの最後の入賞時刻 (入賞口を光らせる) */
  private readonly pulses = new Map<string, number>();
  private last = 0;
  private flashAt = -Infinity;
  private flashPower = 0;

  constructor(
    private readonly batch: CircleBatch,
    sprites: SpriteLayer,
    boardW: number,
    boardH: number,
  ) {
    const white = document.createElement('canvas');
    white.width = white.height = 1;
    const ctx = white.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1, 1);
    this.flashSprite = sprites.add(white);
    const f = this.flashSprite;
    f.additive = true;
    f.visible = false;
    f.x = boardW / 2;
    f.y = boardH / 2;
    f.w = boardW;
    f.h = boardH;
    f.tint = [1, 0.85, 0.95, 1];
  }

  get particleCount(): number {
    return this.particles.length;
  }

  /** (x, y) から粒を飛び散らせる */
  burst(x: number, y: number, color: RGBA, count: number, speed = 160): void {
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      const p = this.pool.pop() ?? ({} as Particle);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - speed * 0.4;
      p.maxLife = p.life = 0.5 + Math.random() * 0.6;
      p.size = 4 + Math.random() * 6;
      p.color = color;
      this.particles.push(p);
    }
  }

  flash(time: number, power = 0.6): void {
    this.flashAt = time;
    this.flashPower = power;
  }

  pulse(objectId: string, time: number): void {
    this.pulses.set(objectId, time);
  }

  clear(): void {
    this.pool.push(...this.particles);
    this.particles.length = 0;
    this.pulses.clear();
    this.flashAt = -Infinity;
  }

  update(time: number, m: GameStateMachine, board: BoardData): void {
    // リセットで時刻が戻ったら残っている粒を消す
    if (time < this.last) this.clear();
    const dt = Math.min(Math.max(time - this.last, 0), 0.1);
    this.last = time;
    const b = this.batch;
    b.clear();
    this.flashSprite.visible = false;
    if (!this.enabled) return;

    this.drawLamps(time, m);
    this.drawObjects(time, m, board);

    // 粒の移動 (重力と空気抵抗)
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1]!;
        ps.pop();
        this.pool.push(p);
        continue;
      }
      p.vy += 420 * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.maxLife;
      b.push(p.x, p.y, p.size * (0.5 + k * 0.5), CircleKind.Glow, [
        p.color[0],
        p.color[1],
        p.color[2],
        k,
      ]);
    }

    const ft = time - this.flashAt;
    if (ft >= 0 && ft < 0.6) {
      this.flashSprite.visible = true;
      this.flashSprite.alpha = this.flashPower * (1 - ft / 0.6) ** 2;
    }
  }

  /** 枠ランプ: 状態によって光り方を変える */
  private drawLamps(time: number, m: GameStateMachine): void {
    const n = this.lamps.length;
    const reach = m.spin !== null && !m.spin.stopped && isReachShowing(m.spin);
    this.lamps.forEach((p, i) => {
      let color: RGBA;
      let a: number;
      if (m.mode === 'jackpot') {
        color = hue((i / n + time * 0.6) % 1, 1);
        a = 0.75 + 0.25 * Math.sin(time * 12 + i);
      } else if (reach) {
        // 光が走る
        const head = (time * 30) % n;
        const d = Math.min(Math.abs(i - head), n - Math.abs(i - head));
        color = LAMP_PINK;
        a = 0.2 + 0.8 * Math.max(0, 1 - d / 6);
      } else if (m.support) {
        color = i % 2 === Math.floor(time * 4) % 2 ? LAMP_BLUE : LAMP_PINK;
        a = 0.55;
      } else {
        color = i % 3 === 0 ? LAMP_VIOLET : LAMP_PINK;
        a = 0.22 + 0.14 * Math.sin(time * 1.8 + i * 0.35);
      }
      this.batch.push(p.x, p.y, 38, CircleKind.Glow, [color[0], color[1], color[2], a]);
    });
  }

  /** 開いている役物・入賞した入賞口・大当り中の BONUS ロゴを光らせる */
  private drawObjects(time: number, m: GameStateMachine, board: BoardData): void {
    const b = this.batch;
    for (const o of board.objects) {
      if (o.type !== 'pocket') continue;
      const color = BURST_COLORS[o.kind];
      if (!color) continue;
      const open =
        (o.kind === 'attacker' && m.lids.attacker) || (o.kind === 'electric' && m.lids.electric);
      const hit = time - (this.pulses.get(o.id) ?? -Infinity);
      let a = open ? 0.75 + 0.25 * Math.sin(time * 14) : 0;
      if (hit >= 0 && hit < 0.4) a = Math.max(a, 1 - hit / 0.4);
      if (a > 0) {
        const r = Math.max(o.rect.w, o.rect.h) * 1.1 + 24;
        b.push(o.rect.x, o.rect.y, r, CircleKind.Glow, [color[0], color[1], color[2], a]);
      }
    }
    if (m.mode === 'jackpot') {
      const a = 0.45 + 0.35 * Math.sin(time * 6);
      b.push(BONUS.x, BONUS.y, 190, CircleKind.Glow, [GOLD[0], GOLD[1], GOLD[2], a]);
      b.push(BONUS.x - 90, BONUS.y + 5, 70, CircleKind.Glow, [1, 0.6, 0.8, a * 0.5]);
      b.push(BONUS.x + 90, BONUS.y + 5, 70, CircleKind.Glow, [1, 0.6, 0.8, a * 0.5]);
    }
  }
}
