// Site scripts

// Layout grid overlay: press G to show/hide the 12 columns (handy for checking alignment
// against the Figma grid). Ignored while typing in a field.
(() => {
  let overlay = null;
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (overlay) {
      overlay.remove();
      overlay = null;
      return;
    }
    overlay = document.createElement('div');
    overlay.className = 'grid-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const columns = getComputedStyle(document.documentElement).getPropertyValue('--grid-columns').trim() || 12;
    overlay.innerHTML = `<div class="container grid">${'<span></span>'.repeat(Number(columns))}</div>`;
    document.body.appendChild(overlay);
  });
})();

// Notepad nav: hovering (or keyboard-focusing) a link circles it by hand in the nav blue. Each
// time is a new loop: a slightly wobbly, tilted ellipse that starts at the upper right, goes
// round anticlockwise and overshoots its start a little, the way a pen circle doesn't close
// neatly. It draws on, and fades out when the pointer leaves.
(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAD = [16, 11];   // px the loop sits outside the text, sideways / up-down

  // A smooth path through points (Catmull-Rom curves as cubic Béziers).
  function smoothPath(points) {
    let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
  }

  function handCircle(width, height) {
    const rand = (min, max) => min + Math.random() * (max - min);
    const cx = width / 2 + rand(-2, 2), cy = height / 2 + rand(-1, 1);
    const rx = width / 2 + PAD[0], ry = height / 2 + PAD[1];
    const start = rand(-0.8, -0.4);                      // upper right
    const sweep = Math.PI * 2 + rand(0.35, 0.65);        // a full turn plus an overshoot
    const tilt = rand(-0.06, 0.06);
    const phase = rand(0, Math.PI * 2);
    const lopside = rand(0, Math.PI * 2);               // which side bulges a little
    const points = [];
    const n = 32;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = start - sweep * t;                       // anticlockwise on screen
      // Starts a touch inside and ends a touch outside, so the ends cross instead of meeting.
      const grow = 1 + (t - 0.5) * 0.09;
      const wobble = (1 + 0.025 * Math.sin(a * 3 + phase)) * (1 + 0.04 * Math.cos(a - lopside));
      const x = rx * grow * wobble * Math.cos(a), y = ry * grow * wobble * Math.sin(a);
      points.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    return smoothPath(points);
  }

  function draw(link) {
    link.querySelector('.nav-circle')?.remove();
    const { width, height } = link.getBoundingClientRect();
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', handCircle(width, height));
    path.setAttribute('pathLength', '1');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'nav-circle');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('aria-hidden', 'true');
    svg.append(path);
    link.append(svg);
    svg.getBoundingClientRect();   // start from undrawn, then draw on
    svg.classList.add('is-drawn');
  }

  function erase(link) {
    const svg = link.querySelector('.nav-circle');
    if (!svg) return;
    svg.classList.add('is-erasing');
    setTimeout(() => svg.remove(), 250);   // after the 0.2s fade
  }

  for (const link of document.querySelectorAll('.notepad-nav a')) {
    link.addEventListener('pointerenter', () => draw(link));
    link.addEventListener('pointerleave', () => erase(link));
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) draw(link); });
    link.addEventListener('blur', () => erase(link));
  }
})();

// Thought cloud: swap the <img> for the same SVG inline (thinking-cloud.svg, shapes unchanged) so
// the bubble and its three trailing circles can each boil on their own (see .home__cloud-part).
// If this doesn't run, the plain image stays.
(async () => {
  const img = document.querySelector('img.home__cloud');
  if (!img) return;
  const PARTS = {
    Vector: 'home__cloud-bubble',
    Vector_2: 'home__cloud-circle-1',   // biggest, next to the bubble
    Vector_3: 'home__cloud-circle-2',
    Vector_4: 'home__cloud-circle-3',   // smallest
  };
  try {
    const doc = new DOMParser().parseFromString(await (await fetch(img.src)).text(), 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    for (const [id, name] of Object.entries(PARTS)) svg.getElementById(id)?.setAttribute('class', `home__cloud-part ${name}`);
    for (const node of svg.querySelectorAll('[id]')) node.removeAttribute('id');
    svg.setAttribute('class', 'home__cloud');
    svg.setAttribute('aria-hidden', 'true');
    img.replaceWith(svg);
  } catch { /* keep the image */ }
})();

// Notepad nav: drag the paper anywhere on the page. A press only becomes a drag once the pointer
// has moved a few px, so the links still work with a normal click (and a drag never clicks one).
// It stays inside the page frame, and keeps its spot as you move between pages during a visit
// (sessionStorage); refreshing the page or a new visit starts it back in its place.
(() => {
  const nav = document.querySelector('.notepad-nav');
  const frame = nav?.closest('.home');
  if (!nav || !frame) return;

  const KEY = 'notepad-nav-offset';
  const THRESHOLD = 4;   // px of movement before a press counts as a drag
  let offset = { x: 0, y: 0 };
  try {
    // Refreshing the page puts it back in its place; going to another page keeps the spot.
    if (performance.getEntriesByType('navigation')[0]?.type === 'reload') sessionStorage.removeItem(KEY);
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) offset = saved;
  } catch { /* storage unavailable: start in place */ }

  // How far the nav can move from its normal spot and still be fully inside the frame.
  function limits() {
    const f = frame.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    const baseLeft = n.left - offset.x, baseTop = n.top - offset.y;
    return {
      minX: f.left - baseLeft, maxX: f.right - (baseLeft + n.width),
      minY: f.top - baseTop, maxY: f.bottom - (baseTop + n.height),
    };
  }
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  function place(x, y) {
    const l = limits();
    offset = { x: clamp(x, l.minX, l.maxX), y: clamp(y, l.minY, l.maxY) };
    nav.style.translate = `${offset.x}px ${offset.y}px`;
  }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(offset)); } catch { /* ignore */ }
  }

  place(offset.x, offset.y);
  window.addEventListener('resize', () => place(offset.x, offset.y));

  let press = null;   // { id, x, y, from, dragging }
  nav.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { ...offset }, dragging: false };
  });
  // Moves and releases are followed on the whole window, so a quick flick that leaves the paper
  // before the drag starts still drags it.
  window.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.dragging) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      press.dragging = true;
      nav.classList.add('is-dragging');
      try { nav.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
    }
    place(press.from.x + dx, press.from.y + dy);
  });
  const end = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.dragging) {
      nav.classList.remove('is-dragging');
      save();
      // The release after a drag shouldn't also follow a link. (The click comes right after
      // pointerup, so the blocker is removed on the next tick in case no click comes at all.)
      const block = (c) => { c.preventDefault(); c.stopPropagation(); };
      nav.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => nav.removeEventListener('click', block, { capture: true }), 0);
    }
    press = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  nav.addEventListener('dragstart', (e) => e.preventDefault());
})();
