layout(location = 0) in vec2 a_corner;  // x: 0 → 始点, 1 → 終点 / y: -1..1 (幅方向)
layout(location = 1) in vec4 a_seg;     // ax, ay, bx, by (盤面座標)
layout(location = 2) in vec2 a_style;   // 幅, 1 ならスクリーン px 指定 (0 なら盤面 px)
layout(location = 3) in vec4 a_color;

out float v_dist;
out float v_halfWidth;
out vec4 v_color;

void main() {
  vec2 a = boardToDevice(a_seg.xy);
  vec2 b = boardToDevice(a_seg.zw);
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = a_style.y > 0.5 ? a_style.x * u_dpr : a_style.x * u_devScale;
  w = max(w, 1.0);
  float hw = w * 0.5 + 1.0; // アンチエイリアス用の余白
  // 端点を半幅だけ延ばして、折れ線の継ぎ目に隙間が出ないようにする
  vec2 p = mix(a, b, a_corner.x) + dir * (a_corner.x * 2.0 - 1.0) * w * 0.5 + nrm * a_corner.y * hw;
  v_dist = a_corner.y * hw;
  v_halfWidth = w * 0.5;
  v_color = a_color;
  gl_Position = deviceToClip(p);
}
