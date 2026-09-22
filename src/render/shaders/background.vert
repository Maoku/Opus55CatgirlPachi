layout(location = 0) in vec2 a_corner;

uniform vec2 u_size;

out vec2 v_uv;

void main() {
  v_uv = a_corner * 0.5 + 0.5;
  gl_Position = boardToClip(v_uv * u_size);
}
