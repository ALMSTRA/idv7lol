/**
 * GLSL ES 1.00 fragment shaders for the cluster renderer. One small shader
 * per piece; every shader receives `u_size` (layer size in pixels) and uses
 * `v_uv` from the service's quad vertex shader ((0,0) at the top-left).
 *
 * Angle convention everywhere: degrees, 0 at 3 o'clock, clockwise positive
 * (screen coordinates, y down), same as the Canvas2D engine.
 */
import type { ShaderKind } from './types.js';

export const PRELUDE = `#version 100
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
`;

/** Shared helpers: pixel coordinates, 1-px anti-aliased coverage, straight-alpha compositing. */
const COMMON = `
vec2 px() { return v_uv * u_size; }
float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 dst, vec4 src) { float a = src.a + dst.a * (1.0 - src.a); return vec4((src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / max(a, 1e-5), a); }
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdEllipse(vec2 p, vec2 ab) { float k = length(p / ab); return (k - 1.0) * min(ab.x, ab.y); }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
const float PI = 3.14159265;
float angDeg(vec2 p) { return degrees(atan(p.y, p.x)); }
`;

/** Glyph atlas sampling shared by every text-capable shader. */
const FONT = `
uniform sampler2D u_font;
uniform vec3 u_font_cells; // cols, cellW/cellH, rows
float sdfAt(float code, vec2 g) {
  float row = floor(code / u_font_cells.x);
  float col = code - row * u_font_cells.x;
  vec2 uv = vec2((col + 0.5 + g.x / u_font_cells.y) / u_font_cells.x, (row + g.y) / u_font_cells.z);
  return texture2D(u_font, uv).r;
}
float glyphCov(float s, float h) { float w = 2.0 / max(h, 1.0); return smoothstep(0.5 - w, 0.5 + w, s); }
`;

/* -------------------------------------------------------------------------- */

export const FLAT_FS = `${PRELUDE}${COMMON}
uniform vec4 u_fill;    // rgba
uniform vec4 u_fill2;   // gradient end colour (alpha 0 = no gradient)
uniform vec4 u_grad;    // angleDeg, enabled, 0, 0
uniform vec4 u_stroke;  // rgba
uniform vec4 u_shape;   // 0 rect | 1 ellipse | 2 line(h) | 3 line(v) | 4 diag | 5 diag-flip, radius, strokeWidth, 0
void main() {
  vec2 p = px();
  vec2 c = u_size * 0.5;
  float d;
  if (u_shape.x < 0.5) d = sdRoundBox(p - c, c, u_shape.y);
  else if (u_shape.x < 1.5) d = sdEllipse(p - c, c);
  else {
    vec2 a, b;
    if (u_shape.x < 2.5) { a = vec2(0.0, c.y); b = vec2(u_size.x, c.y); }
    else if (u_shape.x < 3.5) { a = vec2(c.x, 0.0); b = vec2(c.x, u_size.y); }
    else if (u_shape.x < 4.5) { a = vec2(0.0); b = u_size; }
    else { a = vec2(0.0, u_size.y); b = vec2(u_size.x, 0.0); }
    float dl = sdSegment(p, a, b) - u_shape.z * 0.5;
    gl_FragColor = vec4(u_stroke.rgb, u_stroke.a * cov(dl));
    return;
  }
  vec4 fill = u_fill;
  if (u_grad.y > 0.5) {
    float a = radians(u_grad.x);
    vec2 dir = vec2(cos(a), sin(a));
    float half_ = abs(dir.x) * c.x + abs(dir.y) * c.y;
    float t = clamp((dot(p - c, dir) + half_) / (2.0 * half_), 0.0, 1.0);
    fill = mix(u_fill, u_fill2, t);
  }
  vec4 col = vec4(fill.rgb, fill.a * cov(d));
  if (u_shape.z > 0.0) {
    float ds = abs(d) - u_shape.z * 0.5;
    col = over(col, vec4(u_stroke.rgb, u_stroke.a * cov(ds)));
  }
  gl_FragColor = col;
}
`;

export const PANEL_FS = `${PRELUDE}${COMMON}
uniform vec4 u_fill;
uniform vec4 u_fill2;
uniform vec4 u_grad;    // angleDeg, enabled
uniform vec4 u_stroke;
uniform vec4 u_shape;   // radius, strokeWidth, 0, 0
uniform vec4 u_div;     // dividerCount, rowHeight, padding, dividerWidth
uniform vec4 u_divc;
void main() {
  vec2 p = px();
  vec2 c = u_size * 0.5;
  float d = sdRoundBox(p - c, c, u_shape.x);
  vec4 fill = u_fill;
  if (u_grad.y > 0.5) {
    float a = radians(u_grad.x);
    vec2 dir = vec2(cos(a), sin(a));
    float half_ = abs(dir.x) * c.x + abs(dir.y) * c.y;
    fill = mix(u_fill, u_fill2, clamp((dot(p - c, dir) + half_) / (2.0 * half_), 0.0, 1.0));
  }
  vec4 col = vec4(fill.rgb, fill.a * cov(d));
  if (u_shape.y > 0.0) col = over(col, vec4(u_stroke.rgb, u_stroke.a * cov(abs(d) - u_shape.y * 0.5)));
  if (u_div.x > 0.5 && p.x > u_div.z && p.x < u_size.x - u_div.z) {
    float row = (p.y - u_div.z) / u_div.y;
    float k = floor(row + 0.5);
    if (k >= 1.0 && k <= u_div.x) {
      float dy = abs(p.y - (u_div.z + k * u_div.y)) - u_div.w * 0.5;
      col = over(col, vec4(u_divc.rgb, u_divc.a * cov(dy)));
    }
  }
  gl_FragColor = col;
}
`;

/** Track, value arc, redline and zones of a circular gauge. */
export const ARC_BAND_FS = `${PRELUDE}${COMMON}
uniform vec4 u_arc;    // startDeg, sweepDeg, trackRoundCaps, 0
uniform vec4 u_geo;    // outerR, trackWidth, fillWidth, bandCentreR
uniform float u_value; // 0..1
uniform vec4 u_track;
uniform vec4 u_fill;
uniform vec4 u_fill2;  // gradient end (alpha 0 = none)
uniform vec4 u_red;    // fromNorm, width, placement(0 outer,1 track), enabled
uniform vec4 u_redc;
uniform vec4 u_seg;    // mode(0 solid,1 segments), segments, gapDeg, roundCaps
uniform vec4 u_zone[4];  // from, to (normalised), enabled, 0
uniform vec4 u_zonec[4];
uniform vec4 u_glow;   // enabled, blurPx, 0, 0
uniform vec4 u_glowc;
float arcDist(vec2 p, float r, float a0, float a1, float halfW) {
  // distance to an arc band from angle a0 to a1 (deg, cw), radius r, half width halfW
  float ang = angDeg(p);
  float sweep = a1 - a0;
  float rel = mod(ang - a0, 360.0);
  if (sweep < 0.0) rel = mod(a0 - ang, 360.0);
  float asw = abs(sweep);
  float dr = abs(length(p) - r) - halfW;
  if (rel <= asw) return dr;
  // outside the angular span: distance to the nearest end cap
  float ea = radians(rel - asw < 360.0 - rel ? a1 : a0);
  vec2 e = vec2(cos(ea), sin(ea)) * r;
  return length(p - e) - halfW;
}
float arcDistButt(vec2 p, float r, float a0, float a1, float halfW) {
  // the same band with square ends: the gaps between segments stay open
  float lo = min(a0, a1);
  float span = abs(a1 - a0);
  float rel = mod(angDeg(p) - lo, 360.0);
  float len = length(p);
  float radial = abs(len - r) - halfW;
  float along = rel <= span
    ? -radians(min(rel, span - rel)) * len
    : radians(min(rel - span, 360.0 - rel)) * len;
  return max(radial, along);
}
float bandDist(vec2 p, float r, float a0, float a1, float halfW, float round) {
  return round > 0.5 ? arcDist(p, r, a0, a1, halfW) : arcDistButt(p, r, a0, a1, halfW);
}
void main() {
  vec2 p = px() - u_size * 0.5;
  float a0 = u_arc.x;
  float sw = u_arc.y;
  vec4 col = vec4(0.0);
  // redline outer ring
  if (u_red.w > 0.5 && u_red.z < 0.5 && u_red.x < 1.0) {
    float r = u_geo.x - u_red.y * 0.5;
    float d = arcDistButt(p, r, a0 + sw * u_red.x, a0 + sw, u_red.y * 0.5);
    col = over(col, vec4(u_redc.rgb, u_redc.a * cov(d)));
  }
  // track
  if (u_geo.y > 0.0) {
    float d = bandDist(p, u_geo.w, a0, a0 + sw, u_geo.y * 0.5, u_arc.z);
    col = over(col, vec4(u_track.rgb, u_track.a * cov(d)));
  }
  // redline on track
  if (u_red.w > 0.5 && u_red.z > 0.5 && u_red.x < 1.0) {
    float d = arcDistButt(p, u_geo.w, a0 + sw * u_red.x, a0 + sw, max(u_geo.y, u_red.y) * 0.5);
    col = over(col, vec4(u_redc.rgb, u_redc.a * cov(d)));
  }
  // value fill
  if (u_geo.z > 0.0 && u_value > 0.0005) {
    float ang = angDeg(p);
    float rel = sw >= 0.0 ? mod(ang - a0, 360.0) : mod(a0 - ang, 360.0);
    float n = clamp(rel / abs(sw), 0.0, 1.0);
    vec4 fc = u_fill;
    if (u_fill2.a > 0.0) fc = mix(u_fill, u_fill2, n);
    for (int i = 0; i < 4; i++) {
      if (u_zone[i].z > 0.5 && n >= u_zone[i].x && n < u_zone[i].y) fc = u_zonec[i];
    }
    float d;
    if (u_seg.x < 0.5) {
      d = bandDist(p, u_geo.w, a0, a0 + sw * u_value, u_geo.z * 0.5, u_seg.w);
    } else {
      float segs = max(u_seg.y, 1.0);
      float segSw = sw / segs;
      float idx = floor(rel / abs(segSw));
      float lit = floor(u_value * segs + 0.5);
      if (idx >= lit || rel > abs(sw)) { gl_FragColor = col; return; }
      float g = u_seg.z * 0.5;
      float sa = a0 + segSw * idx + sign(sw) * g;
      float sb = a0 + segSw * (idx + 1.0) - sign(sw) * g;
      d = bandDist(p, u_geo.w, sa, sb, u_geo.z * 0.5, u_seg.w);
    }
    if (u_glow.x > 0.5) {
      float gd = d / max(u_glow.y, 1.0);
      col = over(col, vec4(u_glowc.rgb, u_glowc.a * 0.6 * exp(-gd * gd * 2.0) * step(0.0, d)));
    }
    col = over(col, vec4(fc.rgb, fc.a * cov(d)));
  }
  gl_FragColor = col;
}
`;

/** Tick marks and numerals of a circular gauge, drawn from the glyph atlas. */
export const ARC_TICKS_FS = `${PRELUDE}${COMMON}${FONT}
uniform vec4 u_arc;     // startDeg, sweepDeg, 0, 0
uniform vec4 u_ticks;   // major, minor, majorLen, minorLen
uniform vec4 u_tickw;   // majorW, minorW, tickOuterR, redFromNorm (2 = none)
uniform vec4 u_tickc;
uniform vec4 u_minorc;
uniform vec4 u_redc;
uniform vec4 u_labels;  // show, every, labelR, glyphHeightPx
uniform vec4 u_range;   // min, max, divisor, decimals(0)
uniform vec4 u_labelc;
uniform float u_digit_adv; // advance of a digit in glyph heights
float digitCode(float d) { return d; } // codes 0-9 are the digits in the idv7lol atlas
void main() {
  vec2 p = px() - u_size * 0.5;
  float a0 = u_arc.x;
  float sw = u_arc.y;
  vec4 col = vec4(0.0);
  float major = u_ticks.x;
  if (major < 0.5) { gl_FragColor = col; return; }
  float minor = u_ticks.y;
  float total = major * (minor + 1.0);
  float ang = angDeg(p);
  float rel = sw >= 0.0 ? mod(ang - a0, 360.0) : mod(a0 - ang, 360.0);
  float asw = abs(sw);
  // nearest tick index
  float fi = rel / asw * total;
  float i = floor(fi + 0.5);
  if (i >= 0.0 && i <= total && rel <= asw + 2.0) {
    bool isMajor = mod(i, minor + 1.0) < 0.5;
    float len = isMajor ? u_ticks.z : u_ticks.w;
    float wdt = isMajor ? u_tickw.x : u_tickw.y;
    float ta = radians(a0 + sw * (i / total));
    vec2 dir = vec2(cos(ta), sin(ta));
    vec2 a = dir * u_tickw.z;
    vec2 b = dir * (u_tickw.z - len);
    float d = sdSegment(p, a, b) - wdt * 0.5;
    vec4 tc = isMajor ? u_tickc : u_minorc;
    if ((i / total) >= u_tickw.w) tc = u_redc;
    if (len > 0.0 && wdt > 0.0) col = over(col, vec4(tc.rgb, tc.a * cov(d)));
  }
  // numerals at major ticks
  if (u_labels.x > 0.5) {
    // Past either end of the arc, the nearest end's numeral still owns the pixel,
    // so the first and last numerals aren't cut along the arc's edge.
    float lrel = rel <= asw ? rel : (rel - asw < 360.0 - rel ? asw : 0.0);
    float mi = floor(lrel / asw * major + 0.5);
    if (mi >= 0.0 && mi <= major && mod(mi, u_labels.y) < 0.5) {
      float la = radians(a0 + sw * (mi / major));
      vec2 centre = vec2(cos(la), sin(la)) * u_labels.z;
      float h = u_labels.w;
      float v = (u_range.x + (u_range.y - u_range.x) * (mi / major)) / u_range.z;
      v = floor(abs(v) + 0.5);
      float digits = v >= 1000.0 ? 4.0 : v >= 100.0 ? 3.0 : v >= 10.0 ? 2.0 : 1.0;
      float adv = u_digit_adv * h;
      float x0 = centre.x - digits * adv * 0.5;
      vec2 q = p - vec2(x0, centre.y - h * 0.5);
      if (q.x >= 0.0 && q.x < digits * adv && q.y >= 0.0 && q.y < h) {
        float k = floor(q.x / adv);
        float pw = pow(10.0, digits - 1.0 - k);
        float dig = mod(floor(v / pw), 10.0);
        vec2 g = vec2((q.x - k * adv) / h - u_digit_adv * 0.5, q.y / h);
        float s = sdfAt(digitCode(dig), g);
        col = over(col, vec4(u_labelc.rgb, u_labelc.a * glyphCov(s, h)));
      }
    }
  }
  gl_FragColor = col;
}
`;

export const NEEDLE_FS = `${PRELUDE}${COMMON}
uniform float u_angle;  // deg
uniform vec4 u_needle;  // lengthPx, tailPx, widthPx, shape(0 tapered,1 bar,2 arrow)
uniform vec4 u_color;
uniform vec4 u_cap;     // radiusPx, show, 0, 0
uniform vec4 u_capc;
uniform vec4 u_shadow;  // enabled, blurPx, 0, 0
void main() {
  vec2 p = px() - u_size * 0.5;
  float a = radians(u_angle);
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 q = rot * p; // needle along +x
  float len = u_needle.x;
  float tail = u_needle.y;
  float hw = u_needle.z * 0.5;
  float d;
  if (u_needle.w < 0.5) {
    float t = clamp((q.x + tail) / (len + tail), 0.0, 1.0);
    float w = mix(hw, 0.6, t);
    d = max(abs(q.y) - w, max(-tail - q.x, q.x - len));
  } else if (u_needle.w < 1.5) {
    d = max(abs(q.y) - hw, max(-tail - q.x, q.x - len));
  } else {
    float t = clamp((q.x + tail) / (len * 0.8 + tail), 0.0, 1.0);
    float w = q.x < len * 0.8 ? mix(hw, hw * 1.6, t) : hw * 1.6 * (len - q.x) / (len * 0.2);
    d = max(abs(q.y) - w, max(-tail - q.x, q.x - len));
  }
  vec4 col = vec4(0.0);
  if (u_shadow.x > 0.5) {
    float sd = d / max(u_shadow.y, 1.0);
    col = over(col, vec4(0.0, 0.0, 0.0, 0.5 * exp(-sd * sd * 2.0)));
  }
  col = over(col, vec4(u_color.rgb, u_color.a * cov(d)));
  if (u_cap.y > 0.5) col = over(col, vec4(u_capc.rgb, u_capc.a * cov(length(p) - u_cap.x)));
  gl_FragColor = col;
}
`;

export const BAR_FS = `${PRELUDE}${COMMON}
uniform vec4 u_geo;     // orientation(0 h,1 v), direction(0 fwd,1 rev), trackRadius, fillRadius
uniform float u_value;  // 0..1
uniform vec4 u_track;   // rgba (alpha 0 hides)
uniform vec4 u_fill;
uniform vec4 u_fill2;
uniform vec4 u_seg;     // mode, segments, gapPx, 0
uniform vec4 u_zone[4];
uniform vec4 u_zonec[4];
uniform vec4 u_marker;  // show, norm, widthPx, 0
uniform vec4 u_markerc;
uniform vec4 u_stroke;  // rgba
uniform vec4 u_strokew; // widthPx, 0,0,0
uniform vec4 u_glow;
uniform vec4 u_glowc;
void main() {
  vec2 p = px();
  vec2 c = u_size * 0.5;
  bool horiz = u_geo.x < 0.5;
  float L = horiz ? u_size.x : u_size.y;
  float along = horiz ? p.x : (u_size.y - p.y);
  if (u_geo.y > 0.5) along = L - along;
  float n = along / L;
  vec4 col = vec4(0.0);
  float dt = sdRoundBox(p - c, c, u_geo.z);
  if (u_track.a > 0.0) col = over(col, vec4(u_track.rgb, u_track.a * cov(dt)));
  if (u_strokew.x > 0.0) col = over(col, vec4(u_stroke.rgb, u_stroke.a * cov(abs(dt) - u_strokew.x * 0.5)));
  if (u_value > 0.0005) {
    vec4 fc = u_fill2.a > 0.0 ? mix(u_fill, u_fill2, n) : u_fill;
    for (int i = 0; i < 4; i++) if (u_zone[i].z > 0.5 && n >= u_zone[i].x && n < u_zone[i].y) fc = u_zonec[i];
    float d;
    if (u_seg.x < 0.5) {
      float f0 = 0.0, f1 = u_value * L;
      float mid = (f0 + f1) * 0.5, half_ = (f1 - f0) * 0.5;
      vec2 q = horiz ? vec2(along - mid, p.y - c.y) : vec2(p.x - c.x, along - mid);
      vec2 b = horiz ? vec2(half_, c.y) : vec2(c.x, half_);
      d = sdRoundBox(q, b, min(u_geo.w, min(b.x, b.y)));
    } else {
      float segs = max(u_seg.y, 1.0);
      float segL = L / segs;
      float idx = floor(along / segL);
      float lit = floor(u_value * segs + 0.5);
      if (idx >= lit) { gl_FragColor = col; return; }
      float s0 = idx * segL + u_seg.z * 0.5, s1 = (idx + 1.0) * segL - u_seg.z * 0.5;
      float mid = (s0 + s1) * 0.5, half_ = (s1 - s0) * 0.5;
      vec2 q = horiz ? vec2(along - mid, p.y - c.y) : vec2(p.x - c.x, along - mid);
      vec2 b = horiz ? vec2(half_, c.y) : vec2(c.x, half_);
      d = sdRoundBox(q, b, min(3.0, min(b.x, b.y)));
    }
    if (u_glow.x > 0.5) { float gd = d / max(u_glow.y, 1.0); col = over(col, vec4(u_glowc.rgb, u_glowc.a * 0.6 * exp(-gd * gd * 2.0) * step(0.0, d))); }
    col = over(col, vec4(fc.rgb, fc.a * cov(d)));
  }
  if (u_marker.x > 0.5) {
    float m = u_marker.y * L;
    float d = abs(along - m) - u_marker.z * 0.5;
    col = over(col, vec4(u_markerc.rgb, u_markerc.a * cov(d)));
  }
  gl_FragColor = col;
}
`;

/** Ticks and numerals beside a bar. The layer is the bar box grown by the tick/label margin. */
export const BAR_TICKS_FS = `${PRELUDE}${COMMON}${FONT}
uniform vec4 u_geo;     // orientation, direction, barOffsetPx (inset of the bar inside this layer, along the cross axis), barCrossPx (bar thickness)
uniform vec4 u_bar;     // barStartPx (along axis), barLengthPx, 0, 0
uniform vec4 u_ticks;   // show, count, lenPx, widthPx
uniform vec4 u_side;    // before(0/1), after(0/1), 0, 0
uniform vec4 u_tickc;
uniform vec4 u_labels;  // show, count, glyphHeightPx, offsetPx
uniform vec4 u_range;   // min, max, divisor, 0
uniform vec4 u_labelc;
uniform float u_digit_adv;
void main() {
  vec2 p = px();
  bool horiz = u_geo.x < 0.5;
  float along = horiz ? p.x : (u_size.y - p.y);
  float cross = horiz ? p.y : p.x;
  float L = u_bar.y;
  float a = along - u_bar.x;
  float nrm = a / L;
  if (u_geo.y > 0.5) nrm = 1.0 - nrm;
  vec4 col = vec4(0.0);
  if (u_ticks.x > 0.5 && u_ticks.y > 1.5) {
    float cnt = u_ticks.y - 1.0;
    float i = floor(nrm * cnt + 0.5);
    float ta = (u_geo.y > 0.5 ? 1.0 - i / cnt : i / cnt) * L + u_bar.x;
    float da = abs(along - ta) - u_ticks.w * 0.5;
    float c0 = u_geo.z, c1 = u_geo.z + u_geo.w;
    float dc = 1e9;
    if (u_side.x > 0.5) dc = min(dc, max(c0 - u_ticks.z - cross, cross - c0));
    if (u_side.y > 0.5) dc = min(dc, max(c1 - cross, cross - c1 - u_ticks.z));
    float d = max(da, dc);
    if (i >= 0.0 && i <= cnt) col = over(col, vec4(u_tickc.rgb, u_tickc.a * cov(d)));
  }
  if (u_labels.x > 0.5 && u_labels.y > 1.5) {
    float cnt = u_labels.y - 1.0;
    float i = floor(nrm * cnt + 0.5);
    if (i >= 0.0 && i <= cnt) {
      float h = u_labels.z;
      float ta = (u_geo.y > 0.5 ? 1.0 - i / cnt : i / cnt) * L + u_bar.x;
      float v = floor(abs((u_range.x + (u_range.y - u_range.x) * (i / cnt)) / u_range.z) + 0.5);
      float digits = v >= 1000.0 ? 4.0 : v >= 100.0 ? 3.0 : v >= 10.0 ? 2.0 : 1.0;
      float adv = u_digit_adv * h;
      float lc = u_geo.z + u_geo.w + u_labels.w; // label centre on the cross axis (after side)
      vec2 q;
      if (horiz) q = vec2(along - (ta - digits * adv * 0.5), p.y - (lc - h * 0.5));
      else q = vec2(p.x - lc, (u_size.y - p.y) - (ta + h * 0.5)) * vec2(1.0, -1.0);
      if (q.x >= 0.0 && q.x < digits * adv && q.y >= 0.0 && q.y < h) {
        float k = floor(q.x / adv);
        float dig = mod(floor(v / pow(10.0, digits - 1.0 - k)), 10.0);
        vec2 g = vec2((q.x - k * adv) / h - u_digit_adv * 0.5, q.y / h);
        col = over(col, vec4(u_labelc.rgb, u_labelc.a * glyphCov(sdfAt(dig, g), h)));
      }
    }
  }
  gl_FragColor = col;
}
`;

/**
 * SDF text: up to 32 glyphs. `u_text[8]` holds glyph codes (-1 = none), `u_x[8]`
 * glyph centres in glyph heights from the left. Codes >= 1000 use `u_color2`
 * (secondary text such as a unit) and the glyph is scaled by `u_scale2`.
 */
export const TEXT_FS = `${PRELUDE}${COMMON}${FONT}
uniform vec4 u_text[8];
uniform vec4 u_x[8];
uniform vec4 u_color;
uniform vec4 u_color2;
uniform vec4 u_glow;    // rgb, strength
uniform float u_scale2; // size of secondary glyphs relative to the line height
float lane(vec4 v, float l) { return l < 0.5 ? v.x : l < 1.5 ? v.y : l < 2.5 ? v.z : v.w; }
void main() {
  float h = u_size.y;
  vec2 g = px() / h;   // in glyph heights
  float best = 0.0; float bestSec = 0.0;
  float second = 0.0; float secondSec = 0.0;
  for (int i = 0; i < 8; i++) {
    for (int l = 0; l < 4; l++) {
      float code = lane(u_text[i], float(l));
      if (code < 0.0) continue;
      float sec = code >= 1000.0 ? 1.0 : 0.0;
      float c = code - sec * 1000.0;
      float cx = lane(u_x[i], float(l));
      float sc = sec > 0.5 ? u_scale2 : 1.0;
      vec2 q = vec2((g.x - cx) / sc, 1.0 - (1.0 - g.y) / sc);
      if (abs(q.x) > 0.6 || q.y < -0.05 || q.y > 1.05) continue;
      float s = sdfAt(c, q);
      if (s > best) { second = best; secondSec = bestSec; best = s; bestSec = sec; }
      else if (s > second) { second = s; secondSec = sec; }
    }
  }
  float a = glyphCov(best, h);
  vec4 c = bestSec > 0.5 ? u_color2 : u_color;
  vec4 col = vec4(c.rgb, c.a * a);
  if (u_glow.w > 0.0) {
    float ga = smoothstep(0.2, 0.5, best) * u_glow.w * (1.0 - a);
    col = over(vec4(u_glow.rgb, ga), col);
  }
  gl_FragColor = col;
}
`;

export const SHIFTLIGHTS_FS = `${PRELUDE}${COMMON}
uniform vec4 u_cfg;      // count, shape(0 circle,1 rect,2 pill), gapPx, glow
uniform float u_lit;     // lit count
uniform float u_flash;   // 1 = all on (flash phase), 0 = normal, -1 = all off (flash phase)
uniform float u_sym;     // symmetric
uniform vec4 u_colors[32];
uniform vec4 u_off;
void main() {
  vec2 p = px();
  float n = max(u_cfg.x, 1.0);
  float cellW = (u_size.x - u_cfg.z * (n - 1.0)) / n;
  float i = floor(p.x / (cellW + u_cfg.z));
  if (i < 0.0 || i >= n) { gl_FragColor = vec4(0.0); return; }
  float x0 = i * (cellW + u_cfg.z);
  bool on;
  if (u_flash > 0.5) on = true;
  else if (u_flash < -0.5) on = false;
  else if (u_sym > 0.5) { float fromEdge = min(i, n - 1.0 - i); float pairs = ceil(n / 2.0); on = fromEdge < ceil(u_lit / n * pairs); }
  else on = i < u_lit;
  vec4 c = u_off;
  if (on) { for (int k = 0; k < 32; k++) if (float(k) == i) c = u_colors[k]; }
  float size = min(cellW, u_size.y);
  float d;
  if (u_cfg.y < 0.5) d = length(p - vec2(x0 + cellW * 0.5, u_size.y * 0.5)) - size * 0.5;
  else if (u_cfg.y < 1.5) d = sdRoundBox(p - vec2(x0 + cellW * 0.5, u_size.y * 0.5), vec2(cellW, u_size.y) * 0.5, 2.0);
  else d = sdRoundBox(p - vec2(x0 + cellW * 0.5, u_size.y * 0.5), vec2(cellW, u_size.y) * 0.5, min(cellW, u_size.y) * 0.5);
  vec4 col = vec4(0.0);
  if (on && u_cfg.w > 0.5) { float gd = d / (size * 0.35); col = over(col, vec4(c.rgb, c.a * 0.55 * exp(-gd * gd) * step(0.0, d))); }
  col = over(col, vec4(c.rgb, c.a * cov(d)));
  gl_FragColor = col;
}
`;

/** Telltale icons as signed-distance unions in a 100×100 box. */
export const TELLTALE_FS = `${PRELUDE}${COMMON}${FONT}
uniform float u_icon;  // 0 turn-left,1 turn-right,2 high-beam,3 low-beam,4 fog-rear,5 parking-brake,6 cruise,7 battery,8 fuel,9 engine,10 oil,11 coolant,12 snowflake
uniform vec4 u_color;
uniform float u_code_p; // atlas code of 'P'
float sdBox(vec2 p, vec2 c, vec2 b) { vec2 q = abs(p - c) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdArrow(vec2 p, float dir) {
  // shaft + head, pointing right for dir 1, left for dir -1, in a 100 box
  p.x = 50.0 + (p.x - 50.0) * dir;
  float shaft = sdBox(p, vec2(28.0, 50.0), vec2(22.0, 15.0));
  vec2 q = p - vec2(50.0, 50.0);
  float head = max(abs(q.y) - (45.0 - q.x) , -q.x); // triangle from x=50 to 95
  return min(shaft, head);
}
float sdRing(vec2 p, vec2 c, float r, float w) { return abs(length(p - c) - r) - w * 0.5; }
void main() {
  vec2 p = px() / u_size * 100.0;
  float s = min(u_size.x, u_size.y) / 100.0; // px per unit
  float d = 1e9;
  float ic = u_icon;
  if (ic < 0.5) d = sdArrow(p, -1.0);
  else if (ic < 1.5) d = sdArrow(p, 1.0);
  else if (ic < 4.5) {
    // headlamp: D shape (half disc) + rays
    vec2 q = p - vec2(58.0, 50.0);
    float disc = max(length(q) - 30.0, -q.x);
    float ring = max(abs(length(q) - 30.0) - 3.5, -q.x);
    float flat_ = sdBox(p, vec2(58.0, 50.0), vec2(3.5, 30.0));
    d = min(ring, flat_);
    for (int k = 0; k < 4; k++) {
      float y = 26.0 + float(k) * 16.0;
      float slope = ic < 2.5 ? 0.0 : 8.0; // low beam rays slope down
      float r = sdSegment(p, vec2(44.0, y), vec2(12.0, y + slope)) - 3.0;
      d = min(d, r);
    }
    if (ic > 3.5) d = min(d, sdSegment(p, vec2(22.0, 15.0), vec2(28.0, 85.0)) - 2.5);
    d = min(d, disc + 1e9 * 0.0 + 1e9); // keep outline only
  }
  else if (ic < 5.5) {
    d = sdRing(p, vec2(50.0), 36.0, 7.0);
    float lb = max(sdRing(p, vec2(50.0), 46.0, 7.0), -(abs(p.y - 50.0) - 0.0) );
    float arcs = max(sdRing(p, vec2(50.0), 46.0, 7.0), -(abs(p.y - 50.0) - 30.0)); // keep side arcs where |y-50|>30? invert
    arcs = max(sdRing(p, vec2(50.0), 46.0, 7.0), (abs(p.y - 50.0) - 28.0) * -1.0 > 0.0 ? 1e9 : -1e9);
    d = min(d, max(sdRing(p, vec2(50.0), 46.0, 7.0), abs(p.y - 50.0) - 26.0));
    // 'P' from the atlas
    vec2 g = vec2((p.x - 50.0) / 44.0, (p.y - 28.0) / 44.0);
    float sp = sdfAt(u_code_p, g);
    float pa = glyphCov(sp, 44.0 * s);
    vec4 col = vec4(u_color.rgb, u_color.a * cov(d * s));
    col = over(col, vec4(u_color.rgb, u_color.a * pa));
    gl_FragColor = col; return;
  }
  else if (ic < 6.5) {
    d = max(sdRing(p, vec2(50.0, 55.0), 36.0, 7.0), -(p.y - 55.0 - 20.0) * -1.0 > 0.0 ? 1e9 : -1e9);
    d = max(sdRing(p, vec2(50.0, 55.0), 36.0, 7.0), 55.0 + 22.0 - p.y > 0.0 ? -1e9 : 1e9);
    d = min(d, sdSegment(p, vec2(50.0, 55.0), vec2(72.0, 35.0)) - 3.0);
    d = min(d, sdSegment(p, vec2(22.0, 90.0), vec2(78.0, 90.0)) - 3.0);
  }
  else if (ic < 7.5) {
    d = abs(sdBox(p, vec2(50.0, 55.0), vec2(38.0, 25.0))) - 3.5;
    d = min(d, sdBox(p, vec2(30.0, 25.0), vec2(8.0, 5.0)));
    d = min(d, sdBox(p, vec2(70.0, 25.0), vec2(8.0, 5.0)));
    d = min(d, sdBox(p, vec2(31.0, 55.0), vec2(9.0, 3.0)));
    d = min(d, sdBox(p, vec2(69.0, 55.0), vec2(9.0, 3.0)));
    d = min(d, sdBox(p, vec2(69.0, 55.0), vec2(3.0, 9.0)));
  }
  else if (ic < 8.5) {
    d = abs(sdBox(p, vec2(37.5, 55.0), vec2(22.5, 35.0))) - 3.5;
    d = min(d, sdBox(p, vec2(37.5, 39.0), vec2(15.5, 11.0)));
    d = min(d, sdSegment(p, vec2(60.0, 40.0), vec2(75.0, 40.0)) - 3.0);
    d = min(d, sdSegment(p, vec2(75.0, 40.0), vec2(82.0, 50.0)) - 3.0);
    d = min(d, sdSegment(p, vec2(82.0, 50.0), vec2(82.0, 78.0)) - 3.0);
    d = min(d, sdBox(p, vec2(37.5, 90.0), vec2(27.5, 4.0)));
  }
  else if (ic < 9.5) {
    d = sdBox(p, vec2(55.0, 55.0), vec2(25.0, 25.0));
    d = min(d, sdBox(p, vec2(52.0, 26.0), vec2(8.0, 5.0)));
    d = min(d, sdBox(p, vec2(16.0, 45.0), vec2(8.0, 5.0)));
    d = min(d, sdBox(p, vec2(85.0, 56.0), vec2(6.0, 14.0)));
    d = min(d, sdBox(p, vec2(30.0, 75.0), vec2(6.0, 8.0)));
  }
  else if (ic < 10.5) {
    d = sdBox(p, vec2(50.0, 58.0), vec2(30.0, 13.0));
    d = min(d, sdSegment(p, vec2(80.0, 50.0), vec2(90.0, 60.0)) - 4.0);
    d = min(d, sdBox(p, vec2(45.0, 38.0), vec2(5.0, 8.0)));
    d = min(d, sdBox(p, vec2(45.0, 31.0), vec2(15.0, 3.0)));
    d = min(d, length(p - vec2(12.0, 66.0)) - 5.0);
  }
  else if (ic < 11.5) {
    d = abs(sdBox(p, vec2(50.0, 40.0), vec2(8.0, 25.0))) - 3.0;
    d = min(d, length(p - vec2(50.0, 70.0)) - 12.0);
    for (int k = 0; k < 2; k++) {
      float y = 86.0 + float(k) * 8.0;
      float wave = sin(p.x * 0.63) * 4.0;
      float wd = max(abs(p.y - (y + wave)) - 2.0, abs(p.x - 50.0) - 40.0);
      d = min(d, wd);
    }
  }
  else {
    for (int k = 0; k < 3; k++) {
      float a = float(k) * PI / 3.0;
      vec2 dir = vec2(cos(a), sin(a)) * 40.0;
      d = min(d, sdSegment(p, vec2(50.0) - dir, vec2(50.0) + dir) - 3.5);
    }
  }
  gl_FragColor = vec4(u_color.rgb, u_color.a * cov(d * s));
}
`;

/** An animated picture: one cell of an atlas, chosen by a renderer-side animation of u_frame. */
export const SPRITE_FS = `${PRELUDE}
uniform sampler2D u_atlas;
uniform vec2 u_cells;   // columns, rows
uniform vec2 u_texel;   // half a texel of a cell, to stop neighbours bleeding in
uniform float u_frame;
uniform float u_opacity;
void main() {
  float f = floor(u_frame + 0.5);
  // Row first, with half a frame of margin, so mediump rounding can't pick the wrong row.
  float row = floor((f + 0.5) / u_cells.x);
  vec2 cell = vec2(f - row * u_cells.x, row);
  vec2 uv = (cell + clamp(v_uv, u_texel, vec2(1.0) - u_texel)) / u_cells;
  vec4 c = texture2D(u_atlas, uv);
  gl_FragColor = vec4(c.rgb, c.a * u_opacity);
}
`;

export const SHADERS: Readonly<Record<ShaderKind, string>> = {
  sprite: SPRITE_FS,
  flat: FLAT_FS,
  panel: PANEL_FS,
  'arc-band': ARC_BAND_FS,
  'arc-ticks': ARC_TICKS_FS,
  needle: NEEDLE_FS,
  bar: BAR_FS,
  'bar-ticks': BAR_TICKS_FS,
  text: TEXT_FS,
  shiftlights: SHIFTLIGHTS_FS,
  telltale: TELLTALE_FS,
};

const RESERVED = ['u_mvp', 'u_mv', 'u_m', 'u_v', 'u_p', 'u_normal'];

/** Names of the uniforms a shader declares (for budget checks). */
export function declaredUniforms(src: string): string[] {
  const out: string[] = [];
  const re = /uniform\s+\w+\s+(\w+)(\[\d+\])?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!);
  return out;
}

/** Static sanity checks on a shader source (the real compile happens on the car). */
export function lintShader(src: string): string[] {
  const problems: string[] = [];
  if (!src.startsWith('#version 100')) problems.push('must start with #version 100');
  if (!/precision\s+(highp|mediump)\s+float/.test(src))
    problems.push('must declare float precision');
  for (const r of RESERVED)
    if (new RegExp(`\\b${r}\\b`).test(src)) problems.push(`uses reserved uniform ${r}`);
  const names = declaredUniforms(src);
  if (names.length > 32) problems.push(`declares ${names.length} uniforms (max 32)`);
  return problems;
}
