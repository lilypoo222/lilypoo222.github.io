// Homepage cat: grab it and pull it up off the hill.
// - At rest it's the plain 2D artwork (assets/images/2D-cat-idle.svg) with its Figma hop (CSS).
// - While held it swaps to the 2D rig from 2D-cat-animations.html (same artwork, same pivots)
//   playing the Walk state 2× faster, so it looks a bit frantic.
// - It's magnetic: the further you pull, the harder it resists, and its feet can never leave the
//   green circle (the hill).
// - It's held by the head like a ragdoll: the body swings from the neck after the head, and the
//   legs, arms and tail flop a beat behind.
// - Let go and gravity snaps it back down with one small bounce and a squash on landing, then it
//   eases back into the artwork's pose and the plain SVG takes over again.

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;

// ---------- the 2D rig (copied from 2D-cat-animations.html; keep the two in step) ----------
// Rig coordinates are the original design's (Figma "Cat Character" frame); the site's 2D files are
// the same drawing at 0.61967× scale, placed with ASSET_TO_RIG.
const RIG_SCALE = 1.613754;
const RIG_ORIGIN = [117.0016, 66.0025];
const ASSET_TO_RIG = `matrix(${RIG_SCALE} 0 0 ${RIG_SCALE} ${RIG_ORIGIN[0]} ${RIG_ORIGIN[1]})`;
const ART_SIZE = [226.93, 316.651];   // 2D-cat-idle.svg, in page px

const ARMS_DOWN = {
  L: 'M212.863 458.598C226.896 450.831 245.847 443.407 262.143 432V472C250.048 475.456 234.968 479.658 219.482 482.672C214.623 483.617 209.452 484.286 204.896 482.348C200.712 480.567 199.027 477.536 199.842 473.256C201.112 466.589 206.925 461.885 212.863 458.598Z',
  R: 'M386.28 458.598C372.246 450.831 353.296 443.407 337 432V472C349.095 475.456 364.175 479.658 379.661 482.672C384.52 483.617 389.691 484.286 394.246 482.348C398.431 480.567 400.116 477.536 399.301 473.256C398.031 466.589 392.218 461.885 386.28 458.598Z',
};
// The torso reaches down to the crotch and is outlined only along its sides, so with the grey fill
// no seam shows where it overlaps the legs (they read as one outline, like the Body layer).
const TORSO = 'M262.143 432H334.143V472L336.155 547H260.136L262.143 472Z';
const TORSO_SIDES = 'M260.136 547L262.143 472V432H334.143V472L336.155 547';
const LEGS = {
  L: 'M260.56 530L260.143 548C260.143 565.333 265.476 574 276.143 574C285.476 574 290.143 566.667 290.143 552C292.6 549.6 295.2 548.3 298.143 548.2V530Z',
  R: 'M298.143 530V548.2C301.1 548.3 303.7 549.6 306.143 552C306.143 566.667 310.809 574 320.143 574C330.809 574 336.143 565.333 336.143 548L335.72 530Z',
};
const PIVOTS = {
  feet: [298, 577], head: [298, 440], tail: [256, 516],
  armL: [262, 452], armR: [336, 452],
  legL: [283, 538], legR: [313, 538],
};
const ARM_UP = 0.56;   // shoulder rotation from "arms down" to the design's "arms up"

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
function asset(doc, id) {
  const node = doc.getElementById(id).cloneNode(true);
  node.removeAttribute('id');
  for (const child of node.querySelectorAll('[id]')) child.removeAttribute('id');
  return el('g', { transform: ASSET_TO_RIG, fill: doc.documentElement.getAttribute('fill') || 'black' }, node);
}
const solid = (d) => el('path', { d, fill: '#1A1A1A', stroke: 'black', 'stroke-width': 6, 'stroke-linejoin': 'round' });
const torso = () => el('g', {}, el('path', { d: TORSO, fill: '#1A1A1A' }),
  el('path', { d: TORSO_SIDES, fill: 'none', stroke: 'black', 'stroke-width': 6, 'stroke-linejoin': 'round' }));

function buildRig(idle) {
  const parts = {
    tail: el('g', {}, asset(idle, 'Tail')),
    legL: el('g', {}, solid(LEGS.L)),
    legR: el('g', {}, solid(LEGS.R)),
    armL: el('g'),
    armR: el('g'),
    head: el('g', {}, asset(idle, 'Head'), asset(idle, 'Stitches'),
      asset(idle, 'Eye L'), asset(idle, 'Eye R'), asset(idle, 'Mouth')),
  };
  const arms = {
    L: { down: solid(ARMS_DOWN.L), up: asset(idle, 'Arm Up L') },
    R: { down: solid(ARMS_DOWN.R), up: asset(idle, 'Arm Up R') },
  };
  parts.armL.append(arms.L.down, el('g', {}, arms.L.up));
  parts.armR.append(arms.R.down, el('g', {}, arms.R.up));
  // Everything below the head, so it can swing from the neck (ragdoll) while the head is held.
  const body = el('g', {},
    parts.tail, parts.armL, parts.armR, parts.legL, parts.legR, torso(), asset(idle, 'Belly'));
  const root = el('g', {}, body, parts.head);
  // Same box as the <img>: the artwork's bounds in rig coordinates.
  const svg = el('svg', {
    class: 'home__cat-rig',
    viewBox: `${RIG_ORIGIN[0]} ${RIG_ORIGIN[1]} ${ART_SIZE[0] * RIG_SCALE} ${ART_SIZE[1] * RIG_SCALE}`,
    'aria-hidden': 'true',
  }, root);
  return { svg, root, body, parts, arms };
}

// ---------- poses ----------
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const easeInOut = (v) => (v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2);
const lerp = (a, b, v) => a + (b - a) * v;

const REST = {
  y: 0, squash: 1, lean: 0, headY: 0, headTilt: 0,
  armL: 0, armR: 0, legLy: 0, legLz: 0, legRy: 0, legRz: 0, tail: 0,
  swing: 0,   // body rotation about the neck (ragdoll), radians, + = feet swung right
};
// The artwork's own pose (arms up), so the rig and the <img> match at the hand-over.
const ART_POSE = { ...REST, armL: ARM_UP, armR: -ARM_UP };

// The 2D page's Walk, sped up.
const WALK_SPEED = 2;
function walk(t) {
  const p = (t * WALK_SPEED / 0.9) * TAU;
  const s = Math.sin(p), c = Math.cos(p);
  return {
    ...REST,
    y: Math.abs(Math.sin(p)) * 5,
    squash: 1 - Math.abs(Math.cos(p)) * 0.02,
    lean: s * 0.05,
    headY: -Math.abs(Math.sin(p)) * 1.5,
    headTilt: -s * 0.04,
    armL: s * 0.14,
    armR: s * 0.14,
    legLy: -Math.max(0, c) * 6,
    legRy: -Math.max(0, -c) * 6,
    tail: Math.sin(p + 1) * 0.22,
  };
}
const mix = (a, b, v) => Object.fromEntries(Object.keys(REST).map((k) => [k, lerp(a[k], b[k], v)]));

const about = ([x, y], deg) => `rotate(${deg} ${x} ${y})`;
function applyPose(rig, p) {
  const [fx, fy] = PIVOTS.feet;
  const side = 1 / Math.sqrt(p.squash);
  rig.root.setAttribute('transform',
    `translate(0 ${-p.y}) translate(${fx} ${fy}) rotate(${-p.lean * DEG}) scale(${side} ${p.squash}) translate(${-fx} ${-fy})`);
  rig.body.setAttribute('transform', about(PIVOTS.head, -p.swing * DEG));
  rig.parts.head.setAttribute('transform', `translate(0 ${p.headY}) ${about(PIVOTS.head, p.headTilt * DEG)}`);
  rig.parts.tail.setAttribute('transform', about(PIVOTS.tail, p.tail * DEG));
  placeArm(rig.parts.armL, rig.arms.L, PIVOTS.armL, p.armL, 1);
  placeArm(rig.parts.armR, rig.arms.R, PIVOTS.armR, p.armR, -1);
  rig.parts.legL.setAttribute('transform', `translate(0 ${p.legLy}) ${about(PIVOTS.legL, p.legLz * DEG)}`);
  rig.parts.legR.setAttribute('transform', `translate(0 ${p.legRy}) ${about(PIVOTS.legR, p.legRz * DEG)}`);
}
function placeArm(group, { down, up }, pivot, angle, raise) {
  group.setAttribute('transform', about(pivot, angle * DEG));
  const showUp = angle * raise > ARM_UP / 2;
  down.style.display = showUp ? 'none' : '';
  up.parentNode.style.display = showUp ? '' : 'none';
  up.parentNode.setAttribute('transform', about(pivot, -raise * ARM_UP * DEG));
}

// ---------- drag physics ----------
const GRAB_BLEND = 0.15;     // s, artwork pose → walk
const SETTLE_BLEND = 0.25;   // s, walk → artwork pose after landing
const GRAVITY = 5000;        // px/s², strong so it "snaps" back
const BOUNCE = 0.3;          // share of the landing speed kept for the bounce
const STOP_SPEED = 160;      // px/s, landings slower than this don't bounce
const SIDE_GIVE = 40;        // px, most it slides sideways
const EDGE_MARGIN = 6;       // px, feet stay this far inside the circle's edge
// Ragdoll: it's held by the head, and the body hangs from the neck like a weight on a short rope,
// so it swings after the head when you move it, and the limbs flop a beat behind the body.
const ROPE = 40;             // px, neck to the body's weight (shorter = quicker swing)
const SWING_GRAVITY = 2400;  // px/s², how hard the body is pulled back to hanging straight
const SWING_DAMPING = 3;     // per second, how fast the swinging dies down
const MAX_SWING = 1.2;       // radians (~70°)
// Feet (the rig's PIVOTS.feet) in px from the top-left of .home__cat.
const FEET = [(PIVOTS.feet[0] - RIG_ORIGIN[0]) / RIG_SCALE - 1.85, (PIVOTS.feet[1] - RIG_ORIGIN[1]) / RIG_SCALE];

// Pulling harder gets you less and less: approaches `max` but never reaches it. RESISTANCE is how
// much of your pull the cat gives in to at first (1 = follows the pointer; lower = heavier).
const RESISTANCE = 0.45;
const give = (raw, max) => Math.sign(raw) * max * (1 - Math.exp(-Math.abs(raw) * RESISTANCE / max));
const ungive = (v, max) => Math.sign(v) * -max * Math.log(1 - Math.min(Math.abs(v) / max, 0.999)) / RESISTANCE;

async function init() {
  const cat = document.querySelector('.home__cat');
  const art = cat?.querySelector('.home__cat-art');
  const shadow = cat?.querySelector('.home__cat-shadow');
  const hill = document.querySelector('.home__circle');
  if (!cat || !art || !hill) return;

  const rig = buildRig(await loadSvg(art.getAttribute('src')));
  cat.append(rig.svg);
  art.draggable = false;

  // mode: 'rest' (plain artwork) | 'held' | 'falling' | 'settling'
  const s = { mode: 'rest', x: 0, up: 0, vy: 0, grabAt: 0, settleAt: 0, impactAt: -1, impact: 0,
    fromPose: ART_POSE, lastPose: ART_POSE, hopY: 0, pointer: null, start: null, room: 0, circle: null, feet0: null,
    bob: [0, ROPE], bobV: [0, 0], swing: 0, swingV: 0 };
  const now = () => performance.now() / 1000;
  let raf = 0;

  // Where the hill is right now, and how far the feet can go up before leaving it.
  function measure() {
    const c = cat.getBoundingClientRect();
    const h = hill.getBoundingClientRect();
    const r = h.width / 2 - EDGE_MARGIN;
    const cx = h.left + h.width / 2, cy = h.top + h.height / 2;
    const feet0 = [c.left + FEET[0], c.top + FEET[1]];
    const dx = feet0[0] - cx;
    const top = cy - Math.sqrt(Math.max(r * r - dx * dx, 0));
    s.circle = { cx, cy, r };
    s.feet0 = feet0;
    s.room = Math.max(feet0[1] - top, 1);
  }

  // Keep the feet inside the circle.
  function clampToHill(x, up) {
    const { cx, cy, r } = s.circle;
    const px = s.feet0[0] + x - cx, py = s.feet0[1] - up - cy;
    const d = Math.hypot(px, py);
    if (d <= r) return [x, up];
    return [cx + (px * r) / d - s.feet0[0], s.feet0[1] - (cy + (py * r) / d)];
  }

  cat.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || s.pointer !== null) return;
    e.preventDefault();
    try { cat.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    s.pointer = e.pointerId;
    if (s.mode === 'rest') {
      measure();
      // Start from wherever the CSS hop has the artwork right now, so nothing jumps.
      s.hopY = -parseFloat(getComputedStyle(art).translate.split(' ')[1] || 0) || 0;
      s.x = 0;
      s.up = 0;
      s.bob = [0, ROPE];
      s.bobV = [0, 0];
      s.swing = 0;
      s.swingV = 0;
      s.fromPose = ART_POSE;
      s.grabAt = now();
      cat.classList.add('is-held');
    } else if (s.mode === 'settling') {
      s.fromPose = s.lastPose;
      s.grabAt = now();
    }
    // Continue from the cat's current spot (re-grabbing mid-fall works too).
    s.start = [e.clientX - ungive(s.x, SIDE_GIVE), e.clientY + ungive(s.up, s.room)];
    s.mode = 'held';
    s.vy = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  });

  cat.addEventListener('pointermove', (e) => {
    if (e.pointerId !== s.pointer) return;
    const rawX = e.clientX - s.start[0];
    const rawUp = Math.max(s.start[1] - e.clientY, 0);
    [s.x, s.up] = clampToHill(give(rawX, SIDE_GIVE), give(rawUp, s.room));
  });

  const release = (e) => {
    if (e.pointerId !== s.pointer) return;
    s.pointer = null;
    s.mode = 'falling';
  };
  cat.addEventListener('pointerup', release);
  cat.addEventListener('pointercancel', release);

  let last = now();
  function tick() {
    const t = now();
    const dt = Math.min(t - last, 1 / 30);
    last = t;

    if (s.mode === 'falling') {
      s.vy -= GRAVITY * dt;
      s.up += s.vy * dt;
      s.x *= Math.exp(-dt * 14);
      if (s.up <= 0) {
        s.up = 0;
        s.impact = Math.min(-s.vy / 1300, 1);   // 1 ≈ dropped from the top of the hill
        s.impactAt = t;
        if (-s.vy > STOP_SPEED) {
          s.vy = -s.vy * BOUNCE;
        } else {
          s.vy = 0;
          s.x = 0;
          s.mode = 'settling';
          s.settleAt = t;
          s.fromPose = s.lastPose;
        }
      }
    }

    // Ragdoll: move the body's weight, keep it one rope-length from the neck, and read off the
    // angle. While falling, the weight falls with the cat, so only SWING_GRAVITY acts relative to it.
    const anchor = [s.x, -s.up];
    const fall = s.mode === 'falling' ? GRAVITY : 0;
    const keep = Math.exp(-dt * SWING_DAMPING);
    const before = [...s.bob];
    s.bobV = [s.bobV[0] * keep, (s.bobV[1] + (SWING_GRAVITY + fall) * dt) * keep];
    const free = [s.bob[0] + s.bobV[0] * dt, s.bob[1] + s.bobV[1] * dt];
    const d = [free[0] - anchor[0], free[1] - anchor[1]];
    const len = Math.hypot(...d) || 1;
    s.bob = [anchor[0] + (d[0] * ROPE) / len, anchor[1] + (d[1] * ROPE) / len];
    if (dt > 0) s.bobV = [(s.bob[0] - before[0]) / dt, (s.bob[1] - before[1]) / dt];
    const swing = Math.max(-MAX_SWING, Math.min(MAX_SWING, Math.atan2(d[0], d[1])));
    if (dt > 0) s.swingV = lerp(s.swingV, (swing - s.swing) / dt, 0.3);
    s.swing = swing;

    // Pose: walk while held or in the air, then ease back into the artwork's pose.
    let pose;
    let floppy = 1;
    if (s.mode === 'settling') {
      const b = easeInOut(clamp01((t - s.settleAt) / SETTLE_BLEND));
      pose = mix(s.fromPose, ART_POSE, b);
      floppy = 1 - b;
    } else {
      pose = mix(s.fromPose, walk(t - s.grabAt), easeInOut(clamp01((t - s.grabAt) / GRAB_BLEND)));
      s.lastPose = pose;
    }
    // The body swings from the neck; the limbs try to keep hanging down and trail the swing.
    const flop = (k, lag, max) => Math.max(-max, Math.min(max, (s.swing * k + s.swingV * lag) * floppy));
    pose = {
      ...pose,
      swing: s.swing * floppy,
      headTilt: pose.headTilt + s.swing * 0.12 * floppy,
      legLz: pose.legLz + flop(0.5, 0.04, 0.6),
      legRz: pose.legRz + flop(0.5, 0.04, 0.6),
      armL: pose.armL + flop(0.4, 0.03, 0.4),
      armR: pose.armR + flop(0.4, 0.03, 0.4),
      tail: pose.tail + flop(0.6, 0.06, 0.8),
    };
    if (s.mode !== 'settling') {
      // Keep the arms on their "down" drawing while flopping (past ±0.28 the rig swaps drawings).
      pose.armL = Math.min(pose.armL, 0.27);
      pose.armR = Math.max(pose.armR, -0.27);
    }
    // Follow-through: a squash on each landing that wobbles out.
    const since = t - s.impactAt;
    const wobble = s.impactAt < 0 ? 0 : s.impact * 0.14 * Math.exp(-since * 9) * Math.cos(since * 28);
    pose = { ...pose, squash: pose.squash - wobble };
    applyPose(rig, pose);

    // Fade out the CSS hop offset we started from.
    const hop = s.hopY * (1 - easeInOut(clamp01((t - s.grabAt) / GRAB_BLEND)));
    rig.svg.style.transform = `translate(${s.x}px, ${-(s.up + hop)}px)`;
    // The shadow stays on the ground, shrinking and fading as the cat goes up.
    const lift = clamp01(s.up / s.room);
    shadow.style.transform = `translateX(-50%) scale(${1 - lift * 0.35})`;
    shadow.style.opacity = 1 - lift * 0.45;

    const done = s.mode === 'settling' && t - s.settleAt > SETTLE_BLEND && since > 0.45;
    if (done) {
      s.mode = 'rest';
      s.impactAt = -1;
      cat.classList.remove('is-held');
      rig.svg.style.transform = '';
      shadow.style.transform = '';
      shadow.style.opacity = '';
      // Restart the hop from its start, which is the rig's resting spot.
      art.style.animation = 'none';
      void art.offsetWidth;
      art.style.animation = '';
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }
}

init();
