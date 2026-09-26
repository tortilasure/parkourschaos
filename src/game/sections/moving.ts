import { def, getUnitCyl } from "../courseCore";

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
