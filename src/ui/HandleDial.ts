import type { Launcher } from '@/game/Launcher';
import type { Camera } from '@/render/Camera';
import { h } from './dom';

/** 強度 0 → 100% でノブが回る角度 (度) */
const SWEEP = 270;
const START = -135;

/**
 * 発射ハンドル。盤面画像の右下のハンドル部に重ねて表示する。
 * 押さえているあいだ発射し、ドラッグで回すと強度が変わる。
 */
export class HandleDial {
  readonly el: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private dragging: { pointerId: number; startAngle: number; startStrength: number } | null = null;
  private lastKey = '';

  constructor(
    overlay: HTMLElement,
    private readonly launcher: Launcher,
    private readonly onChange: () => void,
  ) {
    this.knob = h('div', { className: 'dial-knob' });
    this.label = h('div', { className: 'dial-label' });
    this.el = h('div', { className: 'dial', title: '押さえて発射 / 回して強さを調整' }, [
      h('div', { className: 'dial-track' }),
      this.knob,
      this.label,
    ]);
    overlay.append(this.el);

    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.el.setPointerCapture(e.pointerId);
      this.dragging = {
        pointerId: e.pointerId,
        startAngle: this.angleOf(e),
        startStrength: this.launcher.strength,
      };
      this.launcher.holding = true;
      this.onChange();
    });
    this.el.addEventListener('pointermove', (e) => {
      const d = this.dragging;
      if (!d || d.pointerId !== e.pointerId) return;
      let delta = this.angleOf(e) - d.startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      this.launcher.setStrength(d.startStrength + delta / SWEEP);
      // 一周以上回したときに急に戻らないよう、基準を更新する
      d.startAngle = this.angleOf(e);
      d.startStrength = this.launcher.strength;
      this.onChange();
    });
    const release = (e: PointerEvent) => {
      if (this.dragging?.pointerId !== e.pointerId) return;
      this.dragging = null;
      this.launcher.holding = false;
      this.onChange();
    };
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointercancel', release);
    this.el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.launcher.setStrength(this.launcher.strength + (e.deltaY < 0 ? 0.01 : -0.01));
        this.onChange();
      },
      { passive: false },
    );
  }

  private angleOf(e: PointerEvent): number {
    const r = this.el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  /** 盤面座標の円 (cx, cy, r) に重なるよう配置する */
  place(camera: Camera, cx: number, cy: number, r: number): void {
    const p = camera.boardToScreen(cx, cy);
    const size = r * 2 * camera.scale;
    const key = `${p.x.toFixed(1)},${p.y.toFixed(1)},${size.toFixed(1)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    Object.assign(this.el.style, {
      left: `${p.x - size / 2}px`,
      top: `${p.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.max(9, size * 0.16)}px`,
    });
  }

  set visible(v: boolean) {
    this.el.style.display = v ? '' : 'none';
  }

  update(): void {
    const s = this.launcher.strength;
    this.knob.style.transform = `rotate(${START + SWEEP * s}deg)`;
    this.el.style.setProperty('--fill', `${SWEEP * s}deg`);
    this.el.classList.toggle('firing', this.launcher.active);
    this.el.classList.toggle('locked', this.launcher.locked);
    this.label.textContent = `${Math.round(s * 100)}%`;
  }
}
