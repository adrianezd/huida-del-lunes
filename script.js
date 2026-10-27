'use strict';

/* =========================================================================
   Huida del lunes — escapa de la oficina sin que te pille el jefe
   Juego de mesa de un jugador en una oficina de casillas. Para poder irte
   tienes que recoger en las impresoras el informe de cada compañero y
   llevárselo: a cambio te cubren y te dan algo útil. Con los tres
   informes entregados se abre la salida. El jefe se mueve solo: patrulla,
   mira en línea recta y, si te ve, va a por ti. Cuánto anda cada turno lo
   dice su carta, que puedes ver antes de mover. Si te pilla o dan las
   18:00 sin haber salido, te quedas a hacer horas extra.
   ========================================================================= */

const W = 8;
const H = 11;
const STORE = 'huida-lunes-v1';
const STEP_MS = 140;

const MATES = [
  { name: 'Ana', emoji: '👩‍💼', art: 'ana', color: 'azul' },
  { name: 'Luis', emoji: '👨‍💻', art: 'luis', color: 'verde' },
  { name: 'Marta', emoji: '👩‍🔬', art: 'marta', color: 'naranja' }
];
const ITEMS = {
  cafe: { emoji: '☕', name: 'Café', text: 'Este turno mueves 3 casillas más.' },
  excusa: { emoji: '📎', name: 'Excusa', text: 'Si el jefe te pilla, te libras una vez y él vuelve a su despacho.' },
  llamada: { emoji: '📞', name: 'Llamada falsa', text: 'El jefe se queda al teléfono dos turnos sin moverse.' }
};
const CARDS = {
  ronda: { emoji: '🚶', name: 'Ronda', steps: 2, text: 'Anda 2 casillas.' },
  prisa: { emoji: '🏃', name: 'Prisa', steps: 3, text: 'Anda 3 casillas.' },
  cafe: { emoji: '☕', name: 'Máquina de café', steps: 1, text: 'Anda 1 casilla.' },
  reunion: { emoji: '📋', name: 'Reunión', steps: 0, text: 'No se mueve.' },
  inspeccion: { emoji: '👀', name: 'Inspección', steps: 2, vision: 2, text: 'Anda 2 y ve 2 casillas más lejos.' },
  llama: { emoji: '📢', name: '¡Te llama!', steps: 2, hunt: true, text: 'Va 2 casillas directo a ti, te vea o no.' }
};
const LEVELS = {
  facil: { name: 'Fácil', vision: 4, turns: 44, deck: { ronda: 4, prisa: 1, cafe: 3, reunion: 2, inspeccion: 1, llama: 1 } },
  normal: { name: 'Normal', vision: 5, turns: 36, deck: { ronda: 4, prisa: 2, cafe: 2, reunion: 1, inspeccion: 2, llama: 1 } },
  dificil: { name: 'Difícil', vision: 6, turns: 30, deck: { ronda: 3, prisa: 4, cafe: 1, reunion: 0, inspeccion: 2, llama: 2 } }
};
const MOVE = 3;
// dibujos de assets/ (SVG propios)
const art = (name, cls = '') => `<img class="art ${cls}" src="assets/${name}.svg" alt="" draggable="false">`;
const ITEM_ART = { cafe: 'cafe', excusa: 'excusa', llamada: 'llamada' };
const CARD_ART = { ronda: 'carta-ronda', prisa: 'carta-prisa', cafe: 'carta-cafe', reunion: 'carta-reunion', inspeccion: 'carta-inspeccion', llama: 'carta-llama' };

/* ------------------------------- Azar con semilla ------------------------------- */

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/* ---------------------------------- Mapa ---------------------------------- */

const at = (x, y) => y * W + x;
const xy = (k) => [k % W, Math.floor(k / W)];
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const nb = (k) => { const [x, y] = xy(k); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [x + a, y + b]).filter(([a, b]) => inside(a, b)).map(([a, b]) => at(a, b)); };

// distancias andando desde k (sin pasar por muebles ni por las casillas de «block»)
function bfs(walls, from, block) {
  const dist = new Array(W * H).fill(Infinity);
  const prev = new Array(W * H).fill(-1);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of nb(c)) {
      if (walls[n] || dist[n] !== Infinity || (block && block.has(n))) continue;
      dist[n] = dist[c] + 1;
      prev[n] = c;
      q.push(n);
    }
  }
  return { dist, prev };
}

function makeMap(rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  for (let tries = 0; tries < 200; tries++) {
    const walls = new Array(W * H).fill(0);
    const start = at(Math.floor(W / 2) - 1 + Math.floor(rand() * 2), H - 1);
    const office = at(Math.floor(W / 2) - 1 + Math.floor(rand() * 2), 1);
    const exit = at(rand() < 0.5 ? 0 : W - 1, 0);
    const keep = new Set([start, office, exit, office - W]);
    // mesas: bloques de 2×1, 1×2 y 2×2
    let placed = 0;
    for (let k = 0; k < 60 && placed < 24; k++) {
      const [w, h] = pick([[2, 1], [1, 2], [2, 2], [2, 1], [1, 1]]);
      const x = Math.floor(rand() * (W - w + 1));
      const y = 1 + Math.floor(rand() * (H - h - 1));
      const cells = [];
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) cells.push(at(x + a, y + b));
      if (cells.some((c) => keep.has(c) || walls[c] || nb(c).some((n) => keep.has(n)))) continue;
      cells.forEach((c) => { walls[c] = 1; });
      const d = bfs(walls, start).dist;
      if (walls.some((v, c) => !v && d[c] === Infinity)) { cells.forEach((c) => { walls[c] = 0; }); continue; }
      placed += cells.length;
    }
    // impresoras y compañeros, separados entre sí y del inicio
    const floor = walls.map((v, c) => (v || keep.has(c) ? -1 : c)).filter((c) => c >= 0);
    const dStart = bfs(walls, start).dist;
    const spots = [];
    const ok = (c) => dStart[c] >= 3 && spots.every((s) => bfs(walls, s).dist[c] >= 3);
    for (const c of floor.sort(() => rand() - 0.5)) { if (spots.length < 6 && ok(c)) spots.push(c); }
    if (spots.length < 6) continue;
    const order = [0, 1, 2].sort(() => rand() - 0.5);
    const deco = floor.filter((c) => !spots.includes(c));
    return {
      walls, start, office, exit,
      printers: spots.slice(0, 3).map((c, i) => ({ c, mate: order[i], seen: false })),
      mates: spots.slice(3).map((c, i) => ({ c, done: false, mate: i })),
      plants: walls.map((v, c) => (v && rand() < 0.18 ? c : -1)).filter((c) => c >= 0),
      deco
    };
  }
  throw new Error('No se pudo generar la oficina');
}

/* --------------------------------- Estado --------------------------------- */

let store = load();
let G = null;
const el = {};

function load() {
  try { return Object.assign({ level: 'normal', wins: 0, played: 0, daily: {}, sound: true }, JSON.parse(localStorage.getItem(STORE) || '{}')); }
  catch (e) { return { level: 'normal', wins: 0, played: 0, daily: {}, sound: true }; }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { /* sin guardar */ } }

function newGame(mode) {
  const day = today();
  const level = mode === 'daily' ? 'normal' : store.level;
  const rand = rng(mode === 'daily' ? hash(`lunes-${day}`) : Math.floor(Math.random() * 2 ** 32));
  const map = makeMap(rand);
  G = Object.assign(map, {
    mode, day, level, L: LEVELS[level], rand,
    me: map.start, boss: map.office, bossMode: 'patrol', target: null, lost: 0, stunned: 0,
    carry: [], items: [], turn: 1, deck: [], next: null, phase: 'player', bonus: 0,
    log: '¡Lunes! Recoge los informes de la impresora y llévaselos a tus compañeros antes de escapar.', end: null, busy: false
  });
  G.next = draw();
  G.target = patrolPoint();
  if (mode === 'daily' && store.daily[day]) G.log = `Ya jugaste la oficina de hoy (${store.daily[day].win ? 'escapaste' : 'te pillaron'}). Puedes repetirla, pero cuenta la primera.`;
  render();
}

function draw() {
  if (!G.deck.length) {
    Object.entries(G.L.deck).forEach(([k, n]) => { for (let i = 0; i < n; i++) G.deck.push(k); });
    G.deck.sort(() => G.rand() - 0.5);
  }
  return G.deck.pop();
}

function patrolPoint() {
  const pts = G.printers.map((p) => p.c).concat(G.mates.map((m) => m.c), [G.office]);
  const far = pts.filter((c) => c !== G.boss);
  return far[Math.floor(G.rand() * far.length)];
}

const clock = (turn) => { const m = 9 * 60 + (turn - 1) * Math.round((9 * 60) / G.L.turns); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const exitOpen = () => G.mates.every((m) => m.done);

/* --------------------------------- Visión --------------------------------- */

function visionCells(extra) {
  const range = G.L.vision + (extra || 0);
  const out = new Set();
  const [bx, by] = xy(G.boss);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let d = 1; d <= range; d++) {
      const x = bx + dx * d;
      const y = by + dy * d;
      if (!inside(x, y) || G.walls[at(x, y)]) break;
      out.add(at(x, y));
    }
  }
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = bx + dx;
    const y = by + dy;
    if (inside(x, y) && !G.walls[at(x, y)]) out.add(at(x, y));
  }
  return out;
}
function look(extra) {
  if (G.stunned) return false;
  if (visionCells(extra).has(G.me)) {
    if (G.bossMode !== 'chase') G.alert = true;
    G.bossMode = 'chase';
    G.target = G.me;
    G.lost = 0;
    return true;
  }
  return false;
}

/* --------------------------------- Jugador --------------------------------- */

function reach() {
  const steps = MOVE + G.bonus;
  const { dist } = bfs(G.walls, G.me, new Set([G.boss]));
  return dist.map((d, c) => (d <= steps && d > 0 ? c : -1)).filter((c) => c >= 0);
}

function pathTo(c) {
  const { prev } = bfs(G.walls, G.me, new Set([G.boss]));
  const path = [];
  for (let k = c; k !== G.me && k !== -1; k = prev[k]) path.unshift(k);
  return path;
}

async function moveTo(c) {
  if (G.phase !== 'player' || G.busy || G.end) return;
  if (!reach().includes(c)) return;
  G.busy = true;
  for (const k of pathTo(c)) {
    G.me = k;
    sound('step');
    enter(k);
    render();
    if (G.end) { G.busy = false; return; }
    await wait(STEP_MS);
  }
  G.bonus = 0;
  await bossTurn();
  G.busy = false;
  if (!G.end) render();
}

function enter(k) {
  const pr = G.printers.find((p) => p.c === k);
  if (pr) {
    const mate = G.mates[pr.mate];
    const was = pr.seen;
    pr.seen = true;
    if (mate.done) G.log = `🖨️ Esta impresora saca los informes de ${MATES[pr.mate].name}, pero ya se lo diste.`;
    else if (G.carry.includes(pr.mate)) G.log = `🖨️ Ya llevas el informe de ${MATES[pr.mate].name}.`;
    else if (G.carry.length >= 2) G.log = '🖨️ Llevas las manos llenas: dos informes como mucho.';
    else { G.carry.push(pr.mate); G.log = `🖨️ ${was ? '' : '¡Descubierta! '}Coges el informe de ${MATES[pr.mate].emoji} ${MATES[pr.mate].name}.`; sound('pick'); }
    // la impresora hace ruido: si el jefe está cerca, viene a mirar
    const d = bfs(G.walls, G.boss).dist[k];
    if (d <= 6 && G.bossMode !== 'chase' && !G.stunned) { G.bossMode = 'noise'; G.target = k; G.log += ' 🔊 ¡La impresora hace ruido!'; }
  }
  const m = G.mates.find((x) => x.c === k);
  if (m && !m.done && G.carry.includes(m.mate)) {
    m.done = true;
    G.carry = G.carry.filter((x) => x !== m.mate);
    const pool = Object.keys(ITEMS);
    const item = pool[Math.floor(G.rand() * pool.length)];
    G.items.push(item);
    G.log = `${MATES[m.mate].emoji} ${MATES[m.mate].name} te cubre y te da ${ITEMS[item].emoji} ${ITEMS[item].name}.${exitOpen() ? ' ¡Ya puedes salir! 🚪' : ''}`;
    sound('pick');
  } else if (m && !m.done) {
    G.log = `${MATES[m.mate].emoji} ${MATES[m.mate].name}: «¿Y mi informe?»`;
  }
  if (k === G.exit) {
    if (exitOpen()) finish(true);
    else G.log = '🔒 Aún no puedes irte: faltan informes por entregar.';
  }
}

function useItem(i) {
  if (G.phase !== 'player' || G.busy || G.end) return;
  const it = G.items[i];
  if (it === 'cafe') { G.bonus += 3; G.log = '☕ ¡Cafeína! Este turno mueves 3 casillas más.'; }
  else if (it === 'llamada') { G.stunned = 2; G.bossMode = 'patrol'; G.log = '📞 El jefe se queda al teléfono dos turnos.'; }
  else return;
  G.items.splice(i, 1);
  sound('pick');
  render();
}

async function stay() {
  if (G.phase !== 'player' || G.busy || G.end) return;
  G.busy = true;
  G.log = '🫥 Te quedas quieto disimulando.';
  G.bonus = 0;
  await bossTurn();
  G.busy = false;
  if (!G.end) render();
}

/* --------------------------------- El jefe --------------------------------- */

async function bossTurn() {
  G.phase = 'boss';
  const card = CARDS[G.next];
  G.shown = G.next;
  look(card.vision);
  render();
  await wait(250);
  if (G.stunned) {
    G.stunned -= 1;
    G.log = `📞 El jefe sigue al teléfono${G.stunned ? '' : ', pero ya está colgando'}.`;
  } else {
    if (card.hunt) { G.bossMode = 'chase'; G.target = G.me; }
    for (let s = 0; s < card.steps; s++) {
      if (G.target == null || G.target === G.boss) {
        if (G.bossMode === 'chase' || G.bossMode === 'noise') { G.lost += 1; G.bossMode = 'patrol'; }
        G.target = patrolPoint();
      }
      const { prev } = bfs(G.walls, G.boss);
      let k = G.target;
      if (prev[k] === -1 && k !== G.boss) { G.target = patrolPoint(); continue; }
      while (prev[k] !== G.boss && prev[k] !== -1) k = prev[k];
      G.boss = k;
      sound('boss');
      if (G.boss === G.me) { caught(); render(); if (G.end) return; break; }
      look(card.vision);
      if (G.bossMode === 'chase') G.target = visionCells(card.vision).has(G.me) || card.hunt ? G.me : G.target;
      render();
      await wait(STEP_MS + 40);
    }
  }
  if (G.end) return;
  look(0);
  if (G.alert) { G.log = '❗ ¡El jefe te ha visto! Viene a por ti.'; G.alert = false; sound('alert'); }
  G.turn += 1;
  if (G.turn > G.L.turns) { finish(false, 'time'); return; }
  G.next = draw();
  G.phase = 'player';
  render();
}

function caught() {
  const ex = G.items.indexOf('excusa');
  if (ex !== -1) {
    G.items.splice(ex, 1);
    G.boss = G.office;
    G.bossMode = 'patrol';
    G.target = patrolPoint();
    G.log = '📎 «¡Iba a llevarle esto, jefe!» Te libras y él vuelve a su despacho.';
    sound('alert');
    return;
  }
  finish(false, 'caught');
}

function finish(win, why) {
  G.end = { win, why };
  G.phase = 'end';
  store.played += 1;
  if (win) store.wins += 1;
  if (G.mode === 'daily' && !store.daily[G.day]) store.daily[G.day] = { win, time: clock(G.turn) };
  Object.keys(store.daily).sort().slice(0, -30).forEach((d) => delete store.daily[d]);
  save();
  sound(win ? 'win' : 'lose');
  render();
  setTimeout(showEnd, 500);
}

function showEnd() {
  const e = G.end;
  el.endEmoji.innerHTML = art(e.win ? 'yo-huye' : e.why === 'time' ? 'reloj' : 'jefe-enfadado');
  el.endTitle.textContent = e.win ? '¡Has escapado!' : e.why === 'time' ? 'Horas extra' : '¡Te ha pillado!';
  el.endText.textContent = e.win
    ? `Sales por la puerta a las ${clock(G.turn)}. El jefe ni se ha enterado.`
    : e.why === 'time' ? 'Dan las 18:00 y sigues en la oficina. Hoy sales tarde.' : '«¿Adónde vas tan pronto? Pasa a mi despacho, que tenemos que hablar.»';
  el.share.hidden = G.mode !== 'daily';
  el.end.hidden = false;
}

/* --------------------------------- Pintar --------------------------------- */

function render() {
  const vis = G.end ? new Set() : visionCells(G.phase === 'boss' && G.shown ? CARDS[G.shown].vision : CARDS[G.next].vision);
  const can = G.phase === 'player' && !G.busy && !G.end ? new Set(reach()) : new Set();
  const cells = [];
  for (let c = 0; c < W * H; c++) {
    let cls = 'cell';
    let inner = '';
    if (G.walls[c]) {
      cls += ' desk';
      const obj = G.plants.includes(c) ? 'obj-planta' : (c * 7) % 5 === 0 ? 'obj-pc' : ['', 'obj-papeles', '', 'obj-taza', '', 'obj-carpeta'][c % 6];
      inner = obj ? art(obj, 'deskobj') : '';
    } else {
      if (vis.has(c) && !G.stunned) cls += ' seen';
      if (can.has(c)) cls += ' can';
      const pr = G.printers.find((p) => p.c === c);
      const m = G.mates.find((x) => x.c === c);
      if (pr) inner = `<span class="obj">${art(pr.seen ? 'impresora-' + MATES[pr.mate].color : 'impresora')}</span>${pr.seen ? `<i class="dot ${MATES[pr.mate].color}"></i>` : '<i class="q">?</i>'}`;
      else if (m) inner = `<span class="obj mate${m.done ? ' done' : ''}">${art(MATES[m.mate].art + (m.done ? '-ok' : ''))}</span><i class="dot ${MATES[m.mate].color}"></i>${m.done ? '<i class="tick">✓</i>' : ''}`;
      else if (c === G.exit) inner = `<span class="obj">${art(exitOpen() ? 'puerta-abierta' : 'puerta')}</span>${exitOpen() ? '' : `<i class="lock">${art('candado')}</i>`}`;
      else if (c === G.office) inner = `<span class="obj faint">${art('despacho', 'tile')}</span>`;
      if (c === G.me) inner += `<span class="tok me">${art('yo')}</span>`;
      if (c === G.boss) inner += `<span class="tok boss${G.bossMode === 'chase' ? ' angry' : ''}">${art(G.stunned ? 'jefe-telefono' : G.bossMode === 'chase' ? 'jefe-enfadado' : 'jefe')}</span>`;
    }
    cells.push(`<button type="button" class="${cls}" data-c="${c}" ${can.has(c) ? '' : 'tabindex="-1"'}>${inner}</button>`);
  }
  el.office.innerHTML = cells.join('');
  el.time.textContent = clock(Math.min(G.turn, G.L.turns));
  el.left.textContent = String(Math.max(0, G.L.turns - G.turn + 1));
  el.reports.textContent = `${G.mates.filter((m) => m.done).length}/3`;
  el.level.textContent = G.mode === 'daily' ? 'Oficina del día' : `Oficina al azar · ${G.L.name}`;
  const card = CARDS[G.phase === 'boss' ? G.shown : G.next];
  el.card.innerHTML = `<span class="card-emoji">${art(G.stunned ? 'jefe-telefono' : CARD_ART[G.phase === 'boss' ? G.shown : G.next])}</span><div><strong>${card.name}</strong><small>${G.stunned ? 'Está al teléfono: no se mueve.' : card.text}</small></div>`;
  el.card.classList.toggle('is-now', G.phase === 'boss');
  el.cardLabel.textContent = G.phase === 'boss' ? 'El jefe mueve' : 'Lo próximo del jefe';
  el.carry.innerHTML = G.carry.length ? G.carry.map((m) => `<span class="chip ${MATES[m].color}">${art('informe', 'mini')} ${MATES[m].name}</span>`).join('') : '<span class="none">Nada</span>';
  el.items.innerHTML = G.items.length ? G.items.map((it, i) => `<button type="button" class="item" data-item="${i}" ${it === 'excusa' ? 'disabled' : ''} title="${ITEMS[it].text}">${art(ITEM_ART[it], 'mini')} ${ITEMS[it].name}${it === 'excusa' ? '<small>se usa sola</small>' : ''}</button>`).join('') : '<span class="none">Nada</span>';
  el.log.textContent = G.log;
  el.stay.disabled = G.phase !== 'player' || G.busy || Boolean(G.end);
  el.mates.innerHTML = G.mates.map((m) => `<li class="${m.done ? 'done' : ''}"><i class="dot ${MATES[m.mate].color}"></i>${art(MATES[m.mate].art + (m.done ? '-ok' : ''), 'mini')} ${MATES[m.mate].name}${m.done ? ' ✓' : ''}</li>`).join('');
  document.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('is-on', b.dataset.level === store.level && G.mode !== 'daily'));
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === G.mode));
  el.wins.textContent = `${store.wins} de ${store.played}`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let actx = null;
function sound(kind) {
  if (!store.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const seq = { step: [[300, 0.04]], boss: [[140, 0.07]], pick: [[660, 0.08], [880, 0.1]], alert: [[880, 0.1], [660, 0.1], [880, 0.12]], win: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.25]], lose: [[392, 0.2], [330, 0.2], [262, 0.35]] }[kind] || [];
    let d = 0;
    seq.forEach(([f, len]) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = kind === 'boss' || kind === 'lose' ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(kind === 'step' ? 0.05 : 0.12, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      o.connect(g).connect(actx.destination);
      o.start(t + d);
      o.stop(t + d + len + 0.02);
      d += len * 0.9;
    });
  } catch (e) { /* sin sonido */ }
}

/* --------------------------------- Eventos --------------------------------- */

function init() {
  ['office', 'time', 'left', 'reports', 'level', 'card', 'card-label', 'carry', 'items', 'log', 'stay', 'mates', 'end', 'end-emoji', 'end-title', 'end-text', 'again', 'share', 'close', 'sound', 'wins'].forEach((k) => {
    el[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(k);
  });
  el.office.style.setProperty('--w', W);
  el.office.addEventListener('click', (e) => { const c = e.target.closest('[data-c]'); if (c) moveTo(Number(c.dataset.c)); });
  el.items.addEventListener('click', (e) => { const b = e.target.closest('[data-item]'); if (b) useItem(Number(b.dataset.item)); });
  el.stay.onclick = stay;
  document.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { el.end.hidden = true; newGame(b.dataset.mode); }; });
  document.querySelectorAll('[data-level]').forEach((b) => { b.onclick = () => { store.level = b.dataset.level; save(); el.end.hidden = true; newGame('free'); }; });
  el.again.onclick = () => { el.end.hidden = true; newGame('free'); };
  el.close.onclick = () => { el.end.hidden = true; };
  el.share.onclick = () => {
    const r = store.daily[G.day];
    const t = `Huida del lunes ${G.day}: ${r && r.win ? `escapé a las ${r.time} 🏃‍♂️💨` : 'me pilló el jefe 😱'}\nhttps://adrianezd.github.io/huida-del-lunes/`;
    if (navigator.share) navigator.share({ text: t }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { el.share.textContent = 'Copiado'; });
  };
  el.sound.checked = store.sound;
  el.sound.onchange = () => { store.sound = el.sound.checked; save(); };
  newGame(store.daily[today()] ? 'free' : 'daily');
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
