import type { RGBA } from './color';
import { createStaticBuffer, QUAD_CORNERS, setupFloatAttribs } from './gl/Buffer';
import type { ProgramCache, ShaderProgram } from './gl/Shader';
import { Texture, type TextureSource } from './gl/Texture';
import { applyCamera, type FrameContext, type Layer } from './Layer';
import frag from './shaders/sprite.frag?raw';
import vert from './shaders/sprite.vert?raw';

/** 画像やキャンバスを貼った矩形。位置は盤面座標 (中心と幅・高さ) */
export class Sprite {
  x = 0;
  y = 0;
  w = 1;
  h = 1;
  /** ラジアン */
  angle = 0;
  alpha = 1;
  tint: RGBA = [1, 1, 1, 1];
  additive = false;
  visible = true;
  uv: [number, number, number, number] = [0, 0, 1, 1];
  texture: Texture | null = null;
  /** true のあいだは次の描画でテクスチャを転送し直す (キャンバスを描き換えたとき) */
  dirty = true;

  constructor(
    public source: TextureSource,
    readonly mipmap: boolean,
  ) {}

  markDirty(): void {
    this.dirty = true;
  }
}

/** スプライトを順に描くレイヤ (液晶の図柄・カットイン) */
export class SpriteLayer implements Layer {
  visible = true;
  readonly sprites: Sprite[] = [];
  private gl: WebGL2RenderingContext | null = null;
  private program: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  add(source: TextureSource, opts: { mipmap?: boolean } = {}): Sprite {
    const s = new Sprite(source, opts.mipmap ?? false);
    if (this.gl) s.texture = new Texture(this.gl, { mipmap: s.mipmap });
    this.sprites.push(s);
    return s;
  }

  initGL(gl: WebGL2RenderingContext, programs: ProgramCache): void {
    this.gl = gl;
    this.program = programs.get('sprite', vert, frag);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = createStaticBuffer(gl, QUAD_CORNERS);
    setupFloatAttribs(gl, corners, 8, [{ location: 0, size: 2, offset: 0 }]);
    gl.bindVertexArray(null);
    for (const s of this.sprites) {
      s.texture = new Texture(gl, { mipmap: s.mipmap });
      s.dirty = true;
    }
  }

  draw(fc: FrameContext): void {
    if (!this.visible || !this.program || !this.vao) return;
    const gl = fc.gl;
    const p = this.program.use();
    applyCamera(p, fc);
    p.set1i('u_tex', 0);
    gl.bindVertexArray(this.vao);
    for (const s of this.sprites) {
      if (!s.visible || s.alpha <= 0 || !s.texture) continue;
      if (s.dirty) {
        s.texture.upload(s.source);
        s.dirty = false;
      }
      s.texture.bind(0);
      p.set4f('u_rect', s.x, s.y, s.w, s.h);
      p.set1f('u_angle', s.angle);
      p.set4f('u_uv', s.uv[0], s.uv[1], s.uv[2], s.uv[3]);
      p.set4f('u_tint', s.tint[0], s.tint[1], s.tint[2], s.tint[3]);
      p.set1f('u_alpha', s.alpha);
      p.set1f('u_additive', s.additive ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
  }
}
