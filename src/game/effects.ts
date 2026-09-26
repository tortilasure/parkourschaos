import * as THREE from "three";

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; g: number; drag: number; r: number; gg: number; b: number; rainbow: boolean; }

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const AXIS = new THREE.Vector3(0.3, 1, 0.2).normalize();
const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  mesh: THREE.InstancedMesh;
  parts: P[] = [];
  cap: number;
  prints: THREE.InstancedMesh;
  printData: { x: number; y: number; z: number; yaw: number; age: number; color: THREE.Color; rainbow: boolean }[] = [];
  printIdx = 0;
  rings: { m: THREE.Mesh; age: number; max: number; scale: number }[] = [];
  emojis: { s: THREE.Sprite; age: number; max: number; base: THREE.Vector3 }[] = [];
  emojiTex = new Map<string, THREE.Texture>();
  scene: THREE.Scene;
  /** 0..1 global particle budget from the performance settings. */
  scale = 1;

  constructor(scene: THREE.Scene, cap = 1400) {
    this.scene = scene;
    this.cap = cap;
    const g = new THREE.IcosahedronGeometry(0.5, 0);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const pg = new THREE.CircleGeometry(0.16, 10);
    pg.rotateX(-Math.PI / 2);
    pg.scale(1, 1, 1.5);
    this.prints = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }), 240);
    this.prints.setColorAt(0, new THREE.Color());
    this.prints.count = 0;
    this.prints.frustumCulled = false;
    scene.add(this.prints);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color | number | string, life = 0.8, size = 0.2, g = 12, drag = 1.5, rainbow = false) {
    if (this.scale <= 0) return;
    if (this.scale < 1 && Math.random() > this.scale) return;
    if (this.parts.length >= this.cap) this.parts.shift();
    tmpC.set(color as THREE.ColorRepresentation);
    this.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, g, drag, r: tmpC.r, gg: tmpC.g, b: tmpC.b, rainbow });
  }

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, nRaw: number, speed = 5, opts: { up?: number; size?: number; life?: number; g?: number; rainbow?: boolean; color2?: THREE.ColorRepresentation; spread?: number } = {}) {
    const n = this.scale >= 1 ? nRaw : Math.max(this.scale > 0 ? 1 : 0, Math.round(nRaw * this.scale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.8);
      const c = opts.color2 && Math.random() < 0.5 ? opts.color2 : color;
      this.spawn(pos.x, pos.y, pos.z, Math.cos(a) * r * sp, Math.abs(u) * sp * 0.7 + (opts.up ?? 2), Math.sin(a) * r * sp, c as THREE.ColorRepresentation,
        (opts.life ?? 0.7) * (0.6 + Math.random() * 0.8), (opts.size ?? 0.18) * (0.6 + Math.random() * 0.8), opts.g ?? 12, 1.8, opts.rainbow);
    }
  }

  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 3) {
    if (this.scale <= 0) return;
    let r = this.rings.find((x) => x.age >= x.max);
    if (!r) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      r = { m, age: 0, max: 0.45, scale };
      this.rings.push(r);
    }
    r.age = 0; r.scale = scale;
    (r.m.material as THREE.MeshBasicMaterial).color.set(color);
    r.m.position.copy(pos).y += 0.05;
    r.m.visible = true;
  }

  footprint(x: number, y: number, z: number, yaw: number, color: THREE.ColorRepresentation, rainbow = false) {
    if (this.scale <= 0.1) return;
    const d = { x, y: y + 0.02, z, yaw, age: 0, color: new THREE.Color(color), rainbow };
    if (this.printData.length < 240) this.printData.push(d);
    else { this.printData[this.printIdx] = d; this.printIdx = (this.printIdx + 1) % 240; }
  }

  emoji(e: string, pos: THREE.Vector3) {
    let tex = this.emojiTex.get(e);
    if (!tex) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      g.font = "96px serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(e, 64, 72);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.emojiTex.set(e, tex);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.position.copy(pos);
    s.scale.setScalar(0.1);
    this.scene.add(s);
    this.emojis.push({ s, age: 0, max: 5, base: pos.clone() });
    if (this.emojis.length > 40) { const o = this.emojis.shift()!; o.s.removeFromParent(); o.s.material.dispose(); }
  }

  update(dt: number) {
    const t = performance.now() / 1000;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.parts) {
      if (n >= this.cap) break;
      const k = p.life / p.max;
      const s = p.size * Math.min(1, k * 2.5);
      tmpP.set(p.x, p.y, p.z);
      tmpS.set(s, s, s);
      tmpQ.setFromAxisAngle(AXIS, p.life * 6);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      if (p.rainbow) tmpC.setHSL((t * 0.8 + p.x * 0.1 + p.life) % 1, 1, 0.6);
      else tmpC.setRGB(p.r, p.gg, p.b);
      this.mesh.setColorAt(n, tmpC);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // footprints
    let pn = 0;
    for (const f of this.printData) {
      f.age += dt;
      if (f.age > 4) continue;
      const s = f.age < 3 ? 1 : 1 - (f.age - 3);
      tmpP.set(f.x, f.y, f.z);
      tmpQ.setFromAxisAngle(UP, f.yaw);
      tmpS.set(s, 1, s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.prints.setMatrixAt(pn, tmpM);
      if (f.rainbow) tmpC.setHSL((f.x * 0.05 + f.z * 0.05) % 1, 1, 0.6);
      else tmpC.copy(f.color);
      this.prints.setColorAt(pn, tmpC);
      pn++;
    }
    this.prints.count = pn;
    this.prints.instanceMatrix.needsUpdate = true;
    if (this.prints.instanceColor) this.prints.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (r.age >= r.max) { r.m.visible = false; continue; }
      r.age += dt;
      const k = r.age / r.max;
      r.m.scale.setScalar(0.3 + k * r.scale);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }

    for (let i = this.emojis.length - 1; i >= 0; i--) {
      const e = this.emojis[i];
      e.age += dt;
      const k = e.age;
      const pop = k < 0.25 ? (k / 0.25) * 1.3 : k < 0.4 ? 1.3 - ((k - 0.25) / 0.15) * 0.3 : 1;
      e.s.scale.setScalar(pop * 1.3);
      e.s.position.set(e.base.x, e.base.y + Math.sin(k * 2.5) * 0.15 + k * 0.12, e.base.z);
      e.s.material.opacity = e.age > e.max - 0.6 ? (e.max - e.age) / 0.6 : 1;
      if (e.age >= e.max) { e.s.removeFromParent(); e.s.material.dispose(); this.emojis.splice(i, 1); }
    }
  }

  clear() {
    this.parts.length = 0;
    this.printData.length = 0;
    for (const e of this.emojis) { e.s.removeFromParent(); e.s.material.dispose(); }
    this.emojis.length = 0;
  }
}
