import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/* =============================
   CHỈNH NỘI DUNG Ở ĐÂY
============================= */
const MORPH_TEXTS = [
    "Chúc các bạn ",
    "Một ngày 20/10",
    "Vui vẻ"
];

// Thư (đúng format bạn gửi)
const MESSAGE = [
    "Nhân dịp ngày quốc tế phụ nữ 8/3, tập thể các bạn nam lớp 11/10 mong muốn gửi tới những nàng công chúa của lớp những lời chúc tốt đẹp nhất. Chúng mình mong các bạn sẽ luôn giữ được nụ cười trên môi, sẽ luôn xinh đẹp rạng ngời. Chúc bạn Tuệ Linh 8386, vạn sự như ý, triệu sự như mơ, tỉ sự bất ngờ và hàng giờ hạnh phúc. Cảm ơn Tuệ Linh vì đã đồng hành cùng với lớp nói chung và chúng tớ nói riêng trong suốt một khoảng thời gian không dài nhưng cũng đủ để có những kỉ niệm đẹp cùng nhau. Hy vọng trong thời gian tới, như gần nhất là trại, chúng ta sẽ cùng nhau có thêm thật nhiều kỉ niệm với nhau nữa nè. Một lần nữa, chúc Tuệ Linh một ngày 8/3 thật vui vẻ và hạnh phúc nhé!",


].join("\n");

const FROM_NAME = "Long, Khoa, Tuấn";

/* =============================
   CONFIG (giảm mật độ hạt)
============================= */
const IS_DESKTOP = Math.min(innerWidth, innerHeight) >= 600 && !matchMedia('(pointer: coarse)').matches;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOW_POWER = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 2;
const PARTICLE_COUNT = REDUCED_MOTION ? 3000 : IS_DESKTOP ? 18000 : LOW_POWER ? 6000 : 10000;
const PIXEL_RATIO = Math.min(devicePixelRatio || 1, IS_DESKTOP ? 1.5 : LOW_POWER ? 1 : 1.25);
const textCache = new Map();
let animationTime = 0;
let lastFrame = 0;
let sampledFrames = 0, sampledMs = 0, qualityAdjusted = false;
let fxRafId = 0;
let audioWasPlaying = false;
const SHAPE_SIZE = IS_DESKTOP ? 22 : 16;

const HOLD_MS = 1000;
const MORPH_DURATION = REDUCED_MOTION ? 1.0 : 2.5; // seconds
const HOLD_BETWEEN_TEXT_MS = 2500;
const WAIT_AFTER_MORPH_MS = 750;

/* =============================
   DOM
============================= */
const loading = document.getElementById("loading");
const progressBar = document.getElementById("progressBar");

const startWrap = document.getElementById("start-wrap");
const ringFill = document.getElementById("ring-fill");

const webglCanvas = document.getElementById("webglCanvas");

// fireworks + envelope elements
const fxCanvas = document.getElementById("fx");
const fxCtx = fxCanvas.getContext("2d", { alpha: true });

const envelopeWrap = document.getElementById("envelopeWrap");
const envelope = document.getElementById("envelope");
const sealBtn = document.getElementById("sealBtn");
const bigLetter = document.getElementById("bigLetter");
const typedEl = document.getElementById("typed");
const fromNameEl = document.getElementById("fromName");
const tagEl = document.getElementById("tag");
fromNameEl.textContent = FROM_NAME;

/* =============================
   THREE GLOBALS
============================= */
let scene, camera, renderer, composer, bloomPass, controls;
let particlesGeometry, particlesMaterial, particleSystem;

let particleCount = 0;
let targetPositions = null;

let isMorphing = false;
let morphStartTime = 0;

let isScatterPhase = true;

// “lung tung” velocity
let vel = null;

// RAF control
let threeRafId = 0;
let threeRunning = true;





/////
const musicToggle = document.getElementById('musicToggle');
const bgmEl = document.getElementById("bgm");
musicToggle.addEventListener('click', () => {
    if (bgmEl.paused) startBgm();
    else { bgmEl.pause(); musicToggle.setAttribute('aria-pressed', 'false'); }
});
if (bgmEl) bgmEl.volume = 0.55;

function startBgm() {
    if (!bgmEl) return;
    bgmEl.play().then(() => musicToggle.setAttribute("aria-pressed", "true")).catch(() => {});
}

function stopBgm() {
    if (!bgmEl) return;
    bgmEl.pause();
    musicToggle.setAttribute("aria-pressed", "false");
    bgmEl.currentTime = 0;
}

////

/* =============================
   LOADING HELPERS
============================= */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function setProgress(p) {
    progressBar.style.width = `${clamp(p, 0, 100)}%`;
}
function hideLoadingShowHold() {
    loading.classList.add("hide");
    setTimeout(() => (loading.style.display = "none"), 520);
    startWrap.style.display = "flex";
}

/* =============================
   THREE HELPERS
============================= */
function createParticleTexture() {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,225,242,0.92)");
    g.addColorStop(0.55, "rgba(255,130,190,0.38)");
    g.addColorStop(0.85, "rgba(255,100,170,0.06)");
    g.addColorStop(1, "rgba(255,100,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
}

/* =============================
   TEXT -> POINTS
============================= */
function generateFromText(text, count, size) {
    if (!text || !text.trim()) return null;

    const cleanText = text.trim();
    const w = 1200;
    const maxLineWidth = IS_DESKTOP ? 960 : 860;

    // Tự động căn cỡ chữ linh hoạt: câu ngắn thì chữ to rõ, câu dài vừa vặn
    const charCount = cleanText.replace(/\n/g, '').length;
    let baseFontSize = IS_DESKTOP ? 92 : 82;
    if (charCount > 15) baseFontSize = IS_DESKTOP ? 84 : 74;
    else if (charCount < 8) baseFontSize = IS_DESKTOP ? 104 : 92;

    const fontSize = baseFontSize;
    const lineHeight = Math.round(fontSize * 1.58);

    const mctx = document.createElement("canvas").getContext("2d");
    // Ưu tiên 'Be Vietnam Pro' - chuẩn font hiển thị tiếng Việt rõ nét, dấu thanh không bao giờ bị dính
    const fontStr = `600 ${fontSize}px "Be Vietnam Pro", "Quicksand", "Comfortaa", "Segoe UI", sans-serif`;
    mctx.font = fontStr;
    if ("letterSpacing" in mctx) mctx.letterSpacing = "4px";
    if ("wordSpacing" in mctx) mctx.wordSpacing = "8px";

    // Hỗ trợ cả ngắt dòng chủ động bằng \n lẫn tự động ngắt nếu dòng quá dài
    const rawLines = cleanText.split("\n");
    const lines = [];
    for (const rawLine of rawLines) {
        const words = rawLine.trim().split(/\s+/);
        let cur = "";
        for (const word of words) {
            const next = cur ? cur + " " + word : word;
            if (mctx.measureText(next).width <= maxLineWidth) {
                cur = next;
            } else {
                if (cur) lines.push(cur);
                cur = word;
            }
        }
        if (cur) lines.push(cur);
    }

    const h = Math.max(380, lines.length * lineHeight + 120);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = fontStr;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    if ("wordSpacing" in ctx) ctx.wordSpacing = "8px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const startY = h / 2 - (lines.length - 1) * (lineHeight / 2);
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, startY + i * lineHeight));

    const img = ctx.getImageData(0, 0, w, h).data;
    const pixels = [];
    // Ngưỡng b > 40 giúp giữ trọn vẹn cả các dấu thanh nhỏ (dấu nặng, sắc, huyền, hỏi, ngã)
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const b = (img[idx] + img[idx + 1] + img[idx + 2]) / 3;
        if (b > 40) pixels.push({ x, y, b, key: y * w + x });
    }
    if (!pixels.length) return null;

    const scale = size / Math.max(w, h);
    const cx = w / 2, cy = h / 2;
    const depthScale = size * 0.008;
    const jitter = scale * 0.85; // phân tán nhẹ để các hạt không xếp đè lên nhau gây cháy sáng

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
        const p = pixels[Math.min(Math.floor((i * pixels.length) / count), pixels.length - 1)];
        // Sub-pixel jitter giúp nét chữ liền mạch, mịn màng, không bị đốm trắng chụm
        const px = (p.x - cx) * scale + (Math.random() - 0.5) * jitter;
        const py = (cy - p.y) * scale + (Math.random() - 0.5) * jitter;
        const pz = (p.b / 255) * depthScale;

        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;

        const dist = Math.sqrt(px * px + py * py + pz * pz);
        const hue = THREE.MathUtils.mapLinear(dist, 0, size * 0.7, 332, 358);
        c.setHSL(hue / 360, 0.85, 0.62);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    return { positions, colors };
}

/* =============================
   PARTICLES
============================= */
function initScatterParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    const c = new THREE.Color();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 3 + Math.random() * 14;

        positions[i3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.cos(phi);
        positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

        c.setHSL((330 + Math.random() * 30) / 360, 0.78, 0.65);
        colors[i3] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;
    }

    buildParticleSystem({ positions, colors });
    isScatterPhase = true;
}

function buildParticleSystem(result) {
    particleCount = result.positions.length / 3;

    if (particleSystem) {
        scene.remove(particleSystem);
        particlesGeometry.dispose();
        particlesMaterial.dispose();
    }

    particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(result.positions), 3));
    particlesGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    particlesGeometry.setAttribute("target", new THREE.BufferAttribute(new Float32Array(result.positions), 3));
    particlesGeometry.setAttribute("color", new THREE.BufferAttribute(result.colors, 3));

    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) sizes[i] = THREE.MathUtils.randFloat(0.04, 0.082);
    particlesGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    particlesMaterial = new THREE.ShaderMaterial({
        uniforms: { pointTexture: { value: createParticleTexture() }, morph: { value: 0 }, time: { value: 0 }, motion: { value: REDUCED_MOTION ? 0 : 1 } },
        vertexShader: `
      attribute float size;
      attribute vec3 target;
      uniform float morph;
      uniform float time;
      uniform float motion;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec3 p = mix(position, target, morph);
        float arc = sin(morph * 3.14159265) * motion;
        p.x += sin(position.y * 0.7 + time) * arc * 1.3;
        p.y += cos(position.x * 0.6 + time) * arc * 0.8;
        p.z += sin(position.x + position.y) * arc * 1.6;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(size * (640.0 / max(1.0, -mvPosition.z)), 1.2, 4.8);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
        fragmentShader: `
      uniform sampler2D pointTexture;
      varying vec3 vColor;
      void main(){
        float a = texture2D(pointTexture, gl_PointCoord).a;
        if(a < 0.05) discard;
        gl_FragColor = vec4(vColor, a * 0.9);
      }
    `,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending
    });

    particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
    particleSystem.frustumCulled = false;
    scene.add(particleSystem);

    // velocity để bay lung tung
    vel = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        vel[i3] = (Math.random() - 0.5) * 2.2;
        vel[i3 + 1] = (Math.random() - 0.5) * 2.2;
        vel[i3 + 2] = (Math.random() - 0.5) * 2.2;
    }

    targetPositions = null;
}

function startMorphTo(result) {
    if (!result) return;

    const count = result.positions.length / 3;
    if (count !== particleCount) {
        buildParticleSystem(result);
        return;
    }

    targetPositions = result.positions;
    particlesGeometry.attributes.target.array.set(targetPositions);
    particlesGeometry.attributes.target.needsUpdate = true;
    particlesMaterial.uniforms.morph.value = 0;

    particlesGeometry.attributes.color.array.set(result.colors);
    particlesGeometry.attributes.color.needsUpdate = true;

    isMorphing = true;
    morphStartTime = animationTime;
    isScatterPhase = false;
}

/* =============================
   THREE INIT
============================= */
// Count only visible time so switching apps does not skip the wishes.
function sleep(ms) {
    return new Promise(resolve => {
        let remaining = ms, previous = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            if (!document.hidden) remaining -= Math.min(now - previous, 100);
            previous = now;
            if (remaining <= 0) { clearInterval(timer); resolve(); }
        }, 50);
    });
}
function fitCamera() {
    const aspect = innerWidth / innerHeight;
    const vFovRad = THREE.MathUtils.degToRad(35);
    const fitDistance = (SHAPE_SIZE * 0.5) / Math.tan(vFovRad);
    const distance = (fitDistance / Math.min(Math.max(aspect, 0.44), 1.05)) * 1.06;
    camera.position.set(0, 0, Math.max(16, distance));
    camera.lookAt(0, 0, 0);
    if (controls) { controls.target.set(0, 0, 0); controls.update(); }
}

async function initThree() {
    setProgress(6);
    await Promise.race([
        Promise.all([
            document.fonts.load('80px "Be Vietnam Pro"').catch(() => {}),
            document.fonts.load('80px "Quicksand"').catch(() => {}),
            document.fonts.load('80px "Comfortaa"').catch(() => {}),
            document.fonts.load('110px "Pacifico"').catch(() => {})
        ]),
        new Promise(r => setTimeout(r, 2500))
    ]);
    setProgress(28);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Nền đen tuyền từ đầu đồng nhất cho điện thoại và máy tính
    scene.fog = new THREE.FogExp2(0x000000, 0.03);
    setProgress(42);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, IS_DESKTOP ? 18 : 24);
    camera.lookAt(0, 0, 0);
    setProgress(58);

    renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 1.0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(PIXEL_RATIO);
    setProgress(74);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = IS_DESKTOP;
    controls.enableDamping = true;
    fitCamera();
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 80;

    scene.add(new THREE.AmbientLight(0x554050));
    const dir1 = new THREE.DirectionalLight(0xfff0f5, 1.25);
    dir1.position.set(15, 20, 10);
    scene.add(dir1);

    // Soft point sprites provide the glow on phones without multipass bloom.
    if (IS_DESKTOP && !LOW_POWER && !REDUCED_MOTION) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.65, 0.45, 0.2);
        composer.addPass(bloomPass);
    }
    setProgress(90);

    window.addEventListener("resize", onResize);
    initScatterParticles();
    for (const text of MORPH_TEXTS) {
        textCache.set(text, generateFromText(text, PARTICLE_COUNT, SHAPE_SIZE));
        await new Promise(r => setTimeout(r, 0));
    }
    setProgress(100);

    await sleep(250);
    hideLoadingShowHold();
    animateThree();
}

function onResize() {
    if (!renderer || !camera || !threeRunning) { resizeFx(); return; }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    fitCamera();
    resizeFx();
}

/* =============================
   THREE ANIMATE
============================= */
function animateThree(now = performance.now()) {
    if (!threeRunning || document.hidden) { threeRafId = 0; return; }
    threeRafId = requestAnimationFrame(animateThree);
    const frameMs = lastFrame ? now - lastFrame : 16.67;
    const dt = clamp(frameMs / 1000, 0.001, 0.1);
    if (!IS_DESKTOP && !qualityAdjusted && lastFrame) {
        sampledMs += frameMs; sampledFrames++;
        if (sampledFrames >= 120) {
            qualityAdjusted = true;
            if (sampledMs / sampledFrames > 28) { renderer.setPixelRatio(0.85); renderer.setSize(innerWidth, innerHeight); }
        }
    }
    lastFrame = now;
    animationTime += dt;
    const t = animationTime;
    particlesMaterial.uniforms.time.value = t;

    controls.update();

    if (particlesGeometry && particleCount > 0) {
        const pos = particlesGeometry.attributes.position.array;

        if (isMorphing && targetPositions) {
            const k = Math.min(1, (t - morphStartTime) / MORPH_DURATION);
            const smooth = k * k * (3 - 2 * k);

            particlesMaterial.uniforms.morph.value = smooth;
            if (k >= 1) {
                isMorphing = false;
                pos.set(targetPositions);
                particlesGeometry.attributes.position.needsUpdate = true;
                particlesMaterial.uniforms.morph.value = 0;
            }
        } else if (isScatterPhase && vel) {
            // bay lung tung (kéo nhẹ về tâm + giới hạn radius)
            // Three shared forces, rather than random/trigonometry calls per particle.
            const ax = Math.sin(t * 0.6) * 0.4;
            const ay = Math.cos(t * 0.5) * 0.4;
            const az = Math.sin(t * 0.4) * 0.4;
            const damping = Math.exp(-dt * 0.18);
            if (!REDUCED_MOTION) for (let i = 0; i < pos.length; i += 3) {
                vel[i] += (ax - pos[i] * 0.06) * dt;
                vel[i + 1] += (ay - pos[i + 1] * 0.06) * dt;
                vel[i + 2] += (az - pos[i + 2] * 0.06) * dt;
                for (let j = i; j < i + 3; j++) {
                    vel[j] *= damping;
                    pos[j] += vel[j] * dt;
                }
            }
            particlesGeometry.attributes.position.needsUpdate = true;
        }
    }

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
}

/* =============================
   HOLD → START
============================= */
let holdTimer = null;
let holdStart = 0;
let triggered = false;

function resetHoldUI() {
    startWrap.classList.remove("held");
    ringFill.style.transition = "stroke-dashoffset 0.25s ease";
    ringFill.style.strokeDashoffset = "188.5";
}

function onHoldDown(e) {
    e.preventDefault();
    if (triggered || holdTimer) return;
    if (e.pointerId !== undefined) startWrap.setPointerCapture(e.pointerId);
    startBgm();

    holdStart = Date.now();
    ringFill.style.transition = `stroke-dashoffset ${HOLD_MS}ms linear`;
    ringFill.style.strokeDashoffset = "0";

    holdTimer = setInterval(() => {
        const elapsed = Date.now() - holdStart;
        if (elapsed >= 450) startWrap.classList.add("held");
        if (elapsed >= HOLD_MS) {
            clearInterval(holdTimer);
            holdTimer = null;
            triggered = true;
            startWrap.style.display = "none";
            startMorphSequence();
        }
    }, 50);
}

function onHoldUp() {
    if (triggered) return;
    if (holdTimer) clearInterval(holdTimer);
    holdTimer = null;
    if (!triggered) stopBgm();
    resetHoldUI();
}

startWrap.addEventListener("pointerdown", onHoldDown);
startWrap.addEventListener("pointerup", onHoldUp);
startWrap.addEventListener("pointercancel", onHoldUp);
startWrap.addEventListener("lostpointercapture", onHoldUp);
startWrap.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) onHoldDown(e);
});
startWrap.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') onHoldUp(); });

/* =============================
   MORPH → CLEAR → FIREWORKS + ENVELOPE
============================= */
async function startMorphSequence() {
    isScatterPhase = false;

    for (const text of MORPH_TEXTS) {
        const result = textCache.get(text);
        startMorphTo(result);
        while (isMorphing && threeRunning) await sleep(50);
        await sleep(HOLD_BETWEEN_TEXT_MS);
    }

    await sleep(WAIT_AFTER_MORPH_MS);

    // ✅ dọn sạch particles + dừng three loop
    clearAllParticles();

    // ✅ bắt đầu pháo hoa + phong bì (theo code bạn đưa)
    startFireworksSequence();
}

function clearAllParticles() {
    if (particleSystem) {
        scene.remove(particleSystem);
        particleSystem = null;
    }
    if (particlesGeometry) {
        particlesGeometry.dispose();
        particlesGeometry = null;
    }
    if (particlesMaterial) {
        particlesMaterial.uniforms.pointTexture.value.dispose();
        particlesMaterial.dispose();
        particlesMaterial = null;
    }
    particleCount = 0;
    targetPositions = null;
    vel = null;

    webglCanvas.style.opacity = "0";
    threeRunning = false;
    cancelAnimationFrame(threeRafId);
    threeRafId = 0;
    controls.dispose();
    if (composer) { bloomPass.dispose(); composer.dispose(); }
    renderer.dispose();
    textCache.clear();
}

/* =============================
   FIREWORKS + ENVELOPE (adapt từ code bạn gửi)
============================= */
function rand(a, b) { return a + Math.random() * (b - a); }

function resizeFx() {
    const dpr = PIXEL_RATIO;
    fxCanvas.width = Math.floor(innerWidth * dpr);
    fxCanvas.height = Math.floor(innerHeight * dpr);
    fxCanvas.style.width = innerWidth + "px";
    fxCanvas.style.height = innerHeight + "px";
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const fw = [];
const sparks = [];
let fireworksPhase = false;
let fxStarted = false;
let fxLast = performance.now();

function launchFirework() {
    const x = rand(innerWidth * 0.15, innerWidth * 0.85);
    const y = innerHeight + 20;
    const tx = x + rand(-60, 60);
    const ty = rand(innerHeight * 0.18, innerHeight * 0.45);
    fw.push({ x, y, vx: (tx - x) / rand(28, 40), vy: (ty - y) / rand(28, 40), life: 0, ttl: rand(28, 40) });
}

function explode(x, y) {
    const count = REDUCED_MOTION ? 14 : Math.floor(IS_DESKTOP ? rand(45, 65) : rand(25, 40));
    if (sparks.length > (IS_DESKTOP ? 600 : 240)) return;
    for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(1.8, 4.2);
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: rand(0.03, 0.06), life: 0, ttl: rand(48, 78), hue: rand(320, 360) });
    }
}

function tickFx(now) {
    if (document.hidden) { fxRafId = 0; return; }
    const dt = clamp(now - fxLast, 1, 50);
    const step = dt / (1000 / 60);
    fxLast = now;

    fxCtx.fillStyle = `rgba(0,0,0,${1 - Math.pow(0.82, step)})`;
    fxCtx.fillRect(0, 0, innerWidth, innerHeight);

    if (fireworksPhase) {
        if (fw.length < 5 && Math.random() < 1 - Math.pow(1 - (REDUCED_MOTION ? 0.025 : 0.06), step)) launchFirework();

        for (let i = fw.length - 1; i >= 0; i--) {
            const f = fw[i];
            f.x += f.vx * step; f.y += f.vy * step; f.life += step;
            fxCtx.beginPath();
            fxCtx.globalAlpha = 0.9;
            fxCtx.fillStyle = "rgba(255,160,210,0.9)";
            fxCtx.arc(f.x, f.y, 2.2, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.globalAlpha = 1;

            if (f.life >= f.ttl) { explode(f.x, f.y); fw.splice(i, 1); }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.vy += p.g * step; p.x += p.vx * step; p.y += p.vy * step; p.life += step;
            const t = p.life / p.ttl;
            fxCtx.beginPath();
            fxCtx.globalAlpha = (1 - t);
            fxCtx.fillStyle = `hsla(${p.hue}, 90%, ${60 + 20 * (1 - t)}%, 1)`;
            fxCtx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.globalAlpha = 1;

            if (p.life >= p.ttl) sparks.splice(i, 1);
        }
    } else {
        // fade sparks còn lại
        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.vy += p.g * step; p.x += p.vx * step; p.y += p.vy * step; p.life += step;
            const t = p.life / p.ttl;
            fxCtx.beginPath();
            fxCtx.globalAlpha = (1 - t) * 0.7;
            fxCtx.fillStyle = `hsla(${p.hue}, 90%, 70%, 1)`;
            fxCtx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.globalAlpha = 1;
            if (p.life >= p.ttl) sparks.splice(i, 1);
        }
    }

    if (fireworksPhase || sparks.length || fw.length) fxRafId = requestAnimationFrame(tickFx);
    else { fxRafId = 0; fxCanvas.style.display = "none"; fxCtx.clearRect(0, 0, innerWidth, innerHeight); }
}

function startFireworksSequence() {
    if (fxStarted) return;
    fxStarted = true;

    fxCanvas.style.display = "block";
    resizeFx();
    window.addEventListener("resize", resizeFx, { passive: true });

    fireworksPhase = true;
    fxLast = performance.now();
    fxRafId = requestAnimationFrame(tickFx);

    // Sau pháo hoa -> hiện phong bì
    sleep(4000).then(() => {
        fireworksPhase = false;
        fw.length = 0;
        envelopeWrap.classList.add("show");
    });
}

/* =============================
   OPEN ENVELOPE → SHOW BIG LETTER + TYPEWRITER
============================= */
let opened = false;

function typewriter(text, speed = 26) {
    typedEl.textContent = "";
    if (REDUCED_MOTION) { typedEl.textContent = text; return; }
    let i = 0;
    const paper = document.getElementById("paper");
    const step = () => {
        if (document.hidden) { setTimeout(step, 200); return; }
        const nearBottom = paper.scrollHeight - paper.scrollTop - paper.clientHeight < 48;
        if (i <= text.length) {
            typedEl.textContent = text.slice(0, i);
            i++;
            if (nearBottom) paper.scrollTop = paper.scrollHeight;
            setTimeout(step, speed);
        }
    };
    step();
}

function openEnvelope() {
    if (opened) return;
    opened = true;

    envelopeWrap.classList.add("opened");
    envelope.classList.add("opened");
    tagEl.textContent = "Đang mở thiệp...";

    setTimeout(() => {
        envelopeWrap.classList.add("fade-out");
        setTimeout(() => {
            bigLetter.classList.add("show");
            setTimeout(() => typewriter(MESSAGE, 26), 400);
        }, 650);
    }, 900);
}

sealBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openEnvelope();
});

/* =============================
   BOOT
============================= */

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        onHoldUp();
        audioWasPlaying = !bgmEl.paused;
        bgmEl.pause();
        cancelAnimationFrame(threeRafId); threeRafId = 0;
        cancelAnimationFrame(fxRafId); fxRafId = 0;
    } else {
        lastFrame = 0;
        if (threeRunning && renderer && particlesMaterial && !threeRafId) animateThree();
        if (fxStarted && (fireworksPhase || sparks.length || fw.length) && !fxRafId) {
            fxLast = performance.now(); fxRafId = requestAnimationFrame(tickFx);
        }
        if (audioWasPlaying) startBgm();
    }
});
webglCanvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    threeRunning = false;
    cancelAnimationFrame(threeRafId);
    webglCanvas.style.display = 'none';
    startWrap.style.display = 'none';
    loading.style.display = 'none';
    startFireworksSequence();
});
initThree().catch(error => {
    console.warn('Using the light greeting view:', error);
    threeRunning = false;
    webglCanvas.style.display = 'none';
    hideLoadingShowHold();
    startMorphSequence = async () => startFireworksSequence();
});
