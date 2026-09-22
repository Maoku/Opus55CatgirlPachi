in vec2 v_uv;

uniform sampler2D u_tex;
uniform vec4 u_tint;      // 乗算前の色
uniform float u_alpha;
uniform float u_additive; // 1 なら加算合成

out vec4 outColor;

void main() {
  // テクスチャは乗算済みアルファ
  vec4 c = texture(u_tex, v_uv);
  c.rgb *= u_tint.rgb;
  c *= u_tint.a * u_alpha;
  if (u_additive > 0.5) c.a = 0.0;
  outColor = c;
}
