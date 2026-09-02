// dsp.js — CODEC: pure DSP for the "how audio codecs work" lab page.
// ES5-ish, no deps. Works as <script src> (defines window.CODEC) and via
// require() from node (module.exports = CODEC). See CONTRACT.md for the API.

var CODEC = (function () {
  'use strict';

  // ---------------------------------------------------------------------
  // PRNG — mulberry32, seeded, deterministic
  // ---------------------------------------------------------------------
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // gaussian via Box-Muller, driven by a mulberry32 rng function
  function makeGaussian(rng) {
    var has = false, spare = 0;
    return function () {
      if (has) { has = false; return spare; }
      var u, v, s;
      do {
        u = rng() * 2 - 1;
        v = rng() * 2 - 1;
        s = u * u + v * v;
      } while (s <= 0 || s >= 1);
      var mul = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * mul;
      has = true;
      return u * mul;
    };
  }

  // ---------------------------------------------------------------------
  // basic helpers
  // ---------------------------------------------------------------------
  function rms(x) {
    var s = 0;
    for (var i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, x.length));
  }
  function peak(x) {
    var m = 0;
    for (var i = 0; i < x.length; i++) {
      var a = Math.abs(x[i]);
      if (a > m) m = a;
    }
    return m;
  }
  function dbfs(x) {
    return 20 * Math.log10(Math.max(rms(x), 1e-12));
  }
  function normalize(x, targetPeak) {
    targetPeak = (targetPeak === undefined) ? 0.9 : targetPeak;
    var p = peak(x);
    var out = new Float32Array(x.length);
    var g = p > 1e-12 ? (targetPeak / p) : 1;
    for (var i = 0; i < x.length; i++) out[i] = x[i] * g;
    return out;
  }

  function applyFadeInOut(x, sr, ms) {
    ms = (ms === undefined) ? 5 : ms;
    var n = Math.max(1, Math.round(sr * ms / 1000));
    n = Math.min(n, Math.floor(x.length / 2));
    for (var i = 0; i < n; i++) {
      var g = i / n;
      x[i] *= g;
      x[x.length - 1 - i] *= g;
    }
    return x;
  }

  // ---------------------------------------------------------------------
  // window
  // ---------------------------------------------------------------------
  function hann(N) {
    var w = new Float32Array(N);
    if (N === 1) { w[0] = 1; return w; }
    for (var n = 0; n < N; n++) {
      w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1));
    }
    return w;
  }

  // ---------------------------------------------------------------------
  // FFT — in-place radix-2 Cooley-Tukey, iterative, on parallel re/im arrays.
  // ---------------------------------------------------------------------
  function fft(re, im) {
    var n = re.length;
    if (n !== im.length) throw new Error('fft: re/im length mismatch');
    if (n <= 1) return;
    // must be power of two
    if ((n & (n - 1)) !== 0) throw new Error('fft: length must be power of 2');

    // bit-reversal permutation
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }

    // iterative Cooley-Tukey, sign = -1 (forward)
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (-2 * Math.PI) / len;
      var wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (var start = 0; start < n; start += len) {
        var curRe = 1, curIm = 0;
        var half = len >> 1;
        for (var k = 0; k < half; k++) {
          var uRe = re[start + k], uIm = im[start + k];
          var vRe0 = re[start + k + half], vIm0 = im[start + k + half];
          var vRe = vRe0 * curRe - vIm0 * curIm;
          var vIm = vRe0 * curIm + vIm0 * curRe;
          re[start + k] = uRe + vRe;
          im[start + k] = uIm + vIm;
          re[start + k + half] = uRe - vRe;
          im[start + k + half] = uIm - vIm;
          var nextRe = curRe * wRe - curIm * wIm;
          var nextIm = curRe * wIm + curIm * wRe;
          curRe = nextRe; curIm = nextIm;
        }
      }
    }
  }

  function ifft(re, im) {
    var n = re.length;
    // conjugate, forward fft, conjugate, scale
    for (var i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im);
    for (var j = 0; j < n; j++) {
      re[j] = re[j] / n;
      im[j] = -im[j] / n;
    }
  }

  function rfftMag(frame) {
    var N = frame.length;
    var re = new Float32Array(N);
    var im = new Float32Array(N);
    re.set(frame);
    fft(re, im);
    var half = N >> 1;
    var out = new Float32Array(half + 1);
    for (var k = 0; k <= half; k++) {
      out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // STFT / ISTFT — WOLA (weighted overlap-add), Hann analysis+synthesis
  // ---------------------------------------------------------------------
  var _windowCache = {}; // N -> Float32Array
  function getWindow(N) {
    var w = _windowCache[N];
    if (!w) { w = hann(N); _windowCache[N] = w; }
    return w;
  }

  function stft(x, N, hop) {
    N = N || 2048;
    hop = hop || (N >> 1);
    var win = getWindow(N);
    var len = x.length;
    var nFrames = Math.max(1, 1 + Math.floor((len - N) / hop) + ((len - N) % hop !== 0 || len < N ? 1 : 0));
    // simpler robust computation of nFrames: cover the whole signal
    nFrames = Math.max(1, Math.ceil((len - N) / hop) + 1);
    if (nFrames < 1) nFrames = 1;

    var reArr = new Array(nFrames);
    var imArr = new Array(nFrames);
    var frameBuf = new Float32Array(N);
    var reBuf, imBuf;

    for (var f = 0; f < nFrames; f++) {
      var start = f * hop;
      frameBuf.fill(0);
      for (var n = 0; n < N; n++) {
        var idx = start + n;
        var s = (idx >= 0 && idx < len) ? x[idx] : 0;
        frameBuf[n] = s * win[n];
      }
      reBuf = new Float32Array(N);
      imBuf = new Float32Array(N);
      reBuf.set(frameBuf);
      fft(reBuf, imBuf);
      reArr[f] = reBuf;
      imArr[f] = imBuf;
    }

    return { N: N, hop: hop, nFrames: nFrames, re: reArr, im: imArr };
  }

  // Steady-state (periodic) sum-of-squared-window normalization, keyed by
  // "N/hop". At any interior sample, the actual number of overlapping
  // frames is constant (e.g. 2 frames for Hann @ 50% hop) and the per-phase
  // sum win[p]^2 + win[p+hop]^2 + ... is a fixed value close to constant
  // across phases. Near the very start/end of the whole signal, only ONE
  // frame (or fewer) actually overlaps a given sample, so the *actual*
  // per-sample overlap sum can be tiny (the Hann window is ~0 at its own
  // edges) -- dividing by that tiny true sum would massively amplify any
  // per-frame error (e.g. quantization noise from encode()) right at the
  // signal boundary. Using the steady-state value everywhere (as if every
  // sample had full overlap) avoids that instability; the tradeoff is a
  // natural, expected taper of the first/last ~N samples, which is the
  // standard behaviour of windowed OLA reconstruction.
  var _steadyNormCache = {};
  function getSteadyNorm(N, hop) {
    var key = N + '/' + hop;
    var s = _steadyNormCache[key];
    if (s) return s;
    var win = getWindow(N);
    s = new Float32Array(hop);
    for (var p = 0; p < hop; p++) {
      var acc = 0;
      for (var o = p; o < N; o += hop) acc += win[o] * win[o];
      s[p] = acc;
    }
    _steadyNormCache[key] = s;
    return s;
  }

  function istft(S, len) {
    var N = S.N, hop = S.hop, nFrames = S.nFrames;
    var win = getWindow(N);
    var out = new Float32Array(len);

    var reBuf = new Float32Array(N);
    var imBuf = new Float32Array(N);

    for (var f = 0; f < nFrames; f++) {
      reBuf.set(S.re[f]);
      imBuf.set(S.im[f]);
      ifft(reBuf, imBuf);
      var start = f * hop;
      for (var n = 0; n < N; n++) {
        var idx = start + n;
        if (idx >= 0 && idx < len) {
          out[idx] += reBuf[n] * win[n];
        }
      }
    }

    var steady = getSteadyNorm(N, hop);
    for (var i = 0; i < len; i++) {
      var denom = steady[i % hop];
      out[i] = denom > 1e-6 ? out[i] / denom : 0;
    }
    return out;
  }

  function binFreqs(N, sr) {
    var half = N >> 1;
    var out = new Float32Array(half + 1);
    for (var k = 0; k <= half; k++) out[k] = (k * sr) / N;
    return out;
  }

  // ---------------------------------------------------------------------
  // stage 1: sampling & quantization
  // ---------------------------------------------------------------------
  function downsampleSim(x, sr, targetSr, opts) {
    opts = opts || {};
    var antialias = opts.antialias !== false; // default true
    var len = x.length;
    var ratio = sr / targetSr; // samples per target-sample, >= 1 typically
    var src = x;

    if (antialias) {
      // simple zero-phase low-pass (moving-average cascaded 3x -> approx gaussian)
      // cutoff ~ targetSr/2
      var passes = 3;
      var radius = Math.max(1, Math.round(ratio / 2));
      for (var p = 0; p < passes; p++) {
        src = boxBlur(src, radius);
      }
    }

    // decimate: hold each sample for `ratio` original-sample-durations,
    // i.e. pick one sample per targetSr "slot" and zero-order-hold it back
    // to sr.
    var out = new Float32Array(len);
    var step = sr / targetSr;
    var i = 0;
    while (i < len) {
      var srcIdx = Math.min(len - 1, Math.floor(i));
      var held = src[srcIdx];
      var next = Math.min(len, Math.floor(i + step));
      for (var j = i; j < next; j++) out[j] = held;
      i = next;
      if (next <= i - step && step < 1) break; // safety, shouldn't happen
    }
    return out;
  }

  function boxBlur(x, radius) {
    var len = x.length;
    var out = new Float32Array(len);
    if (radius <= 0) { out.set(x); return out; }
    var win = 2 * radius + 1;
    var acc = 0;
    for (var i = -radius; i <= radius; i++) {
      var idx = clampIdx(i, len);
      acc += x[idx];
    }
    out[0] = acc / win;
    for (var n = 1; n < len; n++) {
      var addIdx = clampIdx(n + radius, len);
      var remIdx = clampIdx(n - radius - 1, len);
      acc += x[addIdx] - x[remIdx];
      out[n] = acc / win;
    }
    return out;
  }
  function clampIdx(i, len) {
    if (i < 0) return 0;
    if (i >= len) return len - 1;
    return i;
  }

  var _quantRng = mulberry32(0xC0DEC0DE);

  function quantize(x, bits, opts) {
    opts = opts || {};
    var dither = !!opts.dither;
    var levels = Math.pow(2, bits);
    var len = x.length;
    var y = new Float32Array(len);
    var err = new Float32Array(len);
    var step = 2 / levels; // full-scale [-1,1]
    var rng = mulberry32(1234567 ^ (bits * 2654435761));

    var errSum = 0, sigSum = 0;
    for (var i = 0; i < len; i++) {
      var v = x[i];
      var d = 0;
      if (dither) {
        // TPDF dither: sum of two uniforms in [-step/2, step/2]
        d = ((rng() - 0.5) + (rng() - 0.5)) * step * 0.5;
      }
      var vd = v + d;
      var q = Math.round(vd / step) * step;
      // clamp to representable range
      var half = (levels / 2) * step;
      if (q > half - step) q = half - step;
      if (q < -half) q = -half;
      y[i] = q;
      var e = x[i] - q;
      err[i] = e;
      errSum += e * e;
      sigSum += x[i] * x[i];
    }
    var snrDb;
    if (errSum < 1e-20) snrDb = 200;
    else snrDb = 10 * Math.log10(Math.max(sigSum, 1e-20) / errSum);
    return { y: y, err: err, snrDb: snrDb, levels: levels };
  }

  // ---------------------------------------------------------------------
  // stage 2: psychoacoustics
  // ---------------------------------------------------------------------
  // Traunmuller's Bark formula (accurate across the audible range)
  function barkOf(hz) {
    hz = Math.max(1e-6, hz);
    var b = (26.81 * hz) / (1960 + hz) - 0.53;
    if (b < 2) b = b + 0.15 * (2 - b);
    if (b > 20.1) b = b + 0.22 * (b - 20.1);
    return b;
  }
  function hzOfBark(b) {
    // Invert barkOf's piecewise-affine correction explicitly.
    // Branch 1 (b0<2): forward b = b0 + 0.15*(2-b0) = 0.85*b0 + 0.3
    //   => b0 = (b-0.3)/0.85; this branch's output range is b in [0.3, 2.0)
    // Branch 3 (b0>20.1): forward b = b0 + 0.22*(b0-20.1) = 1.22*b0 - 4.422
    //   => b0 = (b+4.422)/1.22; valid when b>20.1
    var b0;
    if (b < 2) {
      b0 = (b - 0.3) / 0.85;
    } else if (b > 20.1) {
      b0 = (b + 4.422) / 1.22;
    } else {
      b0 = b;
    }
    // invert base formula: b0 = 26.81*hz/(1960+hz) - 0.53  => hz = 1960*(b0+0.53)/(26.81-(b0+0.53))
    var t = b0 + 0.53;
    var denom = 26.81 - t;
    if (denom < 1e-6) denom = 1e-6;
    var hz = 1960 * t / denom;
    return hz;
  }

  // 25 critical band edges (Zwicker), Hz
  var BARK_EDGES = [0, 100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270,
    1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500,
    12000, 15500, 20500];

  // Terhardt (1979) absolute threshold of hearing approximation, in dB SPL.
  // We then reference it into the same dBFS-ish scale used everywhere else
  // in this file (20*log10(mag), floor -100dB) by subtracting a fixed
  // calibration constant (SPL_REF), the conventional "0 dBFS ~= 96 dB SPL"
  // assumption (roughly the dynamic range of 16-bit audio). This makes the
  // ATH curve bottom out near -90..-100 dB around 3-4 kHz (where hearing is
  // most sensitive) and rise toward the edges of the audible range, in the
  // same units as the per-bin magnitude dB used by maskingThreshold.
  var ATH_SPL_REF = 96;
  // Above ~18kHz the polynomial f^4 term in the Terhardt approximation
  // blows up (it's only a good fit up to ~16-18kHz); clamp so one edge bin
  // can't dominate a plot's y-axis. +40dB (well above any real 0dBFS-peak
  // signal) reads honestly as "inaudible at any level a digital file can
  // represent" without touching the curve's true shape below the clamp
  // (in particular the ~-92.6dB minimum around 3-4kHz and the low-frequency
  // rolloff, both far under +40dB already).
  var ATH_CEILING_DB = 40;
  function athDb(hz) {
    var f = Math.max(20, hz) / 1000; // kHz
    var dbSpl = 3.64 * Math.pow(f, -0.8)
      - 6.5 * Math.exp(-0.6 * Math.pow(f - 3.3, 2))
      + 1e-3 * Math.pow(f, 4);
    return Math.min(ATH_CEILING_DB, dbSpl - ATH_SPL_REF);
  }

  // Triangular Bark spreading function applied to per-bin dB magnitudes,
  // producing a masking threshold per bin. Steep downward slope (~27 dB/Bark,
  // toward higher bark from a lower masker... conventionally "downward" means
  // masker's influence falling off as we move AWAY below it in freq — here we
  // use the common convention: slope towards lower Bark (spreadDown) is steep
  // (~-27dB/Bark) and slope towards higher Bark (spreadUp) is shallower
  // (tonality-dependent, ~ -24 dB/Bark also but modelled as slightly less
  // steep + a small extra roll-off with absolute freq per Schroeder).
  function maskingThreshold(magDb, freqs, opts) {
    opts = opts || {};
    var tonality = (opts.tonality === undefined) ? 0.5 : opts.tonality;
    var spreadDown = (opts.spreadDownDbPerBark === undefined) ? 27 : opts.spreadDownDbPerBark;
    var spreadUp = (opts.spreadUpDbPerBark === undefined) ? 15 : opts.spreadUpDbPerBark;

    var n = freqs.length;
    var barks = new Float32Array(n);
    for (var i = 0; i < n; i++) barks[i] = barkOf(freqs[i]);

    // tonality -> offset below the tone/noise energy that's actually masked
    // (a tonal masker masks less than a noise masker, per the classic
    // "6 dB" tonal offset rule; interpolate 6..25 dB with tonality)
    var offsetDb = 25 - 19 * tonality; // tonality=1 (pure tone) -> 6dB, tonality=0 -> 25dB

    var thresh = new Float32Array(n);
    for (var i2 = 0; i2 < n; i2++) thresh[i2] = -1000;

    // For each masker bin i, spread its (energy - offset) across all bins j
    // using a triangular function in Bark distance. O(n^2) but n <= 1025,
    // fine for a browser at interactive rates and self-test.
    for (var i3 = 0; i3 < n; i3++) {
      var maskerLevel = magDb[i3] - offsetDb;
      if (maskerLevel < -100) continue;
      var bi = barks[i3];
      for (var j = 0; j < n; j++) {
        var db = barks[j] - bi; // positive => j is above masker in Bark
        // triangular spreading: attenuation grows with Bark distance in
        // either direction, steeper going down (spreadDown) than up
        // (spreadUp) — both are always a LOSS relative to the masker peak.
        var slopeDbPerBark = db >= 0 ? spreadUp : spreadDown;
        var atten = -slopeDbPerBark * Math.abs(db);
        var lvl = maskerLevel + atten;
        if (lvl > thresh[j]) thresh[j] = lvl;
      }
    }

    var out = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var ath = athDb(freqs[k]);
      out[k] = Math.max(thresh[k], ath);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // stage 3: perceptual codec sim
  // ---------------------------------------------------------------------
  // Final safety net (applied AFTER dequantization/ISTFT, once the
  // underlying arithmetic is already correct): a soft-knee limiter that only
  // touches samples exceeding `ceiling * knee`, smoothly saturating toward
  // `ceiling` and never exceeding it. Below the knee, samples pass through
  // completely untouched, so it does not blur genuine quantization noise
  // into a global gain change (a uniform rescale would also work and would
  // leave correlation exactly unchanged, since Pearson r is scale-invariant,
  // but would needlessly quieten the whole clip for one rare spike). Coarse
  // quantization + ISTFT can occasionally overshoot the original peak by a
  // modest amount (Gibbs-like ringing near sharp transients / abrupt
  // spectral cutoffs); this keeps that bounded without masking a real
  // reconstruction bug behind clamping.
  function softLimitInPlace(audio, ceiling) {
    if (!(ceiling > 1e-9)) return;
    var knee = ceiling * 0.8;
    var range = ceiling - knee;
    for (var i = 0; i < audio.length; i++) {
      var v = audio[i];
      var av = v < 0 ? -v : v;
      if (av > knee) {
        var over = av - knee;
        var compressed = knee + range * Math.tanh(over / range);
        audio[i] = v < 0 ? -compressed : compressed;
      }
    }
  }

  function bitCost(q) {
    if (q === 0) return 0;
    var mag = Math.abs(q);
    return Math.log2(2 * mag + 1) + 1; // + sign bit
  }

  function encode(x, sr, opts) {
    opts = opts || {};
    var N = opts.N || 2048;
    var hop = opts.hop || (N >> 1);
    var bitrateKbps = opts.bitrateKbps === undefined ? 128 : opts.bitrateKbps;
    var useMasking = opts.useMasking !== false;
    var lowpassHz = opts.lowpassHz;

    var len = x.length;
    var S = stft(x, N, hop);
    var nFrames = S.nFrames;
    var half = N >> 1;
    var freqs = binFreqs(N, sr);

    // per-frame magnitude (linear) and dB, and masking threshold dB
    var magDbFrames = new Array(nFrames);
    var threshDbFrames = new Array(nFrames);

    var lowpassBin = lowpassHz ? Math.round((lowpassHz / sr) * N) : (half + 1);

    for (var f = 0; f < nFrames; f++) {
      var re = S.re[f], im = S.im[f];
      var magDb = new Float32Array(half + 1);
      for (var k = 0; k <= half; k++) {
        var mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        magDb[k] = 20 * Math.log10(Math.max(mag, 1e-9));
      }
      magDbFrames[f] = magDb;
      var thr;
      if (useMasking) {
        thr = maskingThreshold(magDb, freqs, {});
      } else {
        thr = new Float32Array(half + 1);
        for (var k2 = 0; k2 <= half; k2++) thr[k2] = athDb(freqs[k2]);
      }
      threshDbFrames[f] = thr;
    }

    // Quantization step per bin per frame derives from the (offset) threshold:
    // step_linear = 10^(thr_db/20) essentially; a bin quantizes to 0 if
    // |coef| < step/2 roughly, i.e. below threshold.
    // We bisect a global dB offset `off` (added to threshold in dB, so
    // positive off = coarser quantization = fewer bits) so the average
    // estimated bitrate matches bitrateKbps.

    function computeForOffset(off) {
      var totalBits = 0;
      var keptBins = 0;
      var totalBinsCounted = 0;
      for (var f2 = 0; f2 < nFrames; f2++) {
        var re2 = S.re[f2], im2 = S.im[f2];
        var thr2 = threshDbFrames[f2];
        for (var k3 = 0; k3 <= half; k3++) {
          if (k3 >= lowpassBin) { totalBinsCounted++; continue; }
          totalBinsCounted++;
          var stepDb = thr2[k3] + off;
          var stepLin = Math.pow(10, stepDb / 20);
          if (stepLin < 1e-9) stepLin = 1e-9;
          var qi = Math.round(re2[k3] / stepLin);
          var qq = Math.round(im2[k3] / stepLin);
          if (qi !== 0) { totalBits += bitCost(qi); keptBins++; }
          if (qq !== 0) { totalBits += bitCost(qq); keptBins++; }
        }
      }
      var seconds = len / sr;
      var kbps = seconds > 0 ? (totalBits / seconds) / 1000 : 0;
      return { kbps: kbps, keptBins: keptBins, totalBinsCounted: totalBinsCounted };
    }

    // bisection on off in dB: larger off -> coarser -> lower kbps
    var lo = -60, hi = 60;
    // ensure bracket: at lo (fine) kbps should be >= target; at hi (coarse) <= target
    var offBest = 0;
    var iterMax = 22;
    var resLo = computeForOffset(lo);
    var resHi = computeForOffset(hi);
    // widen if necessary
    var guard = 0;
    while (resLo.kbps < bitrateKbps && guard < 10) { lo -= 20; resLo = computeForOffset(lo); guard++; }
    guard = 0;
    while (resHi.kbps > bitrateKbps && guard < 10) { hi += 20; resHi = computeForOffset(hi); guard++; }

    var chosen = resHi;
    for (var it = 0; it < iterMax; it++) {
      var mid = (lo + hi) / 2;
      var r = computeForOffset(mid);
      if (r.kbps > bitrateKbps) {
        lo = mid;
      } else {
        hi = mid;
      }
      chosen = r;
      offBest = mid;
    }
    // final pass at hi (closest achieved, coarser side ensures <=; but choose
    // whichever of lo/hi is nearer target for best fit)
    var rLo = computeForOffset(lo);
    var rHi = computeForOffset(hi);
    var finalOff, finalStats;
    if (Math.abs(rLo.kbps - bitrateKbps) <= Math.abs(rHi.kbps - bitrateKbps)) {
      finalOff = lo; finalStats = rLo;
    } else {
      finalOff = hi; finalStats = rHi;
    }

    // now actually quantize/dequantize with finalOff and build output,
    // also collect per-band bits and up to 200 subsampled frames for viz.
    var nBark = BARK_EDGES.length - 1;
    var bandBitsAccum = new Float64Array(nBark);
    var bandBinCount = new Float64Array(nBark);
    var bandFreqs = [];
    for (var bidx = 0; bidx < nBark; bidx++) {
      bandFreqs.push((BARK_EDGES[bidx] + BARK_EDGES[bidx + 1]) / 2);
    }
    function bandIndexForHz(hz) {
      for (var bi = 0; bi < nBark; bi++) {
        if (hz >= BARK_EDGES[bi] && hz < BARK_EDGES[bi + 1]) return bi;
      }
      return nBark - 1;
    }
    var binBand = new Int32Array(half + 1);
    for (var kb = 0; kb <= half; kb++) binBand[kb] = bandIndexForHz(freqs[kb]);

    var outRe = new Array(nFrames);
    var outIm = new Array(nFrames);
    var keptBinsTotal = 0;
    var totalBinsTotal = 0;
    var keptCountPerBin = new Float64Array(half + 1); // for cutoffHz

    var keepFrameStride = Math.max(1, Math.ceil(nFrames / 200));
    var vizFrames = [];

    for (var f3 = 0; f3 < nFrames; f3++) {
      var re3 = S.re[f3], im3 = S.im[f3];
      var thr3 = threshDbFrames[f3];
      var oRe = new Float32Array(N);
      var oIm = new Float32Array(N);
      var keptMask = (f3 % keepFrameStride === 0) ? new Uint8Array(half + 1) : null;

      for (var k4 = 0; k4 <= half; k4++) {
        totalBinsTotal++;
        var isLow = k4 < lowpassBin;
        var stepDb2 = thr3[k4] + finalOff;
        var stepLin2 = Math.pow(10, stepDb2 / 20);
        if (stepLin2 < 1e-9) stepLin2 = 1e-9;
        var qi2 = 0, qq2 = 0;
        if (isLow) {
          qi2 = Math.round(re3[k4] / stepLin2);
          qq2 = Math.round(im3[k4] / stepLin2);
        }
        var kept = (qi2 !== 0 || qq2 !== 0) ? 1 : 0;
        if (kept) { keptBinsTotal++; keptCountPerBin[k4]++; }
        var bits = bitCost(qi2) + bitCost(qq2);
        var band = binBand[k4];
        bandBitsAccum[band] += bits;
        bandBinCount[band] += 1;

        var dRe = qi2 * stepLin2;
        var dIm = qq2 * stepLin2;
        oRe[k4] = dRe;
        oIm[k4] = dIm;
        if (k4 > 0 && k4 < N - k4) {
          // mirror for real signal (conjugate symmetry), skip Nyquist/DC dup
          oRe[N - k4] = dRe;
          oIm[N - k4] = -dIm;
        }
        if (keptMask) keptMask[k4] = kept;
      }

      outRe[f3] = oRe;
      outIm[f3] = oIm;

      if (keptMask) {
        vizFrames.push({ magDb: magDbFrames[f3].slice(), threshDb: thr3.slice(), kept: keptMask });
      }
    }

    var Sout = { N: N, hop: hop, nFrames: nFrames, re: outRe, im: outIm };
    var audio = istft(Sout, len);
    softLimitInPlace(audio, peak(x));
    var residual = new Float32Array(len);
    for (var ri = 0; ri < len; ri++) residual[ri] = x[ri] - audio[ri];

    var bandBits = new Float32Array(nBark);
    for (var bb = 0; bb < nBark; bb++) {
      bandBits[bb] = bandBinCount[bb] > 0 ? (bandBitsAccum[bb] / bandBinCount[bb]) : 0;
    }

    var seconds2 = len / sr;
    var achievedKbps = finalStats.kbps;

    // cutoffHz: the "lowpass cliff" actually produced by the bit allocation
    // -- the lowest frequency above which fewer than ~1% of coefficients
    // (across all frames) survived quantization. Scan from Nyquist downward
    // for the highest bin that still clears the survival threshold; nothing
    // above it does. This is derived from the real per-bin kept counts, not
    // just echoed back from the `lowpassHz` option, so it also reflects the
    // cliff the bit-allocation loop itself creates at low bitrates even
    // when no explicit lowpassHz was requested.
    var survivalThreshold = 0.01;
    var cutoffBin = -1;
    for (var kc = half; kc >= 0; kc--) {
      if (keptCountPerBin[kc] / nFrames >= survivalThreshold) { cutoffBin = kc; break; }
    }
    var cutoffHz = cutoffBin >= 0 ? freqs[cutoffBin] : 0;

    return {
      audio: audio,
      residual: residual,
      stats: {
        bitrateKbps: achievedKbps,
        keptBins: keptBinsTotal,
        totalBins: totalBinsTotal,
        cutoffHz: cutoffHz,
        nFrames: nFrames,
        bandBits: bandBits,
        bandFreqs: bandFreqs
      },
      frames: vizFrames
    };
  }

  // ---------------------------------------------------------------------
  // stage 4: neural codecs (k-means / RVQ / 2D embedding)
  // ---------------------------------------------------------------------
  function dist2(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; }
    return s;
  }

  function kmeans(points, k, iters, seed) {
    iters = iters || 15;
    seed = seed === undefined ? 42 : seed;
    var rng = mulberry32(seed);
    var n = points.length;
    var dim = n > 0 ? points[0].length : 2;
    k = Math.max(1, Math.min(k, n));

    // k-means++ style seeding (deterministic via rng)
    var centroids = [];
    var firstIdx = Math.floor(rng() * n);
    centroids.push(points[firstIdx].slice());
    var d2 = new Float64Array(n);
    for (var c = 1; c < k; c++) {
      var sum = 0;
      for (var i = 0; i < n; i++) {
        var best = Infinity;
        for (var cc = 0; cc < centroids.length; cc++) {
          var dd = dist2(points[i], centroids[cc]);
          if (dd < best) best = dd;
        }
        d2[i] = best;
        sum += best;
      }
      var r = rng() * sum;
      var acc = 0, chosen = n - 1;
      for (var j = 0; j < n; j++) {
        acc += d2[j];
        if (acc >= r) { chosen = j; break; }
      }
      centroids.push(points[chosen].slice());
    }

    var assign = new Int32Array(n);
    for (var it = 0; it < iters; it++) {
      // assign
      for (var p = 0; p < n; p++) {
        var bestC = 0, bestD = Infinity;
        for (var ci = 0; ci < k; ci++) {
          var dd2 = dist2(points[p], centroids[ci]);
          if (dd2 < bestD) { bestD = dd2; bestC = ci; }
        }
        assign[p] = bestC;
      }
      // update
      var sums = [];
      var counts = new Int32Array(k);
      for (var ci2 = 0; ci2 < k; ci2++) {
        var arr = new Float64Array(dim);
        sums.push(arr);
      }
      for (var p2 = 0; p2 < n; p2++) {
        var a = assign[p2];
        counts[a]++;
        var sarr = sums[a];
        var pt = points[p2];
        for (var dI = 0; dI < dim; dI++) sarr[dI] += pt[dI];
      }
      for (var ci3 = 0; ci3 < k; ci3++) {
        if (counts[ci3] > 0) {
          var newC = new Array(dim);
          for (var dI2 = 0; dI2 < dim; dI2++) newC[dI2] = sums[ci3][dI2] / counts[ci3];
          centroids[ci3] = newC;
        }
        // if empty, keep old centroid (avoid dead cluster thrash)
      }
    }

    var mse = 0;
    for (var p3 = 0; p3 < n; p3++) mse += dist2(points[p3], centroids[assign[p3]]);
    mse = n > 0 ? mse / n : 0;

    return { centroids: centroids, assign: assign, mse: mse };
  }

  function rvq(points, opts) {
    opts = opts || {};
    var codebookSize = opts.codebookSize || 8;
    var stages = opts.stages || 3;
    var seed = opts.seed === undefined ? 7 : opts.seed;

    var n = points.length;
    var dim = n > 0 ? points[0].length : 2;
    var residual = points.map(function (p) { return p.slice(); });

    var stageResults = [];
    var mseByStage = [];

    for (var s = 0; s < stages; s++) {
      // `residual` here IS the cloud this stage actually quantizes: the
      // original points for stage 0, then each subsequent stage's leftover
      // after subtracting the previous stage's reconstruction. Snapshot it
      // (deep copy) as `points` before kmeans/residual-update touch it, so
      // the caller can see the cloud visibly shrinking toward zero stage by
      // stage -- the whole point of RVQ (vs. a fan of centroids with no
      // sense of the shrinking cloud they're being fit to).
      var stagePoints = residual.map(function (p) { return p.slice(); });
      var km = kmeans(residual, codebookSize, 15, seed + s * 1013904223);
      stageResults.push({ centroids: km.centroids, assign: km.assign, mse: km.mse, points: stagePoints });
      mseByStage.push(km.mse);
      // subtract assigned centroid from residual for next stage
      var newResidual = new Array(n);
      for (var i = 0; i < n; i++) {
        var c = km.centroids[km.assign[i]];
        var r = residual[i];
        var nr = new Array(dim);
        for (var d = 0; d < dim; d++) nr[d] = r[d] - c[d];
        newResidual[i] = nr;
      }
      residual = newResidual;
    }

    return {
      stages: stageResults,
      mseByStage: mseByStage,
      bitsPerVector: stages * Math.log2(codebookSize)
    };
  }

  function embed2d(x, sr, opts) {
    opts = opts || {};
    var N = opts.N || 1024;
    var hop = opts.hop || (N >> 1);
    var nBands = opts.nBands || 16;

    var S = stft(x, N, hop);
    var half = N >> 1;
    var freqs = binFreqs(N, sr);

    // log-spaced band edges from 40Hz to sr/2
    var minHz = 40, maxHz = sr / 2;
    var edges = [];
    for (var b = 0; b <= nBands; b++) {
      edges.push(minHz * Math.pow(maxHz / minHz, b / nBands));
    }
    var binBand = new Int32Array(half + 1);
    for (var k = 0; k <= half; k++) {
      var f = freqs[k];
      var bnd = 0;
      for (var bi = 0; bi < nBands; bi++) {
        if (f >= edges[bi] && f < edges[bi + 1]) { bnd = bi; break; }
        bnd = nBands - 1;
      }
      binBand[k] = bnd;
    }

    var nFrames = S.nFrames;
    var feats = new Array(nFrames);
    for (var fr = 0; fr < nFrames; fr++) {
      var re = S.re[fr], im = S.im[fr];
      var bandE = new Float64Array(nBands);
      var bandC = new Int32Array(nBands);
      for (var kk = 0; kk <= half; kk++) {
        var mag = Math.sqrt(re[kk] * re[kk] + im[kk] * im[kk]);
        bandE[binBand[kk]] += mag * mag;
        bandC[binBand[kk]] += 1;
      }
      var logE = new Float64Array(nBands);
      for (var bb = 0; bb < nBands; bb++) {
        var mean = bandC[bb] > 0 ? bandE[bb] / bandC[bb] : 0;
        logE[bb] = Math.log(mean + 1e-9);
      }
      feats[fr] = logE;
    }

    // mean-center
    var mean2 = new Float64Array(nBands);
    for (var i2 = 0; i2 < nFrames; i2++) {
      for (var d2 = 0; d2 < nBands; d2++) mean2[d2] += feats[i2][d2];
    }
    for (var d3 = 0; d3 < nBands; d3++) mean2[d3] /= Math.max(1, nFrames);
    for (var i3 = 0; i3 < nFrames; i3++) {
      for (var d4 = 0; d4 < nBands; d4++) feats[i3][d4] -= mean2[d4];
    }

    // PCA via power iteration for top-2 components (deterministic seed)
    var pc1 = powerIterationPC(feats, nBands, nFrames, null, 0xABCDEF);
    var pc2 = powerIterationPC(feats, nBands, nFrames, pc1, 0xFEDCBA);

    var points = new Array(nFrames);
    for (var i4 = 0; i4 < nFrames; i4++) {
      var f4 = feats[i4];
      var a = 0, bcoef = 0;
      for (var d5 = 0; d5 < nBands; d5++) { a += f4[d5] * pc1[d5]; bcoef += f4[d5] * pc2[d5]; }
      points[i4] = [a, bcoef];
    }
    return points;
  }

  function powerIterationPC(feats, dim, nFrames, deflateAgainst, seed) {
    var rng = mulberry32(seed);
    var v = new Float64Array(dim);
    for (var i = 0; i < dim; i++) v[i] = rng() - 0.5;
    normalizeVec(v);

    for (var iter = 0; iter < 40; iter++) {
      var nv = new Float64Array(dim);
      // nv = Cov * v = (1/n) X^T X v
      var Xv = new Float64Array(nFrames);
      for (var f = 0; f < nFrames; f++) {
        var s = 0;
        var row = feats[f];
        for (var d = 0; d < dim; d++) s += row[d] * v[d];
        Xv[f] = s;
      }
      for (var f2 = 0; f2 < nFrames; f2++) {
        var row2 = feats[f2];
        var xv = Xv[f2];
        for (var d2 = 0; d2 < dim; d2++) nv[d2] += row2[d2] * xv;
      }
      for (var d3 = 0; d3 < dim; d3++) nv[d3] /= Math.max(1, nFrames);

      if (deflateAgainst) {
        var dot = 0;
        for (var d4 = 0; d4 < dim; d4++) dot += nv[d4] * deflateAgainst[d4];
        for (var d5 = 0; d5 < dim; d5++) nv[d5] -= dot * deflateAgainst[d5];
      }
      normalizeVec(nv);
      v = nv;
    }
    return v;
  }
  function normalizeVec(v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s);
    if (s < 1e-12) s = 1;
    for (var j = 0; j < v.length; j++) v[j] /= s;
  }

  // ---------------------------------------------------------------------
  // sources — deterministic synths
  // ---------------------------------------------------------------------
  function makeMelody(sr, seconds) {
    seconds = seconds || 3;
    var n = Math.round(sr * seconds);
    var out = new Float32Array(n);
    var rng = mulberry32(0x5EED0001);

    // simple pentatonic-ish arpeggio, plucked-string decay (Karplus-Strong-ish
    // via exponentially decaying sum of harmonics, click-free)
    var scale = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25, 783.99, 987.77]; // C major-ish pentatonic-flavored
    var noteDur = 0.42;
    var t = 0;
    var noteIdx = 0;
    var pattern = [0, 2, 4, 2, 5, 4, 2, 0, 3, 5, 7, 5, 4, 2, 1, 0];

    while (t < seconds) {
      var freq = scale[pattern[noteIdx % pattern.length]];
      // slight per-note detune for life, deterministic
      freq *= 1 + (rng() - 0.5) * 0.004;
      var startSample = Math.round(t * sr);
      var durSamples = Math.min(Math.round(noteDur * sr), n - startSample);
      for (var i = 0; i < durSamples; i++) {
        var tt = i / sr;
        var env = Math.exp(-tt * 6.5); // plucked decay
        var attack = Math.min(1, tt / 0.003);
        var v = 0;
        v += 1.00 * Math.sin(2 * Math.PI * freq * tt);
        v += 0.5 * Math.sin(2 * Math.PI * freq * 2 * tt) * Math.exp(-tt * 10);
        v += 0.25 * Math.sin(2 * Math.PI * freq * 3 * tt) * Math.exp(-tt * 14);
        v += 0.12 * Math.sin(2 * Math.PI * freq * 4 * tt) * Math.exp(-tt * 18);
        var idx = startSample + i;
        if (idx < n) out[idx] += v * env * attack * 0.35;
      }
      t += noteDur * 0.72; // slight overlap between notes
      noteIdx++;
    }

    applyFadeInOut(out, sr, 5);
    return normalize(out, 0.9);
  }

  function makeVowel(sr, seconds) {
    seconds = seconds || 3;
    var n = Math.round(sr * seconds);
    var out = new Float32Array(n);
    var rng = mulberry32(0x5EED0002);

    // 4 vowel formant targets (F1,F2,F3 in Hz), roughly /a/ /i/ /u/ /e/
    var vowels = [
      { f1: 700, f2: 1220, f3: 2600 }, // a
      { f1: 280, f2: 2250, f3: 2900 }, // i
      { f1: 310, f2: 870, f3: 2250 },  // u
      { f1: 460, f2: 2100, f3: 2800 }  // e
    ];
    var segDur = seconds / vowels.length;
    var f0base = 110; // pitch, Hz

    // glottal pulse train (band-limited impulse-ish via a few harmonics with
    // 1/n rolloff), then formant resonances via simple biquad-like resonant
    // filters implemented as time-domain 2nd order resonators.
    var pulseTimes = [];
    var t = 0;
    while (t < seconds) {
      var jitter = 1 + (rng() - 0.5) * 0.02;
      var vIdx = Math.min(vowels.length - 1, Math.floor(t / segDur));
      var f0 = f0base * (1 + 0.06 * Math.sin(2 * Math.PI * 0.7 * t)); // gentle vibrato/intonation
      t += (1 / f0) * jitter;
      pulseTimes.push(t);
    }

    var glottal = new Float32Array(n);
    for (var pi = 0; pi < pulseTimes.length; pi++) {
      var pt = pulseTimes[pi];
      var idx = Math.round(pt * sr);
      if (idx >= 0 && idx < n) {
        // small pulse shaped like a Rosenberg-ish glottal pulse: use a short
        // raised-cosine bump plus its derivative sharpness by summing 2 taps
        glottal[idx] += 1.0;
        if (idx + 1 < n) glottal[idx + 1] += -0.6;
        if (idx + 2 < n) glottal[idx + 2] += -0.25;
      }
    }

    // resonator (simple 2-pole) per formant, time-varying coefficients by
    // recomputing per-sample-block (every 64 samples) is expensive; instead
    // process per output sample with coefficients interpolated per-vowel
    // segment boundaries (piecewise constant per small block for speed).
    function applyResonator(input, freqFn, bwHz) {
      var y = new Float32Array(n);
        var y1 = 0, y2 = 0;
      var blockSize = 32;
      for (var start = 0; start < n; start += blockSize) {
        var mid = Math.min(n - 1, start + (blockSize >> 1));
        var freq = freqFn(mid / sr);
        var r = Math.exp(-Math.PI * bwHz / sr);
        var theta = 2 * Math.PI * freq / sr;
        var a1 = 2 * r * Math.cos(theta);
        var a2 = -r * r;
        var gain = (1 - r); // rough normalization
        var end = Math.min(n, start + blockSize);
        for (var i = start; i < end; i++) {
          var x0 = input[i];
          var yy = x0 * gain + a1 * y1 + a2 * y2;
          y[i] = yy;
          y2 = y1; y1 = yy;
        }
      }
      return y;
    }

    function vowelFreqAt(which) {
      return function (tt) {
        var idxF = Math.min(vowels.length - 1, Math.floor(tt / segDur));
        var idxNext = Math.min(vowels.length - 1, idxF + 1);
        var frac = (tt - idxF * segDur) / segDur;
        // smooth transition across last 30% of each segment
        var blend = frac > 0.7 ? (frac - 0.7) / 0.3 : 0;
        var a = vowels[idxF][which];
        var b = vowels[idxNext][which];
        return a + (b - a) * Math.min(1, blend);
      };
    }

    var r1 = applyResonator(glottal, vowelFreqAt('f1'), 80);
    var r2 = applyResonator(glottal, vowelFreqAt('f2'), 110);
    var r3 = applyResonator(glottal, vowelFreqAt('f3'), 140);

    for (var i2 = 0; i2 < n; i2++) {
      out[i2] = 0.5 * r1[i2] + 0.32 * r2[i2] + 0.18 * r3[i2];
    }

    applyFadeInOut(out, sr, 5);
    return normalize(out, 0.9);
  }

  function makeCastanets(sr, seconds) {
    seconds = seconds || 3;
    var n = Math.round(sr * seconds);
    var out = new Float32Array(n);
    var rng = mulberry32(0x5EED0003);

    // sparse sharp transients: filtered noise burst with very fast decay,
    // near silence between hits (the pre-echo torture test).
    var nHits = Math.max(5, Math.round(seconds * 3.2));
    var hitTimes = [];
    for (var i = 0; i < nHits; i++) {
      var base = (i + 0.5) / nHits * seconds;
      hitTimes.push(base + (rng() - 0.5) * (seconds / nHits) * 0.4);
    }

    for (var h = 0; h < hitTimes.length; h++) {
      var t0 = hitTimes[h];
      var startSample = Math.round(t0 * sr);
      var burstLen = Math.round(sr * 0.02); // 20 ms burst window
      var isDouble = rng() < 0.4;
      var clicks = isDouble ? [0, Math.round(sr * 0.012)] : [0];
      for (var c = 0; c < clicks.length; c++) {
        var off = clicks[c];
        var amp = 0.8 + rng() * 0.2;
        for (var i2 = 0; i2 < burstLen; i2++) {
          var idx = startSample + off + i2;
          if (idx < 0 || idx >= n) continue;
          var tt = i2 / sr;
          var env = Math.exp(-tt * 900); // very sharp decay, <5ms effective
          var noise = (rng() * 2 - 1);
          // bright: emphasize by simple differencing (high-pass-ish) applied
          // after generation below; for now just sum shaped noise
          out[idx] += noise * env * amp;
        }
      }
    }

    // brighten with a simple first-difference high-pass to emphasize transient click
    var hp = new Float32Array(n);
    var prev = 0;
    for (var k = 0; k < n; k++) {
      hp[k] = out[k] - prev;
      prev = out[k];
    }
    for (var k2 = 0; k2 < n; k2++) out[k2] = out[k2] * 0.4 + hp[k2] * 0.6;

    applyFadeInOut(out, sr, 5);
    return normalize(out, 0.9);
  }

  function makeTwoTone(sr, seconds) {
    seconds = seconds || 3;
    var n = Math.round(sr * seconds);
    var out = new Float32Array(n);
    var maskerAmp = Math.pow(10, -6 / 20);
    var probeAmp = Math.pow(10, -40 / 20);
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      out[i] = maskerAmp * Math.sin(2 * Math.PI * 1000 * t)
        + probeAmp * Math.sin(2 * Math.PI * 1250 * t);
    }
    applyFadeInOut(out, sr, 5);
    // normalize to 0.9 peak would destroy the -6/-40 relationship's absolute
    // reference; instead just fade — amplitudes are already sane (<1 peak).
    return out;
  }

  function makeTone(sr, seconds) {
    seconds = seconds || 3;
    var n = Math.round(sr * seconds);
    var out = new Float32Array(n);
    var amp = Math.pow(10, -6 / 20);
    for (var i = 0; i < n; i++) {
      out[i] = amp * Math.sin(2 * Math.PI * 1000 * (i / sr));
    }
    applyFadeInOut(out, sr, 5);
    return out;
  }

  function makePinkNoise(sr, seconds) {
    seconds = seconds || 3;
    var n = Math.round(sr * seconds);
    var rng = mulberry32(0x5EED0006);
    var gauss = makeGaussian(rng);

    // Paul Kellet's pink noise approximation
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var white = gauss() * 0.2;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      var pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      out[i] = pink * 0.11;
    }
    var target = Math.pow(10, -18 / 20);
    out = normalize(out, target); // scale so RMS-ish peak lands near -18dBFS region
    applyFadeInOut(out, sr, 5);
    return out;
  }

  var sources = [
    { id: 'melody', label: 'melody', desc: 'plucked arpeggio', make: makeMelody },
    { id: 'vowel', label: 'vowel', desc: 'pseudo-speech, 4 vowels', make: makeVowel },
    { id: 'castanets', label: 'castanets', desc: 'sharp transients (pre-echo test)', make: makeCastanets },
    { id: 'twotone', label: 'two-tone', desc: 'masker + probe', make: makeTwoTone },
    { id: 'tone', label: 'tone', desc: '1 kHz sine, -6 dBFS', make: makeTone },
    { id: 'noise', label: 'noise', desc: 'pink noise, -18 dBFS', make: makePinkNoise }
  ];

  // ---------------------------------------------------------------------
  // public API
  // ---------------------------------------------------------------------
  var CODEC = {
    hann: hann,
    fft: fft,
    ifft: ifft,
    rfftMag: rfftMag,
    stft: stft,
    istft: istft,
    binFreqs: binFreqs,

    sources: sources,

    downsampleSim: downsampleSim,
    quantize: quantize,

    barkOf: barkOf,
    hzOfBark: hzOfBark,
    BARK_EDGES: BARK_EDGES,
    athDb: athDb,
    maskingThreshold: maskingThreshold,

    encode: encode,

    kmeans: kmeans,
    rvq: rvq,
    embed2d: embed2d,

    rms: rms,
    peak: peak,
    dbfs: dbfs,
    normalize: normalize,

    mulberry32: mulberry32
  };

  return CODEC;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CODEC;
}
if (typeof window !== 'undefined') {
  window.CODEC = CODEC;
}
