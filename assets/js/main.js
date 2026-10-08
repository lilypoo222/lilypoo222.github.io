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
// It stays inside the page frame. Its spot on the page is kept as you move between pages during a
// visit (sessionStorage), so it sits in the same place on every page; refreshing the page or a
// new visit starts it back in its place.
// Until it's been moved, a page can ask for it to stay clear of its content: with
// data-clear-of="main" it starts on the first grid column to the right of everything in <main>
// (projects.html), at its usual height.
(() => {
  const nav = document.querySelector('.notepad-nav');
  const frame = nav?.closest('.home');
  if (!nav || !frame) return;

  const KEY = 'notepad-nav-spot';
  const THRESHOLD = 4;   // px of movement before a press counts as a drag
  let offset = { x: 0, y: 0 };   // current translate from its CSS position
  let spot = null;               // where the user put it (left/top in the frame), once moved
  try {
    // Refreshing the page puts it back in its place; going to another page keeps the spot.
    if (performance.getEntriesByType('navigation')[0]?.type === 'reload') sessionStorage.removeItem(KEY);
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) spot = saved;
  } catch { /* storage unavailable: start in place */ }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  // The nav's CSS position (without our translate) and size, and the frame's size.
  function measure() {
    const f = frame.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return { x: n.left - f.left - offset.x, y: n.top - f.top - offset.y, w: n.width, h: n.height, fw: f.width, fh: f.height, f };
  }
  // Move it so its top-left is at (x, y) in the frame, kept fully inside.
  function placeAt(x, y) {
    const m = measure();
    const px = clamp(x, 0, m.fw - m.w), py = clamp(y, 0, m.fh - m.h);
    offset = { x: px - m.x, y: py - m.y };
    nav.style.translate = `${offset.x}px ${offset.y}px`;
    return { x: px, y: py };
  }
  // Where it starts when it hasn't been moved.
  function home() {
    const m = measure();
    const selector = nav.dataset.clearOf;
    if (!selector) return { x: m.x, y: m.y };
    // The right edge of what you can see in the content: its pictures (including ones that hang
    // outside their boxes) and the text itself (not the boxes around it, which can be as wide as
    // the page). Then the next grid column after a gutter's gap.
    let right = 0;
    const take = (r) => { if (r.width && r.height) right = Math.max(right, r.right - m.f.left); };
    for (const root of frame.querySelectorAll(selector)) {
      for (const el of root.querySelectorAll('img, svg, video, canvas')) take(el.getBoundingClientRect());
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent.trim() || t.parentElement.closest('.visually-hidden')) continue;
        range.selectNodeContents(t);
        take(range.getBoundingClientRect());
      }
    }
    const css = getComputedStyle(document.documentElement);
    const margin = parseFloat(css.getPropertyValue('--grid-margin')) || 60;
    const gutter = parseFloat(css.getPropertyValue('--grid-gutter')) || 20;
    const columns = parseFloat(css.getPropertyValue('--grid-columns')) || 12;
    const step = (m.fw - 2 * margin - (columns - 1) * gutter) / columns + gutter;
    const column = Math.max(0, Math.ceil((right + gutter - margin) / step));
    return { x: margin + column * step, y: m.y };
  }
  function settle() {
    const target = spot ?? home();
    placeAt(target.x, target.y);
  }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(spot)); } catch { /* ignore */ }
  }

  settle();
  new ResizeObserver(settle).observe(frame);   // the frame changes size with the window
  // Pictures in the content can change its width once they load.
  window.addEventListener('load', () => { if (!spot) settle(); });

  let press = null;   // { id, x, y, from, dragging }
  nav.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const m = measure();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { x: m.x + offset.x, y: m.y + offset.y }, dragging: false };
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
    spot = placeAt(press.from.x + dx, press.from.y + dy);
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
