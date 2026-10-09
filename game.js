/* =====================================================================
   SUGAR POP - an original match-3 puzzle game (HTML5 Canvas + WebAudio)
   No libraries, no assets: graphics are drawn in code, sound is synthesized.
   ===================================================================== */
(() => {
'use strict';

/* ------------------------------ constants ------------------------------ */
const COLS = 8, ROWS = 8, CELL = 64, W = COLS * CELL, H = ROWS * CELL, TAU = Math.PI * 2;

const TYPES = [
  { c1: '#ff9a9a', c2: '#e11d48', dark: '#8f1130', shape: 'circle'   },
  { c1: '#ffd08a', c2: '#f97316', dark: '#9a4306', shape: 'square'   },
  { c1: '#fff6a0', c2: '#facc15', dark: '#9a7a05', shape: 'star'     },
  { c1: '#b5f5a0', c2: '#22c55e', dark: '#12722f', shape: 'triangle' },
  { c1: '#9fd8ff', c2: '#2563eb', dark: '#16358f', shape: 'diamond'  },
  { c1: '#e4b5ff', c2: '#9333ea', dark: '#5b1a96', shape: 'hexagon'  },
];
const TYPE_NAMES = ['red circles', 'orange squares', 'yellow stars', 'green triangles', 'blue diamonds', 'purple hexagons'];

const LEVELS = [
  { name: 'First Taste',       moves: 20, colors: 4, score: 1000 },
  { name: 'Cherry Pop',        moves: 20, colors: 5, collect: { 0: 16 } },
  { name: 'Sugar Rush',        moves: 22, colors: 5, score: 2500 },
  { name: 'Jelly Beginnings',  moves: 24, colors: 5, jelly: 'center' },
  { name: 'Double Trouble',    moves: 26, colors: 5, collect: { 1: 18, 3: 18 } },
  { name: 'Frosted Frame',     moves: 26, colors: 5, jelly: 'frame', score: 2800 },
  { name: 'Candy Storm',       moves: 28, colors: 6, score: 4500 },
  { name: 'Rainbow Trio',      moves: 30, colors: 6, collect: { 0: 14, 2: 14, 4: 14 } },
  { name: 'Jelly Jam',         moves: 32, colors: 6, jelly: 'full' },
  { name: 'Grand Finale',      moves: 35, colors: 6, jelly: 'checker', score: 4500, collect: { 5: 15 } },
];

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keyOf = (r, c) => r * COLS + c;

/* ------------------------------ save data ------------------------------ */
const save = { stars: Array(LEVELS.length).fill(0), unlocked: 1, sfx: true, music: true };
try {
  const s = JSON.parse(localStorage.getItem('sugarpop-v1'));
  if (s) Object.assign(save, s);
} catch (e) { /* ignore */ }
function persist() { try { localStorage.setItem('sugarpop-v1', JSON.stringify(save)); } catch (e) { /* ignore */ } }

/* -------------------------------- sound -------------------------------- */
const Sound = (() => {
  let ac = null, master, sfx, mus, timer = null, step = 0, nextT = 0;
  const hz = s => 261.63 * Math.pow(2, s / 12);

  function init() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      sfx = ac.createGain(); sfx.connect(master);
      mus = ac.createGain(); mus.connect(master);
      apply();
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function apply() {
    if (!ac) return;
    sfx.gain.value = save.sfx ? 1 : 0;
    mus.gain.value = save.music ? 0.16 : 0;
  }
  function note(f, d, t, type, vol, dest, slide) {
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + d + 0.03);
  }
  function tone(f, d, o = {}) {
    if (!ac || !save.sfx) return;
    note(f, d, ac.currentTime + (o.delay || 0), o.type || 'sine', o.vol ?? 0.25, sfx, o.slide);
  }
  function noise(d, vol, f0, f1, dest, when) {
    if (!ac) return;
    const t = when ?? ac.currentTime;
    const len = Math.max(1, Math.floor(ac.sampleRate * d));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const filt = ac.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 0.9;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + d);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(filt); filt.connect(g); g.connect(dest || sfx);
    src.start(t);
  }

  /* --- background music: a small looping chiptune --- */
  const MEL = [12, null, 9, null, 7, 9, 12, null, 14, null, 12, null, 9, null, 7, null,
               9, null, 7, null, 4, 7, 9, null, 7, null, 4, 2, 0, null, null, null];
  const BASS = [-12, -15, -19, -17];
  function playStep(s, t) {
    const m = MEL[s];
    if (m !== null) note(hz(m), 0.3, t, 'square', 0.22, mus);
    if (s % 4 === 0) note(hz(BASS[(s >> 3) % 4]), 0.42, t, 'triangle', 0.55, mus);
    if (s % 8 === 2 || s % 8 === 6) note(hz(BASS[(s >> 3) % 4] + 12 + (s % 8 === 6 ? 7 : 4)), 0.15, t, 'triangle', 0.18, mus);
    if (s % 2 === 1) noise(0.04, 0.12, 7000, 5000, mus, t);
  }
  function sched() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.4) {
      playStep(step, nextT);
      nextT += 0.2; step = (step + 1) % 32;
    }
  }
  function startMusic() {
    if (!ac || timer) return;
    step = 0; nextT = ac.currentTime + 0.1;
    timer = setInterval(sched, 80);
  }

  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  return {
    init, apply, startMusic,
    select() { tone(hz(16), 0.08, { type: 'triangle', vol: 0.22 }); },
    click()  { tone(hz(19), 0.06, { type: 'square', vol: 0.1 }); },
    swap()   { tone(280, 0.14, { type: 'sine', slide: 1.9, vol: 0.2 }); },
    invalid() {
      tone(170, 0.16, { type: 'sawtooth', vol: 0.14, slide: 0.7 });
      tone(130, 0.2, { type: 'sawtooth', vol: 0.14, slide: 0.7, delay: 0.09 });
    },
    match(combo) {
      const s = SCALE[Math.min(combo - 1, SCALE.length - 1)];
      tone(hz(s + 12), 0.2, { type: 'triangle', vol: 0.32 });
      tone(hz(s + 19), 0.16, { type: 'sine', vol: 0.18, delay: 0.05 });
    },
    special() { [12, 16, 19, 24].forEach((n, i) => tone(hz(n + 12), 0.1, { type: 'square', vol: 0.1, delay: i * 0.06 })); },
    line()    { tone(300, 0.4, { type: 'sawtooth', slide: 4, vol: 0.12 }); if (ac && save.sfx) noise(0.35, 0.25, 600, 4000); },
    explode() { tone(90, 0.35, { type: 'sawtooth', slide: 0.35, vol: 0.28 }); if (ac && save.sfx) noise(0.45, 0.4, 2200, 160); },
    bomb()    { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(hz(n + 12), 0.2, { type: 'triangle', vol: 0.2, delay: i * 0.045 })); if (ac && save.sfx) noise(0.6, 0.35, 3000, 200); },
    land()    { tone(120, 0.07, { type: 'sine', vol: 0.14, slide: 0.6 }); },
    shuffle() { if (ac && save.sfx) { noise(0.5, 0.3, 500, 3000); } },
    star(i)   { tone(hz(12 + i * 4), 0.35, { type: 'triangle', vol: 0.3 }); tone(hz(24 + i * 4), 0.3, { type: 'sine', vol: 0.15 }); },
    win()  { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(hz(n + 12), 0.28, { type: 'square', vol: 0.14, delay: i * 0.09 })); },
    lose() { [7, 5, 3, 0].forEach((n, i) => tone(hz(n), 0.4, { type: 'sawtooth', vol: 0.14, delay: i * 0.22, slide: 0.95 })); },
    start() { [0, 7, 12].forEach((n, i) => tone(hz(n + 12), 0.16, { type: 'triangle', vol: 0.25, delay: i * 0.08 })); },
  };
})();

/* ------------------------------ drawing ------------------------------- */
function roundRectPath(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
}
function polyPath(g, pts) {
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
}
function shapePath(g, shape, R) {
  g.beginPath();
  switch (shape) {
    case 'circle': g.arc(0, 0, R, 0, TAU); break;
    case 'square': { const s = R * 0.9; roundRectPath(g, -s, -s, s * 2, s * 2, R * 0.38); break; }
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? R * 0.58 : R * 1.12;
        pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      }
      polyPath(g, pts); break;
    }
    case 'triangle': {
      const pts = [];
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; pts.push([Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12 + R * 0.1]); }
      polyPath(g, pts); break;
    }
    case 'diamond': polyPath(g, [[0, -R * 1.12], [R * 0.95, 0], [0, R * 1.12], [-R * 0.95, 0]]); break;
    case 'hexagon': {
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; pts.push([Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05]); }
      polyPath(g, pts); break;
    }
  }
  g.closePath();
}

function drawCandy(g, cd, cx, cy, sc = 1, alpha = 1, t = 0) {
  const R = CELL * 0.36;
  g.save();
  g.translate(cx, cy); g.scale(sc, sc); g.globalAlpha = alpha;
  g.lineJoin = 'round';

  if (cd.special === 'bomb') {
    const gr = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.1);
    gr.addColorStop(0, '#8d8da0'); gr.addColorStop(1, '#13131d');
    g.shadowColor = 'rgba(255,255,255,.8)'; g.shadowBlur = 12;
    g.beginPath(); g.arc(0, 0, R * 1.04, 0, TAU);
    g.fillStyle = gr; g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 3; g.strokeStyle = '#000'; g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + t * 1.5;
      g.fillStyle = `hsl(${(i * 45 + t * 160) % 360},95%,60%)`;
      g.beginPath(); g.arc(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, R * 0.17, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.ellipse(-R * 0.35, -R * 0.4, R * 0.28, R * 0.16, -0.6, 0, TAU); g.fill();
  } else {
    const T = TYPES[cd.type];
    shapePath(g, T.shape, R);
    const gr = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.25);
    gr.addColorStop(0, T.c1); gr.addColorStop(1, T.c2);
    if (cd.special) { g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 12; }
    g.fillStyle = gr; g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 3; g.strokeStyle = T.dark; g.stroke();

    if (cd.special === 'h' || cd.special === 'v') {
      g.save(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 5;
      for (const k of [-R * 0.5, 0, R * 0.5]) {
        g.beginPath();
        if (cd.special === 'h') { g.moveTo(-R * 1.2, k); g.lineTo(R * 1.2, k); }
        else { g.moveTo(k, -R * 1.2); g.lineTo(k, R * 1.2); }
        g.stroke();
      }
      g.restore();
    } else if (cd.special === 'blast') {
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, R * (0.55 + 0.1 * Math.sin(t * 6)), 0, TAU); g.stroke();
      g.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + t * 2;
        g.beginPath(); g.arc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, 3, 0, TAU); g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(-R * 0.35, -R * 0.4, R * 0.28, R * 0.16, -0.6, 0, TAU); g.fill();
  }
  g.restore();
}

function iconCanvas(type) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 36;
  drawCandy(cv.getContext('2d'), { type, special: null }, 18, 18, 0.5, 1, 0);
  return cv;
}

/* ------------------------------ game state ----------------------------- */
const canvas = $('board'), g = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;

let grid = [], jelly = [];
let levelIdx = 0, lv = LEVELS[0];
let moves = 0, score = 0, collected = {}, jellyLeft = 0;
let busy = true, over = false, session = 0, onGame = false;
let selected = null, dragStart = null, hint = null, hintTimer = null, shake = 0;
let goals = [];
const pops = [], parts = [], texts = [], beams = [];

const randType = () => Math.floor(Math.random() * lv.colors);
const newCandy = (type, c, y) => ({ type, special: null, x: c * CELL, y, vy: 0, pulse: 0 });
const tAt = (r, c) => { const d = grid[r][c]; return d ? (d.special === 'bomb' ? -1 : d.type) : -2; };

function jellyMask(kind) {
  return Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) =>
    kind === 'full' ||
    (kind === 'center' && r >= 2 && r <= 5 && c >= 2 && c <= 5) ||
    (kind === 'frame' && (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)) ||
    (kind === 'checker' && (r + c) % 2 === 0)));
}

/* ------------------------------ board logic ---------------------------- */
function findRuns() {
  const runs = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const t = tAt(r, c); let e = c + 1;
      if (t >= 0) {
        while (e < COLS && tAt(r, e) === t) e++;
        if (e - c >= 3) { const cells = []; for (let i = c; i < e; i++) cells.push([r, i]); runs.push({ dir: 'h', cells }); }
      }
      c = e;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const t = tAt(r, c); let e = r + 1;
      if (t >= 0) {
        while (e < ROWS && tAt(e, c) === t) e++;
        if (e - r >= 3) { const cells = []; for (let i = r; i < e; i++) cells.push([i, c]); runs.push({ dir: 'v', cells }); }
      }
      r = e;
    }
  }
  return runs;
}

function swapGrid(a, b) {
  const t = grid[a.r][a.c]; grid[a.r][a.c] = grid[b.r][b.c]; grid[b.r][b.c] = t;
}

function findMove() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const r2 = r + dr, c2 = c + dc;
      if (r2 >= ROWS || c2 >= COLS) continue;
      const a = grid[r][c], b = grid[r2][c2];
      if (!a || !b) continue;
      if (a.special === 'bomb' || b.special === 'bomb' || (a.special && b.special)) return [{ r, c }, { r: r2, c: c2 }];
      swapGrid({ r, c }, { r: r2, c: c2 });
      const ok = findRuns().length > 0;
      swapGrid({ r, c }, { r: r2, c: c2 });
      if (ok) return [{ r, c }, { r: r2, c: c2 }];
    }
  }
  return null;
}

function fillBoard() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  do {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      let t;
      do { t = randType(); } while (
        (c >= 2 && grid[r][c - 1]?.type === t && grid[r][c - 2]?.type === t) ||
        (r >= 2 && grid[r - 1][c]?.type === t && grid[r - 2][c]?.type === t));
      grid[r][c] = newCandy(t, c, (r - ROWS) * CELL - c * 30);
    }
  } while (!findMove());
}

function commonColor() {
  const cnt = Array(TYPES.length).fill(0);
  grid.forEach(row => row.forEach(cd => { if (cd && cd.special !== 'bomb') cnt[cd.type]++; }));
  const max = Math.max(...cnt);
  const best = cnt.map((n, i) => (n === max ? i : -1)).filter(i => i >= 0);
  return best[Math.floor(Math.random() * best.length)];
}

/* Build a "plan" (what to clear / which specials to create) from match runs */
function planFromRuns(runs, prefer) {
  const clear = new Set(), inH = new Set(), inV = new Set(), cre = new Map();
  const rank = { h: 1, v: 1, blast: 2, bomb: 3 };
  const want = (k, sp) => { const cur = cre.get(k); if (!cur || rank[sp] > rank[cur]) cre.set(k, sp); };
  runs.forEach(run => {
    run.cells.forEach(([r, c]) => { const k = keyOf(r, c); clear.add(k); (run.dir === 'h' ? inH : inV).add(k); });
    if (run.cells.length >= 4) {
      const pv = run.cells.find(([r, c]) => prefer.includes(keyOf(r, c))) || run.cells[Math.floor((run.cells.length - 1) / 2)];
      want(keyOf(pv[0], pv[1]), run.cells.length >= 5 ? 'bomb' : (run.dir === 'h' ? 'v' : 'h'));
    }
  });
  inH.forEach(k => { if (inV.has(k)) want(k, 'blast'); });
  const creations = [];
  cre.forEach((sp, k) => {
    const r = (k / COLS) | 0, c = k % COLS;
    if (grid[r][c].special) return;           // existing special just activates instead
    clear.delete(k);
    creations.push({ r, c, special: sp });
  });
  return { clear, creations, bombColor: {} };
}

/* Plan for swapping a colour bomb / two specials together */
function planSwapSpecial(a, b) {
  const ca = grid[a.r][a.c], cb = grid[b.r][b.c];
  const ka = keyOf(a.r, a.c), kb = keyOf(b.r, b.c);
  const clear = new Set(), bombColor = {};
  if (ca.special === 'bomb' || cb.special === 'bomb') {
    if (ca.special === 'bomb' && cb.special === 'bomb') {
      clear.add(ka); clear.add(kb); bombColor[ka] = 'all'; bombColor[kb] = 'all';
    } else {
      const bk = ca.special === 'bomb' ? ka : kb, other = ca.special === 'bomb' ? cb : ca;
      clear.add(bk); bombColor[bk] = other.type;
    }
  } else { clear.add(ka); clear.add(kb); }
  return { clear, creations: [], bombColor };
}

/* Expand the clear-set with the effects of any specials inside it (chain reactions) */
function expand(plan, protect) {
  const set = plan.clear, fx = { line: 0, blast: 0, bomb: 0 };
  const done = new Set(), stack = [...set];
  const add = (r, c) => {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return;
    const k = keyOf(r, c);
    if (protect.has(k) || !grid[r][c]) return;
    set.add(k); stack.push(k);
  };
  while (stack.length) {
    const k = stack.pop();
    if (done.has(k)) continue;
    done.add(k);
    const r = (k / COLS) | 0, c = k % COLS, cd = grid[r][c];
    if (!cd || !cd.special) continue;
    const px = c * CELL + CELL / 2, py = r * CELL + CELL / 2;
    if (cd.special === 'h') { fx.line++; for (let i = 0; i < COLS; i++) add(r, i); beams.push({ kind: 'row', r, t: 0 }); }
    else if (cd.special === 'v') { fx.line++; for (let i = 0; i < ROWS; i++) add(i, c); beams.push({ kind: 'col', c, t: 0 }); }
    else if (cd.special === 'blast') {
      fx.blast++;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
      beams.push({ kind: 'ring', x: px, y: py, t: 0 });
    } else if (cd.special === 'bomb') {
      fx.bomb++;
      let col = plan.bombColor[k];
      if (col === undefined) col = commonColor();
      for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
        const o = grid[rr][cc];
        if (o && (col === 'all' || (o.special !== 'bomb' && o.type === col))) {
          add(rr, cc);
          if (col !== 'all') beams.push({ kind: 'zap', x1: px, y1: py, x2: cc * CELL + CELL / 2, y2: rr * CELL + CELL / 2, t: 0 });
        }
      }
      beams.push({ kind: 'flash', t: 0 });
    }
  }
  return fx;
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 240;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0, max: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 4 });
  }
}

async function executePlan(plan, combo) {
  const set = plan.clear;
  const protect = new Set(plan.creations.map(o => keyOf(o.r, o.c)));
  const fx = expand(plan, protect);
  let count = 0, sx = 0, sy = 0, gain = 0;
  set.forEach(k => {
    const r = (k / COLS) | 0, c = k % COLS, cd = grid[r][c];
    if (!cd) return;
    count++; sx += c; sy += r;
    if (cd.special !== 'bomb') collected[cd.type] = (collected[cd.type] || 0) + 1;
    gain += 20 * combo + (cd.special ? 40 : 0);
    if (jelly[r][c]) { jelly[r][c] = false; jellyLeft--; gain += 60; burst(c * CELL + CELL / 2, r * CELL + CELL / 2, '#9fe9ff', 6); }
    pops.push({ cd: { type: cd.type, special: cd.special }, x: cd.x, y: cd.y, t: 0 });
    burst(c * CELL + CELL / 2, r * CELL + CELL / 2, cd.special === 'bomb' ? '#ffffff' : TYPES[cd.type].c2, cd.special ? 14 : 7);
    grid[r][c] = null;
  });
  plan.creations.forEach(o => {
    const cd = grid[o.r][o.c];
    if (!cd) return;
    cd.special = o.special; cd.pulse = 1;
    if (jelly[o.r][o.c]) { jelly[o.r][o.c] = false; jellyLeft--; gain += 60; }
    burst(o.c * CELL + CELL / 2, o.r * CELL + CELL / 2, '#ffffff', 12);
  });
  score += gain;
  if (count) texts.push({ x: (sx / count) * CELL + CELL / 2, y: (sy / count) * CELL + CELL / 2, text: '+' + gain, t: 0, life: 0.9, size: 26, color: '#fff' });

  if (combo >= 3) {
    const words = ['Sweet!', 'Tasty!', 'Delicious!', 'Divine!', 'Sugar Crush!'];
    texts.push({ x: W / 2, y: H / 2 - 20, text: words[Math.min(combo - 3, words.length - 1)], t: 0, life: 1.1, size: 46, color: '#ffd23f' });
  }

  if (fx.bomb) Sound.bomb(); else if (fx.blast) Sound.explode(); else if (fx.line) Sound.line(); else Sound.match(combo);
  if (plan.creations.length) Sound.special();
  shake = fx.bomb ? 16 : fx.blast ? 10 : fx.line ? 7 : combo > 2 ? 4 : 0;
  updateHUD();
  await sleep(fx.bomb || fx.blast || fx.line || plan.creations.length ? 300 : 200);
}

function gravity() {
  for (let c = 0; c < COLS; c++) {
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c]) { if (r !== w) { grid[w][c] = grid[r][c]; grid[r][c] = null; } w--; }
    }
    const n = w + 1;
    for (let r = 0; r <= w; r++) grid[r][c] = newCandy(randType(), c, (r - n) * CELL - 4);
  }
}

function allSettled() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cd = grid[r][c];
    if (cd && (Math.abs(cd.x - c * CELL) > 0.5 || Math.abs(cd.y - r * CELL) > 0.5)) return false;
  }
  return true;
}
function waitSettled() {
  return new Promise(res => {
    const check = () => (allSettled() ? res() : requestAnimationFrame(check));
    check();
  });
}

/* --------------------------- turn handling ---------------------------- */
async function attemptSwap(a, b) {
  if (busy || over) return;
  busy = true; clearHint(); selected = null;
  const tok = session;
  swapGrid(a, b); Sound.swap();
  await waitSettled();
  if (tok !== session) return;
  const ca = grid[a.r][a.c], cb = grid[b.r][b.c];
  let plan = null;
  if (ca.special === 'bomb' || cb.special === 'bomb' || (ca.special && cb.special)) plan = planSwapSpecial(a, b);
  else {
    const runs = findRuns();
    if (runs.length) plan = planFromRuns(runs, [keyOf(a.r, a.c), keyOf(b.r, b.c)]);
  }
  if (!plan) {
    swapGrid(a, b); Sound.invalid(); shake = 4;
    await waitSettled();
    if (tok !== session) return;
    busy = false; startHint();
    return;
  }
  moves--; updateHUD();
  await resolveBoard(plan, tok);
}

async function resolveBoard(plan, tok) {
  let combo = 0;
  while (plan) {
    combo++;
    await executePlan(plan, combo);
    if (tok !== session) return;
    gravity();
    await waitSettled();
    if (tok !== session) return;
    Sound.land();
    const runs = findRuns();
    plan = runs.length ? planFromRuns(runs, []) : null;
  }
  await afterTurn(tok);
}

function goalsMet() {
  if (lv.score && score < lv.score) return false;
  if (lv.collect) for (const t in lv.collect) if ((collected[t] || 0) < lv.collect[t]) return false;
  if (lv.jelly && jellyLeft > 0) return false;
  return true;
}

async function afterTurn(tok) {
  if (tok !== session) return;
  if (goalsMet()) { await win(); return; }
  if (moves <= 0) { await lose(); return; }
  if (!findMove()) { await doShuffle(); if (tok !== session) return; }
  busy = false; startHint();
}

async function doShuffle() {
  texts.push({ x: W / 2, y: H / 2, text: 'No moves! Shuffling...', t: 0, life: 1.4, size: 34, color: '#fff' });
  Sound.shuffle();
  const list = []; grid.forEach(row => row.forEach(cd => list.push(cd)));
  let tries = 0;
  do {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c] = list[n++];
    tries++;
  } while ((findRuns().length || !findMove()) && tries < 300);
  if (tries >= 300) fillBoard();
  await waitSettled();
}

/* ------------------------------ win / lose ----------------------------- */
async function win() {
  over = true; clearHint();
  await sleep(350);
  const bonus = moves * 100; score += bonus; updateHUD();
  const ratio = moves / lv.moves;
  const stars = ratio >= 0.35 ? 3 : ratio >= 0.12 ? 2 : 1;
  save.stars[levelIdx] = Math.max(save.stars[levelIdx] || 0, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIdx + 2));
  persist();
  Sound.win();
  const last = levelIdx === LEVELS.length - 1;
  const starHtml = [0, 1, 2].map(i => `<span class="${i < stars ? 'on' : 'off'}">&#9733;</span>`).join('');
  const btns = [];
  if (!last) btns.push({ text: 'Next Level \u25B6', cls: 'primary', fn: () => startLevel(levelIdx + 1) });
  btns.push({ text: 'Replay', fn: () => startLevel(levelIdx) });
  btns.push({ text: 'Levels', fn: () => { renderLevels(); show('levels'); } });
  modal(last ? 'You did it!' : 'Level Complete!',
    `<div class="stars">${starHtml}</div>
     <div>Score: <b>${score}</b>${bonus ? ` <small>(incl. ${bonus} move bonus)</small>` : ''}</div>
     ${last ? '<p>You cleared all 10 levels. Sweet victory!</p>' : ''}`, btns);
  for (let i = 0; i < stars; i++) setTimeout(() => Sound.star(i), 350 + i * 250);
}

async function lose() {
  over = true; clearHint();
  await sleep(350);
  Sound.lose();
  modal('Out of moves!', `<p>So close! Goals not reached.</p><div>Score: <b>${score}</b></div>`, [
    { text: 'Try Again', cls: 'primary', fn: () => startLevel(levelIdx) },
    { text: 'Levels', fn: () => { renderLevels(); show('levels'); } },
  ]);
}

/* -------------------------------- hints -------------------------------- */
function startHint() {
  clearTimeout(hintTimer); hint = null;
  hintTimer = setTimeout(() => { if (!busy && !over) hint = findMove(); }, 5000);
}
function clearHint() { hint = null; clearTimeout(hintTimer); }

/* --------------------------------- UI ---------------------------------- */
const modalEl = $('modal'), modalCard = $('modalCard');
function modal(title, html, buttons) {
  modalCard.innerHTML = `<h2>${title}</h2><div class="mbody">${html}</div><div class="mbtns"></div>`;
  const box = modalCard.querySelector('.mbtns');
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.innerHTML = b.text;
    el.onclick = () => { Sound.click(); modalEl.classList.remove('show'); if (b.fn) b.fn(); };
    box.appendChild(el);
  });
  modalEl.classList.add('show');
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  onGame = id === 'game';
}

function renderLevels() {
  const grid = $('levelGrid'); grid.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    const locked = i >= save.unlocked;
    b.className = 'lvl' + (locked ? ' locked' : '');
    const st = save.stars[i] || 0;
    b.innerHTML = locked ? `${i + 1}` : `${i + 1}<small>${'\u2605'.repeat(st)}${'\u2606'.repeat(3 - st)}</small>`;
    b.title = l.name;
    if (!locked) b.onclick = () => { Sound.init(); Sound.click(); startMusicOnce(); startLevel(i); };
    grid.appendChild(b);
  });
}

function buildGoals() {
  const box = $('goals'); box.innerHTML = ''; goals = [];
  const chip = (iconEl, label, done) => {
    const el = document.createElement('div'); el.className = 'chip';
    const txt = document.createElement('span'); txt.className = 'txt';
    el.appendChild(iconEl); el.appendChild(txt); box.appendChild(el);
    goals.push({ el, txt, label, done });
  };
  if (lv.score) {
    const i = document.createElement('span'); i.className = 'ico'; i.textContent = '\u2B50';
    chip(i, () => `${Math.min(score, lv.score)}/${lv.score}`, () => score >= lv.score);
  }
  if (lv.collect) for (const t in lv.collect) {
    const n = lv.collect[t];
    chip(iconCanvas(+t), () => `${Math.min(collected[t] || 0, n)}/${n}`, () => (collected[t] || 0) >= n);
  }
  if (lv.jelly) {
    const i = document.createElement('span'); i.className = 'jico';
    chip(i, () => `${jellyLeft} left`, () => jellyLeft <= 0);
  }
}

function updateHUD() {
  $('moves').textContent = moves;
  $('moves').parentElement.classList.toggle('low', moves <= 5 && moves > 0);
  $('score').textContent = score;
  goals.forEach(gl => { gl.txt.textContent = gl.label(); gl.el.classList.toggle('done', gl.done()); });
}

function goalHtml() {
  const rows = [];
  if (lv.score) rows.push(`Score <b>${lv.score}</b> points`);
  if (lv.collect) for (const t in lv.collect) rows.push(`Collect <b>${lv.collect[t]}</b> ${TYPE_NAMES[t]}`);
  if (lv.jelly) rows.push(`Clear all <b>${jellyLeft}</b> jelly tiles <span style="color:#9fe9ff">(match on top of them)</span>`);
  return rows.map(r => `<div class="goal">${r}</div>`).join('');
}

function startLevel(i) {
  session++; clearHint();
  levelIdx = i; lv = LEVELS[i];
  moves = lv.moves; score = 0; collected = {}; over = false; busy = true; selected = null; dragStart = null;
  jelly = jellyMask(lv.jelly);
  jellyLeft = jelly.flat().filter(Boolean).length;
  pops.length = parts.length = texts.length = beams.length = 0;
  buildGoals(); fillBoard(); updateHUD();
  $('levelTitle').textContent = `Level ${i + 1} \u2013 ${lv.name}`;
  show('game');
  Sound.start();
  modal(`Level ${i + 1}`, `<p class="lname">${lv.name}</p>${goalHtml()}<p>You have <b>${lv.moves}</b> moves.</p>`,
    [{ text: 'Play!', cls: 'primary', fn: () => { busy = false; startHint(); } }]);
}

let musicStarted = false;
function startMusicOnce() { Sound.init(); if (!musicStarted) { musicStarted = true; Sound.startMusic(); } }

function refreshToggles() {
  $('btnSfx').classList.toggle('off', !save.sfx);
  $('btnMusic').classList.toggle('off', !save.music);
}

/* ------------------------------- input -------------------------------- */
function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W, y = (e.clientY - rect.top) / rect.height * H;
  return { x, y, c: Math.floor(x / CELL), r: Math.floor(y / CELL) };
}
const inBounds = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS;
const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

canvas.addEventListener('pointerdown', e => {
  startMusicOnce();
  if (busy || over) return;
  const p = cellFromEvent(e);
  if (!inBounds(p.r, p.c)) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  hint = null; startHint();
  if (selected && adjacent(selected, p)) {
    const a = selected; selected = null; dragStart = null;
    attemptSwap(a, { r: p.r, c: p.c });
    return;
  }
  selected = { r: p.r, c: p.c };
  dragStart = { x: p.x, y: p.y, r: p.r, c: p.c };
  Sound.select();
});
canvas.addEventListener('pointermove', e => {
  if (!dragStart || busy || over) return;
  const p = cellFromEvent(e);
  const dx = p.x - dragStart.x, dy = p.y - dragStart.y;
  if (Math.hypot(dx, dy) < CELL * 0.4) return;
  let dr = 0, dc = 0;
  if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1; else dr = dy > 0 ? 1 : -1;
  const a = { r: dragStart.r, c: dragStart.c }, b = { r: a.r + dr, c: a.c + dc };
  dragStart = null; selected = null;
  if (inBounds(b.r, b.c)) attemptSwap(a, b);
});
const endDrag = () => { dragStart = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* buttons */
$('btnPlay').onclick = () => {
  startMusicOnce(); Sound.click();
  const next = Math.min(save.unlocked, LEVELS.length) - 1;
  startLevel(Math.max(0, next));
};
$('btnLevels').onclick = () => { startMusicOnce(); Sound.click(); renderLevels(); show('levels'); };
$('btnLevelsBack').onclick = () => { Sound.click(); show('menu'); };
$('btnRestart').onclick = () => { Sound.click(); startLevel(levelIdx); };
$('btnHint').onclick = () => { if (busy || over) return; Sound.click(); hint = findMove(); };
$('btnSfx').onclick = () => { save.sfx = !save.sfx; persist(); Sound.apply(); refreshToggles(); Sound.click(); };
$('btnMusic').onclick = () => { startMusicOnce(); save.music = !save.music; persist(); Sound.apply(); refreshToggles(); };
$('btnPause').onclick = () => {
  Sound.click();
  modal('Paused', '<p>Take a breather.</p>', [
    { text: 'Resume', cls: 'primary' },
    { text: 'Restart level', fn: () => startLevel(levelIdx) },
    { text: 'Level select', fn: () => { session++; clearHint(); renderLevels(); show('levels'); } },
    { text: 'Main menu', fn: () => { session++; clearHint(); show('menu'); } },
  ]);
};
document.addEventListener('keydown', e => { if (e.key === 'h' || e.key === 'H') $('btnHint').click(); });

/* ------------------------------ rendering ------------------------------ */
function update(dt) {
  const kPos = 1 - Math.exp(-dt * 20);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cd = grid[r][c]; if (!cd) continue;
    const tx = c * CELL, ty = r * CELL;
    cd.x += (tx - cd.x) * kPos; if (Math.abs(tx - cd.x) < 0.5) cd.x = tx;
    if (cd.y < ty - 0.5) {
      cd.vy = Math.min(cd.vy + 3200 * dt, 1900);
      cd.y += cd.vy * dt;
      if (cd.y >= ty) { cd.y = ty; cd.vy = 0; }
    } else {
      cd.vy = 0;
      cd.y += (ty - cd.y) * kPos; if (Math.abs(ty - cd.y) < 0.5) cd.y = ty;
    }
    if (cd.pulse > 0) cd.pulse = Math.max(0, cd.pulse - dt * 3);
  }
  for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 0.25) pops.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life > p.max) parts.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t > texts[i].life) texts.splice(i, 1); }
  for (let i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t > 0.45) beams.splice(i, 1); }
  shake *= Math.pow(0.0005, dt);
  if (shake < 0.3) shake = 0;
}

function render(t) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // cells + jelly
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * CELL, y = r * CELL;
    g.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.14)';
    g.fillRect(x, y, CELL, CELL);
    if (jelly[r] && jelly[r][c]) {
      g.fillStyle = 'rgba(110,220,255,.42)'; g.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
      g.strokeStyle = 'rgba(220,250,255,.9)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 8, y + 8, 16, 4);
    }
  }

  // selection
  if (selected) {
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); roundRectPath(g, selected.c * CELL + 3, selected.r * CELL + 3, CELL - 6, CELL - 6, 12); g.stroke();
  }

  // candies
  const hintKeys = hint ? hint.map(h => keyOf(h.r, h.c)) : [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cd = grid[r][c]; if (!cd) continue;
    let sc = 1 + 0.4 * cd.pulse;
    if (selected && selected.r === r && selected.c === c) sc *= 1.1;
    if (hintKeys.includes(keyOf(r, c))) sc *= 1 + 0.1 * Math.sin(t * 9);
    drawCandy(g, cd, cd.x + CELL / 2, cd.y + CELL / 2, sc, 1, t);
  }

  // popping candies
  pops.forEach(p => {
    const k = p.t / 0.25;
    drawCandy(g, p.cd, p.x + CELL / 2, p.y + CELL / 2, 1 + 0.5 * k, 1 - k, t);
  });

  // beams
  beams.forEach(b => {
    const k = b.t / 0.45, a = 1 - k;
    if (b.kind === 'row') { g.fillStyle = `rgba(255,255,255,${0.75 * a})`; g.fillRect(0, b.r * CELL + CELL * 0.18, W, CELL * 0.64); }
    else if (b.kind === 'col') { g.fillStyle = `rgba(255,255,255,${0.75 * a})`; g.fillRect(b.c * CELL + CELL * 0.18, 0, CELL * 0.64, H); }
    else if (b.kind === 'ring') { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 8 * a + 1; g.beginPath(); g.arc(b.x, b.y, CELL * (0.4 + 1.6 * k), 0, TAU); g.stroke(); }
    else if (b.kind === 'zap') { g.strokeStyle = `rgba(255,240,150,${a})`; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); g.stroke(); }
    else if (b.kind === 'flash') { g.fillStyle = `rgba(255,255,255,${0.5 * a})`; g.fillRect(0, 0, W, H); }
  });

  // particles
  parts.forEach(p => {
    g.globalAlpha = Math.max(0, 1 - p.life / p.max);
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
  });
  g.globalAlpha = 1;

  // floating texts
  texts.forEach(tx => {
    const k = tx.t / tx.life;
    g.save();
    g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    g.font = `900 ${tx.size}px "Trebuchet MS", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(40,10,80,.9)'; g.lineJoin = 'round';
    const y = tx.y - k * 40, s = 1 + 0.25 * Math.sin(Math.min(1, k * 4) * Math.PI);
    g.translate(tx.x, y); g.scale(s, s);
    g.strokeText(tx.text, 0, 0);
    g.fillStyle = tx.color; g.fillText(tx.text, 0, 0);
    g.restore();
  });

  g.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (onGame) { update(dt); render(now / 1000); }
  requestAnimationFrame(frame);
}

/* -------------------------------- boot --------------------------------- */
document.addEventListener('visibilitychange', () => { /* audio resumes on next interaction */ });
refreshToggles();
renderLevels();
requestAnimationFrame(frame);
})();
