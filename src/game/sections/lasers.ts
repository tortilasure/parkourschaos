import * as THREE from "three";
import { def, getUnitBox, mat, pendulumArm } from "../courseCore";

def("laserSlide", "Скользящие лазеры", 0.25, 2, (c) => {
  const L = c.rng.range(15, 19);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.4, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.6;
  let i = 0;
  while (zz < p.z + L / 2 - 1.6) {
    const sp = c.rng.range(1.1, 1.8) + c.diff * 0.7, ph = c.rng.range(0, 6.28), amp = 1.9;
    if (i % 3 === 2) {
      const bar = lbeam(c, c.x, c.y + 0.35, zz, 5.4, 0.16, 0.16);
      c.upd((t) => { bar.y = c.y + 0.38 + Math.sin(t * sp * 0.7 + ph) * 0.22; });
    } else {
      const post = lbeam(c, c.x, c.y, zz, 0.18, 0.18, 2.6);
      emitter(c, c.x, c.y + 2.75, zz);
      c.upd((t) => { post.x = c.x + Math.sin(t * sp + ph) * amp; });
    }
    c.wp(c.x, c.y, zz);
    zz += c.rng.range(2.6, 3.4);
    i++;
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserSpin", "Лазерный ротор", 0.3, 2, (c) => {
  const r = 5.4;
  const disc = c.p({ x: c.x, y: c.y, z: c.z + 1.6 + r, w: r * 2, d: r * 2, cyl: true, color: 0x2b2d42, perfect: false });
  c.plat({ x: disc.x, y: c.y + 1.4, z: disc.z, w: 1, d: 1, h: 1.4, cyl: true, color: 0x3a3f55, perfect: false, wp: false });
  for (let k = 0; k < 2; k++) {
    const arm = lbeam(c, disc.x, c.y + 0.28, disc.z, r * 1.9, 0.16, 0.16);
    const sp = (1.3 + c.diff * 1.1) * (k ? -0.75 : 1), ph = k * 1.7;
    c.upd((t) => { arm.rot = t * sp + ph; });
  }
  c.wp(disc.x + 2.6, c.y, disc.z);
  c.end(disc);
});

def("laserGrid", "Лазерная решётка", 0.3, 2, (c) => {
  const L = c.rng.range(14, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.6, d: L, color: 0x2b2d42, perfect: false });
  const gates = 3;
  for (let g = 0; g < gates; g++) {
    const zz = p.z - L / 2 + 3 + g * ((L - 4) / gates);
    const bars: Box[] = [];
    for (let k = 0; k < 5; k++) bars.push(lbeam(c, c.x + (k - 2) * 1.25, c.y, zz, 0.16, 0.16, 2.8));
    emitter(c, c.x, c.y + 2.95, zz, 0.5);
    const per = 1.5 - c.diff * 0.45, dir = c.rng.sign(), off = c.rng.int(0, 4);
    c.upd((t) => {
      const gap = ((Math.floor(t / per) * dir + off) % 5 + 5) % 5;
      bars.forEach((b, k) => {
        b.active = k !== gap;
        const m = b.mesh as THREE.Mesh;
        m.visible = b.active;
      });
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserTunnel", "Лазерный тоннель", 0.4, 1.5, (c) => {
  const L = 15;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.2, d: L, color: 0x24263a, perfect: false });
  for (let g = 0; g < 4; g++) {
    const zz = p.z - L / 2 + 2.6 + g * 3.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 8, 20), mat(0x4361ee, 0.3));
    ring.position.set(c.x, c.y + 1.4, zz);
    c.add(ring);
    c.course.track(ring.geometry);
    const blades: Box[] = [];
    for (let k = 0; k < 3; k++) blades.push(lbeam(c, c.x, c.y + 1.4, zz, 3.4, 0.14, 0.14));
    const sp = (1.0 + c.diff * 0.9) * (g % 2 ? -1 : 1), ph = g * 0.9;
    c.upd((t) => {
      blades.forEach((b, k) => {
        const a = t * sp + ph + (k * Math.PI * 2) / 3;
        b.x = c.x + Math.cos(a) * 0.95;
        b.y = c.y + 1.4 + Math.sin(a) * 0.95;
        b.rot = 0;
        const m = b.mesh as THREE.Mesh;
        m.rotation.z = a;
      });
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserWave", "Лазерная волна", 0.25, 2, (c) => {
  const L = c.rng.range(15, 19);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.6, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.4;
  let i = 0;
  while (zz < p.z + L / 2 - 1.4) {
    const bar = lbeam(c, c.x, c.y + 0.4, zz, 4.6, 0.16, 0.16);
    emitter(c, c.x - 2.4, c.y + 1.2, zz, 0.36);
    emitter(c, c.x + 2.4, c.y + 1.2, zz, 0.36);
    const sp = 1.5 + c.diff * 0.9, ph = i * 0.9;
    c.upd((t) => { bar.y = c.y + 1.25 + Math.sin(t * sp + ph) * 1.15; });
    c.wp(c.x, c.y, zz);
    zz += c.rng.range(2.3, 3.0);
    i++;
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserWall", "Лазерная стена", 0.35, 1.5, (c) => {
  const L = 22;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: 0x2b2d42, perfect: false });
  const z0 = p.z - L / 2, z1 = p.z + L / 2;
  const wall = lbeam(c, c.x, c.y, z0, 5, 0.3, 3.4);
  const glow = c.deco(getUnitBox(), 0xff6b81, c.x, c.y + 1.7, z0, 5.2, 3.6, 0.05, 0.8);
  const speed = 4.6 + c.diff * 1.6;
  const period = (z1 - z0 + 9) / speed;
  c.upd((t) => {
    const f = (t % period) / period;
    const zz = z0 - 6 + f * (z1 - z0 + 9);
    wall.z = zz;
    glow.position.z = zz;
    const on = zz > z0 - 3;
    wall.active = on;
    (wall.mesh as THREE.Mesh).visible = on;
    glow.visible = on;
  });
  for (let k = 0; k < 4; k++) c.wp(c.x, c.y, z0 + 3 + k * ((L - 4) / 4));
  c.wp(c.x, c.y, z1 - 0.6);
  c.end(p);
});

def("laserStairs", "Лазерная лестница", 0.3, 1.5, (c) => {
  const n = c.rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.2, 1.2)), y: c.y + c.rng.range(0.9, 1.3), z: c.z + c.rng.range(1.6, 2.3) + 1.6, w: 3.2, d: 3.2, color: 0x3a3f55 });
    const bar = lbeam(c, b.x, b.y + b.hy + 0.35, b.z, 3.4, 0.16, 0.16);
    blinker(c, bar, 2.2 - c.diff * 0.5, 0.55, c.rng.range(0, 2));
    c.end(b);
  }
  const e = c.p({ x: c.x, y: c.y + 0.6, z: c.z + 3.4, w: 4, d: 3.4, color: c.col(0) });
  c.end(e);
});

def("laserPendulum", "Лазерный маятник", 0.4, 1.5, (c) => {
  const L = c.rng.range(14, 17);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 2.6, d: L, color: 0x2b2d42, perfect: false });
  for (let zz = p.z - L / 2 + 2.6; zz < p.z + L / 2 - 1.5; zz += 3.3) {
    pendulumArm(c, c.x, c.y, zz, { len: 3.2, amp: c.rng.range(0.6, 0.78), speed: c.rng.range(1.6, 2.5), phase: c.rng.range(0, 6.28), bob: 0.5, color: 0xff1e3c, laser: true });
  }
  c.wp(c.x, c.y, p.z); c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserCross", "Лазерный крест", 0.45, 1.5, (c) => {
  const L = 13;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1.4 + L / 2, w: 6, d: L, color: 0x24263a, perfect: false });
  for (let k = 0; k < 2; k++) {
    const cz = p.z - 3 + k * 6;
    c.plat({ x: c.x, y: c.y + 1.1, z: cz, w: 0.8, d: 0.8, h: 1.1, cyl: true, color: 0x3a3f55, perfect: false, wp: false });
    for (let j = 0; j < 2; j++) {
      const arm = lbeam(c, c.x, c.y + 0.3, cz, 6.4, 0.15, 0.15);
      const sp = (1.4 + c.diff * 1.2) * (k ? -1 : 1), ph = j * Math.PI / 2;
      c.upd((t) => { arm.rot = t * sp + ph; });
    }
    c.wp(c.x + 2.4, c.y, cz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserMaze", "Лазерный лабиринт", 0.3, 1.5, (c) => {
  const L = c.rng.range(16, 20);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.6, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.4;
  let side = c.rng.sign();
  while (zz < p.z + L / 2 - 1.6) {
    const kind = c.rng.next();
    if (kind < 0.45) {
      lbeam(c, c.x + side * 1.5, c.y, zz, 4.4, 0.15, 2.8);
      emitter(c, c.x + side * 1.5, c.y + 2.95, zz, 0.4);
      c.wp(c.x - side * 2.1, c.y, zz);
    } else if (kind < 0.75) {
      lbeam(c, c.x, c.y + 0.32, zz, 5.6, 0.15, 0.15);
      c.wp(c.x, c.y, zz);
    } else {
      lbeam(c, c.x - 2.3, c.y, zz, 1.4, 0.15, 2.8);
      lbeam(c, c.x + 2.3, c.y, zz, 1.4, 0.15, 2.8);
      c.wp(c.x, c.y, zz);
    }
    side = -side;
    zz += c.rng.range(2.1, 2.9);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});

def("laserVanish", "Лазеры + призрачные плитки", 0.45, 1.5, (c) => {
  const n = c.rng.int(5, 7);
  const z0 = c.z;
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.8, 1.8)), y: c.y, z: c.z + c.rng.range(1.5, 2.1) + 1.2, w: 2.3, d: 2.3, color: 0x7ae7ff, surface: "vanish" });
    c.end(b);
  }
  laserFloor(c, c.x, c.y - 3.2, (z0 + c.z) / 2, 11, c.z - z0 + 2);
  const sweep = lbeam(c, c.x, c.y + 1.9, (z0 + c.z) / 2, 11, 0.16, 0.16);
  c.upd((t) => { sweep.z = (z0 + c.z) / 2 + Math.sin(t * (0.9 + c.diff * 0.6)) * ((c.z - z0) / 2 - 1); });
  const e = c.p({ x: c.x, y: c.y, z: c.z + 2.6, w: 4, d: 3.4, color: c.col(0) });
  c.end(e);
});

def("laserElevator", "Лазерный лифт", 0.4, 1.5, (c) => {
  const hgt = c.rng.range(5.5, 7.5);
  const cz = c.z + 4;
  const lift = c.p({ x: c.x, y: c.y + 0.6, z: cz, w: 3.4, d: 3.4, color: 0x3a3f55 });
  const baseY = lift.y;
  const sp = 0.55 + c.diff * 0.25;
  c.upd((t) => { lift.y = baseY + (1 - Math.cos(t * sp)) * 0.5 * hgt; });
  for (let k = 0; k < 3; k++) {
    const yy = c.y + 1.6 + k * (hgt / 2.4);
    const arm = lbeam(c, c.x, yy, cz, 6.6, 0.15, 0.15);
    const asp = (0.9 + c.diff * 0.8) * (k % 2 ? -1 : 1);
    c.upd((t) => { arm.rot = t * asp + k; });
    emitter(c, c.x, yy + 0.2, cz, 0.3);
  }
  c.wp(c.x, c.y + hgt, cz);
  const e = c.p({ x: c.x, y: c.y + hgt, z: cz + 4.2, w: 4, d: 4, color: c.col(0) });
  c.end(e);
});

def("laserGauntlet", "Лазерное испытание", 0.6, 1, (c) => {
  const L = 20;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.4, d: L, color: 0x1f2133, perfect: false });
  const z0 = p.z - L / 2;
  for (let k = 0; k < 3; k++) {
    const zz = z0 + 2.6 + k * 2.2;
    const post = lbeam(c, c.x, c.y, zz, 0.18, 0.18, 2.6);
    const sp = 1.8 + k * 0.4 + c.diff;
    c.upd((t) => { post.x = c.x + Math.sin(t * sp + k) * 1.3; });
  }
  for (let k = 0; k < 3; k++) {
    const zz = z0 + 9.5 + k * 1.9;
    const bar = lbeam(c, c.x, c.y + 0.32, zz, 3.4, 0.15, 0.15);
    blinker(c, bar, 1.5, 0.5, k * 0.5);
  }
  const cz = z0 + 17;
  c.plat({ x: c.x, y: c.y + 1.2, z: cz, w: 0.7, d: 0.7, h: 1.2, cyl: true, color: 0x3a3f55, perfect: false, wp: false });
  for (let j = 0; j < 2; j++) {
    const arm = lbeam(c, c.x, c.y + 0.3, cz, 3.8, 0.15, 0.15);
    c.upd((t) => { arm.rot = t * (2.1 + c.diff) + (j * Math.PI) / 2; });
  }
  for (let k = 0; k < 5; k++) c.wp(c.x, c.y, z0 + 2 + k * 3.6);
  c.wp(c.x, c.y, p.z + L / 2 - 0.6);
  c.end(p);
});


// ---------------- 13 new sections ----------------
def("laserZigzag", "Лазерный зигзаг", 0.35, 1.4, (c) => {
  const L = c.rng.range(16, 20);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.2, d: L, color: 0x2b2d42, perfect: false });
  let zz = p.z - L / 2 + 2.2, side = 1;
  while (zz < p.z + L / 2 - 1.5) {
    const post = lbeam(c, c.x + side * 1.6, c.y, zz, 0.16, 0.16, 2.7);
    emitter(c, c.x + side * 1.6, c.y + 2.85, zz);
    const sp = 1.4 + c.diff * 0.8, ph = zz * 0.3;
    c.upd((t) => { post.x = c.x + side * 1.6 + Math.sin(t * sp + ph) * 0.9; });
    c.wp(c.x - side * 1.9, c.y, zz);
    side = -side;
    zz += c.rng.range(2.2, 2.8);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserCage", "Лазерная клетка", 0.4, 1.3, (c) => {
  // Three rotating gates with a clear center corridor and timed gaps
  const L = 14;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.8, d: L, color: 0x24263a, perfect: false });
  for (let g = 0; g < 3; g++) {
    const zz = p.z - L / 2 + 3 + g * 3.5;
    // only 2 beams per gate (not 4) so there is always a safe gap to run through
    for (let k = 0; k < 2; k++) {
      const a0 = (k / 2) * Math.PI;
      const bar = lbeam(c, c.x, c.y + 0.9, zz, 3.2, 0.12, 0.12);
      const sp = (0.7 + c.diff * 0.35) * (g % 2 ? -1 : 1);
      const ph = g * 0.6;
      c.upd((t) => {
        const ang = t * sp + a0 + ph;
        bar.x = c.x + Math.cos(ang) * 1.5;
        bar.z = zz + Math.sin(ang) * 0.35;
        bar.rot = ang;
        // brief safe window every cycle
        const pulse = (Math.sin(t * 1.4 + ph) + 1) * 0.5;
        bar.active = pulse > 0.22;
        if (bar.mesh) (bar.mesh as THREE.Mesh).visible = bar.active;
      });
    }
    emitter(c, c.x, c.y + 2.4, zz, 0.35);
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserRain", "Лазерный дождь", 0.3, 1.5, (c) => {
  const L = c.rng.range(15, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: 0x2b2d42, perfect: false });
  for (let i = 0; i < 8; i++) {
    const xx = c.x + c.rng.range(-2.2, 2.2);
    const zz = p.z - L / 2 + 2 + i * ((L - 3) / 8);
    const beam = lbeam(c, xx, c.y + 4, zz, 0.14, 0.14, 0.8);
    const per = 1.8 - c.diff * 0.4, ph = c.rng.range(0, per);
    c.upd((t) => {
      const f = ((t + ph) % per) / per;
      beam.y = c.y + 4.2 - f * 4.5;
      beam.active = f < 0.85;
      (beam.mesh as THREE.Mesh).visible = beam.active;
    });
    if (i % 2 === 0) c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserDoor", "Лазерные двери", 0.25, 1.6, (c) => {
  const L = 16;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.4, d: L, color: 0x2b2d42, perfect: false });
  for (let g = 0; g < 4; g++) {
    const zz = p.z - L / 2 + 2.8 + g * 3.2;
    const left = lbeam(c, c.x - 1.5, c.y, zz, 2.2, 0.16, 2.6);
    const right = lbeam(c, c.x + 1.5, c.y, zz, 2.2, 0.16, 2.6);
    emitter(c, c.x - 2.6, c.y + 2.7, zz);
    emitter(c, c.x + 2.6, c.y + 2.7, zz);
    const per = 2.2 - c.diff * 0.5, ph = g * 0.55;
    c.upd((t) => {
      const open = Math.sin(t * (Math.PI * 2 / per) + ph) > 0.15;
      left.active = !open; right.active = !open;
      (left.mesh as THREE.Mesh).visible = !open;
      (right.mesh as THREE.Mesh).visible = !open;
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("laserHelix", "Лазерная спираль", 0.45, 1.2, (c) => {
  const L = 15;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.2, d: L, color: 0x1f2133, perfect: false });
  for (let k = 0; k < 6; k++) {
    const zz = p.z - L / 2 + 2 + k * 2.1;
    const arm = lbeam(c, c.x, c.y + 1.1, zz, 3.8, 0.14, 0.14);
    const sp = 1.6 + c.diff * 0.9;
    c.upd((t) => {
      const a = t * sp + k * 0.9;
      arm.x = c.x + Math.cos(a) * 1.1;
      arm.y = c.y + 1.1 + Math.sin(a * 0.5) * 0.5;
      arm.rot = a;
    });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("bounceLasers", "Батуты и лазеры", 0.35, 1.4, (c) => {
  const n = c.rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y + (i % 2) * 0.8, z: c.z + c.rng.range(2.0, 2.8) + 1.5, w: 2.8, d: 2.8, color: 0xff7eb9, surface: "bounce", bounce: 14 });
    if (i < n - 1) {
      const bar = lbeam(c, b.x, b.y + 2.2, b.z + 1.4, 3.2, 0.14, 0.14);
      blinker(c, bar, 1.8 - c.diff * 0.35, 0.5, i * 0.4);
    }
    c.end(b);
  }
  const e = c.p({ x: c.x, y: c.y + 0.5, z: c.z + 3, w: 4, d: 3.4, color: c.col(0) });
  c.end(e);
});

def("iceLaser", "Лёд и лазеры", 0.3, 1.5, (c) => {
  const L = c.rng.range(15, 18);
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5.2, d: L, color: 0xa8e0ff, surface: "ice", perfect: false });
  let zz = p.z - L / 2 + 2.5;
  let i = 0;
  while (zz < p.z + L / 2 - 1.5) {
    const post = lbeam(c, c.x, c.y, zz, 0.16, 0.16, 2.4);
    emitter(c, c.x, c.y + 2.6, zz);
    const amp = 2.0, sp = 1.2 + c.diff * 0.7, ph = i;
    c.upd((t) => { post.x = c.x + Math.sin(t * sp + ph) * amp; });
    c.wp(c.x, c.y, zz);
    zz += c.rng.range(2.5, 3.2);
    i++;
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("conveyorLaser", "Конвейер + лазеры", 0.35, 1.3, (c) => {
  const L = 16;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 4.6, d: L, color: 0x5a5f7a, surface: "conveyor", convZ: 2.4 + c.diff * 2, perfect: false });
  for (let g = 0; g < 4; g++) {
    const zz = p.z - L / 2 + 2.5 + g * 3.2;
    const bar = lbeam(c, c.x, c.y + 0.35, zz, 4.6, 0.14, 0.14);
    blinker(c, bar, 1.6 - c.diff * 0.3, 0.45, g * 0.5);
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("towerLaser", "Башня с лазерами", 0.5, 1.1, (c) => {
  const hgt = c.rng.range(6, 8);
  let yy = c.y;
  for (let i = 0; i < 5; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.2, 1.2)), y: yy + c.rng.range(1.0, 1.4), z: c.z + c.rng.range(1.8, 2.4) + 1.5, w: 2.6, d: 2.6, color: 0x3a3f55 });
    if (i % 2 === 1) {
      const arm = lbeam(c, b.x, b.y + 0.4, b.z, 4.5, 0.14, 0.14);
      c.upd((t) => { arm.rot = t * (1.3 + c.diff) * (i % 4 === 1 ? 1 : -1); });
    }
    yy = b.y;
    c.end(b);
  }
  const e = c.p({ x: c.x, y: yy + 0.8, z: c.z + 3, w: 4, d: 3.5, color: c.col(0) });
  c.end(e);
});

def("portalLasers", "Порталы и лазеры", 0.4, 1.2, (c) => {
  const a = c.p({ x: c.x - 2, y: c.y, z: c.z + 3, w: 3, d: 3, color: 0x7b5cff });
  const b = c.p({ x: c.x + 2, y: c.y + 2.5, z: c.z + 10, w: 3, d: 3, color: 0xff5fc8 });
  c.zone("portal", a.x, a.y + 1.5, a.z, 1.2, 1.5, 1.2, b.x, b.y + b.hy + 0.2, b.z);
  c.zone("portal", b.x, b.y + 1.5, b.z, 1.2, 1.5, 1.2, a.x, a.y + a.hy + 0.2, a.z);
  const bar = lbeam(c, c.x, c.y + 1.5, (a.z + b.z) / 2, 6, 0.14, 0.14);
  c.upd((t) => { bar.rot = t * (1.5 + c.diff); });
  c.end(a); c.end(b);
  const e = c.p({ x: c.x, y: b.y, z: b.z + 4, w: 4, d: 3.5, color: c.col(0) });
  c.end(e);
});

def("narrowLasers", "Узкий лазерный коридор", 0.45, 1.3, (c) => {
  const L = 18;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 2.4, d: L, color: 0x24263a, perfect: false });
  for (let i = 0; i < 7; i++) {
    const zz = p.z - L / 2 + 2 + i * 2.2;
    if (i % 2 === 0) {
      const bar = lbeam(c, c.x, c.y + 0.3, zz, 2.4, 0.12, 0.12);
      blinker(c, bar, 1.4 - c.diff * 0.25, 0.4, i * 0.35);
    } else {
      const post = lbeam(c, c.x, c.y, zz, 0.12, 0.12, 2.2);
      c.upd((t) => { post.x = c.x + Math.sin(t * (2 + c.diff) + i) * 0.7; });
    }
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("fanLasers", "Вентиляторы и лазеры", 0.4, 1.2, (c) => {
  const L = 15;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 5, d: L, color: 0x2b2d42, perfect: false });
  for (let g = 0; g < 3; g++) {
    const zz = p.z - L / 2 + 3.5 + g * 4;
    c.zone("wind", c.x, c.y + 2, zz, 2.5, 3, 2, 0, 0, c.rng.sign() * (3 + c.diff));
    const arm = lbeam(c, c.x, c.y + 0.35, zz, 5, 0.14, 0.14);
    c.upd((t) => { arm.rot = t * (1.2 + c.diff * 0.8) * (g % 2 ? -1 : 1); });
    c.wp(c.x, c.y, zz);
  }
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});

def("megaGauntlet", "Мега-гаунтлет", 0.65, 0.9, (c) => {
  const L = 22;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1 + L / 2, w: 3.6, d: L, color: 0x1a1c2e, perfect: false });
  const z0 = p.z - L / 2;
  for (let k = 0; k < 4; k++) {
    const zz = z0 + 2.2 + k * 2;
    const post = lbeam(c, c.x, c.y, zz, 0.16, 0.16, 2.5);
    c.upd((t) => { post.x = c.x + Math.sin(t * (2 + k * 0.3 + c.diff) + k) * 1.2; });
  }
  for (let k = 0; k < 3; k++) {
    const zz = z0 + 11 + k * 2;
    const bar = lbeam(c, c.x, c.y + 0.3, zz, 3.6, 0.14, 0.14);
    blinker(c, bar, 1.3, 0.45, k * 0.4);
  }
  const cz = z0 + 18.5;
  for (let j = 0; j < 3; j++) {
    const arm = lbeam(c, c.x, c.y + 0.35, cz, 3.5, 0.13, 0.13);
    c.upd((t) => { arm.rot = t * (2.4 + c.diff) + (j * Math.PI * 2) / 3; });
  }
  for (let k = 0; k < 6; k++) c.wp(c.x, c.y, z0 + 2 + k * 3.2);
  c.wp(c.x, c.y, p.z + L / 2 - 0.5);
  c.end(p);
});


// ========== 15 NEW SECTIONS ==========
// 5 long sections, 2 random maze types, plus varied mid-length challenges

