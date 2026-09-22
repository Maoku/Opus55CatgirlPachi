in vec2 v_local;
in vec2 v_board;
in vec4 v_color;
in float v_kind;
in float v_radius;

uniform sampler2D u_bg;   // 盤面画像 (玉への映り込みに使う)
uniform vec2 u_boardSize;

out vec4 outColor;

// kind: 0 = 塗り, 1 = 玉, 2 = 釘の頭, 3 = 影, 4 = 輪郭, 5 = 発光 (加算)
void main() {
  float d = length(v_local);
  float aa = max(fwidth(d), 1e-4);
  int kind = int(v_kind + 0.5);

  if (kind == 3) {
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    outColor = vec4(0.0, 0.0, 0.0, a * a * v_color.a);
    return;
  }
  if (kind == 5) {
    float g = 1.0 - smoothstep(0.0, 1.0, d);
    g = g * g;
    // 乗算済みアルファで alpha = 0 にすると加算合成になる
    outColor = vec4(v_color.rgb * v_color.a * g, 0.0);
    return;
  }

  float mask = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  if (kind == 4) {
    float inner = 1.0 - 3.0 * aa;
    mask *= smoothstep(inner - aa, inner + aa, d);
  }
  if (mask <= 0.0) discard;

  vec3 col = v_color.rgb;
  if (kind == 1) {
    // 金属球: 球面の法線で背景をずらしてサンプリングし、映り込みと鏡面ハイライトを加える
    float z = sqrt(max(0.0, 1.0 - d * d));
    vec3 n = vec3(v_local, z);
    vec2 uv = (v_board + n.xy * v_radius * 3.0) / u_boardSize;
    vec3 env = texture(u_bg, clamp(uv, 0.0, 1.0)).rgb;
    vec3 L = normalize(vec3(-0.45, -0.65, 0.75));
    float diff = max(dot(n, L), 0.0);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 70.0);
    float fres = pow(1.0 - z, 2.0);
    // 銀色の地に、周囲の色を控えめに映り込ませる
    float envLum = dot(env, vec3(0.299, 0.587, 0.114));
    vec3 tint = mix(vec3(envLum), env, 0.45);
    vec3 base = v_color.rgb * (0.42 + 0.58 * diff);
    col = base * mix(vec3(1.0), tint * 1.4 + 0.2, 0.4) + tint * fres * 0.5 + vec3(spec * 1.4);
    // 下側は暗く (盤面の影)、縁は締める
    col *= mix(1.0, 0.7, smoothstep(0.0, 1.0, n.y));
    col *= mix(1.0, 0.35, smoothstep(0.82, 1.0, d));
  } else if (kind == 2) {
    // 釘の頭: 平たい金属の円盤。左上から光が当たる
    vec2 hl = v_local - vec2(-0.35, -0.35);
    float h = 1.0 - smoothstep(0.0, 0.8, length(hl));
    float rim = smoothstep(0.6, 1.0, d);
    col = v_color.rgb * (0.65 + 0.35 * (1.0 - rim)) + vec3(h * 0.6);
    col *= mix(1.0, 0.5, rim);
  }
  outColor = vec4(col * v_color.a, v_color.a) * mask;
}
