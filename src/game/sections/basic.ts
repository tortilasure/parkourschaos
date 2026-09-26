import { def } from "../courseCore";

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
