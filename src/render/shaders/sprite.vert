layout(location = 0) in vec2 a_corner; // -1..1

uniform vec4 u_rect;  // 中心 x, y と幅・高さ (盤面 px)
uniform float u_angle; // ラジアン
uniform vec4 u_uv;    // u0, v0, u1, v1

out vec2 v_uv;

void main() {
  vec2 local = a_corner * 0.5 * u_rect.zw;
  float c = cos(u_angle);
  float s = sin(u_angle);
  vec2 p = u_rect.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  v_uv = mix(u_uv.xy, u_uv.zw, a_corner * 0.5 + 0.5);
  gl_Position = boardToClip(p);
}
