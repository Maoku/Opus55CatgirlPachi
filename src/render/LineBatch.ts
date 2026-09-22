import type { Vec2 } from '@/core/Vec2';
import type { RGBA } from './color';
import { createStaticBuffer, DynamicBuffer, setupFloatAttribs } from './gl/Buffer';
import type { ProgramCache, ShaderProgram } from './gl/Shader';
import { applyCamera, type FrameContext, type Layer } from './Layer';
import frag from './shaders/line.frag?raw';
import vert from './shaders/line.vert?raw';

const FLOATS = 10;
/** (始点/終点, 幅方向) の 4 隅 */
const SEGMENT_CORNERS = new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]);

/** 太線をインスタンス描画でまとめて描く (壁・ガイド・選択枠) */
export class LineBatch implements Layer {
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

  /**
   * @param width 太さ。screenSpace が true ならスクリーン px、false なら盤面 px
   */
  segment(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    width: number,
    c: RGBA,
    screenSpace = true,
  ): void {
    if ((this.count + 1) * FLOATS > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const o = this.count * FLOATS;
    const d = this.data;
    d[o] = ax;
    d[o + 1] = ay;
    d[o + 2] = bx;
    d[o + 3] = by;
    d[o + 4] = width;
    d[o + 5] = screenSpace ? 1 : 0;
    d[o + 6] = c[0];
    d[o + 7] = c[1];
    d[o + 8] = c[2];
    d[o + 9] = c[3];
    this.count++;
    this.dirty = true;
  }

  polyline(points: readonly Vec2[], closed: boolean, width: number, c: RGBA, screenSpace = true) {
    const n = points.length;
    if (n < 2) return;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      this.segment(a.x, a.y, b.x, b.y, width, c, screenSpace);
    }
  }

  rect(x: number, y: number, w: number, h: number, width: number, c: RGBA, screenSpace = true) {
    this.polyline(
      [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      true,
      width,
      c,
      screenSpace,
    );
  }

  initGL(gl: WebGL2RenderingContext, programs: ProgramCache): void {
    this.program = programs.get('line', vert, frag);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = createStaticBuffer(gl, SEGMENT_CORNERS);
    setupFloatAttribs(gl, corners, 8, [{ location: 0, size: 2, offset: 0 }]);
    this.instances = new DynamicBuffer(gl);
    this.instances.upload(this.data, 0);
    setupFloatAttribs(gl, this.instances.buffer, FLOATS * 4, [
      { location: 1, size: 4, offset: 0, divisor: 1 },
      { location: 2, size: 2, offset: 16, divisor: 1 },
      { location: 3, size: 4, offset: 24, divisor: 1 },
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
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}
