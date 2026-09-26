import * as THREE from "three";
import { def, pendulumArm, rocks } from "../courseCore";

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
