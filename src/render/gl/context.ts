export class WebGLUnavailableError extends Error {
  constructor(message = 'このブラウザでは WebGL2 を利用できません。') {
    super(message);
    this.name = 'WebGLUnavailableError';
  }
}

/** WebGL2 コンテキストを作る。取得できなければ WebGLUnavailableError を投げる */
export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new WebGLUnavailableError();
  return gl;
}
