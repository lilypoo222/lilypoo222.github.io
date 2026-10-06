// Star cursor (global: include on every page, with assets/css/cursor.css).
// A star that follows the mouse: black over light areas and white over dark ones so it's always
// visible, pink over anything clickable, and green over clickable things that are already that pink.
// Mouse/trackpad only; touch screens keep the CSS fallback (or no cursor at all).
(() => {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const HOTSPOT = [4.8, 0.15];   // the tip of the star's upper-left point, in px
  // Anything you can click counts. Add data-clickable to make other elements count too
  // (e.g. a clickable image).
  const CLICKABLE = 'a[href], button, [role="button"], input, select, textarea, label, summary, [data-clickable]';

  function start() {
    const star = document.createElement('div');
    star.className = 'star-cursor';
    star.setAttribute('aria-hidden', 'true');
    document.body.appendChild(star);
    document.documentElement.classList.add('has-star-cursor');

    // The hover colour as rgb(), to compare against the colours under the cursor.
    const hoverColor = resolveColor(getComputedStyle(document.documentElement).getPropertyValue('--cursor-hover-color'));

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      star.style.transform = `translate3d(${e.clientX - HOTSPOT[0]}px, ${e.clientY - HOTSPOT[1]}px, 0)`;
      star.style.opacity = '1';

      const target = e.target instanceof Element ? e.target.closest(CLICKABLE) : null;
      const clickable = Boolean(target) && !target.matches(':disabled');
      star.classList.toggle('is-over-clickable', clickable);
      star.classList.toggle('is-over-hover-color', clickable && sameColor(backgroundUnder(e.target), hoverColor));
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { star.style.opacity = '0'; });
    window.addEventListener('blur', () => { star.style.opacity = '0'; });

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startTrail();
  }

  // Sparkle trail: little four-point sparkles (and a few dots) drop behind the cursor as it moves,
  // twinkle, drift and shrink, and are gone after half a second. Drawn on one full-window canvas.
  function startTrail() {
    const LIFE = 0.5;        // seconds each sparkle lasts
    const SPACING = 14;      // px of movement between sparkles
    const OPACITY = 0.7;     // sparkles at their brightest
    // The star cursor is 31.75 × 30.5 drawn from its tip (HOTSPOT); sparkles come from its centre.
    const CENTRE = [31.75 / 2 - HOTSPOT[0], 30.5 / 2 - HOTSPOT[1]];
    const canvas = document.createElement('canvas');
    canvas.className = 'cursor-trail';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const sparkles = [];
    let last = null, raf = 0, prev = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const rand = (min, max) => min + Math.random() * (max - min);
    function spawn(x, y) {
      const dot = Math.random() < 0.2;               // 1 in 5 is a tiny dot instead of a sparkle
      sparkles.push({
        x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: rand(-14, 14), vy: rand(4, 26),          // a little drift, mostly downward
        size: dot ? rand(0.6, 1) : rand(2, 4.5),
        dot,
        angle: rand(0, Math.PI / 2), spin: rand(-2, 2),
        twinkle: rand(0, Math.PI * 2),
        born: performance.now() / 1000,
      });
    }

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const x = e.clientX + CENTRE[0], y = e.clientY + CENTRE[1];
      if (!last) { last = [x, y]; return; }
      const dist = Math.hypot(x - last[0], y - last[1]);
      // One sparkle every SPACING px along the path, so fast moves leave a full trail.
      for (let d = SPACING; d <= dist; d += SPACING) {
        const t = d / dist;
        spawn(last[0] + (x - last[0]) * t, last[1] + (y - last[1]) * t);
      }
      if (dist >= SPACING) last = [x, y];
      if (!raf && sparkles.length) { prev = performance.now() / 1000; raf = requestAnimationFrame(frame); }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { last = null; });

    // A four-point sparkle: points out at 0/90/180/270°, pinched in between.
    function drawSparkle(r) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2, b = a + Math.PI / 2;
        if (i === 0) ctx.moveTo(r, 0);
        ctx.quadraticCurveTo(Math.cos(a + Math.PI / 4) * r * 0.18, Math.sin(a + Math.PI / 4) * r * 0.18, Math.cos(b) * r, Math.sin(b) * r);
      }
      ctx.fill();
    }

    function frame() {
      const now = performance.now() / 1000;
      const dt = Math.min(now - prev, 1 / 20);
      prev = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.fillStyle = '#fff';
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        const age = (now - s.born) / LIFE;
        if (age >= 1) { sparkles.splice(i, 1); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.angle += s.spin * dt;
        const fade = (1 - age) ** 2;
        const twinkle = 0.75 + 0.25 * Math.sin(now * 18 + s.twinkle);
        ctx.globalAlpha = OPACITY * fade * twinkle;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        if (s.dot) {
          ctx.beginPath();
          ctx.arc(0, 0, s.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawSparkle(s.size * (1 - age * 0.6));
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      raf = sparkles.length ? requestAnimationFrame(frame) : 0;
    }
  }

  // The colour you see behind the pointer: the nearest element (from the one under the pointer
  // upward) with a non-transparent background colour.
  function backgroundUnder(el) {
    for (let node = el; node instanceof Element; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (rgba(color)[3] > 0) return color;
    }
    return 'rgb(255, 255, 255)';
  }

  function resolveColor(value) {
    const probe = document.createElement('span');
    probe.style.color = value.trim();
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }

  function rgba(color) {
    const n = (color.match(/[\d.]+/g) || []).map(Number);
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
  }

  function sameColor(a, b) {
    const [r1, g1, b1] = rgba(a), [r2, g2, b2] = rgba(b);
    return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 24;
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
