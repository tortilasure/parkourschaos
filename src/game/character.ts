import * as THREE from "three";
import { SHOP } from "./data";

const geoCache: Record<string, THREE.BufferGeometry> = {};
function geo(k: string, f: () => THREE.BufferGeometry) { return (geoCache[k] ??= f()); }
const G = {
  cap: () => geo("cap", () => new THREE.CapsuleGeometry(0.4, 0.55, 5, 14)),
  capSlim: () => geo("capSlim", () => new THREE.CapsuleGeometry(0.33, 0.7, 5, 12)),
  box: () => geo("box", () => new THREE.BoxGeometry(1, 1, 1)),
  sphere: () => geo("sphere", () => new THREE.SphereGeometry(0.5, 14, 11)),
  cone: () => geo("cone", () => new THREE.ConeGeometry(0.5, 1, 12)),
  cone4: () => geo("cone4", () => new THREE.ConeGeometry(0.5, 1, 4)),
  cyl: () => geo("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14)),
  torus: () => geo("torus", () => new THREE.TorusGeometry(0.25, 0.04, 8, 18)),
  limb: () => geo("limb", () => new THREE.SphereGeometry(0.13, 10, 8)),
  eye: () => geo("eyeG", () => new THREE.SphereGeometry(0.1, 10, 8)),
  pupil: () => geo("pupG", () => new THREE.SphereGeometry(0.055, 8, 6)),
};

const mats = new Map<string, THREE.MeshLambertMaterial>();
function lam(color: string | number, emissive = 0, opacity = 1) {
  const k = `${color}_${emissive}_${opacity}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color, emissive: emissive ? color : 0, emissiveIntensity: emissive,
      transparent: opacity < 1, opacity, depthWrite: opacity > 0.75,
    });
    mats.set(k, m);
  }
  return m;
}
function darker(c: string, k = 0.7) { return new THREE.Color(c).multiplyScalar(k).getStyle(); }
function lighter(c: string, k = 0.35) { return new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getStyle(); }

export type Emote = "" | "win" | "dance" | "wave" | "flop" | "cheer";

export interface AnimInput {
  speed: number; grounded: boolean; vy: number; stunned: boolean; wall: boolean; up: number;
}

export function nameSprite(name: string, color = "#ffffff") {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "800 34px system-ui, sans-serif";
  const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = "rgba(20,14,50,0.6)";
  g.beginPath();
  g.roundRect(128 - w / 2, 8, w, 48, 20);
  g.fill();
  g.fillStyle = color;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(name, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.2, 0.55, 1);
  s.renderOrder = 10;
  return s;
}

export class Character {
  root = new THREE.Group();
  pivot = new THREE.Group();
  body = new THREE.Group();
  parts = new THREE.Group();
  bodyMesh!: THREE.Mesh;
  footL!: THREE.Mesh; footR!: THREE.Mesh;
  handL!: THREE.Mesh; handR!: THREE.Mesh;
  hat = new THREE.Group();
  extras: { obj: THREE.Object3D; fn: (t: number, a: AnimInput) => void }[] = [];
  tag: THREE.Sprite | null = null;
  phase = 0;
  squash = 1;
  squashV = 0;
  emote: Emote = "";
  emoteT = 0;
  flipT = 0;
  stunT = 0;
  hatId = "";
  skinId = "";
  color = "#ff4d6d";
  propeller: THREE.Object3D | null = null;
  floats = false;

  constructor(color: string, hatId: string, skinId = "skin_bean", name?: string, tagColor?: string) {
    this.root.add(this.pivot);
    this.pivot.add(this.body);
    this.body.add(this.parts);
    this.hat.position.y = 1.45;
    this.body.add(this.hat);
    this.color = color;
    this.buildSkin(skinId);
    this.setHat(hatId);
    if (name) {
      this.tag = nameSprite(name, tagColor);
      this.tag.position.y = 2.25;
      this.root.add(this.tag);
    }
  }

  setColor(color: string) {
    if (color === this.color) return;
    this.color = color;
    this.buildSkin(this.skinId, true);
  }
  setSkin(id: string) { if (id !== this.skinId) this.buildSkin(id); }

  private add(g: THREE.BufferGeometry, color: string | number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, em = 0, op = 1) {
    const m = new THREE.Mesh(g, lam(color, em, op));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = op > 0.6;
    this.parts.add(m);
    return m;
  }

  private eyes(y: number, z: number, size = 1, dark = "#1b1440", spread = 0.14) {
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(G.eye(), lam("#ffffff"));
      e.position.set(sx * spread, y, z);
      e.scale.set(size, size * 1.2, size * 0.7);
      const p = new THREE.Mesh(G.pupil(), lam(dark));
      p.position.set(0, 0, 0.07);
      e.add(p);
      this.parts.add(e);
    }
  }

  private buildSkin(id: string, keepHat = false) {
    void keepHat;
    this.skinId = id;
    this.parts.clear();
    this.extras = [];
    this.propeller = null;
    this.floats = false;
    const c = this.color;
    const item = SHOP.find((s) => s.id === id);
    const acc = item?.color ?? "#ffffff";
    const acc2 = item?.color2 ?? "#ffffff";

    const feetColor = darker(c, 0.68);
    let bodyY = 0.78;
    let handY = 0.72, handX = 0.5;

    switch (id) {
      case "skin_blocky": {
        this.bodyMesh = this.add(G.box(), c, 0, 0.75, 0, 0.78, 0.95, 0.66);
        this.add(G.box(), "#ffffff", 0, 0.62, 0.34, 0.42, 0.42, 0.02);
        this.eyes(1.02, 0.35);
        break;
      }
      case "skin_slime": {
        this.bodyMesh = this.add(G.sphere(), c, 0, 0.62, 0, 1.5, 1.35, 1.4, 0.12, 0.72);
        this.add(G.sphere(), lighter(c, 0.6), -0.16, 0.85, 0.2, 0.3, 0.25, 0.25, 0.3, 0.8);
        this.eyes(0.78, 0.4, 1.1);
        this.extras.push({ obj: this.bodyMesh, fn: (t) => { this.bodyMesh.scale.set(1.5 + Math.sin(t * 6) * 0.07, 1.35 - Math.sin(t * 6) * 0.07, 1.4 + Math.cos(t * 5) * 0.05); } });
        break;
      }
      case "skin_robot": {
        this.bodyMesh = this.add(G.box(), acc, 0, 0.8, 0, 0.72, 0.9, 0.6);
        this.add(G.box(), c, 0, 0.55, 0.31, 0.5, 0.3, 0.04, 0.2);
        this.add(G.box(), "#141425", 0, 1.02, 0.31, 0.56, 0.18, 0.05);
        for (const sx of [-1, 1]) this.add(G.sphere(), acc2, sx * 0.14, 1.02, 0.33, 0.14, 0.14, 0.14, 1);
        const ant = this.add(G.cyl(), acc, 0, 1.4, 0, 0.05, 0.4, 0.05);
        const ball = this.add(G.sphere(), acc2, 0, 1.62, 0, 0.18, 0.18, 0.18, 1);
        this.extras.push({ obj: ball, fn: (t) => { ball.position.y = 1.62 + Math.sin(t * 4) * 0.04; (ball.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.sin(t * 8) * 0.4; } });
        void ant;
        break;
      }
      case "skin_ninja": {
        this.bodyMesh = this.add(G.cap(), acc, 0, 0.78, 0);
        this.add(G.box(), c, 0, 0.98, 0.02, 0.83, 0.2, 0.83, 0.1);
        this.add(G.box(), acc2, -0.42, 0.98, -0.3, 0.12, 0.1, 0.5);
        this.eyes(1.06, 0.33, 0.9);
        this.add(G.box(), "#20222f", 0, 0.86, 0.3, 0.5, 0.3, 0.12);
        break;
      }
      case "skin_dino": {
        this.bodyMesh = this.add(G.cap(), c, 0, 0.78, 0);
        this.add(G.sphere(), lighter(c, 0.45), 0, 0.6, 0.26, 0.55, 0.75, 0.35);
        this.add(G.box(), c, 0, 0.95, 0.36, 0.42, 0.26, 0.3);
        for (let i = 0; i < 4; i++) this.add(G.cone4(), acc2, 0, 0.55 + i * 0.28, -0.3 + i * 0.03, 0.26, 0.4, 0.26);
        const tail = this.add(G.cone(), c, 0, 0.3, -0.5, 0.35, 0.8, 0.35);
        tail.rotation.x = -1.9;
        this.extras.push({ obj: tail, fn: (t, a) => { tail.rotation.z = Math.sin(t * (a.grounded ? 7 : 3)) * 0.25; } });
        this.eyes(1.12, 0.3, 0.95, "#1b1440", 0.16);
        break;
      }
      case "skin_alien": {
        this.bodyMesh = this.add(G.capSlim(), acc, 0, 0.8, 0, 1, 1, 1, 0.12);
        this.add(G.sphere(), acc, 0, 1.12, 0, 0.9, 0.78, 0.8, 0.12);
        for (const sx of [-1, 1]) {
          const e = this.add(G.sphere(), acc2, sx * 0.16, 1.14, 0.25, 0.22, 0.3, 0.16, 0);
          e.rotation.z = -sx * 0.25;
        }
        this.add(G.cyl(), c, 0, 1.5, 0, 0.04, 0.3, 0.04);
        const orb = this.add(G.sphere(), c, 0, 1.66, 0, 0.14, 0.14, 0.14, 1);
        this.extras.push({ obj: orb, fn: (t) => { orb.position.y = 1.66 + Math.sin(t * 3) * 0.05; } });
        handY = 0.8;
        break;
      }
      case "skin_knight": {
        this.bodyMesh = this.add(G.box(), acc, 0, 0.78, 0, 0.8, 0.92, 0.65);
        this.add(G.box(), c, 0, 0.72, 0.34, 0.4, 0.5, 0.03, 0.15);
        this.add(G.box(), acc, 0, 1.2, 0, 0.62, 0.42, 0.6);
        this.add(G.box(), "#141425", 0, 1.2, 0.3, 0.44, 0.1, 0.06);
        this.add(G.cone4(), acc2, 0, 1.55, 0, 0.3, 0.5, 0.3, 0.25);
        for (const sx of [-1, 1]) this.add(G.sphere(), acc, sx * 0.44, 1.0, 0, 0.26, 0.2, 0.24);
        break;
      }
      case "skin_ghost": {
        this.bodyMesh = this.add(G.cap(), "#f4f2ff", 0, 0.95, 0, 1.05, 1.05, 1.05, 0.25, 0.55);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const tip = this.add(G.cone(), "#f4f2ff", Math.cos(a) * 0.25, 0.42, Math.sin(a) * 0.25, 0.34, 0.4, 0.34, 0.2, 0.5);
          tip.rotation.x = Math.PI;
          this.extras.push({ obj: tip, fn: (t) => { tip.position.y = 0.42 + Math.sin(t * 5 + i) * 0.07; } });
        }
        this.eyes(1.14, 0.34, 1.1, "#3a2a7a");
        this.floats = true;
        bodyY = 0.95;
        break;
      }
      default: {
        this.bodyMesh = this.add(G.cap(), c, 0, 0.78, 0);
        const belly = this.add(G.sphere(), "#ffffff", 0, 0.62, 0.25, 0.6, 0.66, 0.3);
        void belly;
        this.eyes(1.08, 0.33);
        break;
      }
    }
    void bodyY;

    this.footL = this.add(G.limb(), feetColor, -0.17, 0.09, 0, 1, 0.7, 1.4);
    this.footR = this.add(G.limb(), feetColor, 0.17, 0.09, 0, 1, 0.7, 1.4);
    this.handL = this.add(G.limb(), id === "skin_robot" || id === "skin_knight" ? acc : c, -handX, handY, 0, 0.8, 0.8, 0.8);
    this.handR = this.add(G.limb(), id === "skin_robot" || id === "skin_knight" ? acc : c, handX, handY, 0, 0.8, 0.8, 0.8);
    if (this.floats) { this.footL.visible = false; this.footR.visible = false; }
  }

  setHat(id: string) {
    if (id === this.hatId) return;
    this.hatId = id;
    this.hat.clear();
    this.propeller = null;
    const it = SHOP.find((s) => s.id === id);
    if (!it || id === "hat_none") return;
    const c1 = it.color, c2 = it.color2 ?? it.color;
    const add = (g: THREE.BufferGeometry, c: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, em = 0) => {
      const m = new THREE.Mesh(g, lam(c, em));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      m.castShadow = true;
      this.hat.add(m);
      return m;
    };
    const dome = () => geo("dome", () => new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    switch (id) {
      case "hat_party": {
        const m = add(G.cone(), c1, 0, 0.2, 0, 0.44, 0.55, 0.44);
        m.rotation.z = 0.15;
        add(G.sphere(), c2, 0.04, 0.5, 0, 0.16, 0.16, 0.16);
        break;
      }
      case "hat_cap":
        add(dome(), c1, 0, -0.12, 0);
        add(G.box(), c1, 0, -0.1, 0.3, 0.5, 0.05, 0.35);
        break;
      case "hat_ears":
        for (const sx of [-1, 1]) { const e = add(G.cone4(), c1, sx * 0.2, 0.0, 0, 0.26, 0.3, 0.26); e.rotation.z = -sx * 0.3; }
        break;
      case "hat_shades":
        for (const sx of [-1, 1]) add(G.box(), "#111111", sx * 0.14, -0.37, 0.4, 0.22, 0.12, 0.05);
        add(G.box(), "#111111", 0, -0.35, 0.4, 0.5, 0.03, 0.04);
        break;
      case "hat_top":
        add(G.cyl(), c1, 0, 0.18, 0, 0.44, 0.45, 0.44);
        add(G.cyl(), c1, 0, -0.04, 0, 0.72, 0.04, 0.72);
        add(G.cyl(), c2, 0, 0.02, 0, 0.45, 0.08, 0.45);
        break;
      case "hat_propeller": {
        add(dome(), c1, 0, -0.12, 0);
        const p = new THREE.Group();
        p.position.y = 0.28;
        const blade = new THREE.Mesh(G.box(), lam(c2));
        blade.scale.set(0.7, 0.03, 0.1);
        p.add(blade);
        this.hat.add(p);
        this.propeller = p;
        break;
      }
      case "hat_horns":
        for (const sx of [-1, 1]) { const h = add(G.cone(), c1, sx * 0.2, 0.0, 0, 0.22, 0.33, 0.22, 0.3); h.rotation.z = -sx * 0.45; }
        break;
      case "hat_halo": {
        const t = add(G.torus(), c1, 0, 0.3, 0, 1, 1, 1, 0.9);
        t.rotation.x = Math.PI / 2;
        break;
      }
      case "hat_crown":
        add(G.cyl(), c1, 0, 0.0, 0, 0.52, 0.2, 0.52, 0.3);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          add(G.cone4(), c1, Math.cos(a) * 0.22, 0.15, Math.sin(a) * 0.22, 0.26, 0.3, 0.26, 0.3);
        }
        add(G.sphere(), c2, 0, 0.02, 0.26, 0.16, 0.16, 0.16, 0.5);
        break;
    }
  }

  land(impact: number) { this.squashV = -Math.min(6, impact * 0.35); }
  jump() { this.squashV = 5; }
  playEmote(e: Emote) { this.emote = e; this.emoteT = 0; }

  update(dt: number, a: AnimInput) {
    const t = performance.now() / 1000;
    this.squashV += (1 - this.squash) * 180 * dt;
    this.squashV *= Math.exp(-11 * dt);
    this.squash += this.squashV * dt;
    const s = Math.max(0.6, Math.min(1.4, this.squash));
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));

    const targetFlip = a.up < 0 ? 1 : 0;
    this.flipT += (targetFlip - this.flipT) * Math.min(1, dt * 10);
    this.pivot.rotation.z = this.flipT * Math.PI;

    if (this.propeller) this.propeller.rotation.y += dt * (a.grounded ? 6 : 25);
    for (const e of this.extras) e.fn(t, a);

    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, this.floats ? 0.18 + Math.sin(t * 2.2) * 0.07 : 0, 0);

    if (a.stunned) {
      this.stunT += dt;
      const k = Math.min(1, this.stunT * 6);
      this.body.rotation.x = -k * Math.PI / 2;
      this.body.position.y += 0.4 * k;
      this.body.position.z = -0.3 * k;
      this.handL.position.set(-0.55, 0.72 + Math.sin(t * 20) * 0.1, 0);
      this.handR.position.set(0.55, 0.72 - Math.sin(t * 20) * 0.1, 0);
      return;
    }
    this.stunT = 0;

    if (this.emote) {
      this.emoteT += dt;
      const et = this.emoteT;
      switch (this.emote) {
        case "win":
          this.body.position.y += Math.abs(Math.sin(et * 6)) * 0.8;
          this.body.rotation.y = et * 8;
          this.handL.position.set(-0.45, 1.3 + Math.sin(et * 12) * 0.1, 0);
          this.handR.position.set(0.45, 1.3 - Math.sin(et * 12) * 0.1, 0);
          break;
        case "cheer":
          this.body.position.y += Math.abs(Math.sin(et * 7)) * 0.4;
          this.handL.position.set(-0.45, 1.25, 0.1);
          this.handR.position.set(0.45, 1.25, 0.1);
          break;
        case "dance":
          this.body.rotation.z = Math.sin(et * 8) * 0.3;
          this.body.position.x = Math.sin(et * 8) * 0.15;
          this.handL.position.set(-0.55, 0.9 + Math.sin(et * 8) * 0.35, 0.1);
          this.handR.position.set(0.55, 0.9 - Math.sin(et * 8) * 0.35, 0.1);
          this.footL.position.y = 0.09 + Math.max(0, Math.sin(et * 8)) * 0.2;
          this.footR.position.y = 0.09 + Math.max(0, -Math.sin(et * 8)) * 0.2;
          break;
        case "wave":
          this.handR.position.set(0.5, 1.3, 0.1 + Math.sin(et * 10) * 0.15);
          this.handL.position.set(-0.5, 0.72, 0);
          this.body.rotation.z = Math.sin(et * 3) * 0.06;
          break;
        case "flop":
          this.body.rotation.x = -Math.min(1, et * 2) * Math.PI / 2;
          this.body.position.y += 0.4 * Math.min(1, et * 2);
          this.handL.position.set(-0.6, 0.72, 0);
          this.handR.position.set(0.6, 0.72, 0);
          break;
      }
      return;
    }

    const spd = Math.min(1, a.speed / 8.6);
    if (a.grounded) {
      this.phase += dt * (6 + a.speed * 1.6);
      const sw = Math.sin(this.phase) * spd;
      this.footL.position.set(-0.17, 0.09 + Math.max(0, sw) * 0.18, sw * 0.32);
      this.footR.position.set(0.17, 0.09 + Math.max(0, -sw) * 0.18, -sw * 0.32);
      this.handL.position.set(-0.5, 0.72, -sw * 0.3);
      this.handR.position.set(0.5, 0.72, sw * 0.3);
      this.body.position.y += Math.abs(Math.cos(this.phase)) * 0.08 * spd + Math.sin(t * 2) * 0.015;
      this.body.rotation.x = spd * 0.18;
      this.body.rotation.z = Math.sin(this.phase) * 0.06 * spd;
    } else if (a.wall) {
      this.phase += dt * 16;
      const sw = Math.sin(this.phase);
      this.footL.position.set(-0.17, 0.2 + Math.max(0, sw) * 0.2, sw * 0.3);
      this.footR.position.set(0.17, 0.2 + Math.max(0, -sw) * 0.2, -sw * 0.3);
      this.handL.position.set(-0.5, 1.1, 0.1); this.handR.position.set(0.5, 1.1, 0.1);
      this.body.rotation.z = 0.25;
    } else {
      const rising = a.vy * a.up > 0;
      this.footL.position.set(-0.17, rising ? 0.25 : 0.12, rising ? 0.15 : -0.1);
      this.footR.position.set(0.17, rising ? 0.12 : 0.2, rising ? -0.15 : 0.1);
      this.handL.position.set(-0.55, rising ? 1.15 : 0.95, 0);
      this.handR.position.set(0.55, rising ? 1.15 : 0.95, 0);
      this.body.rotation.x = rising ? -0.1 : 0.15;
    }
  }
}
