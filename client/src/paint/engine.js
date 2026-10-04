// Hand Paint engine — React port. Local-only: WASM pixel fields, stroke
// planner, p5.brush natural media (npm) or classic Canvas2D. No AI, no keys.
import * as brush from 'p5.brush/standalone';
import { WF_B64 } from './wasmB64.js';

export const PAPER = '#e8ddc9';
const GRAIN = 0.1;
const WF_OFF = { gray: 0, mag: 262144, dir: 524288 };
export const STYLE_FX = {
  impasto: { w: 1.35, a: 1 },
  knife: { w: 1.6, a: 1 },
  watercolor: { w: 0.9, a: 0.55 },
  impressionist: { w: 1, a: 0.9 },
  gouache: { w: 1.05, a: 1 },
  sketch: { w: 0.9, a: 0.85 },
  pointillism: { w: 0.8, a: 1, c: 1.6 },
  inkwash: { w: 1.1, a: 0.9 },
  pastel: { w: 1.0, a: 0.7 },
  poster: { w: 1.0, a: 1 },
  mosaic: { w: 1.1, a: 1 },
  pixel: { w: 1.0, a: 1 },
  acrylic: { w: 1.0, a: 1 },
  charcoal: { w: 1.2, a: 0.8 },
  flow: { w: 1, a: 0.9 },
  sculpt: { w: 1.5, a: 1 },
  dagger: { w: 0.9, a: 1 },
  stamp: { w: 1.2, a: 0.95 },
};

function quant(v, levels) {
  return (Math.round((v / 255) * (levels - 1)) / (levels - 1)) * 255;
}
function satBoost(r, g, b, k) {
  const m = (r + g + b) / 3;
  const f = (v) => Math.min(255, Math.max(0, m + (v - m) * k));
  return [f(r), f(g), f(b)];
}
// Per-finish color grading, applied once at plan time so both backends
// and the SVG exporter stay consistent.
function styleColor(r, g, b, st) {
  if (st === 'inkwash' || st === 'sketch') {
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    return [lum, lum, lum];
  }
  if (st === 'poster') {
    const c = satBoost(quant(r, 4), quant(g, 4), quant(b, 4), 1.3);
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
  }
  if (st === 'pixel') return [quant(r, 5), quant(g, 5), quant(b, 5)];
  if (st === 'pointillism') return satBoost(r, g, b, 1.35);
  if (st === 'pastel') return [r + (255 - r) * 0.22, g + (255 - g) * 0.22, b + (255 - b) * 0.22];
  if (st === 'acrylic') return satBoost(r, g, b, 1.5);
  if (st === 'charcoal') {
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const v = Math.round(10 + lum * 0.4);
    return [v, v, v];
  }
  return [r, g, b];
}
const NB_BRUSH = {
  impasto: ['charcoal', 'oilflat', 'crayon', 'HB', 'rotring'],
  watercolor: ['washsoft', 'spray', 'cpencil', 'pencilfine', 'pencilfine'],
  impressionist: ['drybrush', 'crayon', 'HB', 'rotring', '2B'],
  knife: ['oilflat', 'charcoal', 'crayon', 'HB', '2B'],
  gouache: ['oilflat', 'crayon', 'HB', '2B', 'rotring'],
  sketch: ['charcoal', 'HB', 'rotring', 'pencilfine', 'pencilfine'],
  pointillism: ['spray', 'spray', 'rotring', 'rotring', '2B'],
  inkwash: ['charcoal', 'HB', 'HB', '2B', 'pencilfine'],
  pastel: ['crayon', 'pastel', 'crayon', 'cpencil', 'pencilfine'],
  poster: ['oilflat', 'charcoal', 'HB', '2B', 'rotring'],
  mosaic: ['charcoal', 'HB', 'HB', '2B', '2B'],
  pixel: ['HB', 'HB', '2B', '2B', 'rotring'],
  acrylic: ['drybrush', 'oilflat', 'crayon', 'HB', '2B'],
  charcoal: ['charcoal', 'charcoal', 'HB', '2B', 'pencilfine'],
  flow: ['HB', 'HB', 'pencilfine', 'pencilfine', 'pencilfine'],
  sculpt: ['charcoal', 'oilflat', 'HB', '2B', 'rotring'],
  dagger: ['HB', 'rotring', 'rotring', 'pen', 'pen'],
  stamp: ['leafstamp', 'leafstamp', 'leafstamp', 'leafstamp', 'crayon'],
};

let wfPromise = null;
function wfInit() {
  if (!wfPromise) {
    wfPromise = (async () => {
      try {
        if (typeof WebAssembly === 'undefined') return null;
        const b = Uint8Array.from(atob(WF_B64), (c) => c.charCodeAt(0));
        const m = await WebAssembly.instantiate(b, {});
        if (m.instance.exports.mem && m.instance.exports.field)
          return { mem: m.instance.exports.mem, field: m.instance.exports.field };
        return null;
      } catch {
        return null;
      }
    })();
  }
  return wfPromise;
}
wfInit();

function jsField(gray, w, h) {
  const mag = new Float32Array(w * h), dir = new Uint8Array(w * h);
  dir.fill(8);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - (gray[i - w - 1] + 2 * gray[i - 1] + gray[i + w - 1]);
    const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1]);
    const m = Math.sqrt(gx * gx + gy * gy);
    mag[i] = m;
    if (m === 0) continue;
    const ax = Math.abs(gx), ay = Math.abs(gy);
    let d;
    if (ax >= ay) d = ay > 0.41421356 * ax ? (gx >= 0 ? (gy >= 0 ? 1 : 7) : (gy >= 0 ? 3 : 5)) : gx >= 0 ? 0 : 4;
    else d = ax > 0.41421356 * ay ? (gy >= 0 ? (gx >= 0 ? 1 : 3) : (gx >= 0 ? 7 : 5)) : gy >= 0 ? 2 : 6;
    dir[i] = d;
  }
  return { mag, dir };
}

let brushScaled = false;
const NB_AVAIL = typeof brush !== 'undefined' && typeof brush.createCanvas === 'function';

export function fitSize(iw, ih, max = 1024) {
  const s = Math.min(1, max / Math.max(iw, ih));
  return [Math.round(iw * s), Math.round(ih * s)];
}

export function createPainter(paintCanvas, hooks = {}) {
  const pctx = paintCanvas.getContext('2d', { alpha: false });
  const srcC = document.createElement('canvas');
  const sctx = srcC.getContext('2d', { willReadFrequently: true });
  // Transparent stroke layer: every stroke lands here, so PNG exports carry
  // no background. The on-screen canvas keeps its paper look via composite().
  const layerC = document.createElement('canvas');
  const lctx = layerC.getContext('2d');
  // Paper + wash snapshot, painted once per job; display = base + layer.
  const baseC = document.createElement('canvas');
  const bctx = baseC.getContext('2d', { alpha: false });
  const hideDiv = document.createElement('div');
  hideDiv.style.cssText = 'position:fixed;left:-10000px;top:0;width:8px;height:8px;overflow:hidden';
  document.body.appendChild(hideDiv);

  const S = {
    img: null, strokes: [], drawn: 0, raf: 0, playing: false,
    W: 0, H: 0, t0: 0, orient: null, ow: 0, oh: 0, magN: null, detail: null,
    backend: 'natural', styleCur: 'impasto', wasmUsed: false,
  };
  const cfg = { backend: 'natural', style: 'impasto', detail: 4, speed: 160, target: 85, quality: 'balanced' };
  const QUALITY = {
    fast: { res: 768, mult: 0.5, capClassic: 25000, capNatural: 8000 },
    balanced: { res: 1024, mult: 1, capClassic: 60000, capNatural: 22000 },
    high: { res: 1536, mult: 1.5, capClassic: 120000, capNatural: 45000 },
    ultra: { res: 2048, mult: 2, capClassic: 250000, capNatural: 90000 },
  };
  function deviceCap() {
    try {
      const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
      if (mem <= 4 || cores <= 2) return 'balanced';
    } catch { /* unknown device: no cap */ }
    return null;
  }
  const NB = { cv: null, W: 0, H: 0, field: false, custom: false };
  let lastProg = 0;

  // Likeness 0-100: mean per-channel distance between painting and source
  // at 48px. Cheap enough to run once per finished job.
  function likeness() {
    try {
      const tw = 48, th = Math.max(1, Math.round((tw * S.H) / S.W));
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(srcC, 0, 0, tw, th);
      const d1 = g.getImageData(0, 0, tw, th).data;
      g.drawImage(paintCanvas, 0, 0, tw, th);
      const d2 = g.getImageData(0, 0, tw, th).data;
      let sum = 0;
      const n = tw * th;
      for (let i = 0; i < d1.length; i += 4) {
        sum += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
      }
      return Math.max(0, Math.round(100 * (1 - sum / n / 3 / 255)));
    } catch {
      return 0;
    }
  }

  function emit(skipped) {
    const now = performance.now();
    if (!skipped && now - lastProg < 250) return;
    lastProg = now;
    if (hooks.onProgress) {
      const done = S.drawn >= S.strokes.length && S.strokes.length > 0;
      hooks.onProgress({
        drawn: S.drawn, total: S.strokes.length, playing: S.playing,
        secs: done ? (performance.now() - S.t0) / 1000 : 0,
        like: done ? likeness() : 0,
      });
    }
  }

  function jobSetup(seed) {
    S.backend = cfg.backend === 'natural' && NB_AVAIL ? 'natural' : 'classic';
    if (S.backend === 'natural') {
      try {
        nbSetup(S.W, S.H, seed || 1);
      } catch {
        S.backend = 'classic';
      }
    }
    if (hooks.onBackend) hooks.onBackend(S.backend);
  }

  function nbSetup(W, H, seed) {
    if (!(NB.cv && NB.W === W && NB.H === H)) {
      if (NB.cv && NB.cv.remove) NB.cv.remove();
      NB.cv = brush.createCanvas(W, H, { parent: hideDiv });
      NB.W = W; NB.H = H;
    }
    if (!brushScaled) { brush.scaleBrushes(Math.max(2, W / 220)); brushScaled = true; }
    if (!NB.custom) {
      brush.add('oilflat', { type: 'marker', weight: 2.2, scatter: 0.25, opacity: 120, spacing: 0.08, pressure: [1.1, 0.9], rotate: 'natural', markerTip: false, noise: 0.25 });
      brush.add('drybrush', { type: 'default', weight: 0.5, scatter: 1.2, sharpness: 0.75, grain: 2.5, opacity: 90, spacing: 0.12, pressure: [0.7, 1.2, 0.7], rotate: 'natural', noise: 0.5 });
      brush.add('washsoft', { type: 'spray', weight: 1.4, scatter: 3.2, opacity: 26, spacing: 0.9, pressure: [1, 0.8], rotate: 'random', markerTip: false, noise: 0.4 });
      brush.add('pencilfine', { type: 'default', weight: 0.22, scatter: 0.35, sharpness: 0.35, grain: 9, opacity: 150, spacing: 0.08, pressure: [0.6, 1.3, 0.6], rotate: 'none', noise: 0.3 });
      brush.add('leafstamp', {
        type: 'custom', weight: 1.8, scatter: 0.5, opacity: 110, spacing: 0.55,
        pressure: [0.7, 1.3, 0.7], rotate: 'random', markerTip: false, noise: 0.35,
        tip: (_m) => {
          _m.noStroke(); _m.fill(30);
          _m.push(); _m.rotate(0.6); _m.ellipse(0, -6, 44, 20); _m.pop();
          _m.rect(-2, 2, 4, 26);
        },
      });
      NB.custom = true;
    }
    brush.seed(seed);
    if (!NB.field) {
      brush.addField('photo', (t, field) => {
        const cols = field.length, rows = field[0].length;
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          const u = cols > 1 ? c / (cols - 1) : 0.5, v = rows > 1 ? r / (rows - 1) : 0.5;
          field[c][r] = sampleOrientRad(u * S.W, v * S.H);
        }
        return field;
      }, { angleMode: 'radians' });
      NB.field = true;
    }
  }

  function sampleOrientRad(px, py) {
    if (!S.orient) return Math.PI / 4;
    const gx = Math.min(S.ow - 1, Math.max(0, Math.round((px / S.W) * (S.ow - 1))));
    const gy = Math.min(S.oh - 1, Math.max(0, Math.round((py / S.H) * (S.oh - 1))));
    return S.orient[gy * S.ow + gx];
  }

  function frameStart() {
    if (S.backend !== 'natural' || !NB.cv) return;
    brush.push();
    brush.translate(-S.W / 2, -S.H / 2);
    brush.field('photo');
    try { brush.refreshField(0); } catch { /* keep painting */ }
  }
  function frameEnd() {
    if (S.backend !== 'natural' || !NB.cv) return;
    brush.pop();
    brush.render();
    lctx.drawImage(NB.cv, 0, 0, S.W, S.H);
  }
  // Display = paper/wash base + transparent stroke layer. The app keeps its
  // white/paper look; only the layer (no background) is what PNG exports.
  function composite() {
    pctx.save();
    pctx.globalAlpha = 1; pctx.globalCompositeOperation = 'source-over'; pctx.filter = 'none';
    pctx.drawImage(baseC, 0, 0, S.W, S.H);
    pctx.drawImage(layerC, 0, 0, S.W, S.H);
    pctx.restore();
  }
  function paintStroke(s) {
    if (S.backend === 'natural' && NB.cv) nbStroke(s);
    else drawStroke(s);
  }
  function nbStroke(s) {
    if (S.styleCur === 'mosaic' || S.styleCur === 'pixel') {
      // Fast flat tiles: wash() is one solid pass, while fill() runs a
      // ~20-layer watercolor simulation per shape — that was the slowdown.
      brush.noStroke();
      brush.noFill();
      brush.noHatch();
      brush.wash(`rgb(${s.r | 0},${s.g | 0},${s.b | 0})`, 255);
      brush.rect(s.x - s.w / 2, s.y - s.w / 2, s.w, s.w, 'corner');
      brush.noWash();
      return;
    }
    if (S.styleCur === 'sculpt') {
      // Mass pass + offset light pass: the only style that draws twice.
      const c = s.exact ? [s.r, s.g, s.b] : jitterCol(s.r, s.g, s.b, s.j);
      const wt = Math.min(3.5, Math.max(0.5, (s.w * 1.3) / 9));
      brush.set('charcoal', `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`, wt);
      brush.flowLine(s.x, s.y, s.len, s.a);
      const nx = -Math.sin(s.a), ny = Math.cos(s.a), off = s.w * 0.3;
      brush.set('HB', 'rgb(255,255,255)', Math.max(0.3, wt * 0.4));
      brush.flowLine(s.x + nx * off, s.y + ny * off, s.len * 0.9, s.a);
      return;
    }
    const table = NB_BRUSH[S.styleCur] || NB_BRUSH.impasto;
    let rr = s.r, gg = s.g, bb = s.b;
    if (S.styleCur === 'sketch') {
      const lum = Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb);
      rr = gg = bb = lum;
    }
    const c = s.exact ? [s.r, s.g, s.b] : jitterCol(rr, gg, bb, s.j);
    brush.set(table[Math.min(s.pi || 0, 4)], `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`, Math.min(3, Math.max(0.35, s.w / 9)));
    brush.flowLine(s.x, s.y, s.len, s.a);
  }

  function avgCss() {
    if (!S.avg) return '#808080';
    return `rgb(${S.avg[0] | 0},${S.avg[1] | 0},${S.avg[2] | 0})`;
  }

  function underpainting() {
    const stc = cfg.style;
    S.styleCur = stc;
    S.grained = false;
    bctx.save();
    bctx.globalAlpha = 1; bctx.globalCompositeOperation = 'source-over'; bctx.filter = 'none';
    bctx.fillStyle = PAPER; bctx.fillRect(0, 0, S.W, S.H);
    bctx.restore();
    if (S.backend === 'natural' && NB.cv) {
      brush.clear(PAPER);
      brush.push();
      brush.translate(-S.W / 2, -S.H / 2);
      if (stc === 'watercolor') {
        brush.wash(avgCss(), 110);
        brush.rect(0, 0, S.W, S.H, 'corner');
        brush.noWash();
      } else if (stc === 'sketch') {
        brush.noStroke();
        brush.noFill();
        brush.hatchStyle('pencilfine', '#8a8a8a', 0.7);
        brush.hatch(7, 0.6, { rand: 0.15 });
        brush.rect(0, 0, S.W, S.H, 'corner');
        brush.hatch(7, 0.6 + Math.PI / 2, { rand: 0.15 });
        brush.rect(0, 0, S.W, S.H, 'corner');
        brush.noHatch();
      } else if (S.avg && stc !== 'sketch' && stc !== 'charcoal') {
        brush.wash(avgCss(), 55);
        brush.rect(0, 0, S.W, S.H, 'corner');
        brush.noWash();
      }
      brush.pop();
      brush.render();
      bctx.drawImage(NB.cv, 0, 0, S.W, S.H);
    } else {
      bctx.save();
      bctx.globalAlpha = 0.36;
      bctx.filter = `blur(${Math.max(8, S.W / 40)}px) saturate(1.2)`;
      bctx.drawImage(srcC, 0, 0, S.W, S.H);
      bctx.restore();
      bctx.filter = 'none'; bctx.globalAlpha = 1;
    }
    applyGrain(false);
    lctx.clearRect(0, 0, S.W, S.H);
    composite();
  }

  async function computeFields() {
    // WASM layout caps the thumb at 256x256 — scale the long edge to fit.
    const sc = 256 / Math.max(S.W, S.H);
    const tw = Math.max(8, Math.round(S.W * sc)), th = Math.max(8, Math.round(S.H * sc));
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(srcC, 0, 0, tw, th);
    const d = x.getImageData(0, 0, tw, th).data, n = tw * th;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    let mag, dir;
    S.wasmUsed = false;
    const WF = await wfInit();
    if (WF) {
      try {
        new Float32Array(WF.mem.buffer, WF_OFF.gray, n).set(gray);
        WF.field(tw, th);
        mag = new Float32Array(WF.mem.buffer, WF_OFF.mag, n).slice();
        dir = new Uint8Array(WF.mem.buffer, WF_OFF.dir, n).slice();
        S.wasmUsed = true;
      } catch {
        ({ mag, dir } = jsField(gray, tw, th));
      }
    } else {
      ({ mag, dir } = jsField(gray, tw, th));
    }
    const ang = new Float32Array(n);
    for (let i = 0; i < n; i++) ang[i] = dir[i] < 8 ? (dir[i] * Math.PI) / 4 : 0;
    const s = new Float32Array(n), def = new Uint8Array(n);
    for (let y = 0; y < th; y++) for (let xx = 0; xx < tw; xx++) {
      let sx = 0, sy = 0, nn = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const X = Math.min(tw - 1, Math.max(0, xx + i)), Y = Math.min(th - 1, Math.max(0, y + j));
        const k = Y * tw + X;
        if (dir[k] >= 8) continue;
        const a = ang[k] * 2;
        sx += Math.cos(a); sy += Math.sin(a); nn++;
      }
      if (nn) { s[y * tw + xx] = Math.atan2(sy / nn, sx / nn) / 2; def[y * tw + xx] = 1; }
    }
    for (let y = 0; y < th; y++) for (let xx = 0; xx < tw; xx++) {
      const k = y * tw + xx;
      if (def[k]) continue;
      let sx = 0, sy = 0, nn = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const X = Math.min(tw - 1, Math.max(0, xx + i)), Y = Math.min(th - 1, Math.max(0, y + j));
        const k2 = Y * tw + X;
        if (!def[k2]) continue;
        const a = s[k2] * 2;
        sx += Math.cos(a); sy += Math.sin(a); nn++;
      }
      s[k] = nn ? Math.atan2(sy / nn, sx / nn) / 2 : Math.random() * Math.PI;
    }
    let mx = 0;
    for (let i = 0; i < n; i++) if (mag[i] > mx) mx = mag[i];
    const magN = new Float32Array(n);
    for (let i = 0; i < n; i++) magN[i] = mx > 0 ? Math.min(1, mag[i] / mx) : 0;
    const detail = new Float32Array(n);
    for (let y = 0; y < th; y++) for (let xx = 0; xx < tw; xx++) {
      let s2 = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++)
        s2 += gray[Math.min(th - 1, Math.max(0, y + j)) * tw + Math.min(tw - 1, Math.max(0, xx + i))];
      detail[y * tw + xx] = Math.min(1, magN[y * tw + xx] * 1.2 + Math.abs(gray[y * tw + xx] - s2 / 9) * 2);
    }
    S.orient = s; S.ow = tw; S.oh = th; S.magN = magN; S.detail = detail;
  }

  function sampleAngle(px, py) {
    if (!S.orient) return Math.random() * Math.PI;
    const gx = Math.min(S.ow - 1, Math.max(0, Math.round((px / S.W) * (S.ow - 1))));
    const gy = Math.min(S.oh - 1, Math.max(0, Math.round((py / S.H) * (S.oh - 1))));
    if (S.magN && S.magN[gy * S.ow + gx] < 0.02) return Math.random() * Math.PI;
    return S.orient[gy * S.ow + gx];
  }

  function averageColor() {
    try {
      const d = sctx.getImageData(0, 0, S.W, S.H).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return n ? [r / n, g / n, b / n] : null;
    } catch {
      return null;
    }
  }

  async function buildStrokes() {
    await computeFields();
    const full = sctx.getImageData(0, 0, S.W, S.H), px = full.data;
    const colAt = (x, y) => {
      x = Math.min(S.W - 1, Math.max(0, x | 0)); y = Math.min(S.H - 1, Math.max(0, y | 0));
      const i = (y * S.W + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const fx = STYLE_FX[cfg.style] || { w: 1, a: 1 };
    S.styleCur = cfg.style;
    const base = S.W / 42;
    const passes = [
      { w: 1.15, a: 0.95, jitter: 14 }, { w: 0.62, a: 0.92, jitter: 10 },
      { w: 0.34, a: 0.9, jitter: 7 }, { w: 0.18, a: 0.95, jitter: 5 },
    ];
    const use = passes.slice(0, Math.min(passes.length, cfg.detail + 1));
    if (cfg.detail === 5) use.push({ w: 0.1, a: 0.95, jitter: 4 });
    const dmult = [0.35, 0.6, 0.85, 1.15, 1.5][cfg.detail - 1] || 1;
    const qm = (QUALITY[cfg.quality] || QUALITY.balanced).mult;
    const caps = (S.backend === 'natural'
      ? [2500, 4000, 5000, 6000, 4000]
      : [5000, 9000, 12000, 14000, 10000]
    ).map((c) => Math.round(c * dmult * qm * (fx.c || 1)));
    const list = [], tw = S.ow, th = S.oh;
    const ST = S.styleCur, gridStyle = ST === 'mosaic' || ST === 'pixel';
    const grid = gridStyle ? Math.max(5, Math.round(S.W / 180)) : 0;
    const seen = gridStyle ? new Set() : null;
    const totalCells = gridStyle ? Math.ceil(S.W / grid) * Math.ceil(S.H / grid) : 0;
    const cellOf = (x, y) => Math.min(th - 1, Math.max(0, Math.round((y / S.H) * (th - 1)))) * tw
      + Math.min(tw - 1, Math.max(0, Math.round((x / S.W) * (tw - 1))));
    if (ST === 'flow') {
      // Streamlines, not dabs: seed on structure, draw long field-following lines.
      const target = Math.max(800, Math.round(caps.reduce((a, b) => a + b, 0) / 8));
      const scale = S.W / 1024;
      let guard = 0;
      while (list.length < target && guard < target * 20) {
        guard++;
        const cu = (Math.random() * tw) | 0, cvv = (Math.random() * th) | 0, kk = cvv * tw + cu;
        if (S.magN[kk] < 0.05) continue;
        if (Math.random() > 0.12 + 0.88 * S.detail[kk]) continue;
        const jx = ((cu + 0.15 + Math.random() * 0.7) / tw) * S.W;
        const jy = ((cvv + 0.15 + Math.random() * 0.7) / th) * S.H;
        const c0 = colAt(jx, jy), cc = styleColor(c0[0], c0[1], c0[2], ST);
        list.push({
          x: jx, y: jy, r: cc[0], g: cc[1], b: cc[2], pi: 3,
          a: sampleAngle(jx, jy), len: (120 + Math.random() * 260) * scale,
          w: (1.5 + Math.random() * 2.5) * Math.max(0.75, scale),
          al: 0.85, j: 4,
        });
      }
    } else {
    for (let pi = 0; pi < use.length; pi++) {
      if (gridStyle && seen.size >= totalCells) break;
      const p = use[pi], cap = caps[Math.min(pi, 4)];
      const bw = Math.max(1.5, base * p.w * fx.w);
      const arr = [];
      let guard = 0;
      while (arr.length < cap && guard < cap * 14) {
        guard++;
        let jx, jy, kk;
        if (gridStyle) {
          const gx = (Math.random() * S.W / grid) | 0, gy = (Math.random() * S.H / grid) | 0;
          const key = gx + ',' + gy;
          if (seen.has(key)) continue;
          jx = (gx + 0.5) * grid; jy = (gy + 0.5) * grid;
          if (jx > S.W || jy > S.H) continue;
          kk = cellOf(jx, jy);
          if (Math.random() > 0.12 + 0.88 * S.detail[kk]) continue;
          seen.add(key);
        } else {
          const cu = (Math.random() * tw) | 0, cvv = (Math.random() * th) | 0;
          kk = cvv * tw + cu;
          if (Math.random() > 0.12 + 0.88 * S.detail[kk]) continue;
          jx = ((cu + 0.15 + Math.random() * 0.7) / tw) * S.W;
          jy = ((cvv + 0.15 + Math.random() * 0.7) / th) * S.H;
        }
        const c0 = colAt(jx, jy), cc = styleColor(c0[0], c0[1], c0[2], ST);
        const mg = S.magN[kk], coh = 1 - Math.min(1, mg * 1.5);
        const ww = gridStyle ? grid * (ST === 'pixel' ? 0.96 : 1.3)
          : bw * (0.7 + Math.random() * 0.7) * (0.75 + 0.5 * coh);
        const ll = gridStyle ? ww : bw * (2.2 + Math.random() * 2.4) * (0.7 + 0.9 * coh);
        arr.push({
          x: jx, y: jy, r: cc[0], g: cc[1], b: cc[2], pi,
          a: gridStyle ? 0 : ST === 'stamp' ? Math.random() * Math.PI : sampleAngle(jx, jy) + (Math.random() - 0.5) * 0.6,
          len: ll, w: ww,
          al: Math.min(1, p.a * fx.a), j: p.jitter,
        });
      }
      for (let k = 0; k < arr.length; k += 8192) list.push.apply(list, arr.slice(k, k + 8192));
    }
    }
    // Coverage sweep at high targets: one small exact stroke per grid cell
    // so no region ends up unpainted (stratified, not luck-based).
    if (cfg.target >= 82 && ST !== 'flow') {
      const gs = Math.max(6, S.W / 160), covCap = Math.round(6000 * qm);
      let added = 0;
      for (let gy = gs / 2; gy < S.H && added < covCap; gy += gs) {
        for (let gx = gs / 2; gx < S.W && added < covCap; gx += gs) {
          if (Math.random() < 0.35) continue;
          const jx = gx + (Math.random() - 0.5) * gs * 0.5;
          const jy = gy + (Math.random() - 0.5) * gs * 0.5;
          const c0 = colAt(jx, jy);
          list.push({
            x: jx, y: jy, r: c0[0], g: c0[1], b: c0[2], pi: 4,
            a: sampleAngle(jx, jy), len: gs * 1.2, w: gs * 0.9,
            al: 1, j: 0, exact: true,
          });
          added++;
        }
      }
    }
    // Preflight safety: thin uniformly past the device/budget cap so weak
    // machines degrade gracefully instead of freezing.
    let note = '';
    const q = QUALITY[cfg.quality] || QUALITY.balanced;
    let hard = S.backend === 'natural' ? q.capNatural : q.capClassic;
    const dc = deviceCap();
    if (dc) {
      const dq = QUALITY[dc];
      const dcap = S.backend === 'natural' ? dq.capNatural : dq.capClassic;
      if (dcap < hard) { hard = dcap; note = ` · auto: ${dc} device cap`; }
    }
    if (list.length > hard) {
      const keep = [];
      const stride = list.length / hard;
      for (let i = 0; i < hard; i++) keep.push(list[(i * stride) | 0]);
      list.length = 0;
      for (let k = 0; k < keep.length; k += 8192) list.push.apply(list, keep.slice(k, k + 8192));
      note += ` · trimmed to ${hard.toLocaleString()}`;
    }
    S.strokes = list; S.drawn = 0; S.t0 = performance.now();
  S.refRounds = 0; S.refLast = 0; S.lastLike = 0;
    if (hooks.onPlan) {
      hooks.onPlan(`${list.length.toLocaleString()} strokes · ${cfg.quality}${S.backend === 'natural' ? ' · p5.brush' : ' · classic'}${S.wasmUsed ? ' · wasm' : ' · js'}${note}`);
    }
    emit(true);
  }

  function jitterCol(r, g, b, j) {
    const l = (Math.random() - 0.5) * 2 * j;
    return [
      Math.min(255, Math.max(0, r + l + (Math.random() - 0.5) * j)),
      Math.min(255, Math.max(0, g + l + (Math.random() - 0.5) * j)),
      Math.min(255, Math.max(0, b + l)),
    ];
  }

  function strokeToSVG(s, st, f) {
    if (st === 'inkwash') st = 'knife';
    let rr = s.r, gg = s.g, bb = s.b;
    if (st === 'sketch') {
      const lum = Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb);
      rr = gg = bb = lum;
    }
    const col = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
    const deg = ((s.a * 180) / Math.PI).toFixed(1);
    if (st === 'flow') {
      let pts = `${f(s.x)},${f(s.y)}`, fx = s.x, fy = s.y;
      const steps = Math.min(40, Math.max(8, (s.len / 8) | 0)), dh = s.len / steps;
      for (let k = 0; k < steps; k++) {
        const fa = sampleAngle(fx, fy);
        fx += Math.cos(fa) * dh; fy += Math.sin(fa) * dh;
        pts += ` ${f(fx)},${f(fy)}`;
      }
      return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-opacity="${(s.al * 0.9).toFixed(3)}" stroke-width="${f(Math.max(0.6, s.w))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (st === 'sculpt') {
      const L = s.len, Wd = s.w * 1.15;
      const li = Math.cos(s.a - Math.PI * 0.75), hi = Math.abs(li), side = li >= 0 ? -1 : 1;
      const edge = Math.max(1, Wd * 0.3);
      let o = `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${deg})"><rect x="${f(-L / 2 + 1.5)}" y="${f(-Wd / 2 + 2)}" width="${f(L)}" height="${f(Wd)}" fill="#000000" fill-opacity="${(0.25 * s.al).toFixed(3)}"/><rect x="${f(-L / 2)}" y="${f(-Wd / 2)}" width="${f(L)}" height="${f(Wd)}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/>`;
      o += `<rect x="${f(-L / 2)}" y="${f(side < 0 ? -Wd / 2 : Wd / 2 - edge)}" width="${f(L)}" height="${f(edge)}" fill="#ffffff" fill-opacity="${(0.05 + 0.25 * hi).toFixed(3)}"/>`;
      o += `<rect x="${f(-L / 2)}" y="${f(side < 0 ? Wd / 2 - edge : -Wd / 2)}" width="${f(L)}" height="${f(edge)}" fill="#000000" fill-opacity="${(0.05 + 0.22 * hi).toFixed(3)}"/></g>`;
      return o;
    }
    if (st === 'dagger') {
      const dx = Math.cos(s.a), dy = Math.sin(s.a), nx = -dy, ny = dx;
      const L = s.len, w0 = s.w, w1 = Math.max(0.4, s.w * 0.15);
      const tx = s.x - dx * L / 2, ty = s.y - dy * L / 2;
      const hx = s.x + dx * L / 2, hy = s.y + dy * L / 2;
      return `<polygon points="${f(tx + nx * w0 / 2)},${f(ty + ny * w0 / 2)} ${f(hx + nx * w1 / 2)},${f(hy + ny * w1 / 2)} ${f(hx - nx * w1 / 2)},${f(hy - ny * w1 / 2)} ${f(tx - nx * w0 / 2)},${f(ty - ny * w0 / 2)}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/>`;
    }
    if (st === 'stamp') {
      return `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${deg})"><ellipse cx="0" cy="${f(-s.w * 0.2)}" rx="${f(s.len * 0.42)}" ry="${f(s.w * 0.5)}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/><line x1="0" y1="${f(s.w * 0.2)}" x2="0" y2="${f(s.w * 0.2 + s.len * 0.35)}" stroke="${col}" stroke-opacity="${(s.al * 0.8).toFixed(3)}" stroke-width="${f(Math.max(1, s.w * 0.12))}"/></g>`;
    }
    if (st === 'mosaic' || st === 'pixel') {
      return `<rect x="${f(s.x - s.w / 2)}" y="${f(s.y - s.w / 2)}" width="${f(s.w)}" height="${f(s.w)}" fill="${col}"/>`;
    }
    if (st === 'pointillism') {
      return `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(Math.max(0.8, s.w * 0.5))}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/>`;
    }
    if (st === 'watercolor' || st === 'pastel' || st === 'charcoal') {
      const k = st === 'pastel' ? 0.5 : st === 'charcoal' ? 0.45 : 0.32;
      return `<ellipse cx="${f(s.x)}" cy="${f(s.y)}" rx="${f(s.len * 0.7)}" ry="${f(s.w * 0.9)}" transform="rotate(${deg} ${f(s.x)} ${f(s.y)})" fill="${col}" fill-opacity="${(s.al * k).toFixed(3)}"/>`;
    }
    if (st === 'acrylic') {
      const L = s.len * 0.7, Wd = s.w;
      return `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${deg})"><rect x="${f(-L / 2)}" y="${f(-Wd / 2)}" width="${f(L)}" height="${f(Wd)}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/><rect x="${f(-L / 2)}" y="${f(Wd / 2 - Math.max(1, Wd * 0.2))}" width="${f(L)}" height="${f(Math.max(1, Wd * 0.2))}" fill="rgb(${Math.max(0, (rr | 0) * 0.65 | 0)},${Math.max(0, (gg | 0) * 0.65 | 0)},${Math.max(0, (bb | 0) * 0.65 | 0)})" fill-opacity="${(s.al * 0.85).toFixed(3)}"/></g>`;
    }
    if (st === 'knife' || st === 'impasto') {
      const L = st === 'knife' ? s.len * 0.8 : s.len, Wd = s.w * (st === 'knife' ? 1.25 : 1);
      let o = `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${deg})"><rect x="${f(-L / 2)}" y="${f(-Wd / 2)}" width="${f(L)}" height="${f(Wd)}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/>`;
      if (st === 'impasto') {
        o += `<rect x="${f(-L / 2)}" y="${f(-Wd / 2)}" width="${f(L)}" height="${f(Math.max(1, Wd * 0.25))}" fill="#ffffff" fill-opacity="${(0.18 * s.al).toFixed(3)}"/>`;
      }
      return o + '</g>';
    }
    if (st === 'impressionist') {
      const L = Math.min(s.len, s.w * 2.2);
      return `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${deg})"><rect x="${f(-L / 2)}" y="${f(-s.w * 0.4)}" width="${f(L)}" height="${f(s.w * 0.8)}" fill="${col}" fill-opacity="${s.al.toFixed(3)}"/><rect x="${f(-L * 0.1)}" y="${f(-s.w * 0.15)}" width="${f(L * 0.2)}" height="${f(s.w * 0.3)}" fill="rgb(${Math.min(255, (rr | 0) + 24)},${Math.min(255, (gg | 0) + 24)},${Math.min(255, (bb | 0) + 24)})" fill-opacity="${(s.al * 0.8).toFixed(3)}"/></g>`;
    }
    return `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${deg})"><rect x="${f(-s.len / 2)}" y="${f(-s.w / 2)}" width="${f(s.len)}" height="${f(s.w)}" rx="${f(s.w * 0.3)}" fill="${col}" fill-opacity="1"/></g>`;
  }

  function drawStroke(s) {
    const pctx = lctx; // classic strokes accumulate on the transparent layer.
    let st = S.styleCur || 'impasto';
    let rr = s.r, gg = s.g, bb = s.b, jj = s.j;
    if (st === 'sketch') {
      const lum = Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb);
      rr = gg = bb = lum; jj *= 0.6; st = 'gouache';
    }
    if (st === 'inkwash') st = 'knife';
    const c = s.exact ? [s.r, s.g, s.b] : jitterCol(rr, gg, bb, jj);
    const R = c[0] | 0, G2 = c[1] | 0, B = c[2] | 0;
    if (st === 'flow') {
      pctx.strokeStyle = `rgba(${R},${G2},${B},${(s.al * 0.9).toFixed(3)})`;
      pctx.lineWidth = Math.max(0.6, s.w);
      pctx.lineCap = 'round'; pctx.lineJoin = 'round';
      pctx.beginPath(); pctx.moveTo(s.x, s.y);
      let fx = s.x, fy = s.y;
      const steps = Math.min(40, Math.max(8, (s.len / 8) | 0)), dh = s.len / steps;
      for (let k = 0; k < steps; k++) {
        const fa = sampleAngle(fx, fy);
        fx += Math.cos(fa) * dh; fy += Math.sin(fa) * dh;
        pctx.lineTo(fx, fy);
      }
      pctx.stroke();
      return;
    }
    if (st === 'sculpt') {
      const L = s.len, Wd = s.w * 1.15;
      const li = Math.cos(s.a - Math.PI * 0.75), hi = Math.abs(li), side = li >= 0 ? -1 : 1;
      pctx.save(); pctx.translate(s.x, s.y); pctx.rotate(s.a);
      pctx.fillStyle = `rgba(0,0,0,${(0.25 * s.al).toFixed(3)})`;
      pctx.fillRect(-L / 2 + 1.5, -Wd / 2 + 2, L, Wd);
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      pctx.fillStyle = `rgba(255,255,255,${(0.05 + 0.25 * hi).toFixed(3)})`;
      if (side < 0) pctx.fillRect(-L / 2, -Wd / 2, L, Math.max(1, Wd * 0.3));
      else pctx.fillRect(-L / 2, Wd / 2 - Math.max(1, Wd * 0.3), L, Math.max(1, Wd * 0.3));
      pctx.fillStyle = `rgba(0,0,0,${(0.05 + 0.22 * hi).toFixed(3)})`;
      if (side < 0) pctx.fillRect(-L / 2, Wd / 2 - Math.max(1, Wd * 0.3), L, Math.max(1, Wd * 0.3));
      else pctx.fillRect(-L / 2, -Wd / 2, L, Math.max(1, Wd * 0.3));
      pctx.restore();
      return;
    }
    if (st === 'dagger') {
      const dx = Math.cos(s.a), dy = Math.sin(s.a), nx = -dy, ny = dx;
      const L = s.len, w0 = s.w, w1 = Math.max(0.4, s.w * 0.15);
      const tx = s.x - dx * L / 2, ty = s.y - dy * L / 2;
      const hx = s.x + dx * L / 2, hy = s.y + dy * L / 2;
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.beginPath();
      pctx.moveTo(tx + nx * w0 / 2, ty + ny * w0 / 2);
      pctx.lineTo(hx + nx * w1 / 2, hy + ny * w1 / 2);
      pctx.lineTo(hx - nx * w1 / 2, hy - ny * w1 / 2);
      pctx.lineTo(tx - nx * w0 / 2, ty - ny * w0 / 2);
      pctx.closePath(); pctx.fill();
      return;
    }
    if (st === 'stamp') {
      pctx.save(); pctx.translate(s.x, s.y); pctx.rotate(s.a);
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.beginPath(); pctx.ellipse(0, -s.w * 0.2, s.len * 0.42, s.w * 0.5, 0, 0, 7); pctx.fill();
      pctx.strokeStyle = `rgba(${R},${G2},${B},${(s.al * 0.8).toFixed(3)})`;
      pctx.lineWidth = Math.max(1, s.w * 0.12);
      pctx.beginPath(); pctx.moveTo(0, s.w * 0.2); pctx.lineTo(0, s.w * 0.2 + s.len * 0.35); pctx.stroke();
      pctx.restore();
      return;
    }
    if (st === 'mosaic' || st === 'pixel') {
      pctx.fillStyle = `rgba(${R},${G2},${B},1)`;
      pctx.fillRect(s.x - s.w / 2, s.y - s.w / 2, s.w, s.w);
      return;
    }
    if (st === 'pointillism') {
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.beginPath(); pctx.arc(s.x, s.y, Math.max(0.8, s.w * 0.5), 0, 7); pctx.fill();
      return;
    }
    if (st === 'watercolor' || st === 'pastel' || st === 'charcoal') {
      const k = st === 'pastel' ? 0.5 : st === 'charcoal' ? 0.45 : 0.32, k2 = k * 0.625;
      pctx.fillStyle = `rgba(${R},${G2},${B},${(s.al * k).toFixed(3)})`;
      pctx.beginPath(); pctx.ellipse(s.x, s.y, s.len * 0.7, s.w * 0.9, s.a, 0, 7); pctx.fill();
      pctx.fillStyle = `rgba(${R},${G2},${B},${(s.al * k2).toFixed(3)})`;
      pctx.beginPath();
      pctx.ellipse(s.x + Math.cos(s.a) * s.len * 0.3, s.y + Math.sin(s.a) * s.len * 0.3, s.len * 0.4, s.w * 0.6, s.a, 0, 7);
      pctx.fill();
      return;
    }
    if (st === 'acrylic') {
      const L = s.len * 0.7, Wd = s.w;
      pctx.save(); pctx.translate(s.x, s.y); pctx.rotate(s.a);
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      pctx.fillStyle = `rgba(${R * 0.65 | 0},${G2 * 0.65 | 0},${B * 0.65 | 0},${(s.al * 0.85).toFixed(3)})`;
      pctx.fillRect(-L / 2, Wd / 2 - Math.max(1, Wd * 0.2), L, Math.max(1, Wd * 0.2));
      pctx.restore();
      return;
    }
    if (st === 'knife' || st === 'impasto') {
      const L = st === 'knife' ? s.len * 0.8 : s.len, Wd = s.w * (st === 'knife' ? 1.25 : 1);
      pctx.save(); pctx.translate(s.x, s.y); pctx.rotate(s.a);
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      if (st === 'impasto') {
        pctx.fillStyle = `rgba(255,255,255,${(0.18 * s.al).toFixed(3)})`;
        pctx.fillRect(-L / 2, -Wd / 2, L, Math.max(1, Wd * 0.25));
      }
      pctx.restore();
      return;
    }
    if (st === 'impressionist') {
      const L = Math.min(s.len, s.w * 2.2);
      pctx.save(); pctx.translate(s.x, s.y); pctx.rotate(s.a);
      pctx.fillStyle = `rgba(${R},${G2},${B},${s.al.toFixed(3)})`;
      pctx.fillRect(-L / 2, -s.w * 0.4, L, s.w * 0.8);
      pctx.fillStyle = `rgba(${Math.min(255, R + 24)},${Math.min(255, G2 + 24)},${Math.min(255, B + 24)},${(s.al * 0.8).toFixed(3)})`;
      pctx.fillRect(-L * 0.1, -s.w * 0.15, L * 0.2, s.w * 0.3);
      pctx.restore();
      return;
    }
    pctx.save(); pctx.translate(s.x, s.y); pctx.rotate(s.a);
    pctx.fillStyle = `rgba(${R},${G2},${B},1)`;
    pctx.beginPath();
    if (pctx.roundRect) pctx.roundRect(-s.len / 2, -s.w / 2, s.len, s.w, s.w * 0.3);
    else pctx.rect(-s.len / 2, -s.w / 2, s.len, s.w);
    pctx.fill(); pctx.restore();
  }

  let grainTile = null;
  function applyGrain(light) {
    if (!GRAIN || S.grained) return;
    // Grain lives in the base (under the strokes): it textures the paper on
    // screen but can never fill the transparent export layer with noise film.
    S.grained = true;
    if (!grainTile) {
      grainTile = document.createElement('canvas');
      grainTile.width = grainTile.height = 128;
      const gx = grainTile.getContext('2d');
      const id = gx.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 28;
      }
      gx.putImageData(id, 0, 0);
    }
    bctx.save();
    bctx.globalAlpha = light ? GRAIN * 0.5 : GRAIN;
    bctx.globalCompositeOperation = 'overlay';
    bctx.fillStyle = bctx.createPattern(grainTile, 'repeat');
    bctx.fillRect(0, 0, S.W, S.H);
    bctx.restore();
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'source-over';
  }

  // Closed-loop refinement: find worst cells, glaze them with exact colors.
  function errorCells(topK) {
    const tw = 96, th = Math.max(8, Math.round((96 * S.H) / S.W));
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(srcC, 0, 0, tw, th);
    const d1 = g.getImageData(0, 0, tw, th).data;
    g.drawImage(paintCanvas, 0, 0, tw, th);
    const d2 = g.getImageData(0, 0, tw, th).data;
    const n = tw * th, err = new Float32Array(n), idx = new Array(n);
    for (let i = 0; i < n; i++) {
      err[i] = Math.abs(d1[i * 4] - d2[i * 4]) + Math.abs(d1[i * 4 + 1] - d2[i * 4 + 1]) + Math.abs(d1[i * 4 + 2] - d2[i * 4 + 2]);
      idx[i] = i;
    }
    idx.sort((a, b) => err[b] - err[a]);
    const occ = new Uint8Array(n), out = [];
    for (const k of idx) {
      if (out.length >= topK) break;
      if (occ[k]) continue;
      out.push(k);
      const cx = k % tw, cy = (k / tw) | 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const X = cx + i, Y = cy + j;
        if (X >= 0 && X < tw && Y >= 0 && Y < th) occ[Y * tw + X] = 1;
      }
    }
    return { cells: out, tw, th };
  }

  function addGlazeStrokes() {
    const { cells, tw, th } = errorCells(4000);
    if (!cells.length) return 0;
    const full = sctx.getImageData(0, 0, S.W, S.H).data;
    const gz = Math.max(2, (S.W / 42) * 0.18);
    for (const k of cells) {
      const cx = k % tw, cy = (k / tw) | 0;
      const jx = Math.min(S.W - 1, (((cx + 0.5) / tw) * S.W) + (Math.random() - 0.5) * gz);
      const jy = Math.min(S.H - 1, (((cy + 0.5) / th) * S.H) + (Math.random() - 0.5) * gz);
      const xi = Math.max(0, jx | 0), yi = Math.max(0, jy | 0);
      const o = (yi * S.W + xi) * 4;
      S.strokes.push({
        x: jx, y: jy, r: full[o], g: full[o + 1], b: full[o + 2], pi: 4,
        a: sampleAngle(jx, jy), len: gz * 1.6, w: gz * (0.8 + Math.random() * 0.4),
        al: 1, j: 0, exact: true,
      });
    }
    return cells.length;
  }

  // Refinement glaze: DISABLED for all finishes. The end-of-job rounds
  // sampled raw photo pixels and stamped them with exact:true, bypassing
  // each finish's color grading — blue strokes over sketch, mud over ink
  // wash. The main pass is final now; likeness stays as an info readout.
  // (addGlazeStrokes/errorCells kept dormant below for a possible return.)
  function checkRefine() {
    return false;
  }

  function loop() {
    if (!S.playing) return;
    const batch = cfg.speed;
    const n = Math.min(batch, S.strokes.length - S.drawn);
    frameStart();
    for (let i = 0; i < n; i++) paintStroke(S.strokes[S.drawn++]);
    frameEnd();
    composite();
    if (S.drawn % 3000 < batch) applyGrain(true);
    emit(false);
    if (S.drawn >= S.strokes.length) {
      if (checkRefine()) {
        emit(true);
        S.raf = requestAnimationFrame(loop);
        return;
      }
      S.playing = false;
      applyGrain(false);
      emit(true);
      cancelAnimationFrame(S.raf);
      return;
    }
    S.raf = requestAnimationFrame(loop);
  }

  function stopLoop() { S.playing = false; cancelAnimationFrame(S.raf); }
  function startPaint() { stopLoop(); S.playing = true; loop(); }

  return {
    cfg,
    get playing() { return S.playing; },
    get hasJob() { return S.strokes.length > 0; },
    get done() { return S.strokes.length > 0 && S.drawn >= S.strokes.length; },
    async loadImage(img) {
      const q = QUALITY[cfg.quality] || QUALITY.balanced;
      const [w, h] = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, q.res);
      S.img = img; S.W = w; S.H = h;
      paintCanvas.width = w; paintCanvas.height = h;
      layerC.width = w; layerC.height = h;
      baseC.width = w; baseC.height = h;
      srcC.width = w; srcC.height = h;
      sctx.drawImage(img, 0, 0, w, h);
      S.avg = averageColor();
      jobSetup((Math.random() * 1e9) | 0);
      underpainting();
      await buildStrokes();
      startPaint();
      return { w, h };
    },
    pause() { stopLoop(); emit(true); },
    resume() {
      if (!S.strokes.length || S.drawn >= S.strokes.length) return;
      S.playing = true; loop();
    },
    async restart() {
      if (!S.img) return;
      stopLoop();
      underpainting();
      await buildStrokes();
      startPaint();
    },
    finish() {
      stopLoop();
      frameStart();
      while (S.drawn < S.strokes.length) paintStroke(S.strokes[S.drawn++]);
      frameEnd();
      composite();
      applyGrain(false);
      S.lastLike = likeness();
      emit(true);
    },
    // Lower target = stops earlier = faster; higher = more glaze rounds = slower.
    // (Glaze rounds are currently disabled, so the target is display-only.)
    setTarget(v) {
      cfg.target = Math.min(98, Math.max(50, Math.round(v)));
      if (S.strokes.length && S.drawn >= S.strokes.length && !S.playing && (S.lastLike || 0) < cfg.target) {
        if (checkRefine()) { S.playing = true; loop(); }
      }
      return cfg.target;
    },
    exportPNG(name = 'hand-painted.png') {
      // Strokes only: unpainted areas stay transparent. The app's paper look
      // lives in the display composite, not in this layer.
      if (!S.drawn) return false;
      layerC.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
      return true;
    },
    exportSVG(name = 'hand-painted.svg') {
      // True vector render of the stroke plan (what classic paints; the
      // natural backend adds bristle texture on top of the same plan).
      // Exports strokes painted so far, so mid-paint snapshots work too.
      if (!S.drawn) return false;
      const st = S.styleCur || 'impasto';
      const f = (n) => Math.round(n * 10) / 10;
      const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${S.W}" height="${S.H}" viewBox="0 0 ${S.W} ${S.H}">`,
      ];
      if (st !== 'sketch' && S.avg) {
        parts.push(`<rect width="${S.W}" height="${S.H}" fill="rgb(${S.avg[0] | 0},${S.avg[1] | 0},${S.avg[2] | 0})" fill-opacity="0.3"/>`);
      }
      for (let i = 0; i < S.drawn; i++) parts.push(strokeToSVG(S.strokes[i], st, f));
      parts.push('</svg>');
      const blob = new Blob([parts.join('')], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return true;
    },
    destroy() {
      stopLoop();
      if (NB.cv && NB.cv.remove) NB.cv.remove();
      NB.cv = null;
      if (hideDiv.remove) hideDiv.remove();
    },
    boot() {
      paintCanvas.width = 1024; paintCanvas.height = 768;
      layerC.width = 1024; layerC.height = 768;
      baseC.width = 1024; baseC.height = 768;
      pctx.fillStyle = PAPER;
      pctx.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
      pctx.fillStyle = '#5a6a7d';
      pctx.font = '600 26px "Segoe UI", Tahoma, sans-serif';
      pctx.textAlign = 'center';
      pctx.fillText('Welcome to Hand Paint', 512, 360);
      pctx.font = '13px "Segoe UI", Tahoma, sans-serif';
      pctx.fillStyle = '#7a8ba0';
      pctx.fillText('Drop a photo — it will be hand-painted here', 512, 386);
    },
  };
}
