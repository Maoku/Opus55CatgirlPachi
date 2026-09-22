export interface TextureOptions {
  mipmap?: boolean;
  /** 既定は CLAMP_TO_EDGE */
  repeat?: boolean;
  /** 既定は true (乗算済みアルファで扱う) */
  premultiply?: boolean;
}

export type TextureSource = TexImageSource & { width: number; height: number };

export class Texture {
  readonly texture: WebGLTexture;
  width = 0;
  height = 0;

  constructor(
    readonly gl: WebGL2RenderingContext,
    private readonly options: TextureOptions = {},
  ) {
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const wrap = options.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      options.mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 読込前でも描画できるよう 1x1 の透明テクスチャを入れておく
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
  }

  /** 画像やキャンバスの内容を転送する (キャンバスの更新にも使う) */
  upload(source: TextureSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.options.premultiply ?? true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (this.options.mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    this.width = source.width;
    this.height = source.height;
  }

  bind(unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めません: ${url}`));
    img.src = url;
  });
}
