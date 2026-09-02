/*
 * viz.js — codec · lab.corentinbel.com
 *
 * Pure canvas painting. No audio, no DSP, no state beyond what's passed in.
 * Every painter is fn(canvas, data, opts): draws one frame synchronously and
 * returns. Never calls requestAnimationFrame — the page owns the loop.
 * Plain ES5, one global: var VIZ.
 */
var VIZ = (function () {
  'use strict';

  var COLORS = {
    bg: '#07080c', panel: '#0d1014', fg: '#e8e6df', dim: '#8a8fa3',
    accent: '#6ea8ff', purple: '#b48ce8', teal: '#38a3a5', teal2: '#8ceedd',
    amber: '#ffd27a', red: '#ff8f7a', border: '#232b3a', radius: '14px'
  };

  var FONT_UI = 'ui-sans-serif, system-ui, sans-serif';
  var FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  // ---------------------------------------------------------------- utils

  function clampInt(v, lo, hi) {
    v = v | 0;
    if (v < lo) v = lo;
    if (v > hi) v = hi;
    return v;
  }

  function clampNum(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function clearBg(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawLabel(ctx, text, x, y) {
    if (!text) return;
    ctx.font = '11px ' + FONT_UI;
    ctx.fillStyle = 'rgba(138,143,163,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    var num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function lerpRgbStr(c0, c1, t) {
    var a = hexToRgb(c0), b = hexToRgb(c1);
    var r = Math.round(a[0] + (b[0] - a[0]) * t);
    var g = Math.round(a[1] + (b[1] - a[1]) * t);
    var bb = Math.round(a[2] + (b[2] - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bb + ')';
  }

  function lerpColor3(c0, c1, c2, t) {
    t = clampNum(t, 0, 1);
    return t < 0.5 ? lerpRgbStr(c0, c1, t * 2) : lerpRgbStr(c1, c2, (t - 0.5) * 2);
  }

  // min/max envelope per pixel column — keeps waveform/spectrum drawing
  // O(n) instead of O(n * w) on long arrays.
  function minMaxEnvelope(x, t0, t1, cols) {
    var mins = new Float32Array(cols);
    var maxs = new Float32Array(cols);
    var n = t1 - t0;
    if (n <= 0) return { mins: mins, maxs: maxs };
    for (var c = 0; c < cols; c++) {
      var i0 = t0 + Math.floor(c * n / cols);
      var i1 = t0 + Math.floor((c + 1) * n / cols);
      if (i1 <= i0) i1 = i0 + 1;
      if (i1 > t1) i1 = t1;
      var mn = Infinity, mx = -Infinity;
      for (var i = i0; i < i1; i++) {
        var v = x[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mn === Infinity) { mn = 0; mx = 0; }
      mins[c] = mn; maxs[c] = mx;
    }
    return { mins: mins, maxs: maxs };
  }

  function drawWaveTrace(ctx, x, t0, t1, w, midY, amp, color, dots, alpha) {
    var n = t1 - t0;
    if (n < 1) return;
    var samplesPerPx = n / Math.max(1, w);

    if (dots && samplesPerPx < 3) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var px = n > 1 ? w * i / (n - 1) : w / 2;
        var py = midY - x[t0 + i] * amp;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      for (var j = 0; j < n; j++) {
        var pxj = n > 1 ? w * j / (n - 1) : w / 2;
        var pyj = midY - x[t0 + j] * amp;
        ctx.beginPath();
        ctx.arc(pxj, pyj, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    var cols = Math.max(1, Math.floor(w));
    var env = minMaxEnvelope(x, t0, t1, cols);

    ctx.beginPath();
    for (var c1 = 0; c1 < cols; c1++) {
      var yTop = midY - env.maxs[c1] * amp;
      if (c1 === 0) ctx.moveTo(c1, yTop); else ctx.lineTo(c1, yTop);
    }
    for (var c2 = cols - 1; c2 >= 0; c2--) {
      var yBot = midY - env.mins[c2] * amp;
      ctx.lineTo(c2, yBot);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c3 = 0; c3 < cols; c3++) {
      var ym = midY - ((env.mins[c3] + env.maxs[c3]) / 2) * amp;
      if (c3 === 0) ctx.moveTo(c3, ym); else ctx.lineTo(c3, ym);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function interpAt(freqs, arr, hz) {
    var n = freqs.length;
    if (n === 0) return 0;
    if (hz <= freqs[0]) return arr[0];
    if (hz >= freqs[n - 1]) return arr[n - 1];
    for (var i = 1; i < n; i++) {
      if (freqs[i] >= hz) {
        var f0 = freqs[i - 1], f1 = freqs[i], v0 = arr[i - 1], v1 = arr[i];
        var t = (hz - f0) / ((f1 - f0) || 1);
        return v0 + (v1 - v0) * t;
      }
    }
    return arr[n - 1];
  }

  function niceDbStep(range) {
    var target = range / 5;
    var steps = [5, 10, 20, 25, 50, 100, 200];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] >= target) return steps[i];
    }
    return steps[steps.length - 1];
  }

  var HZ_CANDIDATES = [20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000,
    1500, 2000, 3000, 5000, 7000, 10000, 15000, 20000];

  // Linear-interpolated percentile of a PRE-SORTED array. Used to derive a
  // robust plot range that ignores a few extreme outlier bins (e.g. the
  // steep ATH rise above ~18kHz) instead of the raw min/max.
  function percentileSorted(sorted, p) {
    if (!sorted.length) return 0;
    var idx = p * (sorted.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    var t = idx - lo;
    return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
  }

  // viridis-ish LUT, tuned to the house palette (dark -> purple -> blue ->
  // teal -> amber). Built once, reused by the spectrogram.
  var _viridisLut = null;
  function viridisLUT() {
    if (_viridisLut) return _viridisLut;
    var stops = [
      [0.00, [7, 8, 12]],
      [0.12, [20, 20, 48]],
      [0.30, [40, 46, 118]],
      [0.48, [58, 96, 190]],
      [0.62, [56, 163, 165]],
      [0.78, [140, 238, 221]],
      [0.90, [255, 210, 122]],
      [1.00, [255, 244, 214]]
    ];
    var lut = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var t = i / 255;
      var s0 = stops[0], s1 = stops[stops.length - 1];
      for (var k = 0; k < stops.length - 1; k++) {
        if (t >= stops[k][0] && t <= stops[k + 1][0]) { s0 = stops[k]; s1 = stops[k + 1]; break; }
      }
      var span = (s1[0] - s0[0]) || 1;
      var lt = (t - s0[0]) / span;
      lut[i * 3] = Math.round(s0[1][0] + (s1[1][0] - s0[1][0]) * lt);
      lut[i * 3 + 1] = Math.round(s0[1][1] + (s1[1][1] - s0[1][1]) * lt);
      lut[i * 3 + 2] = Math.round(s0[1][2] + (s1[1][2] - s0[1][2]) * lt);
    }
    _viridisLut = lut;
    return lut;
  }

  // Frequency ticks along the Y axis of a spectrogram (X is time). The
  // image is drawn edge-to-edge with no reserved margin, so labels are
  // overlaid directly on it with a small dark backing chip for legibility.
  function spectrogramFreqAxis(ctx, w, h, fMin, fMax, logY) {
    if (!(fMax > fMin) || h < 20) return;
    var ticks = [];
    for (var i = 0; i < HZ_CANDIDATES.length; i++) {
      var hz = HZ_CANDIDATES[i];
      if (hz >= fMin && hz <= fMax) ticks.push(hz);
    }
    if (!ticks.length) ticks = [fMin, fMax];

    var lo = logY ? Math.log10(fMin) : fMin;
    var hi = logY ? Math.log10(fMax) : fMax;
    var minGap = 16, lastY = -1e9, kept = [];
    // high frequency is near the top (small y) — walk top to bottom.
    for (var j = ticks.length - 1; j >= 0; j--) {
      var hz2 = ticks[j];
      var t = logY ? (Math.log10(hz2) - lo) / ((hi - lo) || 1) : (hz2 - lo) / ((hi - lo) || 1);
      var y = (h - 1) * (1 - t);
      if (Math.abs(y - lastY) >= minGap) { kept.push({ hz: hz2, y: y }); lastY = y; }
    }

    ctx.font = '10px ' + FONT_MONO;
    ctx.textAlign = 'left';
    for (var k = 0; k < kept.length; k++) {
      var tk = kept[k];
      var yy = clampNum(tk.y, 8, h - 4);
      var lbl = tk.hz >= 1000 ? (tk.hz / 1000) + 'k' : String(tk.hz);
      var tw = (ctx.measureText ? ctx.measureText(lbl).width : lbl.length * 6);
      ctx.fillStyle = 'rgba(5,6,9,0.6)';
      ctx.fillRect(2, yy - 9, tw + 8, 13);
      ctx.fillStyle = 'rgba(232,230,223,0.8)';
      ctx.fillText(lbl, 5, yy + 1);
    }
    ctx.textAlign = 'left';
  }

  // ---------------------------------------------------------------- VIZ

  var VIZ_ = {};
  VIZ_.colors = COLORS;

  VIZ_.fit = function (canvas) {
    if (!canvas) return { ctx: null, w: 0, h: 0, dpr: 1 };
    var cw = Math.round(canvas.clientWidth || 0);
    var ch = Math.round(canvas.clientHeight || 0);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ctx = canvas.getContext('2d');
    if (cw <= 0 || ch <= 0) {
      return { ctx: ctx, w: 0, h: 0, dpr: dpr };
    }
    var pw = Math.max(1, Math.round(cw * dpr));
    var ph = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cw, h: ch, dpr: dpr };
  };

  // dB gridlines + labels along the left edge of a plot rect.
  VIZ_.axisDb = function (ctx, x, y, w, h, yMin, yMax) {
    if (yMax <= yMin) return;
    var step = niceDbStep(yMax - yMin);
    var first = Math.ceil(yMin / step) * step;
    ctx.font = '10px ' + FONT_MONO;
    ctx.textAlign = 'right';
    for (var v = first; v <= yMax; v += step) {
      var yy = y + h * (1 - (v - yMin) / (yMax - yMin));
      ctx.strokeStyle = 'rgba(138,143,163,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      ctx.fillStyle = 'rgba(138,143,163,0.7)';
      ctx.fillText(String(Math.round(v)), x - 4, yy + 3);
    }
    ctx.textAlign = 'left';
  };

  // Hz gridlines + labels along the bottom edge of a plot rect.
  VIZ_.axisHz = function (ctx, x, y, w, h, fMin, fMax, logX) {
    if (fMax <= fMin) return;
    var ticks = [];
    for (var i = 0; i < HZ_CANDIDATES.length; i++) {
      var hz = HZ_CANDIDATES[i];
      if (hz >= fMin && hz <= fMax) ticks.push(hz);
    }
    if (!ticks.length) ticks = [fMin, fMax];

    var minGap = 42, lastX = -1e9, kept = [];
    var lo = logX ? Math.log10(fMin) : fMin;
    var hi = logX ? Math.log10(fMax) : fMax;
    for (var j = 0; j < ticks.length; j++) {
      var hz2 = ticks[j];
      var t = logX ? (Math.log10(hz2) - lo) / ((hi - lo) || 1) : (hz2 - lo) / ((hi - lo) || 1);
      var xx = x + w * t;
      if (xx - lastX >= minGap) { kept.push({ hz: hz2, x: xx }); lastX = xx; }
    }
    ctx.font = '10px ' + FONT_MONO;
    ctx.textAlign = 'center';
    for (var k = 0; k < kept.length; k++) {
      var tk = kept[k];
      ctx.strokeStyle = 'rgba(138,143,163,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tk.x, y); ctx.lineTo(tk.x, y + h); ctx.stroke();
      ctx.fillStyle = 'rgba(138,143,163,0.7)';
      var lbl = tk.hz >= 1000 ? (tk.hz / 1000) + 'k' : String(tk.hz);
      ctx.fillText(lbl, tk.x, y + h + 13);
    }
    ctx.textAlign = 'left';
  };

  // ----------------------------------------------------------- waveform

  VIZ_.waveform = function (cv, x, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!x || !x.length) { if (opts.label) drawLabel(ctx, opts.label, 8, 14); return; }

    var t0 = opts.t0 != null ? opts.t0 : 0;
    var t1 = opts.t1 != null ? opts.t1 : x.length;
    t0 = clampInt(t0, 0, x.length);
    t1 = clampInt(t1, 0, x.length);
    if (t1 - t0 < 1) t1 = Math.min(x.length, t0 + 1);
    if (t1 - t0 < 1) return;

    var padY = 4;
    var midY = h / 2;
    var amp = Math.max(1, (h / 2 - padY) * 0.92);

    if (opts.zeroLine !== false) {
      ctx.strokeStyle = 'rgba(138,143,163,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
    }

    drawWaveTrace(ctx, x, t0, t1, w, midY, amp, opts.color || COLORS.teal2, !!opts.dots, 0.9);

    if (opts.overlay && opts.overlay.length) {
      var ot1 = Math.min(t1, opts.overlay.length);
      if (ot1 - t0 > 0) drawWaveTrace(ctx, opts.overlay, t0, ot1, w, midY, amp, COLORS.amber, false, 0.8);
    }

    if (opts.label) drawLabel(ctx, opts.label, 8, 14);
  };

  // ----------------------------------------------------------- staircase

  VIZ_.staircase = function (cv, x, y, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!x || !x.length || !y || !y.length) { if (opts.label) drawLabel(ctx, opts.label, 8, 14); return; }

    var maxLen = Math.min(x.length, y.length);
    var t0 = opts.t0 != null ? opts.t0 : 0;
    var t1 = opts.t1 != null ? opts.t1 : maxLen;
    t0 = clampInt(t0, 0, maxLen);
    t1 = clampInt(t1, 0, maxLen);
    if (t1 - t0 < 2) t1 = Math.min(maxLen, t0 + 2);
    if (t1 - t0 < 2) return;
    var n = t1 - t0;

    var padY = 6;
    var midY = h / 2;
    var amp = Math.max(1, (h / 2 - padY) * 0.9);
    function yOf(v) { return midY - v * amp; }
    function xOf(i) { return w * i / (n - 1); }

    if (opts.levels && opts.levels > 1 && opts.levels <= 64) {
      ctx.strokeStyle = 'rgba(138,143,163,0.10)';
      ctx.lineWidth = 1;
      for (var li = 0; li <= opts.levels; li++) {
        var lv = -1 + 2 * li / opts.levels;
        var ly = yOf(lv);
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(138,143,163,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yOf(0)); ctx.lineTo(w, yOf(0)); ctx.stroke();

    // error shading between original and quantized
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var yy = yOf(y[t0 + i]);
      if (i === 0) ctx.moveTo(xOf(i), yy); else ctx.lineTo(xOf(i), yy);
    }
    for (var i2 = n - 1; i2 >= 0; i2--) {
      ctx.lineTo(xOf(i2), yOf(x[t0 + i2]));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,143,122,0.16)';
    ctx.fill();

    // original, faint smooth line
    ctx.strokeStyle = 'rgba(232,230,223,0.4)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (var j = 0; j < n; j++) {
      var yj = yOf(x[t0 + j]);
      if (j === 0) ctx.moveTo(xOf(j), yj); else ctx.lineTo(xOf(j), yj);
    }
    ctx.stroke();

    // quantized, step function
    ctx.strokeStyle = COLORS.teal2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var k = 0; k < n; k++) {
      var yk = yOf(y[t0 + k]);
      var xk = xOf(k);
      var xk2 = k < n - 1 ? xOf(k + 1) : w;
      if (k === 0) ctx.moveTo(xk, yk); else ctx.lineTo(xk, yk);
      ctx.lineTo(xk2, yk);
    }
    ctx.stroke();

    if (opts.label) drawLabel(ctx, opts.label, 8, 14);
  };

  // ------------------------------------------------------------ spectrum

  VIZ_.spectrum = function (cv, magDb, freqs, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!magDb || !freqs || !magDb.length || !freqs.length) {
      if (opts.label) drawLabel(ctx, opts.label, 8, 14);
      return;
    }

    // Default the dB window to the data itself — real (unnormalised) STFT
    // magnitude in dB is not guaranteed to sit under 0. opts.yMin/opts.yMax
    // always win when given.
    var dataMaxDb = -Infinity;
    for (var dmi = 0; dmi < magDb.length; dmi++) {
      var dmv = magDb[dmi];
      if (dmv != null && isFinite(dmv) && dmv > dataMaxDb) dataMaxDb = dmv;
    }
    if (!isFinite(dataMaxDb)) dataMaxDb = 0;
    var yMax = opts.yMax != null ? opts.yMax : dataMaxDb + 3;
    var yMin = opts.yMin != null ? opts.yMin : yMax - 100;
    if (yMax <= yMin) yMax = yMin + 1;
    var logX = opts.logX !== false;
    var fMin = 20;
    var fMax = freqs[freqs.length - 1];
    if (!(fMax > fMin)) fMax = fMin * 1000;

    var padL = 30, padR = 6, padT = 4, padB = 15;
    var plotX = padL, plotY = padT;
    var plotW = Math.max(1, w - padL - padR);
    var plotH = Math.max(1, h - padT - padB);

    function xOf(hz) {
      hz = clampNum(hz, fMin, fMax);
      if (logX) {
        var lo = Math.log10(fMin), hi = Math.log10(fMax);
        return plotX + plotW * (Math.log10(hz) - lo) / ((hi - lo) || 1);
      }
      return plotX + plotW * (hz - fMin) / ((fMax - fMin) || 1);
    }
    function yOf(db) {
      db = clampNum(db, yMin, yMax);
      return plotY + plotH * (1 - (db - yMin) / (yMax - yMin));
    }

    VIZ_.axisDb(ctx, plotX, plotY, plotW, plotH, yMin, yMax);
    VIZ_.axisHz(ctx, plotX, plotY, plotW, plotH, fMin, fMax, logX);

    var n = Math.min(magDb.length, freqs.length);
    var cols = Math.max(1, Math.floor(plotW));
    var colMag = new Float32Array(cols);
    var colHas = new Uint8Array(cols);
    var haveKept = !!opts.kept;
    var colKept = haveKept ? new Uint8Array(cols) : null;
    var colDiscard = haveKept ? new Float32Array(cols) : null;
    for (var ci = 0; ci < cols; ci++) { colMag[ci] = yMin; if (colDiscard) colDiscard[ci] = yMin; }

    for (var i = 0; i < n; i++) {
      var hz = freqs[i];
      if (hz < fMin) continue;
      var xc = xOf(hz) - plotX;
      var c = clampInt(Math.floor(xc), 0, cols - 1);
      colHas[c] = 1;
      var v = magDb[i];
      var isKept = haveKept ? !!opts.kept[i] : true;
      if (isKept) {
        if (v > colMag[c]) colMag[c] = v;
        if (colKept) colKept[c] = 1;
      } else if (colDiscard && v > colDiscard[c]) {
        colDiscard[c] = v;
      }
    }

    // masking threshold — dashed purple curve, "inaudible" region shaded
    if (opts.threshDb && opts.threshDb.length === freqs.length) {
      ctx.beginPath();
      ctx.moveTo(xOf(freqs[0]), yOf(yMin));
      for (var i2 = 0; i2 < freqs.length; i2++) ctx.lineTo(xOf(freqs[i2]), yOf(opts.threshDb[i2]));
      ctx.lineTo(xOf(freqs[freqs.length - 1]), yOf(yMin));
      ctx.closePath();
      ctx.fillStyle = 'rgba(180,140,232,0.14)';
      ctx.fill();

      ctx.beginPath();
      for (var i3 = 0; i3 < freqs.length; i3++) {
        var xb = xOf(freqs[i3]), yb = yOf(opts.threshDb[i3]);
        if (i3 === 0) ctx.moveTo(xb, yb); else ctx.lineTo(xb, yb);
      }
      ctx.strokeStyle = COLORS.purple;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // absolute threshold of hearing — thin reference line
    if (opts.athDb && opts.athDb.length === freqs.length) {
      ctx.beginPath();
      for (var i4 = 0; i4 < freqs.length; i4++) {
        var xa = xOf(freqs[i4]), ya = yOf(opts.athDb[i4]);
        if (i4 === 0) ctx.moveTo(xa, ya); else ctx.lineTo(xa, ya);
      }
      ctx.strokeStyle = 'rgba(232,230,223,0.32)';
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (haveKept) {
      // discarded bins first, dim, behind kept
      ctx.strokeStyle = COLORS.dim;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (var c1 = 0; c1 < cols; c1++) {
        if (!colHas[c1] || colKept[c1]) continue;
        var yv1 = yOf(colDiscard[c1]);
        ctx.beginPath();
        ctx.moveTo(plotX + c1 + 0.5, yOf(yMin));
        ctx.lineTo(plotX + c1 + 0.5, yv1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.teal2;
      for (var c2 = 0; c2 < cols; c2++) {
        if (!colHas[c2] || !colKept[c2]) continue;
        var yv2 = yOf(colMag[c2]);
        ctx.beginPath();
        ctx.moveTo(plotX + c2 + 0.5, yOf(yMin));
        ctx.lineTo(plotX + c2 + 0.5, yv2);
        ctx.stroke();
      }
    } else {
      var color = opts.color || COLORS.teal2;
      var started = false, lastC = -1, firstC = -1;
      ctx.beginPath();
      for (var c3 = 0; c3 < cols; c3++) {
        if (!colHas[c3]) continue;
        var xx = plotX + c3 + 0.5, yy = yOf(colMag[c3]);
        if (!started) { ctx.moveTo(xx, yy); started = true; firstC = c3; } else ctx.lineTo(xx, yy);
        lastC = c3;
      }
      if (started) {
        ctx.lineTo(plotX + lastC + 0.5, yOf(yMin));
        ctx.lineTo(plotX + firstC + 0.5, yOf(yMin));
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        var started2 = false;
        for (var c4 = 0; c4 < cols; c4++) {
          if (!colHas[c4]) continue;
          var xx2 = plotX + c4 + 0.5, yy2 = yOf(colMag[c4]);
          if (!started2) { ctx.moveTo(xx2, yy2); started2 = true; } else ctx.lineTo(xx2, yy2);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    if (opts.marker && opts.marker.hz != null && opts.marker.db != null) {
      var mx = xOf(opts.marker.hz), my = yOf(opts.marker.db);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.stroke();
      if (opts.marker.label) {
        // sits on a tall peak by default (my is high up / small) — flip
        // below the point instead of overlapping the peak.
        var mLabelY = my - 12;
        if (mLabelY < plotY + 10) mLabelY = my + 16;
        ctx.font = '10px ' + FONT_UI;
        ctx.textAlign = 'center';
        // dark backing chip — the peak/fill under a marker is often bright,
        // so plain text can sit right on top of it unreadably.
        var mtw = ctx.measureText ? ctx.measureText(opts.marker.label).width : opts.marker.label.length * 6;
        ctx.fillStyle = 'rgba(5,6,9,0.7)';
        ctx.fillRect(mx - mtw / 2 - 4, mLabelY - 10, mtw + 8, 13);
        ctx.fillStyle = COLORS.accent;
        ctx.fillText(opts.marker.label, mx, mLabelY);
        ctx.textAlign = 'left';
      }
    }

    // clear of the axisDb tick column on the left
    if (opts.label) drawLabel(ctx, opts.label, plotX + 6, plotY + 12);
  };

  // ---------------------------------------------------------- spectrogram

  VIZ_.spectrogram = function (cv, framesMagDb, sr, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!framesMagDb || !framesMagDb.length) return;

    var nFrames = framesMagDb.length;
    var nBins = 0;
    // single pass: bin count + global max, so the colour window can default
    // to the data itself (real, unnormalised STFT dB routinely peaks well
    // above 0 dB — a hardcoded -100..0 window clips almost everything).
    var dataMaxDb = -Infinity;
    for (var fi = 0; fi < nFrames; fi++) {
      var fr = framesMagDb[fi];
      if (!fr) continue;
      if (fr.length > nBins) nBins = fr.length;
      for (var bi = 0; bi < fr.length; bi++) {
        var bv = fr[bi];
        if (bv != null && isFinite(bv) && bv > dataMaxDb) dataMaxDb = bv;
      }
    }
    if (nBins < 2) return;
    if (!isFinite(dataMaxDb)) dataMaxDb = 0;

    sr = sr > 0 ? sr : 44100;
    var fMaxNy = sr / 2;
    var fMax = opts.maxHz ? Math.min(opts.maxHz, fMaxNy) : fMaxNy;
    var fMin = 20;
    if (fMax <= fMin) fMax = fMin * 2;
    var logY = opts.logY !== false;
    var yMax = opts.dbMax != null ? opts.dbMax : dataMaxDb;
    var yMin = opts.dbMin != null ? opts.dbMin : yMax - 80;
    if (yMax <= yMin) yMax = yMin + 1;

    var W = cv.width, H = cv.height;
    if (W <= 0 || H <= 0) return;

    var frameIdxAt = new Int32Array(W);
    for (var x = 0; x < W; x++) {
      var idx = Math.floor(x / W * nFrames);
      if (idx >= nFrames) idx = nFrames - 1;
      frameIdxAt[x] = idx;
    }
    var binAt = new Int32Array(H);
    for (var y = 0; y < H; y++) {
      var t = H > 1 ? (H - 1 - y) / (H - 1) : 0;
      var hz = logY ? fMin * Math.pow(fMax / fMin, t) : fMin + t * (fMax - fMin);
      hz = clampNum(hz, fMin, fMax);
      var binF = hz / fMaxNy * (nBins - 1);
      binAt[y] = clampInt(Math.round(binF), 0, nBins - 1);
    }

    var img = ctx.createImageData(W, H);
    var data = img.data;
    var lut = viridisLUT();

    for (var yy = 0; yy < H; yy++) {
      var bin = binAt[yy];
      var rowBase = yy * W * 4;
      for (var xx = 0; xx < W; xx++) {
        var frame = framesMagDb[frameIdxAt[xx]];
        var v = (frame && bin < frame.length) ? frame[bin] : yMin;
        if (v < yMin) v = yMin; else if (v > yMax) v = yMax;
        var norm = (v - yMin) / (yMax - yMin);
        var li = (norm * 255) | 0;
        var o3 = li * 3;
        var o4 = rowBase + xx * 4;
        data[o4] = lut[o3]; data[o4 + 1] = lut[o3 + 1]; data[o4 + 2] = lut[o3 + 2]; data[o4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    if (opts.playhead != null && opts.playhead >= 0 && opts.playhead <= 1) {
      var px = opts.playhead * w;
      ctx.strokeStyle = 'rgba(232,230,223,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }

    // X is time, Y is frequency — label the Y axis only (overlaid on the
    // image, with a dark backing chip, since the image is drawn edge to
    // edge with no reserved axis margin). No hop/duration is passed in, so
    // the X axis is intentionally left unlabeled rather than mislabeled.
    spectrogramFreqAxis(ctx, w, h, fMin, fMax, logY);
  };

  // ----------------------------------------------------------- bandBits

  VIZ_.bandBits = function (cv, bandBits, bandFreqs, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!bandBits || !bandBits.length) { if (opts.label) drawLabel(ctx, opts.label, 8, 14); return; }

    var n = bandBits.length;
    var maxV = 0;
    for (var i = 0; i < n; i++) if (bandBits[i] > maxV) maxV = bandBits[i];
    if (maxV <= 0) maxV = 1;

    var padB = 20, padT = 8, padSide = 6;
    var plotH = h - padB - padT;
    var gap = Math.max(1, w / n * 0.12);
    var barW = Math.max(1, (w - 2 * padSide) / n - gap);

    for (var i2 = 0; i2 < n; i2++) {
      var v = bandBits[i2];
      var bh = plotH * clampNum(v / maxV, 0, 1);
      var bx = padSide + i2 * (barW + gap);
      var by = padT + plotH - bh;
      ctx.fillStyle = lerpColor3(COLORS.dim, COLORS.teal2, COLORS.amber, v / maxV);
      ctx.fillRect(bx, by, barW, Math.max(0.5, bh));
    }

    ctx.strokeStyle = 'rgba(138,143,163,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padSide, padT + plotH); ctx.lineTo(w - padSide, padT + plotH); ctx.stroke();

    ctx.font = '9px ' + FONT_MONO;
    ctx.fillStyle = 'rgba(138,143,163,0.7)';
    ctx.textAlign = 'center';
    var labelEvery = Math.max(1, Math.ceil(n / 8));
    for (var i3 = 0; i3 < n; i3 += labelEvery) {
      var xf = padSide + i3 * (barW + gap) + barW / 2;
      var khz = (bandFreqs && bandFreqs[i3] != null) ? bandFreqs[i3] / 1000 : 0;
      ctx.fillText(khz < 1 ? khz.toFixed(2) : khz.toFixed(1), xf, h - 6);
    }
    ctx.textAlign = 'left';

    if (opts.label) drawLabel(ctx, opts.label, 8, 14);
  };

  // -------------------------------------------------------- bitrateScale

  VIZ_.bitrateScale = function (cv, items, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!items || !items.length) return;

    var n = items.length;
    var rowH = h / n;
    var maxKbps = 0, minKbps = Infinity;
    for (var i = 0; i < n; i++) {
      var k = items[i].kbps || 0;
      if (k > maxKbps) maxKbps = k;
      if (k > 0 && k < minKbps) minKbps = k;
    }
    if (maxKbps <= 0) maxKbps = 1;
    if (!isFinite(minKbps)) minKbps = 1;

    var logScale = opts.log !== false;
    var logMin = Math.log10(Math.max(minKbps, 0.5));
    var logMax = Math.log10(maxKbps);
    if (logMax <= logMin) logMax = logMin + 1;

    var labelW = Math.min(120, w * 0.3);
    var valueW = 60;
    var barAreaX = labelW + 10;
    var barAreaW = Math.max(10, w - labelW - valueW - 18);

    if (logScale) {
      var loD = Math.ceil(logMin), hiD = Math.floor(logMax);
      ctx.strokeStyle = 'rgba(138,143,163,0.08)';
      ctx.lineWidth = 1;
      for (var d = loD; d <= hiD; d++) {
        var fracD = (d - logMin) / ((logMax - logMin) || 1);
        var gx = barAreaX + barAreaW * fracD;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
    }

    for (var j = 0; j < n; j++) {
      var it = items[j];
      var cy = j * rowH + rowH / 2;
      var barH = Math.min(16, rowH * 0.5);
      var frac = logScale
        ? (Math.log10(Math.max(it.kbps, 0.5)) - logMin) / (logMax - logMin)
        : it.kbps / maxKbps;
      frac = clampNum(frac, 0.01, 1);
      var bw = barAreaW * frac;

      ctx.font = '11px ' + FONT_UI;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(138,143,163,0.85)';
      ctx.fillText(it.label || '', labelW, cy + 4);

      var color = it.color || COLORS.teal2;
      ctx.fillStyle = color;
      roundRectPath(ctx, barAreaX, cy - barH / 2, bw, barH, barH / 2);
      ctx.fill();

      ctx.font = '10px ' + FONT_MONO;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.fg;
      var kbps = it.kbps;
      var kbpsLabel = kbps >= 1000 ? kbps.toFixed(0) : (kbps < 10 ? kbps.toFixed(1) : kbps.toFixed(0));
      ctx.fillText(kbpsLabel + ' kbps', barAreaX + bw + 8, cy + 4);
    }
    ctx.textAlign = 'left';
  };

  // ------------------------------------------------------------------ vq

  VIZ_.vq = function (cv, points, centroids, assign, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!points || !points.length) return;
    centroids = centroids || [];

    // opts.range = {x0,x1,y0,y1}: use this extent verbatim instead of
    // auto-fitting to the data — needed so a row of panels (e.g. RVQ
    // stages) shares one scale and a shrinking cloud is visible as
    // shrinking, not re-normalized to fill the panel every time. Absent,
    // behaviour is exactly the previous auto-fit.
    var r = opts.range;
    var fixedRange = !!(r && isFinite(r.x0) && isFinite(r.x1) && isFinite(r.y0) && isFinite(r.y1) &&
      r.x1 > r.x0 && r.y1 > r.y0);

    var minA, maxA, minB, maxB;
    if (fixedRange) {
      minA = r.x0; maxA = r.x1; minB = r.y0; maxB = r.y1;
    } else {
      minA = Infinity; maxA = -Infinity; minB = Infinity; maxB = -Infinity;
      var consider = function (p) {
        if (!p) return;
        if (p[0] < minA) minA = p[0];
        if (p[0] > maxA) maxA = p[0];
        if (p[1] < minB) minB = p[1];
        if (p[1] > maxB) maxB = p[1];
      };
      for (var i = 0; i < points.length; i++) consider(points[i]);
      for (var i2 = 0; i2 < centroids.length; i2++) consider(centroids[i2]);
      if (!isFinite(minA)) { minA = -1; maxA = 1; }
      if (!isFinite(minB)) { minB = -1; maxB = 1; }
      if (maxA - minA < 1e-9) { minA -= 1; maxA += 1; }
      if (maxB - minB < 1e-9) { minB -= 1; maxB += 1; }
    }

    var pad = 22;
    function xOf(a) { return pad + (w - 2 * pad) * (a - minA) / (maxA - minA); }
    function yOf(b) { return h - pad - (h - 2 * pad) * (b - minB) / (maxB - minB); }

    // clip everything data-driven to the plot rect so points outside a
    // fixed range are cut off cleanly instead of drawn over the axes/title.
    if (fixedRange) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, pad, Math.max(0, w - 2 * pad), Math.max(0, h - 2 * pad));
      ctx.clip();

      // the origin becomes a meaningful reference once the extent is
      // fixed — a faint crosshair so a shrinking cloud reads as collapsing
      // toward a point, not just getting smaller.
      var ox = xOf(0), oy = yOf(0);
      ctx.strokeStyle = 'rgba(138,143,163,0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pad, oy); ctx.lineTo(w - pad, oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, pad); ctx.lineTo(ox, h - pad); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(138,143,163,0.45)';
      ctx.beginPath(); ctx.arc(ox, oy, 2, 0, Math.PI * 2); ctx.fill();
    }

    var palette = [COLORS.teal2, COLORS.accent, COLORS.purple, COLORS.amber, COLORS.red, COLORS.teal];
    function colorFor(idx) {
      if (idx == null || idx < 0) return COLORS.dim;
      if (idx < palette.length) return palette[idx];
      var hue = (idx * 47) % 360;
      return 'hsl(' + hue + ',65%,65%)';
    }

    if (opts.showLines && centroids.length && assign) {
      ctx.strokeStyle = 'rgba(138,143,163,0.18)';
      ctx.lineWidth = 1;
      for (var i3 = 0; i3 < points.length; i3++) {
        var ci = assign[i3];
        if (ci == null || ci < 0 || ci >= centroids.length || !points[i3] || !centroids[ci]) continue;
        ctx.beginPath();
        ctx.moveTo(xOf(points[i3][0]), yOf(points[i3][1]));
        ctx.lineTo(xOf(centroids[ci][0]), yOf(centroids[ci][1]));
        ctx.stroke();
      }
    }

    for (var i4 = 0; i4 < points.length; i4++) {
      var p = points[i4];
      if (!p) continue;
      var ci2 = assign ? assign[i4] : -1;
      ctx.fillStyle = colorFor(ci2);
      ctx.globalAlpha = 0.78;
      ctx.beginPath();
      ctx.arc(xOf(p[0]), yOf(p[1]), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var i5 = 0; i5 < centroids.length; i5++) {
      var c = centroids[i5];
      if (!c) continue;
      ctx.fillStyle = 'rgba(7,8,12,0.85)';
      ctx.beginPath(); ctx.arc(xOf(c[0]), yOf(c[1]), 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colorFor(i5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xOf(c[0]), yOf(c[1]), 7, 0, Math.PI * 2); ctx.stroke();
    }

    if (fixedRange) ctx.restore();

    var lbl = '';
    if (opts.title) lbl += opts.title;
    if (opts.stage != null) lbl += (lbl ? ' · ' : '') + 'stage ' + opts.stage;
    if (lbl) drawLabel(ctx, lbl, 8, 14);
  };

  // ------------------------------------------------------------ maskingScene

  // bar geometry only — labels are placed separately so their anchor can
  // be pushed clear of a neighbouring bar without moving the bar itself.
  function drawScaleBar(ctx, x, yTop, yBottom, color, filled) {
    var bw = filled ? 16 : 13;
    if (filled) {
      var grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = grad;
      roundRectPath(ctx, x - bw / 2, yTop, bw, Math.max(0, yBottom - yTop), bw / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, yTop, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(138,143,163,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      roundRectPath(ctx, x - bw / 2, yTop, bw, Math.max(0, yBottom - yTop), bw / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(138,143,163,0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, yTop, 5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawBarLabel(ctx, x, labelBottomY, color, lines) {
    if (!lines || !lines.length) return;
    ctx.font = '10px ' + FONT_UI;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, labelBottomY - (lines.length - 1 - i) * 12);
    }
    ctx.textAlign = 'left';
  }

  VIZ_.maskingScene = function (cv, d, opts) {
    opts = opts || {};
    var f = VIZ_.fit(cv);
    if (!f.ctx || f.w <= 0 || f.h <= 0) return;
    var ctx = f.ctx, w = f.w, h = f.h;
    clearBg(ctx, w, h);
    if (!d) return;

    var freqs = (d.freqs && d.freqs.length > 1) ? d.freqs : null;
    var fMin = 20;
    var fMax = freqs ? freqs[freqs.length - 1] : Math.max(d.maskerHz || 1000, d.probeHz || 1000) * 4;
    if (!(fMax > fMin)) fMax = 20000;

    // Y range: robust to the ATH's steep >18kHz rise (threshDb is already
    // max()'d with athDb per the contract, so that spike is IN threshDb
    // too — a plain min/max would still blow the scale up even excluding
    // the raw athDb array). Use the 2nd..92nd percentile of the curves as
    // the "core" range, then widen to guarantee the masker/probe fit, with
    // extra headroom on top for their labels. The ATH curve is clipped to
    // the frame by yOf()'s clamp below — it is drawn, just flattened at
    // the ceiling instead of dictating it.
    var core = [];
    function pushArr(a) {
      if (!a) return;
      for (var i = 0; i < a.length; i++) { var v = a[i]; if (v != null && isFinite(v)) core.push(v); }
    }
    pushArr(d.threshDb); pushArr(d.athDb);
    core.sort(function (a, b) { return a - b; });

    var yMin = -10, yMax = 100;
    if (core.length) {
      yMin = percentileSorted(core, 0.02);
      yMax = percentileSorted(core, 0.92);
    }
    if (d.maskerDb != null) { yMin = Math.min(yMin, d.maskerDb); yMax = Math.max(yMax, d.maskerDb); }
    if (d.probeDb != null) { yMin = Math.min(yMin, d.probeDb); yMax = Math.max(yMax, d.probeDb); }
    var ySpan = yMax - yMin; if (ySpan < 10) ySpan = 10;
    yMin -= ySpan * 0.15;
    yMax += ySpan * 0.32; // room for masker/probe labels above their bars

    var padL = 34, padR = 10, padT = 14, padB = 20;
    var plotX = padL, plotY = padT;
    var plotW = Math.max(1, w - padL - padR);
    var plotH = Math.max(1, h - padT - padB);

    function xOf(hz) {
      hz = clampNum(hz, fMin, fMax);
      var lo = Math.log10(fMin), hi = Math.log10(fMax);
      return plotX + plotW * (Math.log10(hz) - lo) / ((hi - lo) || 1);
    }
    function yOf(db) {
      db = clampNum(db, yMin, yMax);
      return plotY + plotH * (1 - (db - yMin) / (yMax - yMin));
    }

    VIZ_.axisDb(ctx, plotX, plotY, plotW, plotH, yMin, yMax);
    VIZ_.axisHz(ctx, plotX, plotY, plotW, plotH, fMin, fMax, true);

    // masking threshold — the skirt: this IS the picture, so the shaded
    // "inaudible" region under it is bold (not a faint tint) and the curve
    // itself is solid, not dashed, so it reads as a dominant shape.
    if (freqs && d.threshDb && d.threshDb.length === freqs.length) {
      ctx.beginPath();
      ctx.moveTo(xOf(freqs[0]), yOf(yMin));
      for (var i3 = 0; i3 < freqs.length; i3++) ctx.lineTo(xOf(freqs[i3]), yOf(d.threshDb[i3]));
      ctx.lineTo(xOf(freqs[freqs.length - 1]), yOf(yMin));
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
      grad.addColorStop(0, 'rgba(180,140,232,0.5)');
      grad.addColorStop(0.55, 'rgba(180,140,232,0.28)');
      grad.addColorStop(1, 'rgba(180,140,232,0.10)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      for (var i4 = 0; i4 < freqs.length; i4++) {
        var xb = xOf(freqs[i4]), yb = yOf(d.threshDb[i4]);
        if (i4 === 0) ctx.moveTo(xb, yb); else ctx.lineTo(xb, yb);
      }
      ctx.strokeStyle = COLORS.purple;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // absolute threshold of hearing — thin reference line, clipped to the
    // frame by yOf()'s clamp so its high-frequency rise cannot dictate the
    // scale, only visually top out.
    if (freqs && d.athDb && d.athDb.length === freqs.length) {
      ctx.beginPath();
      for (var i5 = 0; i5 < freqs.length; i5++) {
        var xa = xOf(freqs[i5]), ya = yOf(d.athDb[i5]);
        if (i5 === 0) ctx.moveTo(xa, ya); else ctx.lineTo(xa, ya);
      }
      ctx.strokeStyle = 'rgba(232,230,223,0.55)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // fixed-position legend for the ATH line — anchored to a corner rather
    // than to a point on the curve, so it can never collide with the
    // masker/probe labels regardless of where those sit on the freq axis.
    if (freqs && d.athDb) {
      var legX = plotX + 4, legY = plotY + 11;
      ctx.strokeStyle = 'rgba(232,230,223,0.6)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(legX, legY); ctx.lineTo(legX + 14, legY); ctx.stroke();
      ctx.font = '10px ' + FONT_UI;
      ctx.fillStyle = 'rgba(232,230,223,0.65)';
      ctx.textAlign = 'left';
      ctx.fillText('threshold of hearing', legX + 18, legY + 3);
    }

    // "you cannot hear this" — placed inside the shaded skirt, offset from
    // the masker (and away from the probe) so it never sits under the bars.
    if (freqs && d.threshDb && d.maskerHz != null) {
      var candA = d.maskerHz / 2.6, candB = d.maskerHz * 2.6;
      var pick = candA;
      if (candA < fMin * 1.3 || candA > fMax / 1.15) pick = candB;
      else if (candB >= fMin * 1.3 && candB <= fMax / 1.15 && d.probeHz != null) {
        // pick whichever candidate sits farther (log-distance) from the probe
        var dA = Math.abs(Math.log10(candA) - Math.log10(d.probeHz));
        var dB = Math.abs(Math.log10(candB) - Math.log10(d.probeHz));
        pick = dB > dA ? candB : candA;
      }
      pick = clampNum(pick, fMin * 1.15, fMax / 1.1);
      var curveDb = interpAt(freqs, d.threshDb, pick);
      var yCurve = yOf(curveDb), yFloor = yOf(yMin);
      var labelY = yCurve + (yFloor - yCurve) * 0.45;
      ctx.font = '10px ' + FONT_UI;
      ctx.fillStyle = 'rgba(230,220,245,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('you cannot hear this', xOf(pick), labelY);
      ctx.textAlign = 'left';
    }

    // masker + probe: draw both bars first, then place labels with
    // collision avoidance (push the closer-together one clear).
    var maskerX = null, maskerBarTop = null, probeX = null, probeBarTop = null, audible = null;
    if (d.maskerHz != null && d.maskerDb != null) {
      maskerX = xOf(d.maskerHz);
      maskerBarTop = yOf(d.maskerDb);
      drawScaleBar(ctx, maskerX, maskerBarTop, yOf(yMin), COLORS.amber, true);
    }
    if (d.probeHz != null && d.probeDb != null) {
      audible = d.audible;
      if (audible == null && freqs && d.threshDb) {
        audible = d.probeDb > interpAt(freqs, d.threshDb, d.probeHz);
      }
      probeX = xOf(d.probeHz);
      probeBarTop = yOf(d.probeDb);
      drawScaleBar(ctx, probeX, probeBarTop, yOf(yMin), COLORS.teal2, !!audible);
    }

    // floor for a text BASELINE so a line's ascender doesn't clip the top
    // edge — not a generic "stay clear of the top" margin, which would
    // fight the close-bars push-up below and put labels right back where
    // they started.
    var minLabelY = plotY + 9;
    var LINE_H = 12;
    var maskerLines = ['masker', d.maskerHz != null ? Math.round(d.maskerHz) + ' Hz' : ''];
    var maskerLabelBaseline = null;
    if (maskerX != null) {
      maskerLabelBaseline = maskerBarTop - 10;
      if (maskerLabelBaseline < minLabelY) maskerLabelBaseline = minLabelY;
      drawBarLabel(ctx, maskerX, maskerLabelBaseline, COLORS.amber, maskerLines);
    }
    if (probeX != null) {
      var probeLine = audible ? 'probe — audible' : 'probe — buried';
      var probeLabelBaseline = probeBarTop - 10;
      var closeX = maskerX != null && Math.abs(probeX - maskerX) < 90;
      if (closeX) {
        // clear the masker label's TOPMOST line (it's 2 lines tall), not
        // just its bar/anchor point, with a real gap between baselines.
        var maskerTopBaseline = maskerLabelBaseline - (maskerLines.length - 1) * LINE_H;
        probeLabelBaseline = Math.min(maskerTopBaseline - LINE_H - 6, probeBarTop - 10);
      }
      if (probeLabelBaseline < minLabelY) probeLabelBaseline = minLabelY;
      drawBarLabel(ctx, probeX, probeLabelBaseline, audible ? COLORS.teal2 : 'rgba(138,143,163,0.9)', [probeLine]);
    }

    // below the ATH legend row so the two never overlap
    if (opts.label) drawLabel(ctx, opts.label, plotX + 6, plotY + 27);
  };

  return VIZ_;
})();
