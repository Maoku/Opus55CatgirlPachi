import type { Camera } from './Camera';
import type { ProgramCache, ShaderProgram } from './gl/Shader';
import type { Texture } from './gl/Texture';

export interface FrameContext {
  gl: WebGL2RenderingContext;
  camera: Camera;
  /** 経過時間 (秒) */
  time: number;
  /** デバイス px でのビューポート寸法 */
  viewportW: number;
  viewportH: number;
  /** 盤面画像。玉への映り込みに使う */
  boardTexture: Texture | null;
  boardW: number;
  boardH: number;
}

export interface Layer {
  visible: boolean;
  /** GPU リソースを作る。コンテキストが復帰したときにも呼ばれる */
  initGL(gl: WebGL2RenderingContext, programs: ProgramCache): void;
  draw(fc: FrameContext): void;
}

export function applyCamera(p: ShaderProgram, fc: FrameContext): void {
  const c = fc.camera;
  p.set1f('u_devScale', c.devScale);
  p.set2f('u_devOffset', c.devOffsetX, c.devOffsetY);
  p.set2f('u_viewport', fc.viewportW, fc.viewportH);
  p.set1f('u_dpr', c.dpr);
}
