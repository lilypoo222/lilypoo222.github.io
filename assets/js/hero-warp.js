// Hero text hover warp.
// The hero text is drawn into a WebGL canvas. A small "jelly" simulation runs underneath it:
// moving the cursor across the letters pushes them along with it, they spring back with a soft
// wobble, and a gentle lens swells the letters under the cursor. The real text stays in the page
// (invisible while the canvas shows it), and is simply shown as-is without WebGL or with
// reduced motion.
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
const RADIUS = 0.22;         // cursor influence, as a fraction of the canvas height
const LENS = 0.18;           // magnifying swell under the cursor (0 = none)
const MAX_SPEED = 2.5;       // cap on cursor speed (canvas heights per second)
const MAX_STRETCH = 0.07;    // furthest a point of a letter can be dragged (canvas heights)

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

const DISPLAY_FRAGMENT = `
  uniform sampler2D uText;
  uniform sampler2D uSim;
  uniform vec2 uMouse;
  uniform float uHover;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uLens;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv - texture2D(uSim, vUv).xy;
    // Lens: sample closer to the cursor so the letters there swell outward.
    vec2 p = (uv - uMouse) * vec2(uAspect, 1.0);
    float r = length(p) / (uRadius * 1.4);
    uv = uMouse + (uv - uMouse) * (1.0 - uLens * uHover * exp(-r * r));
    gl_FragColor = texture2D(uText, uv);
    #include <colorspace_fragment>
  }
`;

async function start() {
  await document.fonts.ready;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0);
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 needed');

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  // ---------- text texture ----------
  const textCanvas = document.createElement('canvas');
  const textTexture = new THREE.CanvasTexture(textCanvas);
  textTexture.colorSpace = THREE.SRGBColorSpace;
  textTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  function drawText(cw, ch, dpr) {
    // Draw each word exactly where the (invisible) page text sits, in its own font style.
    const c = canvas.getBoundingClientRect();
    textCanvas.width = Math.round(cw * dpr);
    textCanvas.height = Math.round(ch * dpr);
    const ctx = textCanvas.getContext('2d');
    ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#000';
    for (const word of hero.querySelectorAll('.hero-text__word')) {
      const style = getComputedStyle(word);
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // An inline box's height is the font's ascent + descent, so the baseline is top + ascent.
      const r = word.getBoundingClientRect();
      const ascent = ctx.measureText(word.textContent).fontBoundingBoxAscent;
      ctx.fillText(word.textContent, r.left - c.left, r.top - c.top + ascent);
    }
    textTexture.needsUpdate = true;
  }

  // ---------- simulation (ping-pong between two float targets) ----------
  const targetOptions = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  let simA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  let simB = new THREE.WebGLRenderTarget(1, 1, targetOptions);

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

  const displayMaterial = new THREE.ShaderMaterial({
    vertexShader: SIM_VERTEX,
    fragmentShader: DISPLAY_FRAGMENT,
    transparent: true,
    uniforms: {
      uText: { value: textTexture }, uSim: { value: null },
      uMouse: simMaterial.uniforms.uMouse, uHover: { value: 0 },
      uAspect: simMaterial.uniforms.uAspect, uRadius: { value: RADIUS }, uLens: { value: LENS },
    },
  });
  const displayScene = new THREE.Scene();
  displayScene.add(new THREE.Mesh(quad, displayMaterial));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.width, rect.height, false);
    drawText(rect.width, rect.height, dpr);

    const aspect = rect.width / rect.height;
    const simH = Math.max(8, Math.round(SIM_WIDTH / aspect));
    simA.setSize(SIM_WIDTH, simH);
    simB.setSize(SIM_WIDTH, simH);
    for (const t of [simA, simB]) { renderer.setRenderTarget(t); renderer.clear(); }
    renderer.setRenderTarget(null);
    simMaterial.uniforms.uTexel.value.set(1 / SIM_WIDTH, 1 / simH);
    simMaterial.uniforms.uAspect.value = aspect;
  }

  // ---------- pointer ----------
  const pointer = { x: -10, y: -10, inside: false, moved: false };
  const smoothed = new THREE.Vector2(-10, -10);
  const velocity = new THREE.Vector2();

  function toUv(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: 1 - (e.clientY - rect.top) / rect.height,
      inside: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
    };
  }
  window.addEventListener('pointermove', (e) => {
    const p = toUv(e);
    if (!pointer.inside && p.inside) smoothed.set(p.x, p.y);   // don't streak in from far away
    Object.assign(pointer, p, { moved: true });
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.inside = false; });

  // ---------- loop ----------
  let last = performance.now();
  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 30);
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

    simMaterial.uniforms.uMouse.value.copy(smoothed);
    simMaterial.uniforms.uMouseVel.value.copy(velocity);
    simMaterial.uniforms.uDt.value = dt;
    simMaterial.uniforms.uPrev.value = simA.texture;
    renderer.setRenderTarget(simB);
    renderer.render(simScene, camera);
    [simA, simB] = [simB, simA];

    displayMaterial.uniforms.uSim.value = simA.texture;
    renderer.setRenderTarget(null);
    renderer.render(displayScene, camera);
  }

  // Draw the first frame before hiding the page text, so there's never a blank moment.
  resize();
  displayMaterial.uniforms.uSim.value = simA.texture;
  renderer.render(displayScene, camera);
  hero.classList.add('is-warping');
  new ResizeObserver(resize).observe(hero);
  requestAnimationFrame((t) => { last = t; frame(t); });
}
