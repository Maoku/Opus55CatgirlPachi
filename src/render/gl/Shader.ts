/** すべてのシェーダの先頭に付ける共通ヘッダ。盤面座標 → クリップ座標の変換を含む */
const HEADER = `#version 300 es
precision highp float;
precision highp int;
uniform float u_devScale;  // 盤面 px → デバイス px の倍率
uniform vec2 u_devOffset;  // デバイス px でのオフセット
uniform vec2 u_viewport;   // デバイス px でのビューポート寸法
uniform float u_dpr;
vec2 boardToDevice(vec2 p) { return p * u_devScale + u_devOffset; }
vec4 deviceToClip(vec2 d) { return vec4(d.x / u_viewport.x * 2.0 - 1.0, 1.0 - d.y / u_viewport.y * 2.0, 0.0, 1.0); }
vec4 boardToClip(vec2 p) { return deviceToClip(boardToDevice(p)); }
`;

const HEADER_LINES = HEADER.split('\n').length - 1;

export class ShaderCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShaderCompileError';
  }
}

/** エラー行の前後を行番号付きで抜き出す */
function formatSource(source: string, log: string): string {
  const errorLines = new Set<number>();
  for (const m of log.matchAll(/ERROR: \d+:(\d+)/g)) errorLines.add(Number(m[1]));
  return source
    .split('\n')
    .map((line, i) => {
      const n = i + 1;
      const mark = errorLines.has(n) ? '>>' : '  ';
      return { n, text: `${mark}${String(n - HEADER_LINES).padStart(4)}| ${line}` };
    })
    .filter(({ n }) => errorLines.size === 0 || [...errorLines].some((e) => Math.abs(e - n) <= 3))
    .map(({ text }) => text)
    .join('\n');
}

function compile(gl: WebGL2RenderingContext, type: number, source: string, name: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new ShaderCompileError(`${name}: シェーダを作成できません`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new ShaderCompileError(
      `${name} (${kind}) のコンパイルに失敗:\n${log}\n${formatSource(source, log)}`,
    );
  }
  return shader;
}

export class ShaderProgram {
  readonly program: WebGLProgram;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(
    readonly gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    readonly name = 'shader',
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, HEADER + vertexSource, name);
    const fs = compile(gl, gl.FRAGMENT_SHADER, HEADER + fragmentSource, name);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      throw new ShaderCompileError(`${name} のリンクに失敗:\n${log}`);
    }
    this.program = program;
  }

  use(): this {
    this.gl.useProgram(this.program);
    return this;
  }

  loc(name: string): WebGLUniformLocation | null {
    let l = this.locations.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.locations.set(name, l);
    }
    return l;
  }

  set1f(name: string, v: number): void {
    this.gl.uniform1f(this.loc(name), v);
  }
  set2f(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.loc(name), x, y);
  }
  set4f(name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.loc(name), x, y, z, w);
  }
  set1i(name: string, v: number): void {
    this.gl.uniform1i(this.loc(name), v);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

/** 同じシェーダを複数のレイヤで共有するためのキャッシュ (コンテキストごとに作り直す) */
export class ProgramCache {
  private readonly programs = new Map<string, ShaderProgram>();
  constructor(readonly gl: WebGL2RenderingContext) {}

  get(name: string, vertexSource: string, fragmentSource: string): ShaderProgram {
    let p = this.programs.get(name);
    if (!p) {
      p = new ShaderProgram(this.gl, vertexSource, fragmentSource, name);
      this.programs.set(name, p);
    }
    return p;
  }

  dispose(): void {
    for (const p of this.programs.values()) p.dispose();
    this.programs.clear();
  }
}
