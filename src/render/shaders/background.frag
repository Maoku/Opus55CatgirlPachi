in vec2 v_uv;

uniform sampler2D u_tex;
uniform float u_opacity;
uniform vec3 u_base;

out vec4 outColor;

void main() {
  vec3 tex = texture(u_tex, v_uv).rgb;
  outColor = vec4(mix(u_base, tex, u_opacity), 1.0);
}
