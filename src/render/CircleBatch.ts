import type { RGBA } from './color';
import { createStaticBuffer, DynamicBuffer, QUAD_CORNERS, setupFloatAttribs } from './gl/Buffer';
import type { ProgramCache, ShaderProgram } from './gl/Shader';
import { applyCamera, type FrameContext, type Layer } from './Layer';
import frag from './shaders/circle.frag?raw';
import vert from './shaders/circle.vert?raw';

export const CircleKind = {
  Flat: 0,
  Ball: 1,
  Nail: 2,
  Shadow: 3,
  Ring: 4,
  Glow: 5,
} as const;
export type CircleKind = (typeof CircleKind)[keyof typeof CircleKind];

const FLOATS = 8;

/** 円をインスタンス描画でまとめて描く (玉・釘・影・選択枠・発光) */
export class CircleBatch implements Layer {
  visible = true;
  count = 0;
  private data = new Float32Array(FLOATS * 256);
  private dirty = true;
  private program: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private instances: DynamicBuffer | null = null;

  clear(): void {
    this.count = 0;
    this.dirty = true;
  }

  push(x: number, y: number, r: number, kind: CircleKind, c: RGBA): void {
    if ((this.count + 1) * FLOATS > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const o = this.count * FLOATS;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = r;
    d[o + 3] = kind;
    d[o + 4] = c[0];
    d[o + 5] = c[1];
    d[o + 6] = c[2];
    d[o + 7] = c[3];
    this.count++;
    this.dirty = true;
  }

  initGL(gl: WebGL2RenderingContext, programs: ProgramCache): void {
    this.program = programs.get('circle', vert, frag);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = createStaticBuffer(gl, QUAD_CORNERS);
    setupFloatAttribs(gl, corners, 8, [{ location: 0, size: 2, offset: 0 }]);
    this.instances = new DynamicBuffer(gl);
    this.instances.upload(this.data, 0);
    setupFloatAttribs(gl, this.instances.buffer, FLOATS * 4, [
      { location: 1, size: 4, offset: 0, divisor: 1 },
      { location: 2, size: 4, offset: 16, divisor: 1 },
    ]);
    gl.bindVertexArray(null);
    this.dirty = true;
  }

  draw(fc: FrameContext): void {
    if (!this.visible || this.count === 0 || !this.program || !this.vao || !this.instances) return;
    const gl = fc.gl;
    if (this.dirty) {
      this.instances.upload(this.data, this.count * FLOATS * 4);
      this.dirty = false;
    }
    const p = this.program.use();
    applyCamera(p, fc);
    p.set2f('u_boardSize', fc.boardW, fc.boardH);
    fc.boardTexture?.bind(0);
    p.set1i('u_bg', 0);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}
