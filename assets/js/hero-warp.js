// Hero text hover warp + word cycling.
// The hero text is drawn into a WebGL canvas. A small "jelly" simulation runs underneath it:
// moving the cursor across the letters pushes them along with it, they spring back with a soft
// wobble, and a gentle lens swells the letters under the cursor.
// Word cycling: words with a data-cycle list (e.g. "celebrating, revealing, creating, finding")
// change one step per hover. Hovering a word uncovers its next word under a brush; when the cursor
// leaves, the swap finishes across the whole word with a ripple and stays until the next hover.
// Each cycling word has its own layer and reveal channel, so words never affect each other (the
// lines are tightly spaced and overlap). The real text stays in the page (invisible while the
// canvas shows it), and is simply shown as-is without WebGL or with reduced motion.
import * as THREE from 'three';

const hero = document.querySelector('.hero-text');
const canvas = hero?.querySelector('.hero-text__warp');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (hero && canvas && !reduceMotion) start().catch(() => hero.classList.remove('is-warping'));

// ---------- tuning ----------
const SIM_WIDTH = 320;       // simulation resolution (height follows the canvas aspect)
const STIFFNESS = 90;        // how hard the letters spring back
const DAMPING = 6.5;         // how quickly the wobble settles
const PUSH = 1.6;            // how much cursor motion drags the letters
const RADIUS = 0.15;         // cursor influence, as a fraction of the canvas height
const LENS = 0.18;           // magnifying swell under the cursor (0 = none)
const MAX_SPEED = 2.5;       // cap on cursor speed (canvas heights per second)
const MAX_STRETCH = 0.07;    // furthest a point of a letter can be dragged (canvas heights)
// Reveal brush: a tall oval that covers a full line of text, so moving across a word wipes it over
// in clean vertical slices. Width and height as fractions of the canvas height.
const REVEAL_BRUSH = [0.07, 0.2];
const FINISH_TIME = 0.45;    // seconds for a word to finish swapping after the cursor leaves it
const SWAP_RIPPLE = 0.012;   // how much the letters ripple while finishing the swap (canvas heights)
const MAX_CYCLING = 3;       // cycling words supported (one colour channel each)

const SIM_VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// State per texel: xy = displacement, zw = velocity (both in uv units).
const SIM_FRAGMENT = `
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform vec2 uMouse;
  uniform vec2 uMouseVel;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uDt;
  uniform float uStiffness;
  uniform float uDamping;
  uniform float uPush;
  uniform float uMaxStretch;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(uPrev, vUv);
    // Blend with the neighbours so the surface moves as one soft sheet.
    vec4 n = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)) + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0))
           + texture2D(uPrev, vUv + vec2(0.0, uTexel.y)) + texture2D(uPrev, vUv - vec2(0.0, uTexel.y));
    s = mix(s, n * 0.25, 0.3);
    vec2 d = s.xy;
    vec2 v = s.zw;

    v -= d * uStiffness * uDt;            // spring back to rest
    v *= exp(-uDamping * uDt);            // settle

    vec2 p = (vUv - uMouse) * vec2(uAspect, 1.0);
    float g = exp(-dot(p, p) / (uRadius * uRadius));
    v += uMouseVel * g * uPush * uDt * 60.0;   // drag along with the cursor

    d += v * uDt;
    // Cap the stretch so fast flicks warp the letters instead of folding them over.
    vec2 da = d * vec2(uAspect, 1.0);
    float len = length(da);
    if (len > uMaxStretch) { d *= uMaxStretch / len; v *= 0.5; }
    gl_FragColor = vec4(d, v);
  }
`;

// Reveal mask: one channel per cycling word (r, g, b), 0 → 1 = how far its next word is uncovered.
// The brush paints only the hovered word's channel; a finishing word's channel runs up to 1; when
// its swap is committed, the channel is cleared back to 0.
const MASK_FRAGMENT = `
  uniform sampler2D uPrev;
  uniform vec2 uMouse;
  uniform float uAspect;
  uniform vec2 uBrush;
  uniform float uActive;
  uniform vec3 uHovered;     // 1 for the word under the cursor
  uniform vec3 uFinishing;   // 1 while a word finishes its swap
  uniform vec3 uClearing;    // 1 on the frame a word's swap is committed
  uniform float uFinishStep; // how much a finishing word's reveal grows this frame
  varying vec2 vUv;
  void main() {
    vec3 reveal = texture2D(uPrev, vUv).rgb;
    reveal = min(reveal + uFinishing * uFinishStep, 1.0);
    vec2 p = (vUv - uMouse) * vec2(uAspect, 1.0) / uBrush;
    reveal = max(reveal, uHovered * exp(-dot(p, p)) * uActive);
    reveal *= 1.0 - uClearing;
    gl_FragColor = vec4(reveal, 1.0);
  }
`;

// All the text is black, so the layers only carry coverage: uStatic.a = words that don't cycle,
// uNow.rgb / uNext.rgb = each cycling word's current / next text (one word per channel).
const DISPLAY_FRAGMENT = `
  uniform sampler2D uStatic;
  uniform sampler2D uNow;
  uniform sampler2D uNext;
  uniform sampler2D uSim;
  uniform sampler2D uMask;
  uniform vec2 uMouse;
  uniform float uHover;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uLens;
  uniform float uTime;
  uniform float uRipple;
  uniform vec3 uFinishing;
  uniform vec4 uAreas[${MAX_CYCLING}];   // each cycling word's area in uv (min x, min y, max x, max y)
  varying vec2 vUv;
  float inArea(vec4 a, vec2 uv) {
    return step(a.x, uv.x) * step(uv.x, a.z) * step(a.y, uv.y) * step(uv.y, a.w);
  }
  void main() {
    vec2 uv = vUv - texture2D(uSim, vUv).xy;
    // Lens: sample closer to the cursor so the letters there swell outward.
    vec2 p = (uv - uMouse) * vec2(uAspect, 1.0);
    float r = length(p) / (uRadius * 1.4);
    uv = uMouse + (uv - uMouse) * (1.0 - uLens * uHover * exp(-r * r));
    // While a word finishes its swap, its letters ripple, strongest halfway through the change.
    vec3 m = texture2D(uMask, uv).rgb;
    vec3 swap = uFinishing * 4.0 * m * (1.0 - m);
    float swapping = max(swap.r * inArea(uAreas[0], uv), max(swap.g * inArea(uAreas[1], uv), swap.b * inArea(uAreas[2], uv)));
    uv += swapping * uRipple * vec2(sin(uv.y * 60.0 + uTime * 22.0) / uAspect, sin(uv.x * 90.0 + uTime * 18.0));
    // Each word shows its current or next text (crisp edge: one or the other, never see-through).
    vec3 reveal = smoothstep(0.46, 0.54, texture2D(uMask, uv).rgb);
    vec3 words = mix(texture2D(uNow, uv).rgb, texture2D(uNext, uv).rgb, reveal);
    float coverage = max(texture2D(uStatic, uv).a, max(words.r, max(words.g, words.b)));
    gl_FragColor = vec4(0.0, 0.0, 0.0, coverage);
  }
`;

const CHANNELS = ['#ff0000', '#00ff00', '#0000ff'];

async function start() {
  await document.fonts.ready;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0);
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 needed');

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  // ---------- words ----------
  const words = [...hero.querySelectorAll('.hero-text__word')].map((el) => ({
    el,
    cycle: el.dataset.cycle ? el.dataset.cycle.split(',').map((w) => w.trim()) : null,
    index: 0,
    area: null,          // where it can be hovered, in CSS px relative to the canvas
    finishing: false,
    progress: 0,
  }));
  const cycling = words.filter((w) => w.cycle).slice(0, MAX_CYCLING);
  const isCycling = (w) => cycling.includes(w);

  // ---------- text layers ----------
  // Coverage-only layers: the browser keeps canvas pixels premultiplied, so with premultiplyAlpha
  // each colour channel uploads as that word's coverage.
  function textLayer() {
    const layerCanvas = document.createElement('canvas');
    const texture = new THREE.CanvasTexture(layerCanvas);
    texture.premultiplyAlpha = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return { canvas: layerCanvas, texture };
  }
  const staticLayer = textLayer();
  const nowLayer = textLayer();
  const nextLayer = textLayer();
  let dpr = 1;

  function fontOf(el) {
    const style = getComputedStyle(el);
    return {
      font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      letterSpacing: style.letterSpacing === 'normal' ? '0px' : style.letterSpacing,
    };
  }

  // Draw the given words (each in its colour, with the text picked for it) exactly where the
  // invisible page text sits, in its own font style.
  function drawLayer(layer, list) {
    const c = canvas.getBoundingClientRect();
    const w = Math.round(c.width * dpr), h = Math.round(c.height * dpr);
    // A texture can't change size in place: free the old one so the GPU copy is re-created.
    if (layer.canvas.width !== w || layer.canvas.height !== h) layer.texture.dispose();
    layer.canvas.width = w;
    layer.canvas.height = h;
    const ctx = layer.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'lighter';   // keep each word's channel separate
    for (const { word, text, color } of list) {
      Object.assign(ctx, fontOf(word.el));
      ctx.fillStyle = color;
      // An inline box's height is the font's ascent + descent, so the baseline is top + ascent.
      const r = word.el.getBoundingClientRect();
      ctx.fillText(text, r.left - c.left, r.top - c.top + ctx.measureText(text).fontBoundingBoxAscent);
    }
    layer.texture.needsUpdate = true;
  }

  function drawWords() {
    drawLayer(staticLayer, words.filter((w) => !isCycling(w)).map((word) => ({ word, text: word.el.textContent, color: '#000' })));
    drawLayer(nowLayer, cycling.map((word, i) => ({ word, text: word.cycle[word.index], color: CHANNELS[i] })));
    drawLayer(nextLayer, cycling.map((word, i) => ({ word, text: word.cycle[(word.index + 1) % word.cycle.length], color: CHANNELS[i] })));
  }

  function measureWords() {
    // Each cycling word's hover area: its line's height, and as wide as its widest variant.
    const c = canvas.getBoundingClientRect();
    const ctx = staticLayer.canvas.getContext('2d');
    cycling.forEach((word, i) => {
      Object.assign(ctx, fontOf(word.el));
      const r = word.el.getBoundingClientRect();
      const line = word.el.closest('.hero-text__line').getBoundingClientRect();
      const widest = Math.max(...word.cycle.map((t) => ctx.measureText(t).actualBoundingBoxRight));
      const pad = r.height * 0.06;
      word.area = { left: r.left - c.left - pad, top: line.top - c.top, right: r.left - c.left + widest + pad, bottom: line.bottom - c.top };
      const a = word.area;
      displayMaterial.uniforms.uAreas.value[i].set(a.left / c.width, 1 - (a.bottom + pad * 3) / c.height, a.right / c.width, 1 - (a.top - pad * 3) / c.height);
    });
  }

  // ---------- simulation + reveal mask (each ping-pongs between two float targets) ----------
  const targetOptions = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  let simA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  let simB = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  let maskA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  let maskB = new THREE.WebGLRenderTarget(1, 1, targetOptions);

  const simMaterial = new THREE.ShaderMaterial({
    vertexShader: SIM_VERTEX,
    fragmentShader: SIM_FRAGMENT,
    uniforms: {
      uPrev: { value: null }, uTexel: { value: new THREE.Vector2() },
      uMouse: { value: new THREE.Vector2(-10, -10) }, uMouseVel: { value: new THREE.Vector2() },
      uAspect: { value: 1 }, uRadius: { value: RADIUS }, uDt: { value: 1 / 60 },
      uStiffness: { value: STIFFNESS }, uDamping: { value: DAMPING }, uPush: { value: PUSH },
      uMaxStretch: { value: MAX_STRETCH },
    },
  });
  const simScene = new THREE.Scene();
  simScene.add(new THREE.Mesh(quad, simMaterial));

  const maskMaterial = new THREE.ShaderMaterial({
    vertexShader: SIM_VERTEX,
    fragmentShader: MASK_FRAGMENT,
    uniforms: {
      uPrev: { value: null }, uMouse: simMaterial.uniforms.uMouse, uAspect: simMaterial.uniforms.uAspect,
      uBrush: { value: new THREE.Vector2(...REVEAL_BRUSH) }, uActive: { value: 0 },
      uHovered: { value: new THREE.Vector3() }, uFinishing: { value: new THREE.Vector3() },
      uClearing: { value: new THREE.Vector3() }, uFinishStep: { value: 0 },
    },
  });
  const maskScene = new THREE.Scene();
  maskScene.add(new THREE.Mesh(quad, maskMaterial));

  const displayMaterial = new THREE.ShaderMaterial({
    vertexShader: SIM_VERTEX,
    fragmentShader: DISPLAY_FRAGMENT,
    transparent: true,
    uniforms: {
      uStatic: { value: staticLayer.texture }, uNow: { value: nowLayer.texture }, uNext: { value: nextLayer.texture },
      uSim: { value: null }, uMask: { value: null },
      uMouse: simMaterial.uniforms.uMouse, uHover: { value: 0 },
      uAspect: simMaterial.uniforms.uAspect, uRadius: { value: RADIUS }, uLens: { value: LENS },
      uTime: { value: 0 }, uRipple: { value: SWAP_RIPPLE },
      uFinishing: maskMaterial.uniforms.uFinishing,
      uAreas: { value: Array.from({ length: MAX_CYCLING }, () => new THREE.Vector4(-1, -1, -1, -1)) },
    },
  });
  const displayScene = new THREE.Scene();
  displayScene.add(new THREE.Mesh(quad, displayMaterial));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.width, rect.height, false);
    drawWords();
    measureWords();

    const aspect = rect.width / rect.height;
    const simH = Math.max(8, Math.round(SIM_WIDTH / aspect));
    for (const t of [simA, simB, maskA, maskB]) {
      t.setSize(SIM_WIDTH, simH);
      renderer.setRenderTarget(t);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    simMaterial.uniforms.uTexel.value.set(1 / SIM_WIDTH, 1 / simH);
    simMaterial.uniforms.uAspect.value = aspect;
  }

  // ---------- pointer ----------
  const pointer = { x: -10, y: -10, px: -1e4, py: -1e4, inside: false };
  const smoothed = new THREE.Vector2(-10, -10);
  const velocity = new THREE.Vector2();
  let hovered = null;   // the cycling word under the cursor

  window.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    const x = (e.clientX - rect.left) / rect.width, y = 1 - (e.clientY - rect.top) / rect.height;
    if (!pointer.inside && inside) smoothed.set(x, y);   // don't streak in from far away
    Object.assign(pointer, { x, y, px: e.clientX - rect.left, py: e.clientY - rect.top, inside });
    setHovered(inside ? wordAt(pointer.px, pointer.py) : null);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.inside = false; setHovered(null); });

  function wordAt(px, py) {
    return cycling.find(({ area: a }) => a && px >= a.left && px <= a.right && py >= a.top && py <= a.bottom) ?? null;
  }

  // Checked on every pointer move (not once per frame), so even a quick pass over a word counts.
  function setHovered(word) {
    // Leaving a word finishes its swap across the whole word.
    if (hovered && hovered !== word) {
      hovered.finishing = true;
      hovered.progress = 0;
    }
    hovered = word;
  }

  // ---------- word cycling ----------
  const channelVector = (pick) => new THREE.Vector3(...[0, 1, 2].map((i) => (cycling[i] && pick(cycling[i]) ? 1 : 0)));

  function updateCycling(dt) {
    const committed = new Set();
    for (const word of cycling) {
      if (!word.finishing) continue;
      word.progress += dt / FINISH_TIME;
      if (word.progress >= 1) {
        // Fully swapped: the next word becomes the current one, and its reveal is cleared in this
        // same frame (so the word after it never flashes up).
        word.finishing = false;
        word.index = (word.index + 1) % word.cycle.length;
        committed.add(word);
      }
    }
    const u = maskMaterial.uniforms;
    u.uHovered.value.copy(channelVector((w) => w === hovered));
    u.uFinishing.value.copy(channelVector((w) => w.finishing));
    u.uClearing.value.copy(channelVector((w) => committed.has(w)));
    u.uFinishStep.value = dt / FINISH_TIME;
    if (committed.size) drawWords();
  }

  // ---------- loop ----------
  let last = performance.now();
  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);

  function frame(now) {
    requestAnimationFrame(frame);
    // The jelly physics steps at most 1/30 s at a time (stable even at low frame rates); the word
    // swap runs on real time so it takes the same time at any frame rate.
    const realDt = Math.min((now - last) / 1000, 0.25);
    const dt = Math.min(realDt, 1 / 30);
    last = now;
    if (!visible || dt <= 0) return;

    // Follow the pointer with a little lag, and measure its speed (canvas heights per second).
    const prev = smoothed.clone();
    smoothed.lerp(new THREE.Vector2(pointer.x, pointer.y), 1 - Math.exp(-dt * 30));
    const aspect = simMaterial.uniforms.uAspect.value;
    velocity.copy(smoothed).sub(prev).divideScalar(dt);
    if (!pointer.inside) velocity.set(0, 0);
    const speed = Math.hypot(velocity.x * aspect, velocity.y);
    if (speed > MAX_SPEED) velocity.multiplyScalar(MAX_SPEED / speed);

    const hover = displayMaterial.uniforms.uHover;
    hover.value += ((pointer.inside ? 1 : 0) - hover.value) * (1 - Math.exp(-dt * 8));

    updateCycling(realDt);

    simMaterial.uniforms.uMouse.value.copy(smoothed);
    simMaterial.uniforms.uMouseVel.value.copy(velocity);
    simMaterial.uniforms.uDt.value = dt;
    simMaterial.uniforms.uPrev.value = simA.texture;
    renderer.setRenderTarget(simB);
    renderer.render(simScene, camera);
    [simA, simB] = [simB, simA];

    maskMaterial.uniforms.uActive.value = pointer.inside ? 1 : 0;
    maskMaterial.uniforms.uPrev.value = maskA.texture;
    renderer.setRenderTarget(maskB);
    renderer.render(maskScene, camera);
    [maskA, maskB] = [maskB, maskA];

    displayMaterial.uniforms.uTime.value = now / 1000;
    displayMaterial.uniforms.uSim.value = simA.texture;
    displayMaterial.uniforms.uMask.value = maskA.texture;
    renderer.setRenderTarget(null);
    renderer.render(displayScene, camera);
  }

  // Draw the first frame before hiding the page text, so there's never a blank moment.
  resize();
  displayMaterial.uniforms.uSim.value = simA.texture;
  displayMaterial.uniforms.uMask.value = maskA.texture;
  renderer.render(displayScene, camera);
  hero.classList.add('is-warping');
  new ResizeObserver(resize).observe(hero);
  requestAnimationFrame((t) => { last = t; frame(t); });
}
