import * as THREE from "three";
import { def, getUnitBox, getUnitCyl, mat } from "../courseCore";

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
