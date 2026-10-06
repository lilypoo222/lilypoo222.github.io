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
