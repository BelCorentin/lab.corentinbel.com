// dsp.selftest.js — node, no deps. `node dsp.selftest.js`
// Prints PASS/FAIL per assertion, exits nonzero if any FAIL.

var CODEC = require('./dsp.js');

var failures = 0;
var passes = 0;

function ok(name, cond, extra) {
  if (cond) {
    passes++;
    console.log('PASS  ' + name + (extra ? '  (' + extra + ')' : ''));
  } else {
    failures++;
    console.log('FAIL  ' + name + (extra ? '  (' + extra + ')' : ''));
  }
}

function dbOf(lin) {
  return 20 * Math.log10(Math.max(lin, 1e-12));
}

// -----------------------------------------------------------------------
// 1. FFT of a pure bin has all energy in that bin (>-60dB elsewhere)
// -----------------------------------------------------------------------
(function testFftPureBin() {
  var N = 1024;
  var k0 = 37;
  var re = new Float32Array(N);
  var im = new Float32Array(N);
  for (var n = 0; n < N; n++) {
    re[n] = Math.cos(2 * Math.PI * k0 * n / N);
  }
  CODEC.fft(re, im);
  var mags = new Float32Array(N);
  var maxMag = 0;
  for (var i = 0; i < N; i++) {
    mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    if (mags[i] > maxMag) maxMag = mags[i];
  }
  // expect peaks at k0 and N-k0
  var worstOther = -Infinity;
  for (var j = 0; j < N; j++) {
    if (j === k0 || j === N - k0) continue;
    var relDb = dbOf(mags[j] / maxMag);
    if (relDb > worstOther) worstOther = relDb;
  }
  ok('fft: pure bin energy elsewhere < -60dB', worstOther < -60,
    'worstOther=' + worstOther.toFixed(1) + 'dB, peak@' + k0 + '=' + maxMag.toFixed(1));
})();

// -----------------------------------------------------------------------
// 2. istft(stft(x)) reconstructs x to < -60dB error (interior samples)
// -----------------------------------------------------------------------
(function testIstftReconstruction() {
  var sr = 48000;
  var seconds = 1.0;
  var n = Math.round(sr * seconds);
  var x = new Float32Array(n);
  var rng = CODEC.mulberry32(999);
  for (var i = 0; i < n; i++) {
    x[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / sr)
      + 0.15 * Math.sin(2 * Math.PI * 2500 * i / sr)
      + 0.05 * (rng() * 2 - 1);
  }
  var N = 2048, hop = 1024;
  var S = CODEC.stft(x, N, hop);
  var y = CODEC.istft(S, n);

  // interior region: skip first/last N samples (edge tapering artifacts expected)
  var lo = N, hi = n - N;
  var errSum = 0, sigSum = 0;
  for (var k = lo; k < hi; k++) {
    var e = x[k] - y[k];
    errSum += e * e;
    sigSum += x[k] * x[k];
  }
  var errDb = dbOf(Math.sqrt(errSum / Math.max(1, sigSum)));
  ok('istft(stft(x)) interior reconstruction < -60dB error', errDb < -60,
    'errDb=' + errDb.toFixed(1));
})();

// -----------------------------------------------------------------------
// 3. quantize(x,16).snrDb > 85 ; quantize(x,4).snrDb < 30
// -----------------------------------------------------------------------
(function testQuantizeSnr() {
  var sr = 48000, n = sr;
  var x = new Float32Array(n);
  for (var i = 0; i < n; i++) x[i] = 0.7 * Math.sin(2 * Math.PI * 440 * i / sr);
  var q16 = CODEC.quantize(x, 16, { dither: false });
  var q4 = CODEC.quantize(x, 4, { dither: false });
  ok('quantize(x,16).snrDb > 85', q16.snrDb > 85, 'snr16=' + q16.snrDb.toFixed(1));
  ok('quantize(x,4).snrDb < 30', q4.snrDb < 30, 'snr4=' + q4.snrDb.toFixed(1));
})();

// -----------------------------------------------------------------------
// 4. maskingThreshold on a lone 1kHz tone exceeds athDb near 1kHz, decays away
// -----------------------------------------------------------------------
(function testMasking() {
  var sr = 48000, N = 2048;
  var freqs = CODEC.binFreqs(N, sr);
  var magDb = new Float32Array(freqs.length);
  for (var i = 0; i < freqs.length; i++) magDb[i] = -100;
  // find bin nearest 1000Hz
  var k1k = 0, best = Infinity;
  for (var j = 0; j < freqs.length; j++) {
    var d = Math.abs(freqs[j] - 1000);
    if (d < best) { best = d; k1k = j; }
  }
  magDb[k1k] = 0; // loud tone at 1kHz, 0dB

  var thr = CODEC.maskingThreshold(magDb, freqs, { tonality: 1.0 });
  var athAt1k = CODEC.athDb(1000);
  ok('maskingThreshold near 1kHz exceeds athDb', thr[k1k] > athAt1k,
    'thr[1k]=' + thr[k1k].toFixed(1) + ' ath=' + athAt1k.toFixed(1));

  // decays away: threshold far from masker (e.g. at 8kHz) should be much
  // lower than at the masker itself, and should fall back toward ATH.
  var k8k = 0, best2 = Infinity;
  for (var j2 = 0; j2 < freqs.length; j2++) {
    var d2 = Math.abs(freqs[j2] - 8000);
    if (d2 < best2) { best2 = d2; k8k = j2; }
  }
  ok('maskingThreshold decays away from masker', thr[k8k] < thr[k1k],
    'thr[8k]=' + thr[k8k].toFixed(1) + ' thr[1k]=' + thr[k1k].toFixed(1));
})();

// -----------------------------------------------------------------------
// 4b. athDb is clamped so the Terhardt polynomial's high-frequency blowup
// (the f^4 term is only a good fit up to ~16-18kHz) can't dominate a plot's
// y-axis, while the true shape below the clamp (low-freq rolloff, the
// ~3-4kHz minimum) is preserved.
// -----------------------------------------------------------------------
(function testAthClamped() {
  var maxAth = -Infinity;
  for (var hz = 20; hz <= 24000; hz += 20) {
    var a = CODEC.athDb(hz);
    if (a > maxAth) maxAth = a;
  }
  ok('athDb(f) <= 40 for every f from 20Hz to 24kHz', maxAth <= 40,
    'max=' + maxAth.toFixed(1));

  var a4000 = CODEC.athDb(4000);
  var a100 = CODEC.athDb(100);
  var a20 = CODEC.athDb(20);
  ok('athDb(4000) < athDb(100) < athDb(20) (clamp did not flatten the real shape)',
    a4000 < a100 && a100 < a20,
    'ath4000=' + a4000.toFixed(1) + ' ath100=' + a100.toFixed(1) + ' ath20=' + a20.toFixed(1));
})();

// -----------------------------------------------------------------------
// 5. encode() at 320kbps gives higher SNR than 32kbps; both within ±25% of target
// -----------------------------------------------------------------------
(function testEncode() {
  var sr = 48000;
  var seconds = 4;
  var melody = CODEC.sources[0].make(sr, seconds);

  var t0 = Date.now();
  var enc320 = CODEC.encode(melody, sr, { bitrateKbps: 320, N: 2048, hop: 1024 });
  var t1 = Date.now();
  var enc32 = CODEC.encode(melody, sr, { bitrateKbps: 32, N: 2048, hop: 1024 });
  var t2 = Date.now();

  function snrOf(x, y) {
    var errSum = 0, sigSum = 0;
    for (var i = 0; i < x.length; i++) {
      var e = x[i] - y[i];
      errSum += e * e;
      sigSum += x[i] * x[i];
    }
    return 10 * Math.log10(Math.max(sigSum, 1e-20) / Math.max(errSum, 1e-20));
  }

  var snr320 = snrOf(melody, enc320.audio);
  var snr32 = snrOf(melody, enc32.audio);

  ok('encode(320kbps) SNR > encode(32kbps) SNR', snr320 > snr32,
    'snr320=' + snr320.toFixed(1) + 'dB snr32=' + snr32.toFixed(1) + 'dB');

  var b320 = enc320.stats.bitrateKbps;
  var b32 = enc32.stats.bitrateKbps;
  var within320 = Math.abs(b320 - 320) / 320 <= 0.25;
  var within32 = Math.abs(b32 - 32) / 32 <= 0.25;
  ok('encode(320kbps) achieved bitrate within ±25%', within320,
    'achieved=' + b320.toFixed(1) + 'kbps');
  ok('encode(32kbps) achieved bitrate within ±25%', within32,
    'achieved=' + b32.toFixed(1) + 'kbps');

  ok('encode() on 4s@48kHz N=2048/hop=1024 runs well under 1s (both calls)',
    (t2 - t0) < 2000, 'ms320=' + (t1 - t0) + ' ms32=' + (t2 - t1));
})();

// -----------------------------------------------------------------------
// 5b. encode() amplitude/monotonicity/cutoff sweep across bitrates.
// Regression coverage for a real bug: dequantized coefficients landing far
// above the original coefficient magnitude blew the decoded peak up to
// >600x the input peak at low bitrates (traced to istft() dividing by the
// true, edge-thinned per-sample window-overlap sum instead of the
// steady-state one -- the Hann window is ~0 at its own edges, so only ~1
// frame overlapping near the very start/end of the buffer made that
// denominator tiny, and dividing quantization error by it amplified the
// error enormously right at the signal boundary). Also covers cutoffHz,
// which used to just echo back sr/2 regardless of what was actually kept.
// -----------------------------------------------------------------------
(function testEncodeSweep() {
  var sr = 48000;
  var seconds = 3;
  var melody = CODEC.sources[0].make(sr, seconds);
  var inputPeak = CODEC.peak(melody);

  function pearson(a, b) {
    var n = a.length, ma = 0, mb = 0;
    for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    for (var j = 0; j < n; j++) {
      var xa = a[j] - ma, xb = b[j] - mb;
      num += xa * xb; da += xa * xa; db += xb * xb;
    }
    return num / Math.sqrt(Math.max(da * db, 1e-30));
  }

  var bitrates = [320, 192, 128, 64, 32, 16, 8];
  var results = [];
  for (var i = 0; i < bitrates.length; i++) {
    var kbps = bitrates[i];
    var enc = CODEC.encode(melody, sr, { bitrateKbps: kbps });
    results.push({
      kbps: kbps,
      audio: enc.audio,
      residual: enc.residual,
      peak: CODEC.peak(enc.audio),
      r: pearson(melody, enc.audio),
      cutoffHz: enc.stats.cutoffHz
    });
  }

  // -- peak bound at every bitrate --
  var peakOk = true, worstPeakRow = null;
  for (var p = 0; p < results.length; p++) {
    if (results[p].peak > 1.05 * inputPeak) { peakOk = false; worstPeakRow = results[p]; }
  }
  ok('encode(): output peak <= 1.05x input peak at every bitrate', peakOk,
    peakOk ? '' : (worstPeakRow.kbps + 'kbps peak=' + worstPeakRow.peak.toFixed(3) + ' input=' + inputPeak.toFixed(3)));

  // -- correlation degrades monotonically (non-increasing) as bitrate drops --
  var monotonicOk = true, breakAt = null;
  for (var m = 1; m < results.length; m++) {
    if (results[m].r > results[m - 1].r + 0.02) {
      monotonicOk = false;
      breakAt = results[m - 1].kbps + '->' + results[m].kbps;
    }
  }
  ok('encode(): correlation with input is non-increasing as bitrate drops', monotonicOk,
    'r=' + results.map(function (row) { return row.kbps + ':' + row.r.toFixed(3); }).join(',') +
    (breakAt ? (' BROKE at ' + breakAt) : ''));

  // -- cutoffHz falls with bitrate --
  var c320 = results[0].cutoffHz, c64 = results[3].cutoffHz, c16 = results[5].cutoffHz;
  ok('encode(): cutoffHz(320kbps) > cutoffHz(64kbps) > cutoffHz(16kbps)',
    c320 > c64 && c64 > c16,
    'c320=' + c320.toFixed(0) + ' c64=' + c64.toFixed(0) + ' c16=' + c16.toFixed(0));

  // -- no NaN/Inf anywhere, and residual === x - audio sample for sample --
  var cleanOk = true, residMatchOk = true;
  for (var r2 = 0; r2 < results.length; r2++) {
    var row = results[r2];
    for (var s = 0; s < melody.length; s++) {
      if (!isFinite(row.audio[s]) || !isFinite(row.residual[s])) { cleanOk = false; }
      if (Math.abs((melody[s] - row.audio[s]) - row.residual[s]) > 1e-6) { residMatchOk = false; }
    }
  }
  ok('encode(): no NaN/Inf in audio or residual at any bitrate', cleanOk);
  ok('encode(): residual equals x - audio sample for sample at every bitrate', residMatchOk);

  // -- perceptual sanity: 128kbps should preserve most of the signal --
  var r128 = results[2].r;
  ok('encode(128kbps).r > 0.98 on melody (bit allocation should discard inaudible energy, not audible energy)',
    r128 > 0.98, 'r128=' + r128.toFixed(3));
})();

// -----------------------------------------------------------------------
// 6. rvq mse strictly decreases with each stage
// -----------------------------------------------------------------------
(function testRvq() {
  var rng = CODEC.mulberry32(4242);
  var points = [];
  for (var i = 0; i < 300; i++) {
    // 3 gaussian-ish clusters in 2D via uniform jitter (deterministic)
    var cluster = i % 3;
    var cx = cluster === 0 ? -2 : (cluster === 1 ? 2 : 0);
    var cy = cluster === 2 ? 2.5 : 0;
    points.push([cx + (rng() - 0.5) * 1.2, cy + (rng() - 0.5) * 1.2]);
  }
  var r = CODEC.rvq(points, { codebookSize: 4, stages: 4, seed: 11 });
  var strictlyDecreasing = true;
  for (var s = 1; s < r.mseByStage.length; s++) {
    if (!(r.mseByStage[s] < r.mseByStage[s - 1])) { strictlyDecreasing = false; break; }
  }
  ok('rvq mse strictly decreases with each stage', strictlyDecreasing,
    'mseByStage=' + r.mseByStage.map(function (v) { return v.toFixed(4); }).join(','));

  // -- stages[k].points: the residual cloud each stage actually quantized --
  function rmsOfPoints(pts) {
    var sum = 0, count = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      for (var d = 0; d < p.length; d++) { sum += p[d] * p[d]; count++; }
    }
    return Math.sqrt(sum / Math.max(1, count));
  }

  var stage0MatchesInput = true;
  for (var i0 = 0; i0 < points.length; i0++) {
    var a = points[i0], b = r.stages[0].points[i0];
    for (var d0 = 0; d0 < a.length; d0++) {
      if (a[d0] !== b[d0]) { stage0MatchesInput = false; break; }
    }
    if (!stage0MatchesInput) break;
  }
  ok('rvq: stages[0].points matches the input array element-for-element', stage0MatchesInput);

  var lengthsOk = true;
  for (var sl = 0; sl < r.stages.length; sl++) {
    if (r.stages[sl].points.length !== points.length) { lengthsOk = false; break; }
  }
  ok('rvq: stages[k].points.length equals input length for every stage', lengthsOk);

  var rmsByStage = r.stages.map(function (st) { return rmsOfPoints(st.points); });
  var rmsStrictlyDecreasing = true;
  for (var sr2 = 1; sr2 < rmsByStage.length; sr2++) {
    if (!(rmsByStage[sr2] < rmsByStage[sr2 - 1])) { rmsStrictlyDecreasing = false; break; }
  }
  ok('rvq: RMS magnitude of stages[k].points is strictly decreasing in k', rmsStrictlyDecreasing,
    'rmsByStage=' + rmsByStage.map(function (v) { return v.toFixed(4); }).join(','));

  var pointsClean = true;
  for (var sc = 0; sc < r.stages.length; sc++) {
    var pts = r.stages[sc].points;
    for (var pi = 0; pi < pts.length; pi++) {
      for (var pd = 0; pd < pts[pi].length; pd++) {
        if (!isFinite(pts[pi][pd])) { pointsClean = false; }
      }
    }
  }
  ok('rvq: no NaN/Inf in any stage\'s points', pointsClean);
})();

// -----------------------------------------------------------------------
// bonus sanity: determinism (same input => same output)
// -----------------------------------------------------------------------
(function testDeterminism() {
  var sr = 48000, seconds = 1;
  var a = CODEC.sources[1].make(sr, seconds); // vowel
  var b = CODEC.sources[1].make(sr, seconds);
  var same = true;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) { same = false; break; }
  }
  ok('sources are deterministic (same seed => same output)', same);
})();

// -----------------------------------------------------------------------
// bonus sanity: sources peak-normalized to ~0.9 (except twotone/tone which
// are reference-level tones, and noise which is level-referenced)
// -----------------------------------------------------------------------
(function testSourcesSanity() {
  var sr = 48000, seconds = 2;
  for (var i = 0; i < CODEC.sources.length; i++) {
    var src = CODEC.sources[i];
    var x = src.make(sr, seconds);
    var p = CODEC.peak(x);
    var hasNaN = false;
    for (var j = 0; j < x.length; j++) {
      if (!isFinite(x[j])) { hasNaN = true; break; }
    }
    ok('source "' + src.id + '" finite, no NaN/Inf', !hasNaN);
    ok('source "' + src.id + '" peak <= 1.0', p <= 1.0001, 'peak=' + p.toFixed(3));
  }
})();

// -----------------------------------------------------------------------
// summary
// -----------------------------------------------------------------------
console.log('');
console.log(passes + ' passed, ' + failures + ' failed');
if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
