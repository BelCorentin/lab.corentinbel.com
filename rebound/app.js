"use strict";
/* rebound effect explainer: shared by / (EN) and /fr/ (FR). Text lives in the HTML;
   only the few strings drawn into SVGs or computed live are here. */
const FR = document.documentElement.lang === "fr";
const T = FR ? {
  before: "avant", paper: "sur le papier", real: "en vrai", L: "L / an",
  saved: "économisé", eaten: "mangé par le rebond", extra: "consommé en plus",
  verdict: (r, a, e, cost) => r <= 0.001
    ? `Personne ne change ses habitudes: vous économisez les <b>${e} L</b> promis. Rebond <b>0 %</b>. C'est le monde des calculs d'ingénieur.`
    : r < 1
    ? `Chaque km coûte ${cost}, donc on roule plus. Vous économisez <b>${a} L</b> au lieu de <b>${e} L</b>: le rebond a mangé <b>${Math.round(r * 100)} %</b> du gain. Il reste un vrai gain.`
    : r < 1.005
    ? `Rebond <b>100 %</b>: tout le gain a été reconsommé. Vous roulez beaucoup plus pour exactement le même carburant.`
    : `<b>Retour de flamme</b> (rebond ${Math.round(r * 100)} %): vous brûlez <b>${-a} L de plus</b> qu'avec l'ancienne voiture. C'est le paradoxe de Jevons.`,
  cheaper: f => `${Math.round((1 - f) * 100)} % moins cher`,
  sameCost: "pareil",
  scales: [["un moteur plus efficace", "le gain"], ["DIRECT", "on roule plus"], ["INDIRECT", "l'argent économisé part en week-end en avion"], ["ÉCONOMIE ENTIÈRE", "l'énergie moins chère fait tourner toute l'économie plus vite"]],
  pollNote: k => `Noté. Gardez votre réponse en tête: on y revient tout en bas. (Vous avez choisi: ${k})`,
  pollBack: k => `En haut de la page, vous aviez répondu: <b>${k}</b>.`,
  pollNone: "Vous n'aviez pas répondu en haut de la page: pas de triche, remontez voter avant de lire !",
} : {
  before: "before", paper: "on paper", real: "for real", L: "L / year",
  saved: "saved", eaten: "eaten by rebound", extra: "burned on top",
  verdict: (r, a, e, cost) => r <= 0.001
    ? `Nobody changes their habits: you save the promised <b>${e} L</b>. Rebound <b>0 %</b>. That's the world of engineering estimates.`
    : r < 1
    ? `Each km is ${cost}, so people drive more. You save <b>${a} L</b> instead of <b>${e} L</b>: rebound ate <b>${Math.round(r * 100)} %</b> of the gain. A real saving remains.`
    : r < 1.005
    ? `Rebound <b>100 %</b>: the whole gain is spent again. Many more km for exactly the same fuel.`
    : `<b>Backfire</b> (rebound ${Math.round(r * 100)} %): you now burn <b>${-a} L more</b> than with the old car. That's the Jevons paradox.`,
  cheaper: f => `${Math.round((1 - f) * 100)} % cheaper`,
  sameCost: "the same",
  scales: [["a more efficient engine", "the gain"], ["DIRECT", "you drive more"], ["INDIRECT", "the money saved buys a weekend flight"], ["ECONOMY-WIDE", "cheaper energy makes the whole economy run faster"]],
  pollNote: k => `Noted. Keep your answer in mind: we come back to it at the very end. (You picked: ${k})`,
  pollBack: k => `At the top of the page, you answered: <b>${k}</b>.`,
  pollNone: "You didn't answer at the top of the page: no cheating, scroll up and vote before reading on!",
};
const $ = s => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

/* ---------- 1. opening poll ---------- */
{
  const btns = document.querySelectorAll(".opt");
  const label = b => b.querySelector("span").textContent;
  const show = key => {
    btns.forEach(b => b.classList.toggle("on", b.dataset.k === key));
    const b = [...btns].find(b => b.dataset.k === key);
    if (b) $("#pollNote").textContent = T.pollNote(label(b));
    const back = $("#pollBack");
    if (back) back.innerHTML = b ? T.pollBack(label(b)) : T.pollNone;
  };
  btns.forEach(b => b.addEventListener("click", () => { store.set("rebound-poll", b.dataset.k); show(b.dataset.k); }));
  show(store.get("rebound-poll"));
}

/* ---------- 2. car bench ---------- */
{
  const svg = $("#carViz"), KM = 10000, OLD = 8;
  const sNew = $("#newCons"), sExtra = $("#extraKm");
  const W = 640, H = 270, X0 = 118, XMAX = 600, MAXL = 1300;
  const sx = l => X0 + (XMAX - X0) * Math.min(l, MAXL) / MAXL;
  function bar(y, label, sub, parts) {
    el("text", { x: 8, y: y + 20, "font-family": "Fraunces,serif", "font-weight": 600, "font-size": 17, fill: "#1b1a22" }, svg, label);
    el("text", { x: 8, y: y + 38, "font-size": 11.5, fill: "#6b5f52" }, svg, sub);
    let x = X0;
    for (const [w, fill, stroke, hatch] of parts) {
      if (w <= 0) continue;
      const x2 = sx(w + (x - X0) / (XMAX - X0) * MAXL);
      el("rect", { x, y: y + 4, width: Math.max(0, x2 - x), height: 34, fill: hatch ? "url(#hatch)" : fill, stroke, "stroke-width": 2, rx: 4 }, svg);
      x = x2;
    }
  }
  function draw() {
    const nw = +sNew.value, ex = +sExtra.value / 100;
    const before = KM * OLD / 100, paper = KM * nw / 100, real = KM * (1 + ex) * nw / 100;
    const E = before - paper, A = before - real, R = E > 0 ? 1 - A / E : 0;
    $("#newConsV").textContent = nw.toFixed(1) + " L/100 km";
    $("#extraKmV").textContent = "+" + Math.round(ex * 100) + " % km";
    svg.innerHTML = `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#efb0a0"/><path d="M0 0V7" stroke="#c0503a" stroke-width="2.4"/></pattern></defs>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    for (let l = 0; l <= MAXL; l += 200) {
      el("line", { x1: sx(l), x2: sx(l), y1: 14, y2: 228, stroke: "#e2cfac", "stroke-width": 1 }, svg);
      el("text", { x: sx(l), y: 246, "text-anchor": "middle", "font-size": 11, fill: "#6b5f52" }, svg, l);
    }
    el("text", { x: XMAX, y: 264, "text-anchor": "end", "font-size": 11, fill: "#6b5f52" }, svg, T.L);
    bar(14, T.before, `${OLD} L/100 · ${KM / 1000}k km`, [[before, "#3a3530", "#1b1a22"]]);
    bar(84, T.paper, `${nw} L/100 · ${KM / 1000}k km`, [[paper, "#d9761e", "#1b1a22"], [E, "#9bc8b8", "#3f7a6c"]]);
    const kmReal = Math.round(KM * (1 + ex) / 100) / 10;
    if (real <= before) bar(154, T.real, `${nw} L/100 · ${kmReal}k km`, [[paper, "#d9761e", "#1b1a22"], [real - paper, 0, "#c0503a", 1], [A, "#9bc8b8", "#3f7a6c"]]);
    else bar(154, T.real, `${nw} L/100 · ${kmReal}k km`, [[before, "#d9761e", "#1b1a22"], [real - before, "#c0503a", "#1b1a22"]]);
    el("line", { x1: sx(before), x2: sx(before), y1: 8, y2: 230, stroke: "#1b1a22", "stroke-width": 1.6, "stroke-dasharray": "4 4" }, svg);
    // legend
    const lg = [["#9bc8b8", T.saved], [0, T.eaten], ["#c0503a", T.extra]];
    let lx = X0;
    for (const [f, t] of lg) {
      el("rect", { x: lx, y: 254, width: 12, height: 12, fill: f || "url(#hatch)", stroke: "#1b1a22", "stroke-width": 1.2, rx: 2 }, svg);
      const tx = el("text", { x: lx + 17, y: 264, "font-size": 11.5, fill: "#1b1a22" }, svg, t);
      lx += 26 + t.length * 6.2;
    }
    const f = nw / OLD;
    $("#verdict").innerHTML = T.verdict(R, Math.round(A), Math.round(E), f < 1 ? T.cheaper(f) : T.sameCost);
  }
  sNew.addEventListener("input", draw); sExtra.addEventListener("input", draw);
  document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const [n, x] = b.dataset.preset.split(","); sNew.value = n; sExtra.value = x; draw();
  }));
  draw();
}

/* ---------- 3. three scales (ripples) ---------- */
{
  const svg = $("#scales");
  if (svg) {
    const cx = 170, cy = 155, cols = ["#d9761e", "#3f7fb0", "#7a5aa8", "#3f7a6c"];
    svg.setAttribute("viewBox", "0 0 820 300");
    const rs = [26, 70, 112, 148];
    for (let i = 3; i >= 1; i--) {
      el("circle", { cx, cy, r: rs[i], fill: cols[i], "fill-opacity": .12, stroke: cols[i], "stroke-width": 2.4 }, svg);
    }
    el("circle", { cx, cy, r: rs[0], fill: "#f6c56b", stroke: "#1b1a22", "stroke-width": 2.4 }, svg);
    el("text", { x: cx, y: cy + 5, "text-anchor": "middle", "font-family": "Fraunces,serif", "font-size": 15, "font-weight": 600 }, svg, "−50 %");
    const ys = [140, 180, 220, 262];
    svg.setAttribute("viewBox", "0 0 820 310");
    T.scales.forEach(([h, s], i) => {
      const py = ys[i], px = cx + Math.sqrt(rs[i] * rs[i] - (py - cy) * (py - cy));
      el("path", { d: `M${px.toFixed(1)} ${py} H 360`, fill: "none", stroke: "#1b1a22", "stroke-width": 1.2, "stroke-dasharray": "3 4" }, svg);
      el("circle", { cx: px, cy: py, r: 4, fill: i ? cols[i] : "#1b1a22", stroke: "#1b1a22" }, svg);
      el("text", { x: 370, y: py - 4, "font-size": 12, "font-weight": 600, "letter-spacing": ".08em", fill: i ? cols[i] : "#6b5f52" }, svg, h.toUpperCase());
      el("text", { x: 370, y: py + 14, "font-family": "Fraunces,serif", "font-size": 16, fill: "#1b1a22" }, svg, s);
    });
  }
}

/* ---------- 4. small log charts ---------- */
const L = FR ? {
  price: "prix d'une unité de lumière", use: "lumière utilisée par personne", income: "revenu par personne",
  dcY: "TWh / an", proj: "projection", aiPrice: "$ / million de tokens", aiUse: "tokens / mois (Google)",
} : {
  price: "price of a unit of light", use: "light used per person", income: "income per person",
  dcY: "TWh / year", proj: "projection", aiPrice: "$ / million tokens", aiUse: "tokens / month (Google)",
};
const fmtX = v => v >= 1 ? "×" + v.toLocaleString(FR ? "fr-FR" : "en-GB") : "÷" + Math.round(1 / v).toLocaleString(FR ? "fr-FR" : "en-GB");
/* light: three log bars, 1800 = 1 */
{
  const svg = $("#lightViz");
  if (svg) {
    svg.setAttribute("viewBox", "0 0 560 170");
    const rows = [[L.price, 1 / 3000, "#3f7fb0"], [L.income, 15, "#b9a68a"], [L.use, 6500, "#d9761e"]];
    const cx = 250, k = 200 / Math.log10(10000); // centre = ×1
    el("line", { x1: cx, x2: cx, y1: 8, y2: 150, stroke: "#1b1a22", "stroke-width": 1.6 }, svg);
    el("text", { x: cx, y: 166, "text-anchor": "middle", "font-size": 11, fill: "#6b5f52" }, svg, FR ? "1800 = 1" : "1800 = 1");
    rows.forEach(([lab, v, c], i) => {
      const y = 14 + i * 46, w = Math.log10(v) * k, x = w < 0 ? cx + w : cx;
      el("rect", { x, y, width: Math.abs(w), height: 26, fill: c, stroke: "#1b1a22", "stroke-width": 1.8, rx: 4 }, svg);
      el("text", { x: w < 0 ? cx + 8 : cx - 8, y: y + 18, "text-anchor": w < 0 ? "start" : "end", "font-size": 12.5, fill: "#1b1a22" }, svg, lab);
      el("text", { x: w < 0 ? x - 6 : x + w + 6, y: y + 18, "text-anchor": w < 0 ? "end" : "start", "font-family": "Fraunces,serif", "font-weight": 600, "font-size": 15 }, svg, fmtX(v));
    });
  }
}
/* data centres: TWh, linear */
{
  const svg = $("#dcViz");
  if (svg) {
    const W = 320, H = 210, x0 = 40, x1 = 305, y0 = 180, y1 = 16;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pts = [[2010, 194], [2018, 205], [2024, 415], [2030, 945]];
    const sx = t => x0 + (x1 - x0) * (t - 2010) / 20, sy = v => y0 - (y0 - y1) * v / 1000;
    for (const v of [0, 250, 500, 750, 1000]) {
      el("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), stroke: "#4a4d86", "stroke-width": 1 }, svg);
      el("text", { x: x0 - 5, y: sy(v) + 4, "text-anchor": "end", "font-size": 10, fill: "#b8b2cf" }, svg, v);
    }
    for (const t of [2010, 2015, 2020, 2025, 2030]) el("text", { x: sx(t), y: y0 + 16, "text-anchor": "middle", "font-size": 10, fill: "#b8b2cf" }, svg, t);
    el("text", { x: x0, y: 10, "font-size": 10, fill: "#b8b2cf" }, svg, L.dcY);
    el("path", { d: `M${sx(2010)} ${sy(194)} L${sx(2018)} ${sy(205)} L${sx(2024)} ${sy(415)}`, fill: "none", stroke: "#ffd88a", "stroke-width": 3 }, svg);
    el("path", { d: `M${sx(2024)} ${sy(415)} L${sx(2030)} ${sy(945)}`, fill: "none", stroke: "#ffd88a", "stroke-width": 3, "stroke-dasharray": "6 5" }, svg);
    pts.forEach(([t, v], i) => {
      el("circle", { cx: sx(t), cy: sy(v), r: 4.5, fill: i === 3 ? "#33366b" : "#ffd88a", stroke: "#ffd88a", "stroke-width": 2 }, svg);
      el("text", { x: sx(t) + (i === 3 ? -8 : i === 0 ? 4 : 0), y: sy(v) - 9, "text-anchor": i === 3 ? "end" : i === 0 ? "start" : "middle", "font-size": 11, "font-weight": 600, fill: "#fff3d6" }, svg, v + (i === 3 ? " (" + L.proj + ")" : ""));
    });
  }
}
/* AI: two log panels */
{
  const svg = $("#aiViz");
  if (svg) {
    svg.setAttribute("viewBox", "0 0 320 210");
    const panel = (ox, lab, pts, lo, hi, col, fmt, place) => {
      const x0 = ox + 8, x1 = ox + 142, y0 = 170, y1 = 30;
      const sy = v => y0 - (y0 - y1) * (Math.log10(v) - lo) / (hi - lo);
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0], sx = t => x0 + (x1 - x0) * (t - t0) / (t1 - t0);
      el("text", { x: ox + 75, y: 14, "text-anchor": "middle", "font-size": 10.5, fill: "#b8b2cf" }, svg, lab);
      el("line", { x1: x0, x2: x1, y1: y0, y2: y0, stroke: "#4a4d86" }, svg);
      el("path", { d: pts.map(([t, v], i) => (i ? "L" : "M") + sx(t).toFixed(1) + " " + sy(v).toFixed(1)).join(" "), fill: "none", stroke: col, "stroke-width": 3 }, svg);
      pts.forEach(([t, v, tl], i) => {
        el("circle", { cx: sx(t), cy: sy(v), r: 4.5, fill: col, stroke: "#0e0f22", "stroke-width": 1.5 }, svg);
        const [dx, dy, an] = place(i, pts.length);
        el("text", { x: sx(t) + dx, y: sy(v) + dy, "text-anchor": an, "font-size": 11, "font-weight": 600, fill: "#fff3d6" }, svg, fmt(v));
        el("text", { x: sx(t), y: y0 + 16, "text-anchor": i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle", "font-size": 10, fill: "#b8b2cf" }, svg, tl);
      });
    };
    panel(0, L.aiPrice, [[2021.9, 60, "2021"], [2024.9, 0.06, "2024"]], -1.5, 2, "#ffd88a", v => "$" + v, (i, n) => i === 0 ? [8, -6, "start"] : [-10, 4, "end"]);
    const T = v => v >= 1000 ? (v / 1000).toLocaleString(FR ? "fr-FR" : "en-GB") + (FR ? " 10¹⁵" : " quadr.") : v + " T";
    panel(165, L.aiUse, [[2024.3, 9.7, "04/24"], [2025.3, 480, "04/25"], [2025.8, 1300, "10/25"]], 0.5, 3.4, "#9bc8ff", T, (i, n) => i === 0 ? [8, 16, "start"] : [-8, -6, "end"]);
  }
}
