import type { Game } from '@/game/Game';
import type { Camera } from '@/render/Camera';
import type { KeyHandler } from './input';

/** プレイモードの入力 (発射・強度・デバッグ用の玉落とし) */
export class PlayController implements KeyHandler {
  enabled = true;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly getGame: () => Game,
    private readonly onChange: () => void,
  ) {
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        const l = this.getGame().launcher;
        l.setStrength(l.strength + (e.deltaY < 0 ? 0.01 : -0.01));
        this.onChange();
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || !e.shiftKey || e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const p = this.camera.screenToBoard(e.clientX - r.left, e.clientY - r.top);
      this.getGame().dropBall(p.x, p.y);
    });
  }

  keydown(e: KeyboardEvent): boolean {
    const launcher = this.getGame().launcher;
    switch (e.code) {
      case 'Space':
        launcher.holding = true;
        break;
      case 'KeyF':
        if (!e.repeat) launcher.locked = !launcher.locked;
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = (e.shiftKey ? 0.05 : 0.01) * (e.code === 'ArrowUp' ? 1 : -1);
        launcher.setStrength(launcher.strength + step);
        break;
      }
      default:
        return false;
    }
    this.onChange();
    return true;
  }

  keyup(e: KeyboardEvent): boolean {
    if (e.code !== 'Space') return false;
    this.getGame().launcher.holding = false;
    this.onChange();
    return true;
  }

  /** モードを離れるときに押しっぱなしの状態を解除する */
  release(): void {
    this.getGame().launcher.holding = false;
  }
}
