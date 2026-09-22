/** 必要に応じて容量を伸ばしながら中身を差し替える GPU バッファ */
export class DynamicBuffer {
  readonly buffer: WebGLBuffer;
  private capacity = 0;

  constructor(
    readonly gl: WebGL2RenderingContext,
    readonly target: number = gl.ARRAY_BUFFER,
    readonly usage: number = gl.DYNAMIC_DRAW,
  ) {
    this.buffer = gl.createBuffer();
  }

  bind(): void {
    this.gl.bindBuffer(this.target, this.buffer);
  }

  /** data の先頭 byteLength バイトを転送する */
  upload(data: ArrayBufferView<ArrayBuffer>, byteLength = data.byteLength): void {
    const gl = this.gl;
    gl.bindBuffer(this.target, this.buffer);
    if (byteLength > this.capacity) {
      // 伸ばすときは多めに確保して再確保の回数を減らす
      this.capacity = Math.max(byteLength, Math.ceil(this.capacity * 1.5), 256);
      gl.bufferData(this.target, this.capacity, this.usage);
    }
    if (byteLength > 0) {
      gl.bufferSubData(this.target, 0, new Uint8Array(data.buffer, data.byteOffset, byteLength));
    }
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
  }
}

/** 変更しない頂点データ用のバッファ */
export function createStaticBuffer(
  gl: WebGL2RenderingContext,
  data: ArrayBufferView<ArrayBuffer>,
  target: number = gl.ARRAY_BUFFER,
): WebGLBuffer {
  const buf = gl.createBuffer();
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buf;
}

export interface AttribSpec {
  location: number;
  size: number;
  /** バイト単位のオフセット */
  offset: number;
  divisor?: number;
}

/** interleave された float 配列の属性を、バインド中の VAO に登録する */
export function setupFloatAttribs(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  strideBytes: number,
  attribs: AttribSpec[],
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const a of attribs) {
    gl.enableVertexAttribArray(a.location);
    gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, strideBytes, a.offset);
    gl.vertexAttribDivisor(a.location, a.divisor ?? 0);
  }
}

/** 四角形の 4 隅 (-1..1)。TRIANGLE_STRIP で描く */
export const QUAD_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
