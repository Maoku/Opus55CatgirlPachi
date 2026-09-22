in float v_dist;
in float v_halfWidth;
in vec4 v_color;

out vec4 outColor;

void main() {
  float a = clamp(v_halfWidth + 0.5 - abs(v_dist), 0.0, 1.0) * v_color.a;
  if (a <= 0.0) discard;
  outColor = vec4(v_color.rgb * a, a);
}
