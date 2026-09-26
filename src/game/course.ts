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
          if (b.timer <= 0) { b.state = 2; b.timer = b.surface === "vanish" ? 2.5 : 4; b.active = false; }
        } else if (b.state === 2) {
          b.timer -= dt;
          if (b.surface !== "vanish") b.y -= dt * 14;
          if (b.timer <= 0) this.restoreBox(b);
        }
      }
    }
  }

  restoreBox(b: Box) {
    b.state = 0; b.active = true; b.y = b.baseY; b.x = b.baseX; b.z = b.baseZ;
    const m = b.mesh as THREE.Mesh | null;
    if (m && m.material instanceof THREE.MeshLambertMaterial && m.material.transparent) m.material.opacity = 1;
  }

  onLand(b: Box) {
    if (b.state !== 0) return;
    if (b.surface === "vanish") { b.state = 1; b.timer = 0.45; }
    else if (b.surface === "break") { b.state = 1; b.timer = 0.4; }
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
function def(id: string, name: string, minDiff: number, weight: number, fn: (c: Ctx) => void) { B.push({ id, name, minDiff, weight, fn }); }

function spinner(c: Ctx, cx: number, top: number, cz: number, len: number, speed: number, dir: number, height = 0.6, ph = 0) {
  const bar = c.plat({ x: cx, y: top + 0.35 + height, z: cz, w: len * 2, d: 0.5, h: 0.5, color: 0xff3355, hazard: 1, perfect: false });
  c.upd((t) => { bar.rot = ph + t * speed * dir; });
  c.plat({ x: cx, y: top + 1.6, z: cz, w: 1.0, d: 1.0, h: 1.6, cyl: true, color: 0x333a55, perfect: false });
  return bar;
}

function pendulumArm(c: Ctx, x: number, baseY: number, z: number, o: { len: number; amp: number; speed: number; phase: number; bob: number; color: number; laser?: boolean }) {
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

function rocks(c: Ctx, x0: number, x1: number, z0: number, z1: number, floorY: number, n: number) {
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

def("stones", "Прыжки по камням", 0, 3, (c) => {
  const n = c.rng.int(5, 7 + Math.round(c.diff * 2));
  for (let i = 0; i < n; i++) {
    const s = c.rng.range(2.45 - c.diff * 1.0, 3.2 - c.diff * 1.0);
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2.4, 2.4)), y: c.y + c.rng.range(-0.6, 1.0), z: c.z + c.gap() + s / 2, w: s, d: s, color: c.col(i) });
    c.end(b);
  }
});
def("stairsUp", "Лестница в небо", 0, 2, (c) => {
  const n = c.rng.int(6, 9);
  const dx = c.rng.range(-0.8, 0.8);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + dx), y: c.y + c.rng.range(0.8, 1.25), z: c.z + c.rng.range(1.0, 2.0) + 1, w: 3, d: 2, color: c.col(i % 2) });
    c.end(b);
  }
});
def("stairsDown", "Спуск", 0, 1, (c) => {
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y - c.rng.range(1, 1.7), z: c.z + c.gap(0.5) + 1.25, w: 2.5, d: 2.5, color: c.col(i) });
    c.end(b);
  }
});
def("beam", "Узкая балка", 0.1, 2, (c) => {
  let x = c.x, z = c.z + 0.6;
  const segs = c.rng.int(2, 3);
  for (let i = 0; i < segs; i++) {
    const len = c.rng.range(5, 8);
    const ang = i === 0 ? 0 : c.rng.range(-0.5, 0.5);
    const w = 0.66 - c.diff * 0.3;
    const cx = x + Math.sin(ang) * len / 2, cz = z + Math.cos(ang) * len / 2;
    const b = c.p({ x: cx, y: c.y, z: cz, w, d: len, rot: ang, color: c.col(1), perfect: false });
    c.wp(x + Math.sin(ang) * len, c.y, z + Math.cos(ang) * len);
    x += Math.sin(ang) * len; z += Math.cos(ang) * len;
    void b;
    if (i < segs - 1) { const p = c.p({ x, y: c.y, z: z + 0.6, w: 1.4, d: 1.4, color: c.col(0) }); z += 1.2; void p; }
  }
  c.endAt(x, c.y, z);
});
def("tightrope", "Канат", 0.3, 1.5, (c) => {
  const len = c.rng.range(10, 14);
  const rope = c.p({ x: c.x, y: c.y, z: c.z + 1 + len / 2, w: 0.32, d: len, h: 0.3, color: 0xd9a066, perfect: false });
  for (const zz of [rope.z - len / 2, rope.z + len / 2]) {
    c.plat({ x: c.x, y: c.y + 0.8, z: zz, w: 0.3, d: 0.3, h: 3, color: 0x6d4c41, perfect: false });
  }
  c.end(rope);
  const end = c.p({ x: c.x, y: c.y, z: c.z + 1.5, w: 2.5, d: 2.5, color: c.col(0) });
  c.end(end);
});
def("zigzagBeams", "Зигзаг", 0.2, 2, (c) => {
  const n = c.rng.int(4, 6);
  let x = c.x, z = c.z + 0.5;
  for (let i = 0; i < n; i++) {
    const ang = (i % 2 ? -1 : 1) * c.rng.range(0.45, 0.75);
    const len = c.rng.range(4, 5.5);
    const nx = x + Math.sin(ang) * len, nz = z + Math.cos(ang) * len;
    c.plat({ x: (x + nx) / 2, y: c.y, z: (z + nz) / 2, w: 0.75 - c.diff * 0.28, d: len + 0.8, rot: ang, color: c.col(i), perfect: false });
    c.wp(nx, c.y, nz);
    x = nx; z = nz;
  }
  c.endAt(x, c.y, z + 0.3);
});
def("moveX", "Качели-платформы", 0.1, 3, (c) => {
  const n = c.rng.int(4, 5);
  for (let i = 0; i < n; i++) {
    const amp = c.rng.range(2.2, 4), sp = c.rng.range(0.85, 1.35) * (0.9 + c.diff * 0.8), ph = c.rng.range(0, 6.28);
    const b = c.p({ x: c.x, y: c.y + c.rng.range(-0.3, 0.6), z: c.z + c.gap() + 1.5, w: 3, d: 3, color: c.col(i) });
    const bx = b.x;
    c.upd((t) => { b.x = bx + Math.sin(t * sp + ph) * amp; });
    c.end(b); c.x = bx;
  }
});
def("moveY", "Лифты", 0.1, 2, (c) => {
  const n = c.rng.int(4, 5);
  for (let i = 0; i < n; i++) {
    const sp = c.rng.range(0.9, 1.5), ph = c.rng.range(0, 6.28);
    const by = c.y + 1.2;
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: by, z: c.z + c.gap() + 1.5, w: 3, d: 3, color: c.col(i) });
    const baseY = b.y;
    c.upd((t) => { b.y = baseY + Math.sin(t * sp + ph) * 1.6; });
    c.end(b); c.y = by;
  }
});
def("moveZ", "Челноки", 0.2, 2, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const sp = c.rng.range(0.8, 1.3), ph = c.rng.range(0, 6.28);
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1, 1)), y: c.y, z: c.z + 5.5, w: 3, d: 3, color: c.col(i) });
    const bz = b.z;
    c.upd((t) => { b.z = bz + Math.sin(t * sp + ph) * 2.6; });
    c.endAt(b.x, c.y, bz + 4);
  }
  const e = c.p({ x: c.x, y: c.y, z: c.z + 1.5, w: 3, d: 3, color: c.col(0) });
  c.end(e);
});
def("moveCircle", "Карусель", 0.3, 2, (c) => {
  const n = c.rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const r = c.rng.range(2.5, 3.5), sp = c.rng.range(0.6, 1.0) * c.rng.sign(), ph = c.rng.range(0, 6.28);
    const cz = c.z + r + 1.8;
    const cx = c.x;
    for (let k = 0; k < 3; k++) {
      const b = c.plat({ x: cx, y: c.y, z: cz, w: 2.4, d: 2.4, color: c.col(k), wp: k === 0 });
      const a0 = ph + (k * Math.PI * 2) / 3;
      c.upd((t) => { b.x = cx + Math.cos(t * sp + a0) * r; b.z = cz + Math.sin(t * sp + a0) * r; });
    }
    c.deco(getUnitCyl(), 0x333a55, cx, c.y - 0.5, cz, 0.4, 1, 0.4);
    c.endAt(cx, c.y, cz + r + 1.2);
  }
  const e = c.p({ x: c.x, y: c.y, z: c.z + 1.5, w: 3, d: 3, color: c.col(0) });
  c.end(e);
});
def("vanish", "Исчезающие плитки", 0.1, 2, (c) => {
  const n = c.rng.int(6, 9);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2, 2)), y: c.y + c.rng.range(-0.3, 0.5), z: c.z + c.gap(-0.3) + 1.1, w: 2.2, d: 2.2, color: 0x7ae7ff, surface: "vanish" });
    c.end(b);
  }
});
def("breakBridge", "Хрупкий мост", 0.1, 2, (c) => {
  const n = c.rng.int(10, 15);
  let z = c.z + 1.5;
  for (let i = 0; i < n; i++) {
    const b = c.plat({ x: c.x, y: c.y, z: z + 0.6, w: 2.6, d: 1.15, h: 0.4, color: i % 2 ? 0xc49a6c : 0xa47148, surface: "break", perfect: false, wp: i % 3 === 0 });
    z += 1.25;
    void b;
  }
  c.endAt(c.x, c.y, z);
  c.wp(c.x, c.y, z);
});
def("blink", "Мигающие платформы", 0.2, 2, (c) => {
  const n = c.rng.int(5, 7);
  const period = 3.0 - c.diff * 0.95;
  for (let i = 0; i < n; i++) {
    const grp = i % 2;
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y, z: c.z + c.gap() + 1.3, w: 2.6, d: 2.6, color: grp ? 0xff9f1c : 0x2ec4b6, unique: true });
    c.upd((t) => {
      const ph = ((t / period + grp * 0.5) % 1);
      b.active = ph < 0.62;
      const m = b.mesh as THREE.Mesh;
      const mm = m.material as THREE.MeshLambertMaterial;
      mm.opacity = ph > 0.45 && ph < 0.62 ? 0.3 + 0.7 * Math.abs(Math.sin(t * 20)) : 1;
    });
    c.end(b);
  }
});
def("spinDiscs", "Вращающиеся диски", 0.1, 2, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const r = c.rng.range(1.85, 2.6), sp = c.rng.range(1.25, 2.7) * c.rng.sign();
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y + c.rng.range(-0.3, 0.6), z: c.z + c.gap() + r, w: r * 2, d: r * 2, cyl: true, color: c.col(i) });
    const mark = new THREE.Mesh(getUnitBox(), mat(0xffffff));
    mark.scale.set(0.35 / b.hx, 0.1 / (2 * b.hy), 1.6 / b.hx);
    mark.position.set(0, 0.5, 0.5);
    b.mesh!.add(mark);
    c.upd((t) => { b.rot = t * sp; });
    c.end(b);
  }
});
def("sweeper", "Сметатель", 0.2, 2.5, (c) => {
  const r = 5.2;
  const disc = c.p({ x: c.x, y: c.y, z: c.z + 1.5 + r, w: r * 2, d: r * 2, cyl: true, color: c.col(0), perfect: false });
  spinner(c, disc.x, c.y, disc.z, r - 0.2, 1.55 + c.diff * 1.35, c.rng.sign());
  c.wp(disc.x + 3, c.y, disc.z);
  c.end(disc);
});
def("doubleSweeper", "Двойной сметатель", 0.4, 1.5, (c) => {
  const len = 16;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1.2 + len / 2, w: 7, d: len, color: c.col(0), perfect: false });
  spinner(c, c.x, c.y, p.z - 4, 3.3, 2.25, 1, 0.5);
  spinner(c, c.x, c.y, p.z + 4, 3.3, 2.25, -1, 0.5, 1.5);
  c.wp(c.x + 2.5, c.y, p.z - 4); c.wp(c.x - 2.5, c.y, p.z + 4); c.wp(c.x, c.y, p.z + len / 2 - 0.5);
  c.end(p);
});
def("rotBeam", "Вращающийся мост", 0.3, 1.5, (c) => {
  const len = 12;
  const cz = c.z + 1.5 + len / 2;
  const sp = c.rng.range(0.35, 0.6) * c.rng.sign();
  const b = c.plat({ x: c.x, y: c.y, z: cz, w: 1.4, d: len, color: c.col(1), perfect: false });
  c.upd((t) => { b.rot = Math.sin(t * sp) * 0.9; });
  c.wp(c.x, c.y, cz);
  c.endAt(c.x, c.y, cz + len / 2 + 0.5);
  const e = c.p({ x: c.x, y: c.y, z: c.z + 1.5, w: 4, d: 3, color: c.col(0) });
  c.end(e);
});
def("crossSpin", "Крестовина", 0.3, 1.5, (c) => {
  const len = 10;
  const cz = c.z + 1.8 + len / 2;
  const sp = c.rng.range(0.5, 0.9) * c.rng.sign();
  const a = c.plat({ x: c.x, y: c.y, z: cz, w: 1.6, d: len, color: c.col(0), perfect: false });
  const b = c.plat({ x: c.x, y: c.y, z: cz, w: 1.6, d: len, color: c.col(1), perfect: false });
  c.upd((t) => { a.rot = t * sp; b.rot = t * sp + Math.PI / 2; });
  c.wp(c.x, c.y, cz);
  c.endAt(c.x, c.y, cz + len / 2 + 0.3);
  const e = c.p({ x: c.x, y: c.y, z: c.z + 1.8, w: 4, d: 3, color: c.col(2) });
  c.end(e);
});
def("wallrunCorridor", "Бег по стенам", 0.2, 2, (c) => {
  const L = c.rng.range(8, 10.5);
  const z0 = c.z;
  const side = c.rng.sign();
  c.plat({ x: c.x + side * 1.9, y: c.y + 3.5, z: z0 + 0.3 + (L + 0.7) / 2, w: 0.6, d: L + 0.7, h: 7, color: 0x5e60ce, wallrun: true, perfect: false });
  for (let k = 0; k < 3; k++) c.arrow(c.x + side * 1.5, c.y + 1.6, z0 + 1 + k * 3, 0, 0xffffff);
  c.wp(c.x + side * 1.2, c.y + 0.6, z0 + L * 0.5);
  if (c.diff < 0.45) c.p({ x: c.x, y: c.y - 0.8, z: z0 + L / 2, w: 1.2, d: 1.2, color: c.col(1) });
  const e = c.p({ x: c.x + side * 0.6, y: c.y - 0.6, z: z0 + L + 2.55, w: 4.8, d: 4.5, color: c.col(0) });
  c.end(e);
});
def("wallJumpShaft", "Шахта прыжков от стен", 0.3, 1.5, (c) => {
  const hgt = c.rng.int(4, 6) * 1.6;
  const cz = c.z + 3;
  c.plat({ x: c.x - 2, y: c.y + hgt + 1, z: cz, w: 0.6, d: 3.4, h: hgt + 4, color: 0x7209b7, wallrun: true, perfect: false });
  c.plat({ x: c.x + 2, y: c.y + hgt + 1, z: cz, w: 0.6, d: 3.4, h: hgt + 4, color: 0x7209b7, wallrun: true, perfect: false });
  const floor = c.plat({ x: c.x, y: c.y, z: cz, w: 3.4, d: 3.4, color: c.col(0) });
  void floor;
  c.plat({ x: c.x, y: c.y + hgt - 1, z: cz + 1.95, w: 4.6, d: 0.5, h: hgt + 3, color: 0x560bad, perfect: false });
  for (let k = 1; k * 1.6 < hgt; k++) {
    const sx = k % 2 ? -1 : 1;
    c.p({ x: c.x + sx * 1.15, y: c.y + k * 1.6, z: cz, w: 1.0, d: 1.2, h: 0.3, color: 0xf72585 });
  }
  const top = c.p({ x: c.x, y: c.y + hgt, z: cz + 3.7, w: 4, d: 3, color: c.col(1) });
  c.end(top);
});
def("alternateWalls", "Стена-стена", 0.4, 1.5, (c) => {
  const n = c.rng.int(3, 4);
  let z = c.z + 1;
  let side = c.rng.sign();
  for (let i = 0; i < n; i++) {
    c.plat({ x: c.x + side * 1.8, y: c.y + 3, z: z + 2.4, w: 0.6, d: 4.8, h: 6, color: i % 2 ? 0x4361ee : 0x4cc9f0, wallrun: true, perfect: false });
    c.wp(c.x + side * 1.1, c.y + 0.8, z + 2.4);
    z += 5.2;
    side = -side;
  }
  if (c.diff < 0.5) c.p({ x: c.x, y: c.y - 1.2, z: c.z + (z - c.z) / 2, w: 1.4, d: 1.4, color: c.col(1) });
  const e = c.p({ x: c.x, y: c.y - 0.5, z: z + 1.6, w: 3.8, d: 4.4, color: c.col(0) });
  c.end(e);
});
def("rampUp", "Горка вверх", 0, 1.5, (c) => {
  const L = c.rng.range(7, 10), dy = c.rng.range(2.5, 4);
  const r = c.plat({ x: c.x, y: c.y + dy / 2, z: c.z + 1 + L / 2, w: 3, d: L, slope: dy / L, color: c.col(0), perfect: false });
  c.wp(c.x, c.y, c.z + 1.2); c.wp(c.x, c.y + dy, c.z + 1 + L);
  void r;
  const e = c.p({ x: c.x, y: c.y + dy, z: c.z + 1 + L + 1.5, w: 3, d: 3, color: c.col(1) });
  c.end(e);
});
def("slideDown", "Скоростной спуск", 0, 1.5, (c) => {
  const L = c.rng.range(10, 14), dy = c.rng.range(3, 5);
  c.plat({ x: c.x, y: c.y - dy / 2, z: c.z + 0.5 + L / 2, w: 3, d: L, slope: -dy / L, color: 0x90e0ef, surface: "conveyor", convZ: 7, perfect: false });
  c.wp(c.x, c.y, c.z + 0.6); c.wp(c.x, c.y - dy, c.z + L);
  const e = c.p({ x: c.x, y: c.y - dy - 0.5, z: c.z + L + 4.5, w: 3.5, d: 3.5, color: c.col(1) });
  c.end(e);
});
def("trampolines", "Батуты", 0, 2, (c) => {
  const n = c.rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.2, 1.2)), y: c.y - 1, z: c.z + c.rng.range(2.8, 3.4) + 1.4, w: 2.8, d: 2.8, cyl: true, color: 0x3cff9e, surface: "bounce", bounce: 14 });
    c.end(b); c.y += 1;
  }
  const e = c.p({ x: c.x, y: c.y + 1.1, z: c.z + 2.6 + 1.6, w: 3.4, d: 3.4, color: c.col(0) });
  c.end(e);
});
def("mushrooms", "Грибная роща", 0.1, 2, (c) => {
  const n = c.rng.int(3, 5);
  let y = c.y;
  for (let i = 0; i < n; i++) {
    y += c.rng.range(0.5, 1.6);
    const r = c.rng.range(1.2, 1.7);
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2.5, 2.5)), y, z: c.z + c.rng.range(2.5, 3.8) + r, w: r * 2, d: r * 2, cyl: true, h: 0.7, color: 0xff3b5c, surface: "bounce", bounce: 15 });
    c.deco(getUnitCyl(), 0xfff1d6, b.x, y - 2.5, b.z, 0.4, 4, 0.4);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + i;
      c.deco(getUnitCyl(), 0xffffff, b.x + Math.cos(a) * r * 0.55, y + 0.02, b.z + Math.sin(a) * r * 0.55, 0.22, 0.05, 0.22);
    }
    c.end(b);
  }
  const e = c.p({ x: c.x, y: y + 1.5, z: c.z + 3.2 + 1.5, w: 3, d: 3, color: c.col(1) });
  c.end(e);
});
def("windSide", "Боковой ветер", 0.2, 2, (c) => {
  const L = c.rng.range(12, 16);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 1.8 - c.diff * 0.4, d: L, color: c.col(0), perfect: false });
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.3);
  const zn = c.zone("wind", c.x, c.y + 2, p.z, 6, 4, L / 2);
  const streaks: THREE.Mesh[] = [];
  for (let k = 0; k < 8; k++) streaks.push(c.deco(getUnitBox(), 0xffffff, c.x, c.y + 0.5 + (k % 3), p.z - L / 2 + (k * L) / 8, 1.2, 0.05, 0.05, 1) as THREE.Mesh);
  c.upd((t) => {
    const f = Math.sin(t * 1.1) * 16;
    zn.a = f;
    streaks.forEach((s, k) => { s.position.x = c.x + (((t * 6 * Math.sign(f || 1) + k * 1.3) % 8) - 4); s.visible = Math.abs(f) > 4; });
  });
  c.end(p);
});
def("updraft", "Восходящий поток", 0.2, 1.5, (c) => {
  const dy = c.rng.range(5, 7);
  const cz = c.z + 3.5;
  c.zone("wind", c.x, c.y + dy / 2 + 1, cz, 1.8, dy / 2 + 3, 1.8, 0, 58, 0);
  const col = new THREE.Mesh(getUnitCyl(), new THREE.MeshBasicMaterial({ color: 0xaaf0ff, transparent: true, opacity: 0.25, depthWrite: false }));
  col.scale.set(1.8, dy + 6, 1.8);
  col.position.set(c.x, c.y + dy / 2 + 1, cz);
  c.add(col);
  c.course.animated.push({ obj: col, fn: (t) => { col.rotation.y = t * 2; (col.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 5) * 0.06; } });
  c.wp(c.x, c.y + dy + 1.5, cz);
  const e = c.p({ x: c.x, y: c.y + dy, z: cz + 4, w: 3.4, d: 3, color: c.col(0) });
  c.end(e);
});
def("conveyorBack", "Встречные конвейеры", 0.1, 2, (c) => {
  const n = c.rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const L = c.rng.range(6, 9);
    const b = c.plat({ x: c.x, y: c.y, z: c.z + c.gap(-0.3) + L / 2, w: 3, d: L, surface: "conveyor", convZ: -(4 + c.diff * 3.2), color: 0xffffff, perfect: false });
    c.wp(c.x, c.y, b.z - L / 2 + 0.5); c.wp(c.x, c.y, b.z + L / 2 - 0.5);
    c.end(b);
  }
});
def("conveyorSide", "Боковые ленты", 0.2, 1.5, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.x, y: c.y, z: c.z + c.gap(-0.4) + 1.5, w: 3.5, d: 3, surface: "conveyor", convX: (i % 2 ? 1 : -1) * (4 + c.diff * 2), color: 0xffffff, perfect: false });
    c.end(b);
  }
});
def("icePath", "Ледяная тропа", 0.1, 2, (c) => {
  const n = c.rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + (i % 2 ? 2 : -2)), y: c.y + c.rng.range(-0.2, 0.4), z: c.z + c.gap(-0.2) + 2, w: 2.6, d: 4, color: 0xbde0fe, surface: "ice" });
    c.end(b);
  }
});
def("stickyMud", "Липкая грязь", 0, 1.5, (c) => {
  const n = c.rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1, 1)), y: c.y, z: c.z + c.rng.range(1.0, 1.5) + 2, w: 3, d: 4, color: 0x7f5539, surface: "sticky" });
    c.end(b);
  }
});
def("lowGrav", "Лунная гравитация", 0.1, 1.5, (c) => {
  const n = c.rng.int(3, 4);
  const z0 = c.z;
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2.5, 2.5)), y: c.y + c.rng.range(0.5, 2.5), z: c.z + c.rng.range(5, 7.5) + 1.3, w: 2.6, d: 2.6, color: 0xb388eb, emissive: 0.25 });
    c.end(b);
  }
  c.zone("grav", c.x, c.y, (z0 + c.z) / 2, 12, 20, (c.z - z0) / 2 + 1, 0.35);
  for (let k = 0; k < 10; k++) c.deco(getUnitBox(), 0xffffff, c.x + c.rng.range(-8, 8), c.y + c.rng.range(-4, 6), z0 + c.rng.range(0, c.z - z0), 0.12, 0.12, 0.12, 1);
});
def("gravityFlip", "Перевёрнутый мир", 0.3, 1.5, (c) => {
  const top = c.y + 6;
  const z0 = c.z + 1;
  const n = c.rng.int(3, 4);
  c.p({ x: c.x, y: c.y - 0.5, z: z0 + 0.8, w: 3, d: 1.6, color: 0xff00aa, surface: "bounce", bounce: 12, emissive: 0.4 });
  let z = z0 - 0.6;
  let last: Box | null = null;
  for (let i = 0; i < n; i++) {
    const d = i === 0 ? 4 : c.rng.range(2.4, 3.2);
    const b = c.plat({ x: i === 0 ? c.x : c.clampX(c.x + c.rng.range(-1.2, 1.2)), y: top + 0.8, z: z + d / 2, w: i === 0 ? 4 : 2.8, d, color: 0x9b5de5, perfect: false });
    c.wp(b.x, top, b.z);
    last = b;
    z = b.z + b.hz + (i < n - 1 ? c.rng.range(1.2, 2.0) : 0);
  }
  const zEnd = last ? last.z + last.hz : z;
  c.zone("flip", c.x, c.y + 4, (z0 + 0.4 + zEnd) / 2, 7, 7, (zEnd - (z0 + 0.4)) / 2);
  for (let k = 0; k < 5; k++) c.deco(getUnitBox(), 0xff00aa, c.x + c.rng.range(-3, 3), c.y + c.rng.range(0, 6), z0 + c.rng.range(0, zEnd - z0), 0.2, 0.2, 0.2, 1);
  const e = c.p({ x: c.x, y: c.y - 1, z: zEnd + 2.6, w: 5, d: 5.5, color: c.col(0) });
  c.end(e);
});
def("portals", "Порталы", 0.1, 1.5, (c) => {
  const pad = c.plat({ x: c.x, y: c.y, z: c.z + 1.5 + 3, w: 8, d: 6, color: c.col(0), wp: true });
  const correct = c.rng.int(0, 2);
  const farZ = pad.z + 3 + c.rng.range(12, 18);
  const farY = c.y + c.rng.range(1, 3);
  const spawn = c.sec.spawn;
  for (let k = 0; k < 3; k++) {
    const px = c.x + (k - 1) * 2.6;
    const pz = pad.z + 2.2;
    const ring = new THREE.Mesh(ensureShade(new THREE.TorusGeometry(0.9, 0.16, 8, 24)), mat(0xb14aed, 0.8));
    ring.position.set(px, c.y + 1.2, pz);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: k === correct ? 0x55ffcc : 0xff66cc, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    disc.position.copy(ring.position);
    c.add(ring); c.add(disc);
    c.course.track(ring.geometry); c.course.track(disc.geometry);
    c.course.animated.push({ obj: ring, fn: (t) => { ring.rotation.z = t * 2 + k; disc.scale.setScalar(0.9 + Math.sin(t * 4 + k) * 0.08); } });
    if (k === correct) {
      c.wp(px, c.y, pz - 0.2);
      c.zone("portal", px, c.y + 1.2, pz, 0.8, 1.1, 0.35, c.x, farY + 0.1, farZ);
    } else {
      c.zone("portal", px, c.y + 1.2, pz, 0.8, 1.1, 0.35, spawn.x, spawn.y + 0.1, spawn.z);
    }
  }
  const e = c.plat({ x: c.x, y: farY, z: farZ, w: 4, d: 4, color: c.col(1) });
  c.wp(c.x, farY, farZ, undefined, true);
  c.end(e);
});
def("spiral", "Спираль", 0.2, 1.5, (c) => {
  const n = c.rng.int(7, 10);
  const r = 3.4;
  const cx = c.x, cz = c.z + 1 + r + 0.5;
  const dir = c.rng.sign();
  c.plat({ x: cx, y: c.y + n * 0.95 + 1, z: cz, w: 2.4, d: 2.4, h: n * 0.95 + 6, cyl: true, color: 0x3a3f55, perfect: false });
  let a = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: cx + Math.cos(a) * r, y: c.y + (i + 1) * 0.95, z: cz + Math.sin(a) * r, w: 2, d: 2, rot: -a, color: c.col(i) });
    void b;
    a += dir * 0.85;
  }
  const endY = c.y + n * 0.95;
  const e = c.p({ x: cx, y: endY + 0.3, z: cz + r + 2.2, w: 3, d: 2.5, color: c.col(1) });
  c.end(e);
});
def("tower", "Башня-лесенка", 0.2, 1.5, (c) => {
  const n = c.rng.int(6, 8);
  const cx = c.x, cz = c.z + 3.5;
  c.plat({ x: cx, y: c.y + n * 1.1 - 0.5, z: cz, w: 2.6, d: 2.6, h: n * 1.1 + 4, color: 0x4a4e69, perfect: false });
  const spots = [[-2.1, 0], [0, 2.1], [2.1, 0], [0, -2.1]];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const [ox, oz] = spots[k % 4];
    c.p({ x: cx + ox, y: c.y + (i + 1) * 1.1, z: cz + oz, w: 1.5, d: 1.5, color: c.col(i) });
    k += c.rng.chance(0.7) ? 1 : 3;
  }
  const e = c.p({ x: cx, y: c.y + n * 1.1 + 0.5, z: cz + 4.3, w: 3, d: 3, color: c.col(1) });
  c.end(e);
});
def("elevatorShaft", "Шахта лифтов", 0.2, 1.5, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const sp = c.rng.range(1.0, 1.6), ph = c.rng.range(0, 6.28);
    const b = c.p({ x: c.clampX(c.x + (i % 2 ? 1.5 : -1.5)), y: c.y + 1.5, z: c.z + c.gap(-0.5) + 1.3, w: 2.6, d: 2.6, color: c.col(i), emissive: 0.1 });
    const by = b.y;
    c.upd((t) => { b.y = by + (Math.sin(t * sp + ph) + 1) * 1.5; });
    c.end(b); c.y += 1.5;
  }
  const e = c.p({ x: c.x, y: c.y + 2, z: c.z + 2.4, w: 3, d: 3, color: c.col(1) });
  c.end(e);
});
def("timerBridge", "Мост на время", 0.2, 1.5, (c) => {
  const n = c.rng.int(12, 17);
  const tiles: Box[] = [];
  let z = c.z + 1.2;
  for (let i = 0; i < n; i++) {
    const b = c.plat({ x: c.x, y: c.y, z: z + 0.65, w: 2.8, d: 1.25, h: 0.45, color: i % 2 ? 0xffd166 : 0xef476f, surface: "timed", perfect: false, wp: i % 4 === 0, unique: true });
    tiles.push(b);
    z += 1.35;
  }
  let startT = -1;
  const secIdx = c.sec.index;
  const course = c.course;
  c.zone("trigger", c.x, c.y + 1, c.z + 1.8, 1.6, 1.5, 0.6, 0, 0, 0, () => {
    if (startT < 0) { startT = course.localTime; course.onMsg(t("pop.bridgeRun")); }
  });
  void secIdx;
  c.local((lt, dt) => {
    if (startT < 0) return;
    const el = lt - startT - 0.8;
    tiles.forEach((b, i) => {
      const fallAt = i * (1.35 / (7.4 + c.diff * 1.6));
      const m = b.mesh as THREE.Mesh;
      const mm = m.material as THREE.MeshLambertMaterial;
      if (el > fallAt - 0.6 && b.active) mm.emissive.setHex(0xff0000), (mm.emissiveIntensity = 0.5 + 0.5 * Math.sin(lt * 30));
      if (el > fallAt && b.active) { b.active = false; b.state = 2; }
      if (b.state === 2) b.y -= dt * 12;
    });
  });
  c.onReset(() => {
    startT = -1;
    tiles.forEach((b) => { b.active = true; b.state = 0; b.y = b.baseY; const mm = (b.mesh as THREE.Mesh).material as THREE.MeshLambertMaterial; mm.emissive.setHex(0); });
  });
  c.endAt(c.x, c.y, z);
  c.wp(c.x, c.y, z);
});
def("crushers", "Сжимающиеся стены", 0.3, 2, (c) => {
  const L = c.rng.range(12, 16);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: c.col(0), perfect: false });
  const n = Math.floor(L / 4);
  for (let i = 0; i < n; i++) {
    const zz = p.z - L / 2 + 2.5 + i * 4;
    const sp = c.rng.range(1.7, 2.7), ph = c.rng.range(0, 6.28);
    const l = c.plat({ x: c.x - 3.5, y: c.y + 1.6, z: zz, w: 2.5, d: 1.4, h: 1.6, color: 0x6c757d, hazard: 1 });
    const r = c.plat({ x: c.x + 3.5, y: c.y + 1.6, z: zz, w: 2.5, d: 1.4, h: 1.6, color: 0x6c757d, hazard: 1 });
    c.upd((t) => {
      const s = Math.max(0, Math.sin(t * sp + ph));
      const off = 3.8 - s * 2.55;
      l.x = c.x - off; r.x = c.x + off;
    });
  }
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});
def("fallingRocks", "Камнепад", 0.2, 2, (c) => {
  const L = c.rng.range(14, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 6, d: L, color: 0xa98467, perfect: false });
  rocks(c, c.x - 2.5, c.x + 2.5, p.z - L / 2 + 1, p.z + L / 2 - 1, c.y, 5 + Math.round(c.diff * 5));
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});
def("fog", "Туман", 0.1, 1.5, (c) => {
  const z0 = c.z;
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2, 2)), y: c.y + c.rng.range(-0.4, 0.8), z: c.z + c.gap() + 1.3, w: 2.6, d: 2.6, color: 0x80ffdb, emissive: 0.6 });
    c.end(b);
  }
  c.zone("fog", c.x, c.y, (z0 + c.z) / 2, 20, 25, (c.z - z0) / 2 + 1, 0.075);
});
def("splitPaths", "Развилка", 0.1, 2, (c) => {
  const L = 14;
  const z0 = c.z + 1;
  // left hard: narrow beams
  const lx = c.x - 3.2, rx = c.x + 3.2;
  c.plat({ x: lx, y: c.y, z: z0 + L / 2, w: 0.45, d: L, color: 0xff595e, perfect: false });
  // right easy: stones with moving
  for (let i = 0; i < 4; i++) {
    const b = c.p({ x: rx, y: c.y, z: z0 + 1.5 + i * 3.7, w: 2.2, d: 2.2, color: 0x8ac926 });
    const bx = b.x, ph = i * 1.3;
    c.upd((t) => { b.x = bx + Math.sin(t * 1.2 + ph) * 0.8; });
  }
  const e = c.p({ x: c.x, y: c.y, z: z0 + L + 1.5, w: 9, d: 3, color: c.col(0) });
  c.end(e);
});
def("pillars", "Столбы", 0.2, 2, (c) => {
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const r = c.rng.range(0.72, 1.0) - c.diff * 0.2;
    const y = c.y + c.rng.range(-0.8, 1.0);
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2, 2)), y, z: c.z + c.gap(-0.2) + r, w: r * 2, d: r * 2, h: 14, cyl: true, color: c.col(i) });
    c.end(b);
  }
});
def("longJumps", "Длинные прыжки", 0.2, 1.5, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1, 1)), y: c.y - c.rng.range(0, 0.6), z: c.z + c.rng.range(3.4, 4.3) + 2, w: 4, d: 4, color: c.col(i) });
    c.end(b);
  }
});
def("hurdles", "Барьеры", 0, 2, (c) => {
  const L = c.rng.range(15, 20);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4, d: L, color: c.col(0), perfect: false });
  for (let zz = p.z - L / 2 + 3; zz < p.z + L / 2 - 1.5; zz += c.rng.range(2.6, 3.6)) {
    const hh = c.rng.chance(0.3) ? 1.3 : 0.75;
    c.plat({ x: c.x, y: c.y + hh, z: zz, w: 4, d: 0.4, h: hh, color: 0xffffff, perfect: false });
    c.plat({ x: c.x, y: c.y + hh + 0.01, z: zz, w: 4.02, d: 0.42, h: 0.18, color: 0xff3355, perfect: false, noMesh: false, wp: false }).solid = false;
    c.wp(c.x, c.y + hh + 0.6, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});
def("punchers", "Кулаки", 0.3, 1.5, (c) => {
  const L = c.rng.range(14, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.5, d: L, color: c.col(0), perfect: false });
  for (let zz = p.z - L / 2 + 2.5; zz < p.z + L / 2 - 1.5; zz += 3.2) {
    const side = c.rng.sign();
    const sp = c.rng.range(1.8, 3.0), ph = c.rng.range(0, 6.28);
    const f = c.plat({ x: c.x + side * 3, y: c.y + 1.3, z: zz, w: 2.2, d: 1.2, h: 1.1, color: 0xff006e, hazard: 1 });
    c.upd((t) => { const s = Math.pow(Math.max(0, Math.sin(t * sp + ph)), 3); f.x = c.x + side * (3.2 - s * 2.4); });
  }
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});
def("lasers", "Лазеры", 0.3, 2, (c) => {
  const L = c.rng.range(14, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4, d: L, color: 0x2b2d42, perfect: false });
  for (let zz = p.z - L / 2 + 2.5; zz < p.z + L / 2 - 1.5; zz += c.rng.range(2.8, 3.8)) {
    const blink = c.rng.chance(0.5);
    const lz = c.plat({ x: c.x, y: c.y + (blink ? 1.5 : 0.55), z: zz, w: 4, d: 0.12, h: blink ? 1.5 : 0.1, color: 0xff1e3c, hazard: 2, emissive: 1, unique: true });
    for (const sx of [-1, 1]) c.plat({ x: c.x + sx * 2.1, y: c.y + 1.6, z: zz, w: 0.3, d: 0.3, h: 1.6, color: 0x555555, perfect: false });
    if (blink) {
      const per = c.rng.range(2.4, 3.2), ph = c.rng.range(0, per);
      c.upd((t) => { const f = ((t + ph) % per) / per; lz.active = f < 0.45; (lz.mesh as THREE.Mesh).visible = lz.active || (f > 0.9 && Math.sin(t * 40) > 0); });
    }
    c.wp(c.x, c.y + 0.7, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});
def("bumpers", "Бамперы", 0.2, 1.5, (c) => {
  const r = 5.5;
  const disc = c.p({ x: c.x, y: c.y, z: c.z + 1.5 + r, w: r * 2, d: r * 2, cyl: true, color: c.col(0), perfect: false });
  for (let k = 0; k < 3; k++) {
    const bm = c.plat({ x: disc.x, y: c.y + 1, z: disc.z, w: 1.6, d: 1.6, h: 1, cyl: true, color: 0xffbe0b, hazard: 1 });
    const rr = 1.5 + k * 1.3, sp = (1.2 - k * 0.2) * (k % 2 ? 1 : -1);
    c.upd((t) => { bm.x = disc.x + Math.cos(t * sp + k * 2) * rr; bm.z = disc.z + Math.sin(t * sp + k * 2) * rr; });
  }
  c.end(disc);
});
def("lilyPads", "Кувшинки", 0.2, 1.5, (c) => {
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const r = c.rng.range(0.9, 1.3);
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2, 2)), y: c.y, z: c.z + c.gap(-0.2) + r, w: r * 2, d: r * 2, h: 0.3, cyl: true, color: 0x52b788 });
    const by = b.y, bx = b.x, ph = c.rng.range(0, 6.28);
    c.upd((t) => { b.y = by + Math.sin(t * 2.4 + ph) * 0.4; b.x = bx + Math.sin(t * (0.8 + c.diff * 0.6) + ph) * (0.9 + c.diff * 0.7); });
    c.end(b); c.x = bx;
  }
});
def("checkerFake", "Фальшивые плитки", 0.2, 2, (c) => {
  const rows = c.rng.int(4, 6);
  let z = c.z + 1;
  for (let r = 0; r < rows; r++) {
    const safe = c.rng.int(0, 2);
    const safe2 = c.rng.chance(0.32 - c.diff * 0.3) ? (safe + 1) % 3 : safe;
    for (let k = 0; k < 3; k++) {
      const isSafe = k === safe || k === safe2;
      c.plat({ x: c.x + (k - 1) * 2.6, y: c.y, z: z + 1.1, w: 2.1, d: 2.1, color: 0xe9c46a, surface: isSafe ? "normal" : "fake", unique: true, wp: false, perfect: isSafe });
      if (k === safe) c.wp(c.x + (k - 1) * 2.6, c.y, z + 1.1);
    }
    z += 3.1;
  }
  c.endAt(c.x, c.y, z - 0.9);
});
def("drops", "Обрывы", 0, 1.5, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2, 2)), y: c.y - c.rng.range(2.2, 3.2), z: c.z + c.rng.range(2.5, 3.5) + 1.6, w: 3.2, d: 3.2, color: c.col(i) });
    c.end(b);
  }
});
def("pendulum", "Маятники", 0.3, 2, (c) => {
  const L = c.rng.range(14, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 2.2, d: L, color: c.col(0), perfect: false });
  for (let zz = p.z - L / 2 + 2.5; zz < p.z + L / 2 - 1.5; zz += 3.4) {
    pendulumArm(c, c.x, c.y, zz, {
      len: 3.6, amp: c.rng.range(0.62, 0.8), speed: c.rng.range(1.5, 2.4), phase: c.rng.range(0, 6.28),
      bob: 1.3, color: 0xe63946,
    });
  }
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});
def("zigzagJumps", "Змейка", 0, 2, (c) => {
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + (i % 2 ? 3 : -3) * c.rng.range(0.7, 1)), y: c.y + c.rng.range(0, 0.5), z: c.z + c.rng.range(0.6, 1.6) + 1, w: 2.2, d: 2, color: c.col(i) });
    c.end(b);
  }
});
def("comboTrampWall", "Батут + стена", 0.4, 1, (c) => {
  const t = c.p({ x: c.x, y: c.y - 0.6, z: c.z + 2.5, w: 2.2, d: 2.2, cyl: true, color: 0x3cff9e, surface: "bounce", bounce: 15 });
  c.plat({ x: c.x + 1.9, y: c.y + 5, z: t.z + 6, w: 0.6, d: 9, h: 7, color: 0x5e60ce, wallrun: true, perfect: false });
  c.wp(c.x + 1.2, c.y + 3, t.z + 6);
  const e = c.p({ x: c.x, y: c.y + 2, z: t.z + 12.5, w: 3.4, d: 3, color: c.col(0) });
  c.end(e);
});
def("comboIceSweeper", "Лёд + сметатель", 0.4, 1, (c) => {
  const r = 5;
  const disc = c.p({ x: c.x, y: c.y, z: c.z + 1.5 + r, w: r * 2, d: r * 2, cyl: true, color: 0xcaf0f8, surface: "ice", perfect: false });
  spinner(c, disc.x, c.y, disc.z, r - 0.2, 1.3, c.rng.sign());
  c.end(disc);
});
def("comboMoveVanish", "Движущиеся призраки", 0.4, 1, (c) => {
  const n = c.rng.int(4, 5);
  for (let i = 0; i < n; i++) {
    const amp = c.rng.range(1.5, 2.5), sp = c.rng.range(0.9, 1.3), ph = c.rng.range(0, 6.28);
    const b = c.p({ x: c.x, y: c.y, z: c.z + c.gap() + 1.3, w: 2.6, d: 2.6, color: 0x7ae7ff, surface: "vanish" });
    const bx = b.x;
    c.upd((t) => { b.x = bx + Math.sin(t * sp + ph) * amp; if (b.state === 0) b.baseX = b.x; });
    c.end(b); c.x = bx;
  }
});
def("comboConveyorRocks", "Лента под камнепадом", 0.5, 1, (c) => {
  const L = 14;
  const b = c.plat({ x: c.x, y: c.y, z: c.z + 1.2 + L / 2, w: 5, d: L, surface: "conveyor", convZ: -3.5, color: 0xffffff, perfect: false });
  rocks(c, c.x - 2, c.x + 2, b.z - L / 2 + 1, b.z + L / 2 - 1, c.y, 5);
  c.wp(c.x, c.y, b.z - L / 2 + 0.5); c.wp(c.x, c.y, b.z + L / 2 - 0.5);
  c.end(b);
});
def("comboWindBeams", "Балки на ветру", 0.5, 1, (c) => {
  const z0 = c.z;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const len = c.rng.range(4, 6);
    const b = c.plat({ x: c.x, y: c.y, z: c.z + c.gap(-0.5) + len / 2, w: 0.9, d: len, color: c.col(i), perfect: false });
    c.wp(c.x, c.y, b.z - len / 2 + 0.3); c.wp(c.x, c.y, b.z + len / 2 - 0.3);
    c.end(b);
  }
  const zn = c.zone("wind", c.x, c.y + 2, (z0 + c.z) / 2, 6, 5, (c.z - z0) / 2);
  c.upd((t) => { zn.a = Math.sin(t * 1.4) * 10; });
});
def("comboBlinkMove", "Мигающие челноки", 0.5, 1, (c) => {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const grp = i % 2;
    const sp = c.rng.range(0.9, 1.3), ph = c.rng.range(0, 6.28);
    const b = c.p({ x: c.x, y: c.y, z: c.z + c.gap() + 1.4, w: 2.8, d: 2.8, color: grp ? 0xff9f1c : 0x2ec4b6, unique: true });
    const bx = b.x;
    c.upd((t) => {
      b.x = bx + Math.sin(t * sp + ph) * 1.8;
      const f = (t / 3.4 + grp * 0.5) % 1;
      b.active = f < 0.65;
      ((b.mesh as THREE.Mesh).material as THREE.MeshLambertMaterial).opacity = f > 0.48 && f < 0.65 ? 0.3 + 0.7 * Math.abs(Math.sin(t * 20)) : 1;
    });
    c.end(b); c.x = bx;
  }
});


// ---------------- laser toolkit ----------------
function lbeam(c: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, rot = 0) {
  return c.plat({ x, y: y + h / 2, z, w, d, h, rot, color: 0xff1e3c, hazard: 2, emissive: 1, unique: true, perfect: false, wp: false });
}
function emitter(c: Ctx, x: number, y: number, z: number, s = 0.32) {
  return c.deco(getUnitBox(), 0x2b2d42, x, y, z, s, s, s);
}
function blinker(c: Ctx, b: Box, period: number, onFrac: number, phase: number) {
  const m = b.mesh as THREE.Mesh;
  const mm = m.material as THREE.MeshLambertMaterial;
  c.upd((t) => {
    const f = ((t + phase) % period) / period;
    b.active = f < onFrac;
    m.visible = b.active || f > onFrac + (1 - onFrac) * 0.65;
    mm.opacity = b.active ? 1 : 0.45;
  });
}
function laserFloor(c: Ctx, x: number, y: number, z: number, w: number, d: number) {
  const f = c.plat({ x, y: y + 0.2, z, w, d, h: 0.4, color: 0xff1e3c, hazard: 2, emissive: 0.8, unique: true, perfect: false, wp: false });
  const m = f.mesh as THREE.Mesh;
  (m.material as THREE.MeshLambertMaterial).opacity = 0.75;
  c.upd((t) => { ((f.mesh as THREE.Mesh).material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.sin(t * 6) * 0.3; });
  return f;
}

def("laserSlide", "Скользящие лазеры", 0.25, 2, (c) => {
  const L = c.rng.range(15, 19);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.4, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.6;
  let i = 0;
  while (zz < p.z + L / 2 - 1.6) {
    const sp = c.rng.range(1.1, 1.8) + c.diff * 0.7, ph = c.rng.range(0, 6.28), amp = 1.9;
    if (i % 3 === 2) {
      const bar = lbeam(c, c.x, c.y + 0.35, zz, 5.4, 0.16, 0.16);
      c.upd((t) => { bar.y = c.y + 0.38 + Math.sin(t * sp * 0.7 + ph) * 0.22; });
    } else {
      const post = lbeam(c, c.x, c.y, zz, 0.18, 0.18, 2.6);
      emitter(c, c.x, c.y + 2.75, zz);
      c.upd((t) => { post.x = c.x + Math.sin(t * sp + ph) * amp; });
    }
    c.wp(c.x, c.y, zz);
    zz += c.rng.range(2.6, 3.4);
    i++;
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserSpin", "Лазерный ротор", 0.3, 2, (c) => {
  const r = 5.4;
  const disc = c.p({ x: c.x, y: c.y, z: c.z + 1.6 + r, w: r * 2, d: r * 2, cyl: true, color: 0x2b2d42, perfect: false });
  c.plat({ x: disc.x, y: c.y + 1.4, z: disc.z, w: 1, d: 1, h: 1.4, cyl: true, color: 0x3a3f55, perfect: false, wp: false });
  for (let k = 0; k < 2; k++) {
    const arm = lbeam(c, disc.x, c.y + 0.28, disc.z, r * 1.9, 0.16, 0.16);
    const sp = (1.3 + c.diff * 1.1) * (k ? -0.75 : 1), ph = k * 1.7;
    c.upd((t) => { arm.rot = t * sp + ph; });
  }
  c.wp(disc.x + 2.6, c.y, disc.z);
  c.end(disc);
});

def("laserGrid", "Лазерная решётка", 0.3, 2, (c) => {
  const L = c.rng.range(14, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.6, d: L, color: 0x2b2d42, perfect: false });
  const gates = 3;
  for (let g = 0; g < gates; g++) {
    const zz = p.z - L / 2 + 3 + g * ((L - 4) / gates);
    const bars: Box[] = [];
    for (let k = 0; k < 5; k++) bars.push(lbeam(c, c.x + (k - 2) * 1.25, c.y, zz, 0.16, 0.16, 2.8));
    emitter(c, c.x, c.y + 2.95, zz, 0.5);
    const per = 1.5 - c.diff * 0.45, dir = c.rng.sign(), off = c.rng.int(0, 4);
    c.upd((t) => {
      const gap = ((Math.floor(t / per) * dir + off) % 5 + 5) % 5;
      bars.forEach((b, k) => {
        b.active = k !== gap;
        const m = b.mesh as THREE.Mesh;
        m.visible = b.active;
      });
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserTunnel", "Лазерный тоннель", 0.4, 1.5, (c) => {
  const L = 15;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.2, d: L, color: 0x24263a, perfect: false });
  for (let g = 0; g < 4; g++) {
    const zz = p.z - L / 2 + 2.6 + g * 3.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 8, 20), mat(0x4361ee, 0.3));
    ring.position.set(c.x, c.y + 1.4, zz);
    c.add(ring);
    c.course.track(ring.geometry);
    const blades: Box[] = [];
    for (let k = 0; k < 3; k++) blades.push(lbeam(c, c.x, c.y + 1.4, zz, 3.4, 0.14, 0.14));
    const sp = (1.0 + c.diff * 0.9) * (g % 2 ? -1 : 1), ph = g * 0.9;
    c.upd((t) => {
      blades.forEach((b, k) => {
        const a = t * sp + ph + (k * Math.PI * 2) / 3;
        b.x = c.x + Math.cos(a) * 0.95;
        b.y = c.y + 1.4 + Math.sin(a) * 0.95;
        b.rot = 0;
        const m = b.mesh as THREE.Mesh;
        m.rotation.z = a;
      });
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserWave", "Лазерная волна", 0.25, 2, (c) => {
  const L = c.rng.range(15, 19);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.6, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.4;
  let i = 0;
  while (zz < p.z + L / 2 - 1.4) {
    const bar = lbeam(c, c.x, c.y + 0.4, zz, 4.6, 0.16, 0.16);
    emitter(c, c.x - 2.4, c.y + 1.2, zz, 0.36);
    emitter(c, c.x + 2.4, c.y + 1.2, zz, 0.36);
    const sp = 1.5 + c.diff * 0.9, ph = i * 0.9;
    c.upd((t) => { bar.y = c.y + 1.25 + Math.sin(t * sp + ph) * 1.15; });
    c.wp(c.x, c.y, zz);
    zz += c.rng.range(2.3, 3.0);
    i++;
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserWall", "Лазерная стена", 0.35, 1.5, (c) => {
  const L = 22;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: 0x2b2d42, perfect: false });
  const z0 = p.z - L / 2, z1 = p.z + L / 2;
  const wall = lbeam(c, c.x, c.y, z0, 5, 0.3, 3.4);
  const glow = c.deco(getUnitBox(), 0xff6b81, c.x, c.y + 1.7, z0, 5.2, 3.6, 0.05, 0.8);
  const speed = 4.6 + c.diff * 1.6;
  const period = (z1 - z0 + 9) / speed;
  c.upd((t) => {
    const f = (t % period) / period;
    const zz = z0 - 6 + f * (z1 - z0 + 9);
    wall.z = zz;
    glow.position.z = zz;
    const on = zz > z0 - 3;
    wall.active = on;
    (wall.mesh as THREE.Mesh).visible = on;
    glow.visible = on;
  });
  for (let k = 0; k < 4; k++) c.wp(c.x, c.y, z0 + 3 + k * ((L - 4) / 4));
  c.wp(c.x, c.y, z1 - 0.6);
  c.end(p);
});

def("laserStairs", "Лазерная лестница", 0.3, 1.5, (c) => {
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.2, 1.2)), y: c.y + c.rng.range(0.9, 1.3), z: c.z + c.rng.range(1.6, 2.3) + 1.6, w: 3.2, d: 3.2, color: 0x3a3f55 });
    const bar = lbeam(c, b.x, b.y + b.hy + 0.35, b.z, 3.4, 0.16, 0.16);
    blinker(c, bar, 2.2 - c.diff * 0.5, 0.55, c.rng.range(0, 2));
    c.end(b);
  }
  const e = c.p({ x: c.x, y: c.y + 0.6, z: c.z + 3.4, w: 4, d: 3.4, color: c.col(0) });
  c.end(e);
});

def("laserPendulum", "Лазерный маятник", 0.4, 1.5, (c) => {
  const L = c.rng.range(14, 17);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 2.6, d: L, color: 0x2b2d42, perfect: false });
  for (let zz = p.z - L / 2 + 2.6; zz < p.z + L / 2 - 1.5; zz += 3.3) {
    pendulumArm(c, c.x, c.y, zz, { len: 3.2, amp: c.rng.range(0.6, 0.78), speed: c.rng.range(1.6, 2.5), phase: c.rng.range(0, 6.28), bob: 0.5, color: 0xff1e3c, laser: true });
  }
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserCross", "Лазерный крест", 0.45, 1.5, (c) => {
  const L = 13;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1.4 + L / 2, w: 6, d: L, color: 0x24263a, perfect: false });
  for (let k = 0; k < 2; k++) {
    const cz = p.z - 3 + k * 6;
    c.plat({ x: c.x, y: c.y + 1.1, z: cz, w: 0.8, d: 0.8, h: 1.1, cyl: true, color: 0x3a3f55, perfect: false, wp: false });
    for (let j = 0; j < 2; j++) {
      const arm = lbeam(c, c.x, c.y + 0.3, cz, 6.4, 0.15, 0.15);
      const sp = (1.4 + c.diff * 1.2) * (k ? -1 : 1), ph = j * Math.PI / 2;
      c.upd((t) => { arm.rot = t * sp + ph; });
    }
    c.wp(c.x + 2.4, c.y, cz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserMaze", "Лазерный лабиринт", 0.3, 1.5, (c) => {
  const L = c.rng.range(16, 20);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.6, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.4;
  let side = c.rng.sign();
  while (zz < p.z + L / 2 - 1.6) {
    const kind = c.rng.next();
    if (kind < 0.45) {
      lbeam(c, c.x + side * 1.5, c.y, zz, 4.4, 0.15, 2.8);
      emitter(c, c.x + side * 1.5, c.y + 2.95, zz, 0.4);
      c.wp(c.x - side * 2.1, c.y, zz);
    } else if (kind < 0.75) {
      lbeam(c, c.x, c.y + 0.32, zz, 5.6, 0.15, 0.15);
      c.wp(c.x, c.y, zz);
    } else {
      lbeam(c, c.x - 2.3, c.y, zz, 1.4, 0.15, 2.8);
      lbeam(c, c.x + 2.3, c.y, zz, 1.4, 0.15, 2.8);
      c.wp(c.x, c.y, zz);
    }
    side = -side;
    zz += c.rng.range(2.1, 2.9);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserVanish", "Лазеры + призрачные плитки", 0.45, 1.5, (c) => {
  const n = c.rng.int(5, 7);
  const z0 = c.z;
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.8, 1.8)), y: c.y, z: c.z + c.rng.range(1.5, 2.1) + 1.2, w: 2.3, d: 2.3, color: 0x7ae7ff, surface: "vanish" });
    c.end(b);
  }
  laserFloor(c, c.x, c.y - 3.2, (z0 + c.z) / 2, 11, c.z - z0 + 2);
  const sweep = lbeam(c, c.x, c.y + 1.9, (z0 + c.z) / 2, 11, 0.16, 0.16);
  c.upd((t) => { sweep.z = (z0 + c.z) / 2 + Math.sin(t * (0.9 + c.diff * 0.6)) * ((c.z - z0) / 2 - 1); });
  const e = c.p({ x: c.x, y: c.y, z: c.z + 2.6, w: 4, d: 3.4, color: c.col(0) });
  c.end(e);
});

def("laserElevator", "Лазерный лифт", 0.4, 1.5, (c) => {
  const hgt = c.rng.range(5.5, 7.5);
  const cz = c.z + 4;
  const lift = c.p({ x: c.x, y: c.y + 0.6, z: cz, w: 3.4, d: 3.4, color: 0x3a3f55 });
  const baseY = lift.y;
  const sp = 0.55 + c.diff * 0.25;
  c.upd((t) => { lift.y = baseY + (1 - Math.cos(t * sp)) * 0.5 * hgt; });
  for (let k = 0; k < 3; k++) {
    const yy = c.y + 1.6 + k * (hgt / 2.4);
    const arm = lbeam(c, c.x, yy, cz, 6.6, 0.15, 0.15);
    const asp = (0.9 + c.diff * 0.8) * (k % 2 ? -1 : 1);
    c.upd((t) => { arm.rot = t * asp + k; });
    emitter(c, c.x, yy + 0.2, cz, 0.3);
  }
  c.wp(c.x, c.y + hgt, cz);
  const e = c.p({ x: c.x, y: c.y + hgt, z: cz + 4.2, w: 4, d: 4, color: c.col(0) });
  c.end(e);
});

def("laserGauntlet", "Лазерное испытание", 0.6, 1, (c) => {
  const L = 20;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.4, d: L, color: 0x1f2133, perfect: false });
  const z0 = p.z - L / 2;
  for (let k = 0; k < 3; k++) {
    const zz = z0 + 2.6 + k * 2.2;
    const post = lbeam(c, c.x, c.y, zz, 0.18, 0.18, 2.6);
    const sp = 1.8 + k * 0.4 + c.diff;
    c.upd((t) => { post.x = c.x + Math.sin(t * sp + k) * 1.3; });
  }
  for (let k = 0; k < 3; k++) {
    const zz = z0 + 9.5 + k * 1.9;
    const bar = lbeam(c, c.x, c.y + 0.32, zz, 3.4, 0.15, 0.15);
    blinker(c, bar, 1.5, 0.5, k * 0.5);
  }
  const cz = z0 + 17;
  c.plat({ x: c.x, y: c.y + 1.2, z: cz, w: 0.7, d: 0.7, h: 1.2, cyl: true, color: 0x3a3f55, perfect: false, wp: false });
  for (let j = 0; j < 2; j++) {
    const arm = lbeam(c, c.x, c.y + 0.3, cz, 3.8, 0.15, 0.15);
    c.upd((t) => { arm.rot = t * (2.1 + c.diff) + (j * Math.PI) / 2; });
  }
  for (let k = 0; k < 5; k++) c.wp(c.x, c.y, z0 + 2 + k * 3.6);
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});


// ---------------- 13 new sections ----------------
def("laserZigzag", "Лазерный зигзаг", 0.35, 1.4, (c) => {
  const L = c.rng.range(16, 20);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.2, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.2, side = 1;
  while (zz < p.z + L / 2 - 1.5) {
    const post = lbeam(c, c.x + side * 1.6, c.y, zz, 0.16, 0.16, 2.7);
    emitter(c, c.x + side * 1.6, c.y + 2.85, zz);
    const sp = 1.4 + c.diff * 0.8, ph = zz * 0.3;
    c.upd((t) => { post.x = c.x + side * 1.6 + Math.sin(t * sp + ph) * 0.9; });
    c.wp(c.x - side * 1.9, c.y, zz);
    side = -side;
    zz += c.rng.range(2.2, 2.8);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserCage", "Лазерная клетка", 0.4, 1.3, (c) => {
  const L = 14;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.8, d: L, color: 0x24263a, perfect: false });
  for (let g = 0; g < 3; g++) {
    const zz = p.z - L / 2 + 3 + g * 3.5;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const bar = lbeam(c, c.x, c.y + 1.2, zz, 4.2, 0.12, 0.12);
      const sp = (1.1 + c.diff) * (g % 2 ? -1 : 1);
      c.upd((t) => {
        const ang = t * sp + a;
        bar.x = c.x + Math.cos(ang) * 1.4;
        bar.z = zz + Math.sin(ang) * 0.4;
        bar.rot = ang;
      });
    }
    emitter(c, c.x, c.y + 2.6, zz, 0.4);
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserRain", "Лазерный дождь", 0.3, 1.5, (c) => {
  const L = c.rng.range(15, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: 0x2b2d42, perfect: false });
  for (let i = 0; i < 8; i++) {
    const xx = c.x + c.rng.range(-2.2, 2.2);
    const zz = p.z - L / 2 + 2 + i * ((L - 3) / 8);
    const beam = lbeam(c, xx, c.y + 4, zz, 0.14, 0.14, 0.8);
    const per = 1.8 - c.diff * 0.4, ph = c.rng.range(0, per);
    c.upd((t) => {
      const f = ((t + ph) % per) / per;
      beam.y = c.y + 4.2 - f * 4.5;
      beam.active = f < 0.85;
      (beam.mesh as THREE.Mesh).visible = beam.active;
    });
    if (i % 2 === 0) c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserDoor", "Лазерные двери", 0.25, 1.6, (c) => {
  const L = 16;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.4, d: L, color: 0x2b2d42, perfect: false });
  for (let g = 0; g < 4; g++) {
    const zz = p.z - L / 2 + 2.8 + g * 3.2;
    const left = lbeam(c, c.x - 1.5, c.y, zz, 2.2, 0.16, 2.6);
    const right = lbeam(c, c.x + 1.5, c.y, zz, 2.2, 0.16, 2.6);
    emitter(c, c.x - 2.6, c.y + 2.7, zz);
    emitter(c, c.x + 2.6, c.y + 2.7, zz);
    const per = 2.2 - c.diff * 0.5, ph = g * 0.55;
    c.upd((t) => {
      const open = Math.sin(t * (Math.PI * 2 / per) + ph) > 0.15;
      left.active = !open; right.active = !open;
      (left.mesh as THREE.Mesh).visible = !open;
      (right.mesh as THREE.Mesh).visible = !open;
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserHelix", "Лазерная спираль", 0.45, 1.2, (c) => {
  const L = 15;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.2, d: L, color: 0x1f2133, perfect: false });
  for (let k = 0; k < 6; k++) {
    const zz = p.z - L / 2 + 2 + k * 2.1;
    const arm = lbeam(c, c.x, c.y + 1.1, zz, 3.8, 0.14, 0.14);
    const sp = 1.6 + c.diff * 0.9;
    c.upd((t) => {
      const a = t * sp + k * 0.9;
      arm.x = c.x + Math.cos(a) * 1.1;
      arm.y = c.y + 1.1 + Math.sin(a * 0.5) * 0.5;
      arm.rot = a;
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("bounceLasers", "Батуты и лазеры", 0.35, 1.4, (c) => {
  const n = c.rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y + (i % 2) * 0.8, z: c.z + c.rng.range(2.0, 2.8) + 1.5, w: 2.8, d: 2.8, color: 0xff7eb9, surface: "bounce", bounce: 14 });
    if (i < n - 1) {
      const bar = lbeam(c, b.x, b.y + 2.2, b.z + 1.4, 3.2, 0.14, 0.14);
      blinker(c, bar, 1.8 - c.diff * 0.35, 0.5, i * 0.4);
    }
    c.end(b);
  }
  const e = c.p({ x: c.x, y: c.y + 0.5, z: c.z + 3, w: 4, d: 3.4, color: c.col(0) });
  c.end(e);
});

def("iceLaser", "Лёд и лазеры", 0.3, 1.5, (c) => {
  const L = c.rng.range(15, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.2, d: L, color: 0xa8e0ff, surface: "ice", perfect: false });
  let zz = p.z - L / 2 + 2.5;
  let i = 0;
  while (zz < p.z + L / 2 - 1.5) {
    const post = lbeam(c, c.x, c.y, zz, 0.16, 0.16, 2.4);
    emitter(c, c.x, c.y + 2.6, zz);
    const amp = 2.0, sp = 1.2 + c.diff * 0.7, ph = i;
    c.upd((t) => { post.x = c.x + Math.sin(t * sp + ph) * amp; });
    c.wp(c.x, c.y, zz);
    zz += c.rng.range(2.5, 3.2);
    i++;
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("conveyorLaser", "Конвейер + лазеры", 0.35, 1.3, (c) => {
  const L = 16;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.6, d: L, color: 0x5a5f7a, surface: "conveyor", convZ: 2.4 + c.diff * 2, perfect: false });
  for (let g = 0; g < 4; g++) {
    const zz = p.z - L / 2 + 2.5 + g * 3.2;
    const bar = lbeam(c, c.x, c.y + 0.35, zz, 4.6, 0.14, 0.14);
    blinker(c, bar, 1.6 - c.diff * 0.3, 0.45, g * 0.5);
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("towerLaser", "Башня с лазерами", 0.5, 1.1, (c) => {
  const hgt = c.rng.range(6, 8);
  let yy = c.y;
  for (let i = 0; i < 5; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.2, 1.2)), y: yy + c.rng.range(1.0, 1.4), z: c.z + c.rng.range(1.8, 2.4) + 1.5, w: 2.6, d: 2.6, color: 0x3a3f55 });
    if (i % 2 === 1) {
      const arm = lbeam(c, b.x, b.y + 0.4, b.z, 4.5, 0.14, 0.14);
      c.upd((t) => { arm.rot = t * (1.3 + c.diff) * (i % 4 === 1 ? 1 : -1); });
    }
    yy = b.y;
    c.end(b);
  }
  const e = c.p({ x: c.x, y: yy + 0.8, z: c.z + 3, w: 4, d: 3.5, color: c.col(0) });
  c.end(e);
});

def("portalLasers", "Порталы и лазеры", 0.4, 1.2, (c) => {
  const a = c.p({ x: c.x - 2, y: c.y, z: c.z + 3, w: 3, d: 3, color: 0x7b5cff });
  const b = c.p({ x: c.x + 2, y: c.y + 2.5, z: c.z + 10, w: 3, d: 3, color: 0xff5fc8 });
  c.zone("portal", a.x, a.y + 1.5, a.z, 1.2, 1.5, 1.2, b.x, b.y + b.hy + 0.2, b.z);
  c.zone("portal", b.x, b.y + 1.5, b.z, 1.2, 1.5, 1.2, a.x, a.y + a.hy + 0.2, a.z);
  const bar = lbeam(c, c.x, c.y + 1.5, (a.z + b.z) / 2, 6, 0.14, 0.14);
  c.upd((t) => { bar.rot = t * (1.5 + c.diff); });
  c.end(a); c.end(b);
  const e = c.p({ x: c.x, y: b.y, z: b.z + 4, w: 4, d: 3.5, color: c.col(0) });
  c.end(e);
});

def("narrowLasers", "Узкий лазерный коридор", 0.45, 1.3, (c) => {
  const L = 18;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 2.4, d: L, color: 0x24263a, perfect: false });
  for (let i = 0; i < 7; i++) {
    const zz = p.z - L / 2 + 2 + i * 2.2;
    if (i % 2 === 0) {
      const bar = lbeam(c, c.x, c.y + 0.3, zz, 2.4, 0.12, 0.12);
      blinker(c, bar, 1.4 - c.diff * 0.25, 0.4, i * 0.35);
    } else {
      const post = lbeam(c, c.x, c.y, zz, 0.12, 0.12, 2.2);
      c.upd((t) => { post.x = c.x + Math.sin(t * (2 + c.diff) + i) * 0.7; });
    }
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("fanLasers", "Вентиляторы и лазеры", 0.4, 1.2, (c) => {
  const L = 15;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: 0x2b2d42, perfect: false });
  for (let g = 0; g < 3; g++) {
    const zz = p.z - L / 2 + 3.5 + g * 4;
    c.zone("wind", c.x, c.y + 2, zz, 2.5, 3, 2, 0, 0, c.rng.sign() * (3 + c.diff));
    const arm = lbeam(c, c.x, c.y + 0.35, zz, 5, 0.14, 0.14);
    c.upd((t) => { arm.rot = t * (1.2 + c.diff * 0.8) * (g % 2 ? -1 : 1); });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("megaGauntlet", "Мега-гаунтлет", 0.65, 0.9, (c) => {
  const L = 22;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.6, d: L, color: 0x1a1c2e, perfect: false });
  const z0 = p.z - L / 2;
  for (let k = 0; k < 4; k++) {
    const zz = z0 + 2.2 + k * 2;
    const post = lbeam(c, c.x, c.y, zz, 0.16, 0.16, 2.5);
    c.upd((t) => { post.x = c.x + Math.sin(t * (2 + k * 0.3 + c.diff) + k) * 1.2; });
  }
  for (let k = 0; k < 3; k++) {
    const zz = z0 + 11 + k * 2;
    const bar = lbeam(c, c.x, c.y + 0.3, zz, 3.6, 0.14, 0.14);
    blinker(c, bar, 1.3, 0.45, k * 0.4);
  }
  const cz = z0 + 18.5;
  for (let j = 0; j < 3; j++) {
    const arm = lbeam(c, c.x, c.y + 0.35, cz, 3.5, 0.13, 0.13);
    c.upd((t) => { arm.rot = t * (2.4 + c.diff) + (j * Math.PI * 2) / 3; });
  }
  for (let k = 0; k < 6; k++) c.wp(c.x, c.y, z0 + 2 + k * 3.2);
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

export const SECTION_TYPES = B.map((b) => b.id);
export const SECTION_COUNT = B.length;

export const TIME_ATTACK_LIST = [
  "stones", "sweeper", "wallrunCorridor", "vanish", "laserSlide", "trampolines", "laserGrid", "moveX",
  "timerBridge", "gravityFlip", "laserPendulum", "wallJumpShaft", "checkerFake", "laserWall", "fallingRocks",
  "laserZigzag", "laserDoor", "bounceLasers", "narrowLasers", "megaGauntlet",
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

