import * as THREE from "three";
import { Box, Zone, makeBox, makeZone, Surface, ZoneType } from "./physics";
import { t } from "./i18n";

export class RNG {
  s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

export interface Waypoint { x: number; y: number; z: number; box?: Box; tp?: boolean; }

export interface Section {
  index: number;
  type: string;
  name: string;
  zStart: number;
  zEnd: number;
  minY: number;
  maxY: number;
  spawn: THREE.Vector3;
  boxes: Box[];
  zones: Zone[];
  updaters: ((t: number) => void)[];
  locals: ((lt: number, dt: number) => void)[];
  resets: (() => void)[];
  wps: Waypoint[];
  /** culled by the draw-distance setting (collision is unaffected) */
  visible: boolean;
}

// ---------- shared geometry/material ----------
let unitBox: THREE.BufferGeometry | null = null;
let unitCyl: THREE.BufferGeometry | null = null;
function shade(g: THREE.BufferGeometry) {
  const n = g.attributes.normal;
  const cols: number[] = [];
  for (let i = 0; i < n.count; i++) {
    const ny = n.getY(i);
    const v = ny > 0.5 ? 1 : ny < -0.5 ? 0.5 : 0.78;
    cols.push(v, v, v);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  return g;
}
export function ensureShade(g: THREE.BufferGeometry) { if (!g.attributes.color) shade(g); return g; }
export function getUnitBox() { return (unitBox ??= shade(new THREE.BoxGeometry(1, 1, 1))); }
export function getUnitCyl() { return (unitCyl ??= shade(new THREE.CylinderGeometry(1, 1, 1, 22))); }
const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: number, emissive = 0): THREE.MeshLambertMaterial {
  const k = `${color}_${emissive}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, vertexColors: true, emissive: emissive ? color : 0, emissiveIntensity: emissive });
    matCache.set(k, m);
  }
  return m;
}

let arrowTex: THREE.CanvasTexture | null = null;
function getArrowTex() {
  if (arrowTex) return arrowTex;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3a3f55"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#ffd23f";
  g.beginPath(); g.moveTo(32, 8); g.lineTo(56, 36); g.lineTo(42, 36); g.lineTo(42, 56); g.lineTo(22, 56); g.lineTo(22, 36); g.lineTo(8, 36); g.closePath(); g.fill();
  arrowTex = new THREE.CanvasTexture(c);
  arrowTex.wrapS = arrowTex.wrapT = THREE.RepeatWrapping;
  arrowTex.colorSpace = THREE.SRGBColorSpace;
  return arrowTex;
}
let checkTex: THREE.CanvasTexture | null = null;
function getCheckTex() {
  if (checkTex) return checkTex;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? "#222" : "#fff"; g.fillRect(i * 8, j * 8, 8, 8); }
  checkTex = new THREE.CanvasTexture(c);
  checkTex.magFilter = THREE.NearestFilter;
  checkTex.wrapS = checkTex.wrapT = THREE.RepeatWrapping;
  checkTex.colorSpace = THREE.SRGBColorSpace;
  return checkTex;
}
function textSprite(text: string, color = "#fff", bg = "rgba(0,0,0,0)", w = 512, h = 128, font = 84) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = `900 ${font}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 12; g.strokeStyle = "#1b1440"; g.strokeText(text, w / 2, h / 2);
  g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PALETTES = [
  [0xff5d8f, 0xffa3c4, 0xff7aa8],
  [0x4cc9f0, 0x4895ef, 0x72ddf7],
  [0x80ed99, 0x57cc99, 0xb8f2a0],
  [0xffb703, 0xfb8500, 0xffd166],
  [0xb388eb, 0x8093f1, 0xd0a8ff],
  [0xff6b6b, 0xffa07a, 0xff8e72],
  [0x06d6a0, 0x1b9aaa, 0x5ef2c6],
  [0xf15bb5, 0xfee440, 0x00bbf9],
];

export interface PlatOpts {
  x: number; y: number; z: number; w: number; d: number; h?: number;
  rot?: number; cyl?: boolean; color?: number; surface?: Surface; bounce?: number;
  convX?: number; convZ?: number; hazard?: 0 | 1 | 2; wallrun?: boolean; perfect?: boolean;
  unique?: boolean; slope?: number; wp?: boolean; emissive?: number; noMesh?: boolean;
}

export class Course {
  group = new THREE.Group();
  sections: Section[] = [];
  boxes: Box[] = [];
  zones: Zone[] = [];
  startPos = new THREE.Vector3();
  finishPos = new THREE.Vector3();
  finishBanner: THREE.Mesh | null = null;
  localTime = 0;
  onMsg: (m: string) => void = () => {};
  animated: { obj: THREE.Object3D; fn: (t: number) => void }[] = [];
  private disposables: { dispose: () => void }[] = [];

  update(t: number) {
    for (const b of this.boxes) { b.px = b.x; b.py = b.y; b.pz = b.z; b.prot = b.rot; }
    for (const s of this.sections) for (const u of s.updaters) u(t);
    for (const a of this.animated) a.fn(t);
  }

  localUpdate(dt: number) {
    this.localTime += dt;
    const lt = this.localTime;
    for (const s of this.sections) for (const l of s.locals) l(lt, dt);
    for (const b of this.boxes) {
      if (b.surface === "vanish" || b.surface === "break" || b.surface === "fake") {
        if (b.state === 1) {
          b.timer -= dt;
          const m = b.mesh as THREE.Mesh | null;
          if (m) {
            m.position.x = b.x + (Math.random() - 0.5) * 0.12;
            const mm = m.material as THREE.MeshLambertMaterial;
            if (b.surface === "vanish") { mm.opacity = 0.35 + 0.65 * Math.abs(Math.sin(b.timer * 25)); }
          }
          if (b.timer <= 0) {
            b.state = 2; b.timer = b.surface === "vanish" ? 2.5 : 4;
            b.active = false; b.solid = false;
            if (b.mesh) b.mesh.visible = b.surface === "break"; // break falls visibly
          }
        } else if (b.state === 2) {
          b.timer -= dt;
          if (b.surface !== "vanish") b.y -= dt * 16;
          if (b.mesh) {
            b.mesh.position.y = b.y;
            if (b.surface === "vanish") b.mesh.visible = false;
          }
          if (b.timer <= 0) this.restoreBox(b);
        }
      }
    }
  }

  restoreBox(b: Box) {
    b.state = 0; b.active = true; b.solid = true; b.y = b.baseY; b.x = b.baseX; b.z = b.baseZ;
    const m = b.mesh as THREE.Mesh | null;
    if (m) {
      m.visible = true;
      m.position.set(b.x, b.y, b.z);
      if (m.material instanceof THREE.MeshLambertMaterial && m.material.transparent) m.material.opacity = 1;
    }
  }

  onLand(b: Box) {
    if (b.state !== 0) return;
    if (b.surface === "vanish") { b.state = 1; b.timer = 0.4; }
    else if (b.surface === "break") { b.state = 1; b.timer = 0.28; }
    else if (b.surface === "fake") { b.state = 1; b.timer = 0.08; }
  }

  resetSection(i: number) {
    const s = this.sections[i];
    if (!s) return;
    for (const r of s.resets) r();
  }

  syncMeshes() {
    for (const s of this.sections) {
      if (!s.visible) continue;
      for (const b of s.boxes) this.syncBox(b);
    }
    if (this.sections.length === 0) for (const b of this.boxes) this.syncBox(b);
  }

  private syncBox(b: Box) {
    {
      const m = b.mesh;
      if (!m) return;
      if (b.state !== 1) m.position.x = b.x;
      m.position.y = b.slope ? b.y : b.y;
      m.position.z = b.z;
      m.rotation.y = b.rot;
      if (b.surface === "break" || b.surface === "fake" || b.surface === "timed") m.visible = b.active || b.state === 2;
      else m.visible = b.active;
    }
  }

  sectionAt(z: number): number {
    const ss = this.sections;
    for (let i = ss.length - 1; i >= 0; i--) if (z >= ss[i].zStart - 1) return i;
    return 0;
  }

  track(d: { dispose: () => void }) { this.disposables.push(d); }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mm = m.material as THREE.Material;
        if (![...matCache.values()].includes(mm as THREE.MeshLambertMaterial)) mm.dispose();
      }
    });
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}

export class Ctx {
  x: number; y: number; z: number;
  pal: number[];
  constructor(public course: Course, public sec: Section, public rng: RNG, public diff: number, x: number, y: number, z: number) {
    this.x = x; this.y = y; this.z = z;
    this.pal = rng.pick(PALETTES);
  }
  col(i = 0) { return this.pal[i % this.pal.length]; }
  gap(extra = 0) { return this.rng.range(1.4, 2.2 + this.diff * 1.3) + extra; }
  clampX(x: number) { return Math.max(-9, Math.min(9, x)); }

  plat(o: PlatOpts): Box {
    const h = o.h ?? 0.8;
    const b = makeBox({
      x: o.x, y: o.slope ? o.y : o.y - h / 2, z: o.z,
      hx: o.cyl ? o.w / 2 : o.w / 2, hy: h / 2, hz: o.cyl ? o.w / 2 : o.d / 2,
      rot: o.rot ?? 0, cyl: !!o.cyl, surface: o.surface ?? "normal", bounce: o.bounce ?? 0,
      convX: o.convX ?? 0, convZ: o.convZ ?? 0, hazard: o.hazard ?? 0, wallrun: !!o.wallrun,
      perfect: o.perfect ?? (o.w * o.d <= 10 && !o.hazard), section: this.sec.index, color: o.color ?? this.col(0),
      slope: o.slope ?? 0,
    });
    if (!o.noMesh) {
      const color = o.color ?? this.col(0);
      const unique = o.unique || b.surface === "vanish" || b.surface === "break" || b.surface === "fake" || b.surface === "timed";
      let material: THREE.Material;
      if (b.surface === "conveyor") {
        const tex = getArrowTex().clone();
        tex.needsUpdate = true;
        const len = o.d, wid = o.w;
        tex.repeat.set(Math.max(1, Math.round(wid / 1.5)), Math.max(1, Math.round(len / 1.5)));
        const ang = Math.atan2(b.convX, b.convZ);
        tex.center.set(0.5, 0.5);
        tex.rotation = Math.abs(b.convX) > Math.abs(b.convZ) ? (b.convX > 0 ? Math.PI / 2 : -Math.PI / 2) : (b.convZ > 0 ? Math.PI : 0);
        void ang;
        const mm = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
        this.course.track(tex);
        material = mm;
        const sp = Math.hypot(b.convX, b.convZ) / 1.5;
        const dirSign = Math.abs(b.convX) > Math.abs(b.convZ) ? Math.sign(b.convX) : -Math.sign(b.convZ);
        this.course.animated.push({ obj: new THREE.Object3D(), fn: (t) => { tex.offset.y = (t * sp * dirSign * (Math.abs(b.convX) > Math.abs(b.convZ) ? 1 : 1)) % 1; } });
      } else if (unique) {
        material = new THREE.MeshLambertMaterial({ color, vertexColors: true, transparent: true, opacity: 1, emissive: o.emissive ? color : 0, emissiveIntensity: o.emissive ?? 0 });
      } else {
        material = mat(color, o.emissive ?? (b.hazard ? 0.35 : 0));
      }
      let obj: THREE.Object3D;
      if (b.slope) {
        const len = 2 * b.hz * Math.sqrt(1 + b.slope * b.slope);
        const m = new THREE.Mesh(getUnitBox(), material);
        m.scale.set(2 * b.hx, h, len);
        m.rotation.x = -Math.atan(b.slope);
        m.position.y = -h / 2;
        m.castShadow = true; m.receiveShadow = true;
        obj = new THREE.Group();
        obj.add(m);
      } else {
        const m = new THREE.Mesh(b.cyl ? getUnitCyl() : getUnitBox(), material);
        if (b.cyl) m.scale.set(b.hx, 2 * b.hy, b.hx);
        else m.scale.set(2 * b.hx, 2 * b.hy, 2 * b.hz);
        m.castShadow = true; m.receiveShadow = true;
        obj = m;
      }
      obj.position.set(b.x, b.y, b.z);
      obj.rotation.y = b.rot;
      b.mesh = obj;
      this.course.group.add(obj);
    }
    this.sec.boxes.push(b);
    this.course.boxes.push(b);
    const top = b.slope ? b.y + Math.abs(b.slope) * b.hz : b.y + b.hy;
    const bottom = b.slope ? b.y - Math.abs(b.slope) * b.hz : b.y + b.hy;
    this.sec.minY = Math.min(this.sec.minY, bottom);
    this.sec.maxY = Math.max(this.sec.maxY, top);
    if (o.wp !== false && !b.hazard && o.wp) this.wp(b.x, top, b.z, b);
    return b;
  }

  // platform + waypoint shortcut
  p(o: PlatOpts): Box { return this.plat({ ...o, wp: o.wp ?? true }); }

  zone(type: ZoneType, x: number, y: number, z: number, hx: number, hy: number, hz: number, a = 0, b = 0, c = 0, fn?: () => void) {
    const zn = makeZone({ x, y, z, hx, hy, hz, type, a, b, c, fn, section: this.sec.index });
    this.sec.zones.push(zn);
    this.course.zones.push(zn);
    return zn;
  }

  wp(x: number, y: number, z: number, box?: Box, tp?: boolean) {
    this.sec.wps.push({ x: box ? x - box.x : x, y: box ? y - (box.y + box.hy) : y, z: box ? z - box.z : z, box, tp });
  }
  upd(fn: (t: number) => void) { this.sec.updaters.push(fn); }
  local(fn: (lt: number, dt: number) => void) { this.sec.locals.push(fn); }
  onReset(fn: () => void) { this.sec.resets.push(fn); }
  add(o: THREE.Object3D) { this.course.group.add(o); return o; }
  end(b: Box) { this.x = b.x; this.y = b.y + b.hy; this.z = b.z + b.hz; }
  endAt(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }

  deco(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, emissive = 0) {
    const m = new THREE.Mesh(ensureShade(geo), mat(color, emissive));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    this.add(m);
    return m;
  }
  arrow(x: number, y: number, z: number, dirYaw: number, color = 0xffffff) {
    const g = ensureShade(new THREE.ConeGeometry(0.35, 0.8, 4));
    this.course.track(g);
    const m = new THREE.Mesh(g, mat(color, 0.4));
    m.position.set(x, y, z);
    m.rotation.set(Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    m.position.set(0, 0, 0);
    holder.add(m);
    holder.rotation.y = dirYaw;
    this.add(holder);
    return holder;
  }
}

// ---------------- section builders ----------------
type Builder = { id: string; name: string; minDiff: number; weight: number; fn: (c: Ctx) => void };

const B: Builder[] = [];
export function def(id: string, name: string, minDiff: number, weight: number, fn: (c: Ctx) => void) { B.push({ id, name, minDiff, weight, fn }); }

export function spinner(c: Ctx, cx: number, top: number, cz: number, len: number, speed: number, dir: number, height = 0.6, ph = 0) {
  const bar = c.plat({ x: cx, y: top + 0.35 + height, z: cz, w: len * 2, d: 0.5, h: 0.5, color: 0xff3355, hazard: 1, perfect: false });
  c.upd((t) => { bar.rot = ph + t * speed * dir; });
  c.plat({ x: cx, y: top + 1.6, z: cz, w: 1.0, d: 1.0, h: 1.6, cyl: true, color: 0x333a55, perfect: false });
  return bar;
}

export function pendulumArm(c: Ctx, x: number, baseY: number, z: number, o: { len: number; amp: number; speed: number; phase: number; bob: number; color: number; laser?: boolean }) {
  const pivotY = baseY + 1.6 + o.len;
  const rod = new THREE.Group();
  rod.position.set(x, pivotY, z);
  const stick = new THREE.Mesh(getUnitBox(), mat(0x3b3f52));
  stick.scale.set(0.14, o.len, 0.14);
  stick.position.y = -o.len / 2;
  stick.castShadow = true;
  rod.add(stick);
  c.add(rod);
  c.deco(getUnitCyl(), 0x2b2d42, x, pivotY + 0.1, z, 0.22, 0.5, 0.22);
  const bob = o.laser
    ? c.plat({ x, y: pivotY - o.len + 0.3, z, w: 0.22, d: 0.22, h: 0.6, color: 0xff1e3c, hazard: 2, emissive: 1, unique: true, perfect: false, wp: false })
    : c.plat({ x, y: pivotY - o.len + o.bob / 2, z, w: o.bob, d: o.bob, h: o.bob, color: o.color, hazard: 1, perfect: false, wp: false });
  const rest = pivotY - o.len - (o.laser ? 0.3 : o.bob / 2);
  c.upd((t) => {
    const a = Math.sin(t * o.speed + o.phase) * o.amp;
    rod.rotation.z = a;
    bob.x = x + Math.sin(a) * o.len;
    bob.y = pivotY - Math.cos(a) * o.len + (rest - (pivotY - o.len));
    bob.z = z;
  });
  return bob;
}

export function rocks(c: Ctx, x0: number, x1: number, z0: number, z1: number, floorY: number, n: number) {
  for (let i = 0; i < n; i++) {
    const period = c.rng.range(2.2, 3.4);
    const ph = c.rng.range(0, period);
    const seedA = c.rng.int(1, 9999);
    const rock = c.plat({ x: x0, y: floorY + 12, z: z0, w: 1.3, d: 1.3, h: 1.3, color: 0x8d6e63, hazard: 1, perfect: false });
    const shadow = c.deco(getUnitCyl(), 0x222222, x0, floorY + 0.03, z0, 0.8, 0.02, 0.8);
    c.upd((t) => {
      const tt = t + ph;
      const cyc = Math.floor(tt / period);
      const f = (tt % period) / period;
      const h = ((cyc * 9301 + seedA * 49297) % 233280) / 233280;
      const h2 = ((cyc * 7919 + seedA * 3571) % 233280) / 233280;
      rock.x = x0 + (x1 - x0) * h;
      rock.z = z0 + (z1 - z0) * h2;
      const fallT = Math.min(1, f / 0.55);
      rock.y = floorY + 0.65 + (1 - fallT * fallT) * 13;
      rock.active = f < 0.62;
      rock.rot = t * 3;
      shadow.position.set(rock.x, floorY + 0.03, rock.z);
      const s = rock.active ? 0.3 + fallT * 0.6 : 0;
      shadow.scale.set(s, 0.02, s);
    });
  }
}


export function getSectionTypes(): string[] { return B.map((b) => b.id); }
export function getSectionCount(): number { return B.length; }
/** @deprecated use getSectionTypes() — kept for compatibility after sections register */
export const SECTION_TYPES: string[] = [];
export let SECTION_COUNT = 0;
export function finalizeSections() {
  SECTION_TYPES.length = 0;
  SECTION_TYPES.push(...B.map((b) => b.id));
  SECTION_COUNT = B.length;
}

export const TIME_ATTACK_LIST = [
  "stones", "sweeper", "wallrunCorridor", "vanish", "laserSlide", "trampolines", "laserGrid", "moveX",
  "timerBridge", "gravityFlip", "laserPendulum", "wallJumpShaft", "checkerFake", "laserWall", "fallingRocks",
  "laserZigzag", "laserDoor", "bounceLasers", "narrowLasers", "megaGauntlet",
  "longSkyBridge", "gridMaze", "branchMaze", "hexPads", "dualPathChoice",
];
export const TIME_ATTACK_SEED = 424242;

function pickType(rng: RNG, diff: number, recent: string[]): Builder {
  const pool = B.filter((b) => b.minDiff <= diff + 0.05 && !recent.includes(b.id));
  const total = pool.reduce((s, b) => s + b.weight, 0);
  let r = rng.next() * total;
  for (const b of pool) { r -= b.weight; if (r <= 0) return b; }
  return pool[0];
}

export interface CourseOpts { seed: number; count: number; types?: string[]; fixedDiff?: number; }

export function buildCourse(o: CourseOpts): Course {
  const course = new Course();
  const rng = new RNG(o.seed);
  let x = 0, y = 0, z = 0;
  // start pad
  const start: Section = mkSec(-1, "start", "Старт", z, y);
  const sc = new Ctx(course, start, rng, 0, x, y, z);
  const pad = sc.plat({ x: 0, y: 0, z: 6, w: 14, d: 12, color: 0xf8f9ff, perfect: false });
  sc.plat({ x: 0, y: -0.05, z: 6, w: 14.6, d: 12.6, h: 0.9, color: 0x5a4fcf, perfect: false, noMesh: false }).solid = false;
  course.startPos.set(0, 0, 3);
  z = pad.z + pad.hz;
  const recent: string[] = [];
  const secs: Section[] = [];
  for (let i = 0; i < o.count; i++) {
    const diff = o.fixedDiff ?? Math.min(1, 0.15 + (i / Math.max(1, o.count - 1)) * 0.75 + rng.range(-0.1, 0.1));
    let b: Builder;
    if (o.types && o.types[i]) b = B.find((bb) => bb.id === o.types![i]) ?? B[0];
    else b = pickType(rng, diff, recent);
    recent.push(b.id);
    if (recent.length > 5) recent.shift();
    const sec = mkSec(i, b.id, b.name, z, y);
    const c = new Ctx(course, sec, rng, diff, x, y, z);
    // checkpoint pad (section 0 uses start pad)
    if (i > 0) {
      const g = rng.range(1.2, 2);
      const cp = c.plat({ x: c.x, y: c.y, z: z + g + 2.25, w: 4.5, d: 4.5, color: 0xf1f3ff, perfect: false, wp: true });
      c.plat({ x: c.x, y: c.y - 0.02, z: cp.z, w: 4.9, d: 4.9, h: 0.84, color: c.col(0), perfect: false }).solid = false;
      sec.spawn.set(cp.x, cp.y + cp.hy, cp.z);
      c.zone("checkpoint", cp.x, cp.y + 2, cp.z, 2.4, 3, 2.4, i);
      flag(c, cp.x - 1.9, cp.y + cp.hy, cp.z - 1.9, c.col(0));
      c.end(cp);
    } else {
      sec.spawn.set(0, 0, 3);
      c.wp(c.x, c.y, c.z - 0.5);
    }
    sec.zStart = sec.spawn.z - 2.5;
    b.fn(c);
    sec.zEnd = c.z;
    secs.push(sec);
    x = c.x; y = c.y; z = c.z;
    // keep x near centre
    if (Math.abs(x) > 6) x *= 0.8;
  }
  // finish
  const fin = mkSec(o.count, "finish", "Финиш", z, y);
  const fc = new Ctx(course, fin, rng, 0, x, y, z);
  const fp = fc.plat({ x, y, z: z + 2 + 6, w: 12, d: 12, color: 0xffd23f, perfect: false, wp: true });
  const fm = fp.mesh as THREE.Mesh;
  const tex = getCheckTex().clone();
  tex.needsUpdate = true;
  tex.repeat.set(3, 3);
  course.track(tex);
  fm.material = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  fin.spawn.set(x, y, fp.z);
  course.finishPos.set(x, y, fp.z - 4);
  fc.zone("finish", x, y + 2, fp.z - 2, 6, 4, 4);
  // arch
  for (const sx of [-1, 1]) fc.plat({ x: x + sx * 5.5, y: y + 5, z: fp.z - 4, w: 0.8, d: 0.8, h: 5, color: 0xff3d7f, perfect: false });
  fc.plat({ x, y: y + 6, z: fp.z - 4, w: 11.8, d: 0.8, h: 1, color: 0xff3d7f, perfect: false });
  const finLabel = t("sec.finish").toUpperCase();
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: textSprite(finLabel, "#ffe14d"), transparent: true, side: THREE.DoubleSide }));
  banner.position.set(x, y + 6.9, fp.z - 4.45);
  banner.rotation.y = Math.PI;
  fc.add(banner);
  course.track(banner.geometry);
  course.finishBanner = banner;
  course.sections = secs;
  secs.push(fin);
  fin.zStart = z;
  fin.zEnd = fp.z + 6;
  start.boxes.forEach((bx) => { bx.section = 0; secs[0].boxes.push(bx); });
  return course;
}

function mkSec(index: number, type: string, name: string, z: number, y: number): Section {
  return { index, type, name, zStart: z, zEnd: z, minY: y, maxY: y, spawn: new THREE.Vector3(0, y, z), boxes: [], zones: [], updaters: [], locals: [], resets: [], wps: [], visible: true };
}

function flag(c: Ctx, x: number, y: number, z: number, color: number) {
  c.deco(getUnitCyl(), 0xffffff, x, y + 1.2, z, 0.06, 2.4, 0.06);
  const f = c.deco(getUnitBox(), color, x + 0.45, y + 2.1, z, 0.9, 0.55, 0.05, 0.3);
  c.course.animated.push({ obj: f, fn: (t) => { f.rotation.y = Math.sin(t * 3 + x) * 0.3; } });
}

export function relocalizeFinish(course: Course) {
  if (!course.finishBanner) return;
  const mat = course.finishBanner.material as THREE.MeshBasicMaterial;
  const old = mat.map;
  mat.map = textSprite(t("sec.finish").toUpperCase(), "#ffe14d");
  mat.needsUpdate = true;
  if (old) old.dispose();
}

export { textSprite };

