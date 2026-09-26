import * as THREE from "three";
import { def, getUnitBox } from "../courseCore";

def("gridMaze", "Квадратный лабиринт", 0.3, 1.4, (c) => {
  // Enclosed maze with clear entry + exit, low ceiling
  const cols = 7, rows = 9;
  const cell = 3.0;
  const wallH = 3.2;
  const floorW = cols * cell;
  const floorD = rows * cell;
  const z0 = c.z + 2.5;
  const y0 = c.y;
  // entry pad BEFORE maze
  c.p({ x: c.x, y: y0, z: c.z + 1.0, w: 3.4, d: 2.2, color: c.col(0) });
  // floor
  c.plat({
    x: c.x, y: y0, z: z0 + floorD / 2,
    w: floorW + 0.8, d: floorD + 0.8, color: 0x1a1c2e, perfect: false,
  });
  const thick = 0.5;
  const ox = c.x, oz = z0 + floorD / 2;
  // outer walls — leave gap at near side (entry) and far side (exit)
  // left / right full walls
  c.plat({ x: ox - floorW / 2 - thick / 2, y: y0 + wallH / 2, z: oz, w: thick, d: floorD, h: wallH, color: 0x3d348b, perfect: false });
  c.plat({ x: ox + floorW / 2 + thick / 2, y: y0 + wallH / 2, z: oz, w: thick, d: floorD, h: wallH, color: 0x3d348b, perfect: false });
  // near wall with center gap
  c.plat({ x: ox - floorW / 4 - 0.8, y: y0 + wallH / 2, z: z0 - thick / 2, w: floorW / 2 - 1.2, d: thick, h: wallH, color: 0x3d348b, perfect: false });
  c.plat({ x: ox + floorW / 4 + 0.8, y: y0 + wallH / 2, z: z0 - thick / 2, w: floorW / 2 - 1.2, d: thick, h: wallH, color: 0x3d348b, perfect: false });
  // far wall with center gap
  c.plat({ x: ox - floorW / 4 - 0.8, y: y0 + wallH / 2, z: z0 + floorD + thick / 2, w: floorW / 2 - 1.2, d: thick, h: wallH, color: 0x3d348b, perfect: false });
  c.plat({ x: ox + floorW / 4 + 0.8, y: y0 + wallH / 2, z: z0 + floorD + thick / 2, w: floorW / 2 - 1.2, d: thick, h: wallH, color: 0x3d348b, perfect: false });
  // recursive backtracker maze
  const hWall: boolean[][] = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => true));
  const vWall: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => true));
  const visited: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const stack: [number, number][] = [[0, Math.floor(cols / 2)]];
  visited[0][Math.floor(cols / 2)] = true;
  while (stack.length) {
    const [cr, cc] = stack[stack.length - 1];
    const dirs: [number, number, "h" | "v", number, number][] = [];
    if (cr > 0 && !visited[cr - 1][cc]) dirs.push([-1, 0, "h", cr - 1, cc]);
    if (cr < rows - 1 && !visited[cr + 1][cc]) dirs.push([1, 0, "h", cr, cc]);
    if (cc > 0 && !visited[cr][cc - 1]) dirs.push([0, -1, "v", cr, cc - 1]);
    if (cc < cols - 1 && !visited[cr][cc + 1]) dirs.push([0, 1, "v", cr, cc]);
    if (!dirs.length) { stack.pop(); continue; }
    const pick = dirs[c.rng.int(0, dirs.length - 1)];
    const [dr, dc, kind, wr, wc] = pick;
    if (kind === "h") hWall[wr][wc] = false;
    else vWall[wr][wc] = false;
    const nr = cr + dr, nc = cc + dc;
    visited[nr][nc] = true;
    stack.push([nr, nc]);
  }
  // ensure path from entry col to exit col on last row
  for (let r = 0; r < rows - 1; r++) hWall[r][Math.floor(cols / 2)] = false;
  for (let r = 0; r < rows - 1; r++) {
    for (let col = 0; col < cols; col++) {
      if (!hWall[r][col]) continue;
      const wx = c.x - floorW / 2 + (col + 0.5) * cell;
      const wz = z0 + (r + 1) * cell;
      c.plat({ x: wx, y: y0 + wallH / 2, z: wz, w: cell * 0.92, d: 0.4, h: wallH, color: 0x4361ee, perfect: false });
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols - 1; col++) {
      if (!vWall[r][col]) continue;
      const wx = c.x - floorW / 2 + (col + 1) * cell;
      const wz = z0 + (r + 0.5) * cell;
      c.plat({ x: wx, y: y0 + wallH / 2, z: wz, w: 0.4, d: cell * 0.92, h: wallH, color: 0x5e60ce, perfect: false });
    }
  }
  // low ceiling
  c.plat({
    x: c.x, y: y0 + wallH + 0.15, z: z0 + floorD / 2,
    w: floorW + 0.8, d: floorD + 0.8, h: 0.35, color: 0x24263a, perfect: false,
  });
  for (let r = 0; r < rows; r++) {
    c.wp(c.x, y0, z0 + (r + 0.5) * cell);
  }
  // exit pad
  const e = c.p({ x: c.x, y: y0, z: z0 + floorD + 2.2, w: 3.6, d: 3.2, color: c.col(1) });
  c.end(e);
});

def("branchMaze", "Лазерный лабиринт", 0.35, 1.3, (c) => {
  // Same footprint as grid maze, but walls are LOW lasers (duck / time gaps)
  const cols = 6, rows = 7;
  const cell = 3.0;
  const floorW = cols * cell;
  const floorD = rows * cell;
  const z0 = c.z + 2.5;
  const y0 = c.y;
  c.p({ x: c.x, y: y0, z: c.z + 1.0, w: 3.4, d: 2.2, color: c.col(0) });
  c.plat({
    x: c.x, y: y0, z: z0 + floorD / 2,
    w: floorW + 0.6, d: floorD + 0.6, color: 0x1a1c2e, perfect: false,
  });
  // outer solid walls with entry/exit gaps
  const thick = 0.45;
  const oz = z0 + floorD / 2;
  c.plat({ x: c.x - floorW / 2 - thick / 2, y: y0 + 1.6, z: oz, w: thick, d: floorD, h: 3.2, color: 0x3d348b, perfect: false });
  c.plat({ x: c.x + floorW / 2 + thick / 2, y: y0 + 1.6, z: oz, w: thick, d: floorD, h: 3.2, color: 0x3d348b, perfect: false });
  c.plat({ x: c.x - floorW / 4 - 0.7, y: y0 + 1.6, z: z0 - thick / 2, w: floorW / 2 - 1.0, d: thick, h: 3.2, color: 0x3d348b, perfect: false });
  c.plat({ x: c.x + floorW / 4 + 0.7, y: y0 + 1.6, z: z0 - thick / 2, w: floorW / 2 - 1.0, d: thick, h: 3.2, color: 0x3d348b, perfect: false });
  c.plat({ x: c.x - floorW / 4 - 0.7, y: y0 + 1.6, z: z0 + floorD + thick / 2, w: floorW / 2 - 1.0, d: thick, h: 3.2, color: 0x3d348b, perfect: false });
  c.plat({ x: c.x + floorW / 4 + 0.7, y: y0 + 1.6, z: z0 + floorD + thick / 2, w: floorW / 2 - 1.0, d: thick, h: 3.2, color: 0x3d348b, perfect: false });
  // maze structure via random low laser beams
  for (let r = 0; r < rows - 1; r++) {
    for (let col = 0; col < cols; col++) {
      if (c.rng.chance(0.55) && !(col === Math.floor(cols / 2))) {
        const wx = c.x - floorW / 2 + (col + 0.5) * cell;
        const wz = z0 + (r + 1) * cell;
        const bar = lbeam(c, wx, y0 + 0.15, wz, cell * 0.85, 0.12, 0.12);
        // some blink so you can cross
        if (c.rng.chance(0.45)) blinker(c, bar, 1.5 - c.diff * 0.3, 0.45, (r + col) * 0.4);
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols - 1; col++) {
      if (c.rng.chance(0.55)) {
        const wx = c.x - floorW / 2 + (col + 1) * cell;
        const wz = z0 + (r + 0.5) * cell;
        const post = lbeam(c, wx, y0, wz, 0.12, 0.12, 0.9);
        if (c.rng.chance(0.4)) blinker(c, post, 1.3, 0.4, (r * 3 + col) * 0.35);
      }
    }
  }
  // clear center corridor for bots / guaranteed path
  for (let r = 0; r < rows; r++) c.wp(c.x, y0, z0 + (r + 0.5) * cell);
  const e = c.p({ x: c.x, y: y0, z: z0 + floorD + 2.2, w: 3.6, d: 3.2, color: c.col(1) });
  c.end(e);
});

def("hexPads", "Шестиугольники", 0.15, 1.5, (c) => {
  const n = c.rng.int(7, 10);
  let z = c.z + 1.2;
  c.p({ x: c.x, y: c.y, z: z, w: 2.8, d: 2.0, color: c.col(0) });
  z += 2.3;
  for (let i = 0; i < n; i++) {
    const dx = Math.sin(i * 1.2) * 1.6;
    const dy = (i % 3) * 0.35;
    c.p({
      x: c.clampX(c.x + dx), y: c.y + dy, z: z,
      w: 1.9, d: 1.9, h: 0.4, color: c.col(i), cyl: true,
    });
    if (i % 2 === 0) c.wp(c.x + dx * 0.4, c.y + dy, z);
    z += 2.0;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.4, d: 3.0, color: c.col(1) });
  c.end(e);
});

def("risingSteps", "Подъёмные ступени", 0.2, 1.4, (c) => {
  const n = c.rng.int(6, 8);
  let z = c.z + 1;
  let y = c.y;
  c.p({ x: c.x, y: y, z: z, w: 3.0, d: 2.0, color: c.col(0) });
  z += 2.2;
  for (let i = 0; i < n; i++) {
    const step = c.p({ x: c.x + (i % 2 ? 0.6 : -0.6), y: y + 0.5, z: z, w: 2.4, d: 1.6, color: c.col(i) });
    const by = step.y;
    const ph = i * 0.7;
    c.upd((t) => { step.y = by + (Math.sin(t * 1.1 + ph) + 1) * 0.7; });
    c.wp(c.x, y + 0.6, z);
    y += 0.85;
    z += 1.9;
  }
  const e = c.p({ x: c.x, y: y + 0.4, z: z + 1.2, w: 3.4, d: 3.0, color: c.col(1) });
  c.end(e);
});

def("spinningRings", "Вращающиеся кольца", 0.3, 1.3, (c) => {
  const n = c.rng.int(4, 5);
  let z = c.z + 1.2;
  c.p({ x: c.x, y: c.y, z: z, w: 3.2, d: 2.2, color: c.col(0) });
  z += 2.8;
  for (let i = 0; i < n; i++) {
    // larger safe pad in the center
    c.p({ x: c.x, y: c.y, z: z, w: 2.6, d: 2.6, color: c.col(i) });
    const arm = c.plat({
      x: c.x, y: c.y + 1.0, z: z, w: 6.0, d: 0.5, h: 1.0,
      color: 0xff3355, hazard: 1, perfect: false,
    });
    const sp = 1.1 + i * 0.22;
    const dir = i % 2 ? 1 : -1;
    c.upd((t) => { arm.rot = t * sp * dir; });
    c.wp(c.x, c.y, z);
    z += 3.6;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.6, d: 3.2, color: c.col(1) });
  c.end(e);
});

def("windCorridor", "Ветряной коридор", 0.25, 1.4, (c) => {
  const L = 18;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.6, d: L, color: 0x4cc9f0, perfect: false });
  // strong side wind — values are m/s style push applied every frame in physics
  const zn = c.zone("wind", c.x, c.y + 2, p.z, 6, 5, L / 2 + 0.5, 0, 0, 0);
  const streaks: THREE.Mesh[] = [];
  for (let k = 0; k < 12; k++) {
    streaks.push(c.deco(getUnitBox(), 0xffffff, c.x, c.y + 0.6 + (k % 3) * 0.5, p.z - L / 2 + (k * L) / 12, 1.6, 0.07, 0.07, 1) as THREE.Mesh);
  }
  c.upd((t) => {
    const f = Math.sin(t * 1.05) * (28 + c.diff * 8);
    zn.a = f;
    streaks.forEach((s, k) => {
      s.position.x = c.x + (((t * 10 * Math.sign(f || 1) + k * 1.1) % 10) - 5);
      s.visible = Math.abs(f) > 4;
    });
  });
  for (let i = 0; i < 5; i++) c.wp(c.x, c.y, p.z - L / 2 + 2.5 + i * 3);
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("crumblePath", "Осыпающийся путь", 0.2, 1.4, (c) => {
  const n = c.rng.int(8, 11);
  let z = c.z + 1;
  c.p({ x: c.x, y: c.y, z: z, w: 3.0, d: 2.0, color: c.col(0) });
  z += 2.2;
  for (let i = 0; i < n; i++) {
    const dx = (i % 3 - 1) * 0.8;
    c.plat({
      x: c.clampX(c.x + dx), y: c.y, z: z,
      w: 2.0, d: 1.5, color: 0xffd166, surface: "break", perfect: false,
    });
    if (i % 2 === 0) c.wp(c.x + dx * 0.3, c.y, z);
    z += 1.75;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.4, d: 3.0, color: c.col(1) });
  c.end(e);
});

def("dualPathChoice", "Два пути", 0.15, 1.5, (c) => {
  const L = 12;
  c.p({ x: c.x, y: c.y, z: c.z + 1.2, w: 3.2, d: 2.2, color: c.col(0) });
  c.plat({ x: c.x - 2.2, y: c.y + 2.2, z: c.z + 2 + L / 2, w: 2.4, d: L, color: 0x06d6a0, perfect: false });
  c.plat({ x: c.x + 2.2, y: c.y, z: c.z + 2 + L / 2, w: 2.4, d: L, color: 0xff9f1c, perfect: false });
  for (let i = 0; i < 3; i++) {
    const zz = c.z + 3.5 + i * 3.2;
    const arm = c.plat({
      x: c.x + 2.2, y: c.y + 0.8, z: zz, w: 2.6, d: 0.4, h: 0.8,
      color: 0xff3355, hazard: 1, perfect: false,
    });
    c.upd((t) => { arm.rot = t * 1.8 * (i % 2 ? -1 : 1); });
  }
  c.wp(c.x - 2.2, c.y + 2.2, c.z + 2 + L / 2);
  c.wp(c.x + 2.2, c.y, c.z + 2 + L / 2);
  const e = c.p({ x: c.x, y: c.y + 0.5, z: c.z + 2 + L + 2.2, w: 4.0, d: 3.4, color: c.col(1) });
  c.end(e);
});

def("pillarHop", "Прыжки по столбам", 0.2, 1.5, (c) => {
  const n = c.rng.int(8, 11);
  let z = c.z + 1.2;
  c.p({ x: c.x, y: c.y, z: z, w: 2.8, d: 2.0, color: c.col(0) });
  z += 2.4;
  for (let i = 0; i < n; i++) {
    const dx = Math.sin(i * 1.4) * 1.8;
    const h = 0.8 + (i % 4) * 0.35;
    c.plat({
      x: c.clampX(c.x + dx), y: c.y + h / 2, z: z,
      w: 1.3, d: 1.3, h, color: c.col(i), perfect: false,
    });
    if (i % 2 === 0) c.wp(c.x + dx * 0.4, c.y + h, z);
    z += 2.1;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.2, w: 3.4, d: 3.0, color: c.col(1) });
  c.end(e);
});

def("gravityWells", "Гравитационные колодцы", 0.3, 1.2, (c) => {
  const n = c.rng.int(3, 4);
  let z = c.z + 1;
  c.p({ x: c.x, y: c.y, z: z, w: 3.0, d: 2.0, color: c.col(0) });
  z += 2.5;
  for (let i = 0; i < n; i++) {
    c.p({ x: c.x, y: c.y, z: z, w: 3.2, d: 2.4, color: c.col(i) });
    const gapZ = z + 2.2;
    c.zone("grav", c.x, c.y + 2, gapZ, 2.5, 4, 1.6, 0.35, 0, 0);
    c.wp(c.x, c.y, z);
    z += 4.4;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 0.8, w: 3.4, d: 3.0, color: c.col(1) });
  c.end(e);
});

