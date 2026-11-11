// 3D 空间站：把一次 Agent 运行画成一座可以拖动旋转的空间站。
// 舱段对应概念：上下文舱（context）、主脑（LLM）、工具舱（tools）、数据舱（虚拟文件）、
// 上行/下行天线（提问与答复）、循环轨道（loop）、验收信标（check）。
// 画面完全由服务端流回来的真实事件驱动；这里只负责“怎么画”和“画多快”。
import * as THREE from '../vendor/three.min.js';
import { COLORS, currentTheme } from './theme.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const SPINE = { x0: -11.2, x1: -2.8, r: 1.3 };
const CORE = V(0.6, 0, 0);
const HUB = V(3.5, 0, 0);
const UPLINK = V(-13.4, 0, 0);
const DOWNLINK = V(0.6, 3.7, 0);
const TOOL_X = 6.3;
const VAULT_X = 10.4;
const BEACON = V(3.5, -3.3, 0);
const TARGET = V(-0.9, -1.3, 0);

const ROLE_TAG = { system: '系统', user: '提问', assistant: '主脑', toolResult: '结果' };

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function ringTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class Station3D {
  /**
   * @param {HTMLElement} container
   * @param {{onPick?: (kind: string, data: object) => void, onWaiting?: (waiting: boolean) => void, showcase?: boolean}} hooks
   */
  constructor(container, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.showcase = Boolean(hooks.showcase);
    this.speed = 1;
    this.stepMode = false;
    this.stepWaiter = null;
    this.generation = 0;
    this.tweens = [];
    this.time = 0;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.orbit = { theta: 0.16, phi: 1.36, drag: null, moved: 0 };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'station-canvas';
    this.labels = document.createElement('div');
    this.labels.className = 'station-labels';
    container.append(this.canvas, this.labels);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 2, 0.1, 600);
    this.raycaster = new THREE.Raycaster();
    this.glowMap = glowTexture();
    this.ringMap = ringTexture();
    this.shakeAmount = 0;
    this.shot = null;
    this.cam = { theta: 0, phi: 0, zoom: 1, weight: 0.22, point: V(0, 0, 0) };
    this.station = new THREE.Group();
    this.scene.add(this.station);
    this.dynamic = new THREE.Group(); // 每次运行重建的东西：方块、数据包、光束
    this.station.add(this.dynamic);
    this.tags = [];
    this.pickables = [];
    this.slots = [];
    this.fileNodes = [];
    this.blocks = [];
    this.packets = [];
    this.particles = [];

    // 后处理：辉光让发光体真的“发光”，再统一做色调映射。
    this.composer = new THREE.EffectComposer(this.renderer);
    this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
    this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new THREE.OutputPass());
    this.intro = this.reduceMotion ? 0 : 1; // 开场镜头：从远处推近
    this.attention = { point: V(0, 0, 0), zoom: 1, current: V(0, 0, 0), currentZoom: 1 };

    this.buildBackdrop();
    this.buildHull();
    this.applyTheme();
    this.configure({ slots: [], files: [], mode: 'puppet', model: '' });

    this.onResize = () => this.resize();
    this.observer = new ResizeObserver(this.onResize);
    this.observer.observe(container);
    this.onTheme = () => this.applyTheme();
    window.addEventListener('themechange', this.onTheme);
    this.bindPointer();
    this.resize();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.generation++;
    this.releaseStep();
    this.observer.disconnect();
    window.removeEventListener('themechange', this.onTheme);
    this.renderer.dispose();
    this.canvas.remove();
    this.labels.remove();
  }

  // ---------- 材质与小部件 ----------
  color(name) {
    return new THREE.Color(COLORS[name] ?? name);
  }

  lit(name, intensity = 0.7) {
    const c = this.color(name);
    return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: this.light ? intensity * 0.5 : intensity * 0.6, roughness: 0.55, metalness: 0, envMapIntensity: 0 });
  }

  glow(name, scale, opacity = 0.9) {
    const material = new THREE.SpriteMaterial({ map: this.glowMap, color: this.color(name), transparent: true, opacity: this.light ? opacity * 0.5 : opacity, depthWrite: false, blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(scale);
    return sprite;
  }

  rod(from, to, radius, material) {
    const length = from.distanceTo(to);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize());
    return mesh;
  }

  /** 三角桁架：三根纵梁加之字形斜撑。比一根光杆像样得多。 */
  truss(from, to, width = 0.3, material = this.hullMat) {
    const group = new THREE.Group();
    const axis = to.clone().sub(from);
    const length = axis.length();
    const dir = axis.clone().normalize();
    const side = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, side).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    const corner = (i, along) => from.clone().addScaledVector(dir, along).addScaledVector(u, Math.cos((i * 2 * Math.PI) / 3) * width).addScaledVector(v, Math.sin((i * 2 * Math.PI) / 3) * width);
    for (let i = 0; i < 3; i++) group.add(this.rod(corner(i, 0), corner(i, length), 0.032, material));
    const bays = Math.max(2, Math.round(length / 0.62));
    for (let b = 0; b < bays; b++) {
      const a0 = (length * b) / bays;
      const a1 = (length * (b + 1)) / bays;
      for (let i = 0; i < 3; i++) group.add(this.rod(corner(i, a0), corner((i + 1) % 3, a1), 0.018, material));
    }
    return group;
  }

  /** 到站冲击环：数据包抵达、零件受击时扩散开的一圈光。 */
  shock(position, colorName, size = 2.4) {
    if (this.reduceMotion) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringMap, color: this.color(colorName), transparent: true, opacity: 0.9, depthWrite: false, blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending }));
    sprite.position.copy(position);
    this.dynamic.add(sprite);
    this.tween(460, (t) => {
      sprite.scale.setScalar(0.3 + ease(t) * size);
      sprite.material.opacity = 0.9 * (1 - t);
    }).then(() => this.dynamic.remove(sprite));
  }

  /** 镜头震动，0–1。 */
  shake(amount = 1) {
    if (!this.reduceMotion) this.shakeAmount = Math.max(this.shakeAmount ?? 0, amount);
  }

  /**
   * 镜头演出：在一小段时间里把镜头交给剧情。
   * incident 事故推近；reveal 环绕新零件；victory 拉远环绕；结束后自动交还给玩家。
   */
  cinematic(kind, point = null) {
    const shots = {
      incident: { point: CORE, weight: 0.85, zoom: 0.7, theta: -0.3, phi: 0.06, hold: 1700 },
      reveal: { point: point ?? CORE, weight: 0.9, zoom: 0.62, theta: 0.42, phi: -0.14, hold: 2300 },
      victory: { point: V(0, 0.6, 0), weight: 0.5, zoom: 1.12, theta: 0.7, phi: -0.2, hold: 5200 },
    };
    const shot = shots[kind];
    if (!shot || this.reduceMotion) return;
    this.shot = { ...shot, until: this.time + shot.hold / 1000 };
  }

  tag(className, text, anchor, onClick) {
    const el = document.createElement(onClick ? 'button' : 'div');
    el.className = `tag ${className}`;
    el.textContent = text;
    if (onClick) {
      el.type = 'button';
      el.addEventListener('click', onClick);
    }
    this.labels.append(el);
    const entry = { el, anchor, visible: true };
    this.tags.push(entry);
    return entry;
  }

  dropTag(entry) {
    entry.el.remove();
    this.tags = this.tags.filter((t) => t !== entry);
  }

  // ---------- 固定结构 ----------
  buildBackdrop() {
    // 环境反射：金属舱体靠它才有“金属”的样子。
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 星空：三层不同大小与色温的星，外加一条淡淡的银河。
    this.stars = new THREE.Group();
    const tints = [0xffffff, 0xcfe0ff, 0xfff1d6, 0xaecbff];
    for (const [count, size, opacity] of [
      [2600, 1.0, 0.7],
      [520, 1.7, 0.85],
      [70, 2.6, 1],
    ]) {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const tint = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(260 + Math.random() * 120);
        positions.set([v.x, v.y, v.z], i * 3);
        tint.set(tints[Math.floor(Math.random() * tints.length)]).multiplyScalar(0.55 + Math.random() * 0.45);
        colors.set([tint.r, tint.g, tint.b], i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.stars.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity })));
    }
    const band = document.createElement('canvas');
    band.width = 1024;
    band.height = 256;
    const bctx = band.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 1024;
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * 90;
      const r = 6 + Math.random() * 34;
      const g = bctx.createRadialGradient(x, 128 + spread, 0, x, 128 + spread, r);
      const hue = Math.random() < 0.3 ? '255,214,170' : '150,190,255';
      g.addColorStop(0, `rgba(${hue},${0.02 + Math.random() * 0.035})`);
      g.addColorStop(1, `rgba(${hue},0)`);
      bctx.fillStyle = g;
      bctx.fillRect(x - r, 128 + spread - r, r * 2, r * 2);
    }
    this.milkyWay = new THREE.Mesh(new THREE.PlaneGeometry(900, 230), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(band), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.milkyWay.position.set(-60, 110, -340);
    this.milkyWay.rotation.z = 0.42;
    this.stars.add(this.milkyWay);
    this.scene.add(this.stars);

    // 太阳：一个很远的亮点，决定了行星的昼夜和舱体的轮廓光。
    const SUN = new THREE.Vector3(-150, 62, -190);
    this.sunSprite = new THREE.Group();
    const flare = (scale, opacity, color) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowMap, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.scale.setScalar(scale);
      return sprite;
    };
    this.sunSprite.add(flare(90, 0.22, 0xffc98a), flare(34, 0.6, 0xffe6c4), flare(10, 1, 0xffffff));
    this.sunSprite.position.copy(SUN);
    this.scene.add(this.sunSprite);

    // 行星：程序生成的海陆与云层，按太阳方向分出昼夜；外面罩一层大气辉光。
    const sunDir = SUN.clone().sub(new THREE.Vector3(46, -88, -90)).normalize();
    const vertexShader = `
      varying vec3 vPos; varying vec3 vNormalW; varying vec3 vWorld;
      void main() {
        vPos = position;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    this.planetMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir }, time: { value: 0 } },
      vertexShader,
      fragmentShader: `
        uniform vec3 sunDir; uniform float time;
        varying vec3 vPos; varying vec3 vNormalW; varying vec3 vWorld;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          vec3 p = normalize(vPos) * 3.2;
          float h = fbm(p * 1.4);
          float land = smoothstep(0.5, 0.56, h);
          vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.03, 0.17, 0.36), fbm(p * 4.0));
          vec3 ground = mix(vec3(0.06, 0.17, 0.08), vec3(0.3, 0.24, 0.15), fbm(p * 6.0 + 3.0));
          vec3 color = mix(ocean, ground, land);
          float clouds = smoothstep(0.52, 0.78, fbm(p * 2.3 + vec3(time * 0.012, 0.0, 0.0) + h));
          color = mix(color, vec3(0.92), clouds * 0.85);
          float day = smoothstep(-0.08, 0.38, dot(vNormalW, sunDir));
          vec3 view = normalize(cameraPosition - vWorld);
          float rim = pow(1.0 - max(dot(vNormalW, view), 0.0), 3.0);
          float cities = step(0.72, noise(p * 22.0)) * land * (1.0 - day) * 0.35;
          vec3 lit = color * (0.015 + day * 1.05) + vec3(0.18, 0.46, 0.95) * rim * (0.08 + day * 0.9) + vec3(1.0, 0.75, 0.4) * cities;
          gl_FragColor = vec4(lit, 1.0);
        }`,
    });
    const atmosphere = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vPos; varying vec3 vNormalW; varying vec3 vWorld;
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          float d = dot(vNormalW, view);
          float glow = pow(clamp(-d * 3.6, 0.0, 1.0), 1.6);
          float day = smoothstep(-0.25, 0.4, dot(vNormalW, sunDir));
          gl_FragColor = vec4(vec3(0.25, 0.58, 1.0) * glow * (0.12 + day), glow * (0.15 + day * 0.85));
        }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.planet = new THREE.Group();
    this.planet.add(new THREE.Mesh(new THREE.SphereGeometry(60, 96, 64), this.planetMat), new THREE.Mesh(new THREE.SphereGeometry(62.2, 96, 64), atmosphere));
    this.planet.position.set(46, -88, -90);
    this.planet.rotation.set(0.3, 0.8, 0.2);
    this.scene.add(this.planet);

    // 三点布光：正面主光、太阳方向的暖色轮廓光、主脑自己的青色点光。
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.sun = new THREE.DirectionalLight(0xfff2e0, 1.5);
    this.sun.position.set(-18, 22, 26);
    this.rim = new THREE.DirectionalLight(0xffc98a, 1.3);
    this.rim.position.copy(SUN);
    this.coreLight = new THREE.PointLight(0x5ce1e6, 14, 40, 1.6);
    this.coreLight.position.copy(CORE);
    this.scene.add(this.ambient, this.sun, this.rim);
    this.station.add(this.coreLight);
  }

  /** 舱体表面的分块纹理：一张小画布，既当凹凸也当粗糙度。 */
  panelTexture(repeatX, repeatY) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const shade = 130 + Math.floor(Math.random() * 60);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
    }
    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, size);
      ctx.moveTo(0, i * 64);
      ctx.lineTo(size, i * 64);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2a2a';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(Math.random() * 4) * 64 + 8 + Math.random() * 44, Math.floor(Math.random() * 4) * 64 + 8 + Math.random() * 44, 3, 3);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
  }

  solarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a1830';
    ctx.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 6; x++) {
        const g = ctx.createLinearGradient(x * 42, y * 32, x * 42 + 40, y * 32 + 30);
        g.addColorStop(0, '#16407f');
        g.addColorStop(1, '#0d2a5c');
        ctx.fillStyle = g;
        ctx.fillRect(x * 42 + 4, y * 32 + 2, 38, 28);
      }
    }
    ctx.strokeStyle = 'rgba(190,210,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 510);
    return new THREE.CanvasTexture(canvas);
  }

  buildHull() {
    const plating = this.panelTexture(3, 2);
    this.hullMat = new THREE.MeshPhysicalMaterial({ color: 0x8794b0, metalness: 0.9, roughness: 0.42, roughnessMap: plating, bumpMap: plating, bumpScale: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.5 });
    this.frameMat = new THREE.LineBasicMaterial({ color: 0x3d4d70, transparent: true, opacity: 0.9 });
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.05, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const hull = new THREE.Group();
    this.station.add(hull);

    // 上下文舱：一根横放的六棱玻璃舱，消息从左往右排。
    const length = SPINE.x1 - SPINE.x0;
    const shell = new THREE.CylinderGeometry(SPINE.r, SPINE.r, length, 6, 1, true);
    const glass = new THREE.Mesh(shell, this.glassMat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(SPINE.r, SPINE.r, length, 6, 4, false)), this.frameMat);
    for (const part of [glass, edges]) {
      part.rotation.z = Math.PI / 2;
      part.position.set((SPINE.x0 + SPINE.x1) / 2, 0, 0);
      hull.add(part);
    }
    // 两端的对接环：厚环 + 收口 + 一圈指示灯带。
    this.collarMat = this.lit('assistant', 0.8);
    for (const [x, sign] of [
      [SPINE.x0 - 0.12, -1],
      [SPINE.x1 + 0.12, 1],
    ]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(SPINE.r + 0.14, SPINE.r + 0.14, 0.26, 6), this.hullMat);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(SPINE.r * 0.55, SPINE.r + 0.1, 0.34, 6), this.hullMat);
      const strip = new THREE.Mesh(new THREE.TorusGeometry(SPINE.r + 0.16, 0.03, 6, 6), this.collarMat);
      for (const part of [cap, neck]) part.rotation.z = (Math.PI / 2) * -sign;
      strip.rotation.y = Math.PI / 2;
      strip.rotation.x = Math.PI / 6;
      cap.position.set(x, 0, 0);
      neck.position.set(x + sign * 0.3, 0, 0);
      strip.position.set(x - sign * 0.16, 0, 0);
      hull.add(cap, neck, strip);
    }
    // 六根纵梁，沿六棱柱的棱。
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      hull.add(this.rod(V(SPINE.x0, Math.sin(a) * SPINE.r, Math.cos(a) * SPINE.r), V(SPINE.x1, Math.sin(a) * SPINE.r, Math.cos(a) * SPINE.r), 0.035, this.hullMat));
    }
    // 舱体的加强肋：六棱环，隔一段一个。
    for (let i = 1; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(SPINE.r + 0.05, 0.045, 6, 6), this.hullMat);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.x = Math.PI / 6;
      rib.position.set(SPINE.x0 + (length * i) / 6, 0, 0);
      hull.add(rib);
    }
    // 航行灯：左红右绿，慢闪。
    this.navLights = [
      [V(UPLINK.x + 0.6, 0.5, 0), 0xff3344],
      [V(VAULT_X + 1.6, 3.4, 0), 0x33ff88],
      [V(DOWNLINK.x, DOWNLINK.y + 0.75, 0), 0xffffff],
    ].map(([position, color], i) => {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }));
      light.position.copy(position);
      hull.add(light);
      return { light, phase: i * 0.7 };
    });
    // 扫描环：每次呼叫主脑，它从舱头扫到舱尾。
    this.scanner = new THREE.Mesh(new THREE.TorusGeometry(SPINE.r + 0.16, 0.05, 8, 6), this.lit('assistant', 1.4));
    this.scanner.rotation.y = Math.PI / 2;
    this.scanner.visible = false;
    this.station.add(this.scanner);

    // 主桁架与太阳能板
    hull.add(this.truss(V(SPINE.x1 + 0.5, 0, 0), V(CORE.x - 2.4, 0, 0), 0.3));
    hull.add(this.truss(V(CORE.x + 2.4, 0, 0), HUB, 0.3));
    hull.add(this.truss(V(UPLINK.x + 0.45, 0, 0), V(SPINE.x0 - 0.5, 0, 0), 0.2));
    hull.add(this.truss(V(CORE.x, 2.5, 0), V(DOWNLINK.x, DOWNLINK.y - 0.35, 0), 0.16));
    // 桁架枢纽：工具舱和信标都从这里分出去。
    const hubNode = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), this.hullMat);
    hubNode.position.copy(HUB);
    hull.add(hubNode);
    // 主脑的护架：前后两道弧形装甲，把那颗球“架”在站体中央。
    for (const [start, tilt] of [
      [Math.PI * 0.69, 0],
      [-Math.PI * 0.31, 0],
    ]) {
      const bracket = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.1, 10, 48, Math.PI * 0.62), this.hullMat);
      bracket.position.copy(CORE);
      bracket.rotation.set(tilt, 0, start);
      hull.add(bracket);
    }
    for (const sign of [-1, 1]) {
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.5), this.hullMat);
      yoke.position.set(CORE.x + sign * 2.42, 0, 0);
      hull.add(yoke);
    }
    // 散热片：两组白色翅片，挂在主脑与枢纽之间的桁架背面。
    const finMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe6f2, metalness: 0.2, roughness: 0.5 });
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.5, 1.1), finMat);
        fin.position.set(HUB.x - 0.75 + i * 0.2, sign * 1.25, -1.15);
        hull.add(fin);
      }
      hull.add(this.rod(V(HUB.x - 0.45, 0, 0), V(HUB.x - 0.45, sign * 1.25, -1.15), 0.035, this.hullMat));
    }
    // 数据舱的笼架。
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 6.6, 1.7)), this.frameMat);
    cage.position.set(VAULT_X, 0, 0);
    hull.add(cage);
    for (const [dx, dz] of [
      [-0.85, -0.85],
      [0.85, -0.85],
      [-0.85, 0.85],
      [0.85, 0.85],
    ]) hull.add(this.rod(V(VAULT_X + dx, -3.3, dz), V(VAULT_X + dx, 3.3, dz), 0.04, this.hullMat));
    for (const y of [-3.3, 3.3]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), this.hullMat);
      plate.position.set(VAULT_X, y, 0);
      hull.add(plate);
    }
    hull.add(this.truss(V(HUB.x + 0.3, 0, -0.9), V(VAULT_X - 0.95, 0, -0.9), 0.16));
    hull.add(this.rod(HUB, V(HUB.x + 0.3, 0, -0.9), 0.05, this.hullMat));
    const cells = this.solarTexture();
    this.panelMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: cells, metalness: 0.7, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: 0x0a1a3a, emissiveIntensity: 0.35 });
    for (const [x, sign] of [
      [-1.4, -1],
      [2.2, -1],
      [-1.4, -2.3],
      [2.2, -2.3],
    ]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 5.2), this.panelMat);
      panel.position.set(x, 0, sign * 4.4);
      panel.rotation.x = -0.5;
      hull.add(panel, this.rod(V(x, 0, 0), V(x, 0, sign * 2.2), 0.05, this.hullMat));
    }

    // 上行天线（提问进来）与下行天线（答复出去）
    const dish = (position, rotationZ) => {
      const group = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.55, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x8794b0, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
      const feed = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), this.lit('user', 1.2));
      feed.position.y = -0.2;
      group.add(bowl, feed);
      // 馈源支架三脚 + 底座万向节
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3;
        group.add(this.rod(V(Math.cos(a) * 0.9, -0.27, Math.sin(a) * 0.9), V(0, -0.2, 0), 0.016, this.hullMat));
      }
      const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 12), this.hullMat);
      gimbal.position.y = 0.42;
      group.add(gimbal);
      group.position.copy(position);
      group.rotation.z = rotationZ;
      hull.add(group);
      group.userData.feed = feed;
      return group;
    };
    this.uplink = dish(UPLINK, -Math.PI / 2);
    this.downlink = dish(DOWNLINK, Math.PI);
    this.downlink.userData.feed.material = this.lit('assistant', 1.2);

    // 主脑
    this.core = new THREE.Group();
    this.core.position.copy(CORE);
    this.coreMat = this.lit('assistant', 0.9);
    this.coreBall = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 3), this.coreMat);
    this.coreBall.userData.pick = { kind: 'reactor', data: {} };
    this.coreCage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.5, 1)), new THREE.LineBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.55 }));
    this.coreGlow = this.glow('assistant', 6.5, 0.55);
    this.shellMat = new THREE.ShaderMaterial({
      uniforms: { tint: { value: this.color('assistant') }, power: { value: 0.6 }, time: { value: 0 } },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vPos;
        void main() { vPos = position; vNormalW = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform vec3 tint; uniform float power; uniform float time;
        varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vPos;
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          float rim = pow(1.0 - abs(dot(vNormalW, view)), 2.4);
          float bands = 0.5 + 0.5 * sin(vPos.y * 9.0 - time * 2.2);
          float alpha = rim * (0.35 + power) + bands * rim * 0.25 * power;
          gl_FragColor = vec4(tint * (0.6 + power), alpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.coreShell = new THREE.Mesh(new THREE.SphereGeometry(1.34, 48, 32), this.shellMat);
    this.rings = [0, 1, 2].map((i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85 + i * 0.22, 0.028, 8, 72), this.lit('assistant', 1.1));
      ring.rotation.set(i * 1.1, i * 0.7, 0);
      return ring;
    });
    this.core.add(this.coreBall, this.coreShell, this.coreCage, this.coreGlow, ...this.rings);
    this.station.add(this.core);
    this.pickables.push(this.coreBall);

    this.tag('tag-module', '上下文舱', V((SPINE.x0 + SPINE.x1) / 2, -SPINE.r - 0.55, 0));
    this.tag('tag-module', '主脑 · LLM', V(CORE.x, -2.5, 0));
    this.tag('tag-module', '上行天线', V(UPLINK.x, -1.35, 0));
    this.tag('tag-module', '下行天线', V(DOWNLINK.x - 1.9, DOWNLINK.y + 0.1, 0));
    this.bubble = this.tag('tag-bubble', '', V(CORE.x - 1.6, -3.0, 0));
    this.bubble.el.hidden = true;
    this.answer = this.tag('tag-answer', '', V(DOWNLINK.x + 1.3, DOWNLINK.y + 0.3, 0));
    this.answer.el.hidden = true;
    this.callTag = this.tag('tag-call', '', V(CORE.x + 2.3, 1.9, 0));
    this.callTag.el.hidden = true;
  }

  // ---------- 主题 ----------
  applyTheme() {
    this.light = currentTheme() === 'light';
    this.scene.background = this.color('space');
    this.stars.visible = !this.light;
    this.planet.visible = !this.light;
    this.sunSprite.visible = !this.light;
    this.rim.intensity = this.light ? 0.5 : 1.3;
    this.scene.environmentIntensity = this.light ? 0.7 : 0.16;
    this.ambient.intensity = this.light ? 1.1 : 0.3;
    this.sun.intensity = this.light ? 1.8 : 1.5;
    this.coreLight.intensity = this.light ? 4 : 14;
    this.bloom.strength = this.light ? 0.1 : 0.5;
    this.bloom.threshold = this.light ? 0.95 : 0.62;
    this.renderer.toneMappingExposure = this.light ? 1.0 : 1.05;
    this.hullMat.color.set(this.light ? 0x9aa6bf : 0x8794b0);
    this.frameMat.color.set(COLORS.line);
    this.glassMat.color.set(COLORS.assistant);
    this.glassMat.opacity = this.light ? 0.09 : 0.05;
    this.shellMat.uniforms.tint.value = this.color('assistant');
    this.shellMat.blending = this.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.collarMat.color.copy(this.color('assistant'));
    this.collarMat.emissive.copy(this.color('assistant'));
    // 依赖主题的发光体：直接重建最省事，也最不容易漏。
    if (this.lastConfig) this.configure(this.lastConfig, true);
  }

  // ---------- 任务装配 ----------
  /**
   * @param {{slots: {id: string, name: string, kind: string, state: 'installed'|'empty'|'locked'}[], files: object[], mode: string, model: string}} config
   */
  configure(config, keepRun = false) {
    this.lastConfig = config;
    if (!keepRun) this.generation++;
    this.releaseStep();
    this.mode = config.mode;
    for (const slot of this.slots) {
      this.station.remove(slot.group);
      this.dropTag(slot.tag);
    }
    this.pickables = this.pickables.filter((mesh) => !mesh.userData.slot);
    this.slots = [];
    if (this.loopRing) this.station.remove(this.loopRing);
    if (this.beacon) this.station.remove(this.beacon);
    this.loopRing = null;
    this.beacon = null;
    if (this.loopTag) this.dropTag(this.loopTag);
    if (this.beaconTag) this.dropTag(this.beaconTag);
    this.loopTag = this.beaconTag = null;

    const tools = config.slots.filter((slot) => slot.kind === 'tool' && slot.id !== 'check');
    tools.forEach((slot, i) => {
      const y = ((tools.length - 1) / 2 - i) * 2.1;
      this.buildPod(slot, V(TOOL_X, y, 0));
    });
    const loop = config.slots.find((slot) => slot.id === 'loop');
    if (loop) this.buildLoop(loop);
    const check = config.slots.find((slot) => slot.id === 'check');
    if (check) this.buildBeacon(check);
    if (!keepRun) this.resetRun(config.files);
    else this.rebuildFiles(this.files);
  }

  slotMaterial(state) {
    if (state === 'installed') return this.hullMat;
    return new THREE.MeshBasicMaterial({ color: this.color(state === 'locked' ? 'hullDim' : 'line'), wireframe: true, transparent: true, opacity: state === 'locked' ? 0.28 : 0.6 });
  }

  buildPod(slot, position) {
    const group = new THREE.Group();
    group.position.copy(position);
    const installed = slot.state === 'installed';
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.5, 6, 16), this.slotMaterial(slot.state));
    body.rotation.z = Math.PI / 2;
    group.add(body);
    let band = null;
    if (installed) {
      band = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 32), this.lit('assistant', 0.9));
      band.rotation.y = Math.PI / 2;
      group.add(band, this.truss(HUB.clone().sub(position), V(-1.5, 0, 0), 0.13));
      // 对接口、两端箍环、舷窗、天线、尾喷口
      const dock = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.3, 16), this.hullMat);
      dock.rotation.z = Math.PI / 2;
      dock.position.x = -1.38;
      group.add(dock);
      for (const x of [-0.72, 0.72]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.535, 0.035, 8, 32), this.hullMat);
        hoop.rotation.y = Math.PI / 2;
        hoop.position.x = x;
        group.add(hoop);
      }
      const windowMat = this.lit('user', 1.1);
      for (let w = 0; w < 4; w++) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.02), windowMat);
        pane.position.set(-0.45 + w * 0.3, 0.16, 0.51);
        group.add(pane);
      }
      group.add(this.rod(V(0.3, 0.5, 0), V(0.3, 1.0, 0), 0.014, this.hullMat));
      for (const z of [-0.2, 0.2]) {
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 12, 1, true), this.hullMat);
        nozzle.rotation.z = Math.PI / 2;
        nozzle.position.set(1.36, 0, z);
        group.add(nozzle);
      }
      body.userData.pick = { kind: 'tool', data: { id: slot.id } };
      body.userData.slot = true;
      this.pickables.push(body);
    }
    this.station.add(group);
    const text = slot.state === 'locked' ? '？？？' : installed ? slot.tool ?? slot.name : `${slot.tool ?? slot.name} · 未装`;
    const tag = this.tag(`tag-slot is-${slot.state}`, text, position.clone().add(V(0, 0.95, 0)));
    this.slots.push({ ...slot, group, body, band, tag, position });
  }

  buildLoop(slot) {
    const installed = slot.state === 'installed';
    const curve = new THREE.EllipseCurve(-2.4, 0, 9.4, 4.6, 0, Math.PI * 2);
    const points = curve.getPoints(160).map((p) => V(p.x, 0, p.y));
    this.loopPath = points;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = installed
      ? new THREE.LineBasicMaterial({ color: this.color('assistant'), transparent: true, opacity: 0.9 })
      : new THREE.LineDashedMaterial({ color: this.color(slot.state === 'locked' ? 'hullDim' : 'line'), dashSize: 0.35, gapSize: 0.45, transparent: true, opacity: slot.state === 'locked' ? 0.35 : 0.7 });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.loopRing = new THREE.Group();
    this.loopRing.add(line);
    this.loopRing.rotation.x = 0.16;
    this.loopInstalled = installed;
    this.loopRunners = [];
    if (installed) {
      for (let i = 0; i < 3; i++) {
        const runner = this.glow('assistant', 0.7, 0.9);
        this.loopRing.add(runner);
        this.loopRunners.push({ sprite: runner, offset: i / 3 });
      }
    }
    this.station.add(this.loopRing);
    this.loopTag = this.tag(`tag-slot is-${slot.state}`, slot.state === 'locked' ? '？？？' : installed ? '循环' : '循环 · 未装', V(-2.4, 0.2, 4.9));
  }

  buildBeacon(slot) {
    const installed = slot.state === 'installed';
    this.beacon = new THREE.Group();
    this.beacon.position.copy(BEACON);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), installed ? new THREE.MeshStandardMaterial({ color: 0x556079, emissive: 0x000000, roughness: 0.3 }) : this.slotMaterial(slot.state));
    this.beacon.add(lamp);
    if (installed) {
      this.beacon.add(this.truss(HUB.clone().sub(BEACON), V(0, 0.62, 0), 0.13));
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.26, 16), this.hullMat);
      housing.position.y = 0.5;
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 8, 32), this.hullMat);
      guard.rotation.x = Math.PI / 2;
      this.beacon.add(housing, guard);
      lamp.userData.pick = { kind: 'tool', data: { id: 'check' } };
      lamp.userData.slot = true;
      this.pickables.push(lamp);
      this.beaconGlow = this.glow('toolResult', 0.01, 0.9);
      this.beacon.add(this.beaconGlow);
    }
    this.beaconLamp = lamp;
    this.beaconInstalled = installed;
    this.beaconState = 'off';
    this.station.add(this.beacon);
    this.beaconTag = this.tag(`tag-slot is-${slot.state}`, slot.state === 'locked' ? '？？？' : installed ? '验收信标' : '验收信标 · 未装', BEACON.clone().add(V(0, -0.95, 0)));
  }

  setBeacon(state) {
    if (!this.beaconInstalled) return;
    this.beaconState = state;
    const name = state === 'pass' ? 'toolResult' : state === 'fail' ? 'error' : null;
    const material = this.beaconLamp.material;
    if (!name) {
      material.color.set(0x556079);
      material.emissive.set(0x000000);
      this.beaconGlow.scale.setScalar(0.01);
      return;
    }
    material.color.copy(this.color(name));
    material.emissive.copy(this.color(name));
    material.emissiveIntensity = 0.9;
    this.beaconGlow.material.color.copy(this.color(name));
    this.beaconGlow.material.opacity = this.light ? 0.3 : 0.4;
    this.beaconGlow.scale.setScalar(3);
  }

  // ---------- 每次运行的状态 ----------
  resetRun(files = this.files ?? []) {
    this.generation++;
    this.releaseStep();
    this.tweens = [];
    for (const block of this.blocks) this.dropTag(block.tag);
    this.dynamic.clear();
    this.blocks = [];
    this.packets = [];
    this.particles = [];
    this.pickables = this.pickables.filter((mesh) => !mesh.userData.dynamic);
    this.calls = 0;
    this.totalTokens = 0;
    this.coreEnergy = 0.25;
    this.scanner.visible = false;
    this.bubble.el.hidden = true;
    this.answer.el.hidden = true;
    this.callTag.el.hidden = true;
    this.setBeacon('off');
    this.attend(null, 1);
    this.rebuildFiles(files);
  }

  rebuildFiles(files) {
    for (const node of this.fileNodes) {
      this.station.remove(node.mesh);
      this.dropTag(node.tag);
    }
    this.pickables = this.pickables.filter((mesh) => !mesh.userData.file);
    const old = new Map(this.fileNodes.map((node) => [node.file.path, node]));
    this.files = files;
    this.fileNodes = files.slice(0, 6).map((file, i) => {
      const position = V(VAULT_X, ((Math.min(files.length, 6) - 1) / 2 - i) * 1.35, 0);
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.44, 0), this.lit('user', 0.35));
      mesh.position.copy(position);
      mesh.userData.pick = { kind: 'file', data: file };
      mesh.userData.file = true;
      const holder = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.022, 8, 40), this.hullMat);
      holder.rotation.x = Math.PI / 2;
      mesh.add(holder);
      this.station.add(mesh);
      this.pickables.push(mesh);
      const tag = this.tag('tag-file', file.path, position.clone().add(V(0.75, 0, 0)), () => this.hooks.onPick?.('file', file));
      const previous = old.get(file.path);
      const isNew = old.size > 0 && !previous;
      const changed = previous && previous.file.text !== file.text;
      return { file, mesh, tag, position, flash: isNew || changed ? 1 : 0, flashColor: 'toolResult' };
    });
    if (!this.vaultTag) this.vaultTag = this.tag('tag-module', '数据舱 · 仅内存', V(VAULT_X, -3.2, 0));
  }

  // ---------- 动画基础 ----------
  setSpeed(speed) {
    this.speed = speed;
  }

  setStepMode(on) {
    this.stepMode = on;
    if (!on) this.releaseStep();
  }

  releaseStep() {
    if (this.stepWaiter) {
      const resolve = this.stepWaiter;
      this.stepWaiter = null;
      resolve();
    }
  }

  gate() {
    if (!this.stepMode) return Promise.resolve();
    return new Promise((resolve) => {
      this.stepWaiter = resolve;
      this.hooks.onWaiting?.(true);
    }).then(() => this.hooks.onWaiting?.(false));
  }

  tween(ms, update) {
    const generation = this.generation;
    const duration = this.reduceMotion ? 1 : ms / this.speed;
    return new Promise((resolve) => this.tweens.push({ elapsed: 0, duration, update, resolve, generation }));
  }

  wait(ms) {
    return this.tween(ms, () => {});
  }

  async fly(points, colorName, { ms = 700, size = 0.2, impact = true } = {}) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    const group = new THREE.Group();
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), this.lit(colorName, 1.6)), this.glow(colorName, size * 9, 0.85));
    group.add(head);
    // 拖尾：一串越来越小、越来越淡的光点，沿同一条曲线落后一点点。
    const trail = this.reduceMotion ? [] : Array.from({ length: 12 }, (_, i) => this.glow(colorName, size * 6 * (1 - i / 13), 0.5 * (1 - i / 12)));
    group.add(...trail);
    this.dynamic.add(group);
    await this.tween(ms, (t) => {
      const k = ease(t);
      head.position.copy(curve.getPoint(k));
      trail.forEach((sprite, i) => sprite.position.copy(curve.getPoint(Math.max(0, k - (i + 1) * 0.016))));
    });
    this.dynamic.remove(group);
    if (impact) this.shock(points[points.length - 1], colorName, size * 9);
  }

  burst(position, colorName, count = 26) {
    if (this.reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const sprite = this.glow(colorName, 0.34, 1);
      sprite.position.copy(position);
      this.dynamic.add(sprite);
      this.particles.push({ sprite, velocity: new THREE.Vector3().randomDirection().multiplyScalar(1.5 + Math.random() * 4), life: 1 });
    }
  }

  /** 镜头的注意力：轻轻偏向正在发生事情的舱段。 */
  attend(point, zoom = 1) {
    this.attention.point.copy(point ?? V(0, 0, 0));
    this.attention.zoom = zoom;
  }

  // ---------- 上下文舱里的方块 ----------
  layout() {
    const gap = 0.07;
    const room = SPINE.x1 - SPINE.x0 - 0.5;
    const wanted = this.blocks.map((b) => clamp(0.3 + Math.sqrt(b.data.tokens) * 0.022, 0.56, 2.2));
    const sum = wanted.reduce((a, b) => a + b, 0) + gap * Math.max(0, this.blocks.length - 1);
    const scale = sum > room ? (room - gap * (this.blocks.length - 1)) / (sum - gap * (this.blocks.length - 1)) : 1;
    let x = SPINE.x0 + 0.25;
    this.blocks.forEach((block, i) => {
      block.targetW = Math.max(0.08, wanted[i] * scale);
      block.targetX = x + block.targetW / 2;
      x += block.targetW + gap;
    });
    this.nextSlotX = Math.min(x, SPINE.x1 - 0.3);
  }

  addBlock(data) {
    const colorName = data.isError ? 'error' : data.role;
    const material = this.lit(colorName, 0.75);
    material.transparent = true;
    material.opacity = 0.92;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 1, 6), material);
    mesh.rotation.z = Math.PI / 2;
    mesh.userData.pick = { kind: 'block', data };
    mesh.userData.dynamic = true;
    this.dynamic.add(mesh);
    this.pickables.push(mesh);
    const label = data.role === 'toolResult' ? `${data.toolName}${data.isError ? ' ✗' : ''}` : ROLE_TAG[data.role];
    const tag = this.tag(`tag-block is-${colorName}`, `${label} ${data.tokens}`, V(0, 0, 0), () => this.hooks.onPick?.('block', data));
    const block = { data, mesh, tag, w: 0.02, x: 0, targetW: 0.3, targetX: 0, pop: 1 };
    this.blocks.push(block);
    this.totalTokens = this.blocks.reduce((sum, b) => sum + b.data.tokens, 0);
    this.layout();
    block.x = block.targetX + 0.4;
    this.burst(V(block.targetX, 0, 0), colorName, 8);
    return block;
  }

  // ---------- 节拍：由 app.js 按事件顺序调用 ----------
  async userIn(systemBlock, userBlock) {
    this.attend(V(-8, 0, 0), 0.94);
    this.addBlock(systemBlock);
    await this.wait(280);
    await this.fly([V(-22, 5, 8), V(-16, 1.4, 2), UPLINK, V(SPINE.x0, 0, 0), V(this.nextSlotX, 0, 0)], 'user', { ms: 1100 });
    this.addBlock(userBlock);
    await this.wait(300);
  }

  /** 每次呼叫主脑：扫描环把整舱内容从头到尾扫一遍。 */
  async feed() {
    this.calls++;
    this.callTag.el.hidden = false;
    this.callTag.el.textContent = `第 ${this.calls} 次呼叫`;
    this.attend(V(-4, 0, 0), 0.94);
    this.bubble.el.hidden = true;
    const jobs = [];
    if (this.calls > 1 && this.loopInstalled) jobs.push(this.tween(700, (t) => (this.loopPulse = t)).then(() => (this.loopPulse = -1)));
    await Promise.all(jobs);
    this.scanner.visible = true;
    const end = Math.max(this.nextSlotX, SPINE.x0 + 1);
    const stream = [];
    await Promise.all([
      this.tween(900, (t) => {
        const x = SPINE.x0 + (end - SPINE.x0) * ease(t);
        this.scanner.position.set(x, 0, 0);
        for (const block of this.blocks) block.pop = Math.max(block.pop, 1 - Math.min(1, Math.abs(block.x - x) / 0.6));
        this.coreEnergy = 0.3 + t * 0.7;
      }),
      ...this.blocks.slice(-8).map((block, i) => {
        const job = this.wait(240 + i * 80).then(() => this.fly([V(SPINE.x1, 0, 0), V(CORE.x - 1.4, 0, 0)], block.data.isError ? 'error' : block.data.role, { ms: 420, size: 0.13, impact: false }));
        stream.push(job);
        return job;
      }),
    ]);
    this.scanner.visible = false;
    this.coreEnergy = 1;
  }

  async think(text, calls) {
    this.attend(V(1, -1, 0), 0.88);
    this.bubble.el.hidden = false;
    this.bubble.el.classList.remove('is-dim');
    const chars = [...text];
    const render = (shown) => {
      this.bubble.el.replaceChildren();
      if (shown) this.bubble.el.append(document.createTextNode(shown));
      else if (!calls.length) this.bubble.el.append(document.createTextNode('……'));
    };
    if (chars.length) await this.tween(clamp(chars.length * 22, 320, 2200), (t) => render(chars.slice(0, Math.ceil(chars.length * t)).join('')));
    else {
      render('');
      await this.wait(260);
    }
    if (calls.length) {
      const row = document.createElement('div');
      row.className = 'bubble-calls';
      for (const call of calls) {
        const chip = document.createElement('span');
        chip.textContent = `→ ${call.name}`;
        row.append(chip);
      }
      this.bubble.el.append(row);
      await Promise.all(
        calls.map((call, i) => {
          const slot = this.slots.find((s) => (s.tool ?? s.id) === call.name && s.state === 'installed');
          const to = call.name === 'check' ? BEACON : slot ? slot.position : V(TOOL_X, 0, 0);
          return this.wait(i * 120).then(() => this.fly([V(CORE.x + 1.2, 0, 0), HUB.clone(), to.clone().add(V(call.name === 'check' ? 0 : -1.2, 0, 0))], 'assistant', { ms: 620 }));
        }),
      );
    }
  }

  async storeAssistant(block) {
    await this.fly([V(CORE.x - 0.6, 0.9, 0), V(-1.6, 3.1, 0.6), V(this.nextSlotX + 0.4, 2.2, 0.3), V(this.nextSlotX, 0, 0)], 'assistant', { ms: 620, size: 0.16 });
    this.addBlock(block);
    this.coreEnergy = 0.3;
    await this.wait(200);
  }

  async runTools(items) {
    this.attend(V(7, 0, 0), 0.9);
    await Promise.all(
      items.map(async (item, i) => {
        await this.wait(i * 110);
        const slot = this.slots.find((s) => (s.tool ?? s.id) === item.name && s.state === 'installed');
        const origin = item.name === 'check' ? BEACON.clone() : slot ? slot.position.clone() : V(TOOL_X, 0, 0);
        if (slot?.band) slot.flash = { v: 1, color: item.isError ? 'error' : 'assistant' };
        this.shock(origin, item.isError ? 'error' : 'assistant', 2.6);
        if (item.isError) this.shake(0.35);
        const node = this.fileNodes.find((n) => n.file.path === item.touched);
        if (node) {
          const colorName = item.name === 'write' ? 'toolResult' : 'user';
          const beam = this.rod(origin.clone().add(V(item.name === 'check' ? 0.4 : 1.3, 0, 0)), node.position.clone().add(V(-0.45, 0, 0)), 0.035, this.lit(colorName, 2));
          this.dynamic.add(beam);
          node.flash = 1;
          node.flashColor = colorName;
          await this.wait(440);
          this.dynamic.remove(beam);
        } else await this.wait(320);
        if (item.isError) this.burst(origin, 'error', 14);
        if (item.files) this.rebuildFiles(item.files);
        if (item.check) {
          this.setBeacon(item.check.passed ? 'pass' : 'fail');
          this.burst(BEACON, item.check.passed ? 'toolResult' : 'error', item.check.passed ? 30 : 14);
          this.shock(BEACON, item.check.passed ? 'toolResult' : 'error', 5);
          if (!item.check.passed) this.shake(0.5);
          await this.wait(420);
        }
        const dip = -3.4 - i * 0.35;
        await this.fly([origin.clone().add(V(-0.9, -0.5, 0)), V(2.4, dip, 1.2), V(-3, dip - 0.3, 1.6), V(this.nextSlotX + 0.6, -2.4, 0.8), V(this.nextSlotX, 0, 0)], item.isError ? 'error' : 'toolResult', { ms: 860 });
        this.addBlock(item.block);
      }),
    );
    this.attend(null, 1);
    await this.wait(220);
  }

  async deliver(text) {
    this.attend(V(1, 3, 0), 0.92);
    await this.fly([V(CORE.x, 1.2, 0), DOWNLINK.clone().add(V(0, -0.4, 0)), DOWNLINK.clone().add(V(0, 0.6, 0)), V(3, 12, 6), V(8, 22, 14)], 'assistant', { ms: 1000 });
    this.answer.el.hidden = false;
    this.answer.el.textContent = text;
    this.bubble.el.classList.add('is-dim');
    this.coreEnergy = 0.2;
    this.attend(null, 1);
  }

  /** 没有循环：结果回舱了，主脑却再也没被叫起来。 */
  async silence() {
    this.attend(V(0.6, 0, 0), 0.86);
    this.coreEnergy = 0.08;
    this.bubble.el.hidden = false;
    this.bubble.el.classList.add('is-dim');
    this.bubble.el.textContent = '……';
    await this.wait(900);
  }

  celebrate() {
    this.cinematic('victory');
    for (const name of ['user', 'assistant', 'toolResult', 'system']) this.burst(CORE.clone().add(V((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, 0)), name, 30);
  }

  /** 装上零件的演出：镜头绕过去，零件从无到有地长出来，带一圈焊花。 */
  flashPart(id) {
    const slot = this.slots.find((s) => s.id === id);
    if (slot) {
      this.cinematic('reveal', slot.position);
      this.burst(slot.position, 'assistant', 28);
      this.shock(slot.position, 'assistant', 5);
      this.tween(760, (t) => {
        const k = t < 0.7 ? ease(t / 0.7) * 1.12 : 1.12 - ((t - 0.7) / 0.3) * 0.12;
        slot.group.scale.setScalar(Math.max(0.02, k));
      });
    } else if (id === 'check' && this.beacon) {
      this.cinematic('reveal', BEACON);
      this.burst(BEACON, 'toolResult', 28);
      this.shock(BEACON, 'toolResult', 5);
      this.tween(760, (t) => this.beacon.scale.setScalar(Math.max(0.02, ease(t))));
    } else if (id === 'loop' && this.loopRing) {
      this.cinematic('reveal', V(-2.4, 0, 0));
      const line = this.loopRing.children[0];
      const total = line.geometry.attributes.position.count;
      this.loopPulse = 0;
      this.tween(1300, (t) => {
        line.geometry.setDrawRange(0, Math.ceil(total * ease(t)));
        this.loopPulse = t;
      }).then(() => (this.loopPulse = -1));
    }
  }

  // ---------- 交互 ----------
  bindPointer() {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (event) => {
      this.orbit.drag = { x: event.clientX, y: event.clientY };
      this.orbit.moved = 0;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      const drag = this.orbit.drag;
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        this.orbit.moved += Math.abs(dx) + Math.abs(dy);
        this.orbit.theta = clamp(this.orbit.theta - dx * 0.006, -1.15, 1.15);
        this.orbit.phi = clamp(this.orbit.phi - dy * 0.005, 0.65, 2.1);
        this.orbit.drag = { x: event.clientX, y: event.clientY };
        return;
      }
      const hit = this.pick(event);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    });
    const release = (event) => {
      if (!this.orbit.drag) return;
      this.orbit.drag = null;
      if (this.orbit.moved < 6) {
        const hit = this.pick(event);
        if (hit) this.hooks.onPick?.(hit.kind, hit.data);
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', () => (this.orbit.drag = null));
    canvas.addEventListener('dblclick', () => Object.assign(this.orbit, { theta: 0.16, phi: 1.36 }));
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return hit?.object.userData.pick ?? null;
  }

  // ---------- 帧循环 ----------
  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    // 给 HUD 让位：窄窗口时左侧面板占地方，画面中心往右挪；底部对话框占地方，往上挪。
    if (this.showcase) this.camera.clearViewOffset();
    else this.camera.setViewOffset(width, height, width < 1240 ? -Math.min(120, width * 0.1) : 0, height * 0.05, width, height);
    this.camera.updateProjectionMatrix();
    this.viewport = { width, height };
  }

  frame(now) {
    const dt = clamp((now - this.last) / 1000, 0, 0.05); // 首帧的时间戳可能早于构造时刻
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.composer.render();
    this.placeTags();
    this.raf = requestAnimationFrame(this.frame);
  }

  update(dt) {
    for (const tween of [...this.tweens]) {
      if (tween.generation !== this.generation) {
        this.tweens.splice(this.tweens.indexOf(tween), 1);
        continue;
      }
      tween.elapsed += dt * 1000;
      const t = clamp(tween.elapsed / tween.duration, 0, 1);
      tween.update(t);
      if (t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tween), 1);
        tween.resolve();
      }
    }

    // 相机：按画面比例决定退多远，保证整座站都在画面里。
    const fit = 34.5 / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    this.intro = Math.max(0, this.intro - dt / 2.4);
    const introK = this.intro * this.intro * (3 - 2 * this.intro);
    const follow = 1 - Math.pow(0.02, dt);
    this.attention.current.lerp(this.attention.point, follow);
    this.attention.currentZoom += (this.attention.zoom - this.attention.currentZoom) * follow;
    // 演出镜头：有 shot 时向它靠拢，过期后平滑交还。
    if (this.shot && this.time > this.shot.until) this.shot = null;
    const shot = this.shot;
    const camFollow = 1 - Math.pow(0.04, dt);
    this.cam.theta += ((shot?.theta ?? 0) - this.cam.theta) * camFollow;
    this.cam.phi += ((shot?.phi ?? 0) - this.cam.phi) * camFollow;
    this.cam.zoom += ((shot?.zoom ?? 1) - this.cam.zoom) * camFollow;
    this.cam.weight += ((shot?.weight ?? 0.22) - this.cam.weight) * camFollow;
    this.cam.point.lerp(shot ? shot.point : this.attention.current, camFollow);
    const radius = clamp(fit, 22, 78) * this.attention.currentZoom * this.cam.zoom * (1 + introK * 1.6) * (this.showcase ? 1.12 : 1);
    const sway = this.reduceMotion ? 0 : Math.sin(this.time * 0.22) * 0.035;
    const theta = this.orbit.theta + this.cam.theta + sway + introK * 1.1 + (this.showcase && !this.reduceMotion ? Math.sin(this.time * 0.1) * 0.5 : 0);
    const phi = clamp(this.orbit.phi + this.cam.phi - introK * 0.35, 0.5, 2.3);
    const target = TARGET.clone().addScaledVector(this.cam.point, this.cam.weight);
    if (this.showcase) target.set(TARGET.x - 6.5, 0.4, 0);
    this.camera.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta));
    this.camera.lookAt(target);
    if (this.shakeAmount > 0.001) {
      const a = this.shakeAmount * 0.45;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z += (Math.random() - 0.5) * this.shakeAmount * 0.012;
      this.shakeAmount *= Math.pow(0.012, dt);
    }
    this.stars.rotation.y += dt * 0.003;
    this.planet.rotation.y += dt * 0.004;
    this.planetMat.uniforms.time.value = this.time;
    for (const nav of this.navLights) nav.light.material.emissiveIntensity = (this.time * 0.8 + nav.phase) % 1.6 < 0.22 ? 2.4 : 0.1;

    const k = 1 - Math.pow(0.0006, dt);
    for (const block of this.blocks) {
      block.w += (block.targetW - block.w) * k;
      block.x += (block.targetX - block.x) * k;
      block.pop = Math.max(0, block.pop - dt * 1.5);
      block.mesh.scale.set(1 + block.pop * 0.08, block.w, 1 + block.pop * 0.08);
      block.mesh.position.set(block.x, 0, 0);
      block.mesh.material.emissiveIntensity = (this.light ? 0.5 : 0.28) + block.pop * (this.light ? 0.5 : 0.7);
      block.tag.anchor.set(block.x, 1.3, 0);
      block.tag.visible = block.w > 0.3;
    }

    const energy = this.coreEnergy ?? 0.25;
    const pulse = this.reduceMotion ? 0.5 : 0.5 + Math.sin(this.time * 2.2) * 0.5;
    this.coreMat.emissiveIntensity = (this.light ? 0.15 : 0.22) + energy * (this.light ? 0.45 : 0.75) + pulse * 0.05;
    this.coreGlow.scale.setScalar(4.4 + energy * 2.6 + pulse * 0.2);
    this.coreGlow.material.opacity = (this.light ? 0.2 : 0.16) + energy * (this.light ? 0.3 : 0.2);
    this.shellMat.uniforms.power.value = this.light ? energy * 0.35 : energy;
    this.shellMat.uniforms.time.value = this.time;
    this.coreCage.rotation.y += dt * (0.15 + energy * 1.2);
    this.coreCage.rotation.x += dt * 0.08;
    this.rings.forEach((ring, i) => {
      ring.rotation.x += dt * (0.2 + energy * 1.6) * (i % 2 ? -1 : 1);
      ring.rotation.y += dt * (0.14 + energy * 1.1);
    });

    for (const slot of this.slots) {
      if (slot.state !== 'installed') {
        slot.group.rotation.x = Math.sin(this.time * 0.7 + slot.position.y) * 0.08;
        continue;
      }
      if (slot.flash) {
        slot.flash.v = Math.max(0, slot.flash.v - dt * 0.9);
        slot.band.material.color.copy(this.color(slot.flash.color));
        slot.band.material.emissive.copy(this.color(slot.flash.color));
        slot.band.material.emissiveIntensity = 0.9 + slot.flash.v * 3;
        slot.group.scale.setScalar(1 + slot.flash.v * 0.08);
      }
    }
    for (const node of this.fileNodes) {
      node.flash = Math.max(0, node.flash - dt * 0.8);
      node.mesh.rotation.y += dt * (0.4 + node.flash * 5);
      node.mesh.material.color.copy(this.color(node.flash > 0.02 ? node.flashColor : 'user'));
      node.mesh.material.emissive.copy(node.mesh.material.color);
      node.mesh.material.emissiveIntensity = (this.light ? 0.15 : 0.22) + node.flash * 1.4;
      node.mesh.scale.setScalar(1 + node.flash * 0.35);
    }
    if (this.loopRunners?.length && this.loopPath) {
      for (const runner of this.loopRunners) {
        const boost = this.loopPulse >= 0 && this.loopPulse !== undefined ? 6 : 1;
        runner.offset = (runner.offset + dt * 0.05 * boost) % 1;
        const point = this.loopPath[Math.floor(runner.offset * (this.loopPath.length - 1))];
        runner.sprite.position.copy(point);
        runner.sprite.scale.setScalar(boost > 1 ? 1.5 : 0.7);
      }
    }
    if (this.beaconInstalled && this.beaconState !== 'off') this.beaconGlow.scale.setScalar(2.6 + pulse * 0.8);

    for (const particle of this.particles) {
      particle.sprite.position.addScaledVector(particle.velocity, dt);
      particle.life -= dt * 1.1;
      particle.sprite.material.opacity = clamp(particle.life, 0, 1);
    }
    for (const particle of this.particles.filter((p) => p.life <= 0)) this.dynamic.remove(particle.sprite);
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  placeTags() {
    const { width, height } = this.viewport;
    const point = new THREE.Vector3();
    for (const entry of this.tags) {
      if (entry.el.hidden) continue;
      point.copy(entry.anchor);
      this.station.localToWorld(point);
      if (entry.el.parentElement === null) continue;
      if (this.loopRing && entry === this.loopTag) {
        point.copy(entry.anchor);
        this.loopRing.localToWorld(point);
      }
      point.project(this.camera);
      const shown = entry.visible && point.z < 1;
      entry.el.style.display = shown ? '' : 'none';
      if (shown) {
        entry.el.style.setProperty('--x', `${(((point.x + 1) / 2) * width).toFixed(1)}px`);
        entry.el.style.setProperty('--y', `${(((1 - point.y) / 2) * height).toFixed(1)}px`);
      }
    }
  }
}
