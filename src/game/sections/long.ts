import { def } from "../courseCore";

def("longSkyBridge", "Небесный мост", 0.15, 1.4, (c) => {
  const L = 28;
  let z = c.z + 1;
  c.p({ x: c.x, y: c.y, z: z, w: 3.2, d: 2.2, color: c.col(0) });
  z += 2.4;
  for (let i = 0; i < 14; i++) {
    const w = i % 3 === 0 ? 1.1 : i % 3 === 1 ? 2.4 : 1.6;
    const dx = (i % 4 === 0 ? -1 : i % 4 === 2 ? 1 : 0) * 0.9;
    const dy = Math.sin(i * 0.7) * 0.6;
    c.p({ x: c.clampX(c.x + dx), y: c.y + dy, z: z, w, d: 1.5, color: c.col(i) });
    if (i % 3 === 0) c.wp(c.x + dx * 0.5, c.y + dy, z);
    z += 1.85;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.6, d: 3.4, color: c.col(1) });
  c.end(e);
});

def("longConveyorGauntlet", "Длинный конвейер", 0.2, 1.3, (c) => {
  const L = 26;
  // conveyor pushes FORWARD (+Z) along the course
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.2, d: L, color: 0x3a86ff, surface: "conveyor", convZ: 6.5, perfect: false });
  for (let i = 0; i < 6; i++) {
    const zz = p.z - L / 2 + 3 + i * 3.8;
    const side = i % 2 ? 1 : -1;
    // tall moving punchers — hard to jump over
    const fist = c.plat({
      x: c.x + side * 3.2, y: c.y + 1.6, z: zz,
      w: 1.6, d: 1.3, h: 3.2, color: 0xff006e, hazard: 1, perfect: false,
    });
    const bx = fist.x;
    const ph = i * 0.9;
    c.upd((t) => {
      const s = Math.pow(Math.max(0, Math.sin(t * 1.8 + ph)), 3);
      fist.x = bx + side * (-s * 2.6);
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("longIceSprint", "Ледяной спринт", 0.15, 1.3, (c) => {
  const L = 24;
  let z = c.z + 1;
  c.p({ x: c.x, y: c.y, z: z, w: 3.0, d: 2.0, color: c.col(0) });
  z += 2.2;
  for (let i = 0; i < 12; i++) {
    const dx = Math.sin(i * 0.9) * 1.4;
    c.plat({
      x: c.clampX(c.x + dx), y: c.y, z: z + 0.9,
      w: 2.6, d: 1.8, color: 0xa0e7ff, surface: "ice", perfect: false,
    });
    if (i % 2 === 0) c.wp(c.x + dx * 0.4, c.y, z + 0.9);
    z += 1.9;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.6, d: 3.2, color: c.col(1) });
  c.end(e);
});

def("longMovingForest", "Лес платформ", 0.25, 1.2, (c) => {
  const n = 12;
  let z = c.z + 1.2;
  c.p({ x: c.x, y: c.y, z: z, w: 3.0, d: 2.0, color: c.col(0) });
  z += 2.5;
  for (let i = 0; i < n; i++) {
    const amp = 1.2 + (i % 3) * 0.35;
    const sp = 0.9 + (i % 4) * 0.15;
    const ph = i * 0.8;
    const axis = i % 2 === 0 ? "x" : "y";
    const b = c.p({
      x: c.x, y: c.y + (axis === "y" ? amp : 0.3), z: z,
      w: 2.2, d: 1.8, color: c.col(i),
    });
    const bx = b.x, by = b.y;
    if (axis === "x") c.upd((t) => { b.x = bx + Math.sin(t * sp + ph) * amp; });
    else c.upd((t) => { b.y = by + Math.sin(t * sp + ph) * amp * 0.7; });
    if (i % 2 === 0) c.wp(c.x, c.y + 0.4, z);
    z += 2.2;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.3, w: 3.6, d: 3.2, color: c.col(1) });
  c.end(e);
});

def("longBounceValley", "Долина батутов", 0.2, 1.2, (c) => {
  const n = 10;
  let z = c.z + 1;
  c.p({ x: c.x, y: c.y, z: z, w: 3.0, d: 2.0, color: c.col(0) });
  z += 2.6;
  for (let i = 0; i < n; i++) {
    const dx = (i % 2 ? 1 : -1) * 1.2;
    c.plat({
      x: c.clampX(c.x + dx), y: c.y - 0.3, z: z,
      w: 2.4, d: 2.0, color: 0x3cff9e, surface: "bounce", bounce: 15 + (i % 3), perfect: false,
    });
    c.wp(c.x + dx * 0.3, c.y + 0.5, z);
    z += 2.8;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.6, d: 3.2, color: c.col(1) });
  c.end(e);
});

