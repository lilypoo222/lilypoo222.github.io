// The 2D cat facing left / right (assets/images/2D-cat-facingRight.svg, 2D-cat-facingLeft.svg;
// Figma Portfolio_02 "cat-planet" 2173:1840, groups facingRight 2173:1862 / facingLeft 2175:2076),
// walking in place with the same cycle as the Walk state on 2D-cat-animations.html.
// Not used on any page yet — preview it on cat-facing-walk.html.
//
//   import { createFacingCat } from './assets/js/cat-facing-walk.js';
//   const cat = await createFacingCat('right');   // or 'left'
//   someElement.append(cat.svg);                   // walks until cat.stop(); cat.play() restarts
//
// The rig works in the file's own (Figma export) coordinates. The Body layer is one shape, so the
// legs are the same Body drawing clipped below the hips, letting them move under the torso without
// adding any new shapes or outlines.

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;
// The 2D page's walk is in rig units, where this artwork is 1.613754× larger.
const RIG_TO_ART = 1 / 1.613754;

// Pivots for facingRight, in its export coordinates. facingLeft is its mirror image about
// MIRROR_X (the two Body layers are exact mirrors), so its pivots are reflected.
const MIRROR_X = 245.782;
const PIVOTS_RIGHT = {
  feet: [125.6, 329.2],
  head: [126, 245],                     // neck
  tail: [97.5, 294.5],                  // where the tail meets the body
  armL: [112.8, 245.2], armR: [133.7, 235.1],   // shoulders (the arm edges hidden behind the body)
  legL: [111.4, 314], legR: [139.9, 314],       // hips (on the torso cut, so the leg tops stay hidden as they swing)
};
const LEG_SPLIT_X = 125.6;   // between the legs
const TORSO_BOTTOM = 314;    // through the crotch, so the torso keeps the crotch outline when the legs part
const LEG_TOP = 311;         // legs start a little higher, hidden behind the torso
const SHADOW = { x: 65, y: 318, width: 122, height: 23 };   // the Figma shadow ellipse, for previews

const HEAD_LAYERS = ['Head', 'Stitches', 'Eye L', 'Eye R', 'Mouth'];

// How far the legs swing forward and back. The front-on Walk only lifts the legs; side-on, a stride
// is what reads as walking. Set to 0 for the front-on Walk's legs exactly.
const STRIDE = 0.18;

// Standing still: exactly the drawing in the file.
const REST = { y: 0, squash: 1, lean: 0, headY: 0, headTilt: 0, armL: 0, armR: 0, legL: 0, legR: 0, legLy: 0, legRy: 0, tail: 0 };

// Walk, as on 2D-cat-animations.html (same cycle, timing and amounts), plus the stride. `dir` is +1
// facing right, -1 facing left, so forward is always the way the cat faces.
function walkPose(t, dir) {
  const cycle = 0.9;
  const p = (t / cycle) * TAU;
  const s = Math.sin(p), c = Math.cos(p);
  return {
    y: Math.abs(s) * 5 * RIG_TO_ART,
    squash: 1 - Math.abs(c) * 0.02,
    lean: s * 0.05,
    headY: -Math.abs(s) * 1.5 * RIG_TO_ART,
    headTilt: -s * 0.04,
    armL: s * 0.14,
    armR: s * 0.14,
    legL: s * STRIDE * dir,
    legR: -s * STRIDE * dir,
    legLy: -Math.max(0, c) * 6 * RIG_TO_ART,
    legRy: -Math.max(0, -c) * 6 * RIG_TO_ART,
    tail: Math.sin(p + 1) * 0.22,
  };
}

function el(name, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
async function loadSvg(url) {
  const text = await (await fetch(url)).text();
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}
// A layer from the file, ids dropped so copies don't clash.
function layer(doc, id) {
  const node = doc.getElementById(id).cloneNode(true);
  node.removeAttribute('id');
  for (const child of node.querySelectorAll('[id]')) child.removeAttribute('id');
  return node;
}

let instances = 0;

export async function createFacingCat(facing = 'right', { shadow = false } = {}) {
  const dir = facing === 'left' ? -1 : 1;
  const file = facing === 'left' ? '2D-cat-facingLeft.svg' : '2D-cat-facingRight.svg';
  const doc = await loadSvg(new URL(`../images/${file}`, import.meta.url));
  const fileSvg = doc.documentElement;
  const fileCat = doc.getElementById('cat');

  const mirror = ([x, y]) => [dir > 0 ? x : MIRROR_X - x, y];
  const pivot = Object.fromEntries(Object.entries(PIVOTS_RIGHT).map(([k, v]) => [k, mirror(v)]));
  // Facing left, the legs swap sides; keep "L" as the leg on the left of the drawing.
  if (dir < 0) [pivot.legL, pivot.legR] = [pivot.legR, pivot.legL];
  const splitX = mirror([LEG_SPLIT_X, 0])[0];

  // Clips for the torso and the two legs, in the file's coordinates.
  const id = `facing-cat-${++instances}`;
  const big = 1000;
  const defs = el('defs', {},
    el('clipPath', { id: `${id}-torso` }, el('rect', { x: -big, y: -big, width: 2 * big, height: big + TORSO_BOTTOM })),
    el('clipPath', { id: `${id}-legL` }, el('rect', { x: -big, y: LEG_TOP, width: big + splitX, height: big })),
    el('clipPath', { id: `${id}-legR` }, el('rect', { x: splitX, y: LEG_TOP, width: big, height: big })));

  const parts = {
    head: el('g'), tail: el('g'), armL: el('g'), armR: el('g'), legL: el('g'), legR: el('g'),
  };
  const body = (clip) => el('g', { 'clip-path': `url(#${id}-${clip})` }, layer(doc, 'Body'));
  parts.legL.append(body('legL'));
  parts.legR.append(body('legR'));

  // Same layer order as the file; the head layers go together where the Head is.
  const root = el('g');
  for (const child of fileCat.children) {
    const name = child.id;
    if (name === 'Head') root.append(parts.head);
    if (HEAD_LAYERS.includes(name)) parts.head.append(layer(doc, name));
    else if (name === 'Tail') root.append(parts.tail), parts.tail.append(layer(doc, name));
    else if (name === 'Arm Up L') root.append(parts.armL), parts.armL.append(layer(doc, name));
    else if (name === 'Arm Up R') root.append(parts.armR), parts.armR.append(layer(doc, name));
    else if (name === 'Body') root.append(parts.legL, parts.legR, body('torso'));
    else root.append(layer(doc, name));
  }

  // Same box as the file (plus room for the bob), placed with the file's own offset.
  const [, , w, h] = fileSvg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  const offset = fileCat.getAttribute('transform') || '';
  const pad = 12;
  const svg = el('svg', {
    viewBox: `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`,
    width: w + 2 * pad, height: h + 2 * pad,
    fill: fileSvg.getAttribute('fill') || 'none', overflow: 'visible',
    role: 'img', 'aria-label': `Black cat character walking, facing ${dir > 0 ? 'right' : 'left'}`,
  }, defs, el('g', { transform: offset },
    ...(shadow ? [el('image', { href: new URL('../images/cat-shadow.svg', import.meta.url), ...SHADOW })] : []),
    root));

  const about = ([x, y], deg) => `rotate(${deg} ${x} ${y})`;
  function apply(p) {
    const [fx, fy] = pivot.feet;
    const side = 1 / Math.sqrt(p.squash);
    root.setAttribute('transform',
      `translate(0 ${-p.y}) translate(${fx} ${fy}) rotate(${-p.lean * DEG}) scale(${side} ${p.squash}) translate(${-fx} ${-fy})`);
    parts.head.setAttribute('transform', `translate(0 ${p.headY}) ${about(pivot.head, p.headTilt * DEG)}`);
    parts.tail.setAttribute('transform', about(pivot.tail, p.tail * dir * DEG));
    parts.armL.setAttribute('transform', about(pivot.armL, p.armL * DEG));
    parts.armR.setAttribute('transform', about(pivot.armR, p.armR * DEG));
    parts.legL.setAttribute('transform', `translate(0 ${p.legLy}) ${about(pivot.legL, p.legL * DEG)}`);
    parts.legR.setAttribute('transform', `translate(0 ${p.legRy}) ${about(pivot.legR, p.legR * DEG)}`);
  }

  let raf = 0, start = 0;
  const tick = (ms) => { apply(walkPose(ms / 1000 - start, dir)); raf = requestAnimationFrame(tick); };
  const cat = {
    svg,
    facing: dir > 0 ? 'right' : 'left',
    play() { cancelAnimationFrame(raf); start = performance.now() / 1000; raf = requestAnimationFrame(tick); },
    stop() { cancelAnimationFrame(raf); raf = 0; apply(REST); },
    // Hold the walk at t seconds (for inspecting a pose).
    freeze(t) { cancelAnimationFrame(raf); raf = 0; apply(walkPose(t, dir)); },
  };
  apply(REST);
  cat.play();
  return cat;
}
