// Star cursor (global: include on every page, with assets/css/cursor.css).
// A star that follows the mouse: black/white "difference" normally so it's always visible, pink
// over anything clickable, and green over clickable things that are already that pink.
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
