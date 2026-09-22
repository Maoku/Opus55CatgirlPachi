import './style.css';
import { App } from '@/app/App';
import { PhysicsInitError } from '@/physics/rapier';
import { WebGLUnavailableError } from '@/render/gl/context';
import { showFatalError } from '@/ui/errorScreen';

declare global {
  interface Window {
    /** E2E テストとデバッグ用の入口 */
    __pachi?: App;
  }
}

async function main() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;
  try {
    const app = new App(root);
    window.__pachi = app;
    await app.start();
  } catch (e) {
    console.error(e);
    if (e instanceof WebGLUnavailableError) {
      showFatalError(root, 'WebGL2 を利用できません', e.message);
    } else if (e instanceof PhysicsInitError) {
      showFatalError(root, '物理エンジンを起動できません', e.message);
    } else {
      showFatalError(root, '起動に失敗しました', e instanceof Error ? e.message : String(e));
    }
  }
}

void main();
