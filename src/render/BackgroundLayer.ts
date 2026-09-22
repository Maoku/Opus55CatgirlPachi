import { createStaticBuffer, QUAD_CORNERS, setupFloatAttribs } from './gl/Buffer';
import type { ProgramCache, ShaderProgram } from './gl/Shader';
import { Texture, type TextureSource } from './gl/Texture';
import { applyCamera, type FrameContext, type Layer } from './Layer';
import frag from './shaders/background.frag?raw';
import vert from './shaders/background.vert?raw';

/** 盤面画像 (pachi.png) を描く */
export class BackgroundLayer implements Layer {
  visible = true;
  /** 0 にすると画像を消して下地の色だけにする */
  opacity = 1;
  base: readonly [number, number, number] = [0.07, 0.03, 0.07];
  texture: Texture | null = null;

  private source: TextureSource | null = null;
  private program: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  initGL(gl: WebGL2RenderingContext, programs: ProgramCache): void {
    this.program = programs.get('background', vert, frag);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = createStaticBuffer(gl, QUAD_CORNERS);
    setupFloatAttribs(gl, corners, 8, [{ location: 0, size: 2, offset: 0 }]);
    gl.bindVertexArray(null);
    this.texture = new Texture(gl, { mipmap: true });
    if (this.source) this.texture.upload(this.source);
  }

  setImage(source: TextureSource): void {
    this.source = source;
    this.texture?.upload(source);
  }

  get width(): number {
    return this.source?.width ?? 1;
  }

  get height(): number {
    return this.source?.height ?? 1;
  }

  draw(fc: FrameContext): void {
    if (!this.program || !this.vao || !this.texture) return;
    const gl = fc.gl;
    const p = this.program.use();
    applyCamera(p, fc);
    p.set2f('u_size', this.width, this.height);
    p.set1f('u_opacity', this.visible ? this.opacity : 0);
    this.texture.bind(0);
    p.set1i('u_tex', 0);
    gl.uniform3f(p.loc('u_base'), this.base[0], this.base[1], this.base[2]);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }
}
