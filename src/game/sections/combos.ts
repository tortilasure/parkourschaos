import * as THREE from "three";
import { def, getUnitBox, rocks, spinner } from "../courseCore";

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

