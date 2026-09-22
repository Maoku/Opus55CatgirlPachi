layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_inst;  // cx, cy, radius, kind
layout(location = 2) in vec4 a_color; // 乗算前の rgba

out vec2 v_local;       // 円の中心を原点、半径を 1 とした座標
out vec2 v_board;       // 盤面座標
out vec4 v_color;
out float v_kind;
out float v_radius;     // 盤面 px

void main() {
  float r = a_inst.z;
  // アンチエイリアス用に 2 デバイス px 分だけ四角形を広げる
  float pad = 1.0 + 2.0 / max(r * u_devScale, 1.0);
  vec2 local = a_corner * pad;
  vec2 board = a_inst.xy + local * r;
  v_local = local;
  v_board = board;
  v_color = a_color;
  v_kind = a_inst.w;
  v_radius = r;
  gl_Position = boardToClip(board);
}
