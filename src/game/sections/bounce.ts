import { def, getUnitCyl } from "../courseCore";

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
