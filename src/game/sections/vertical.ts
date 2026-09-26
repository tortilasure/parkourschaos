import * as THREE from "three";
import { def } from "../courseCore";

def("spiral", "Спираль", 0.2, 1.5, (c) => {
  const n = c.rng.int(7, 10);
  const r = 3.4;
  const cx = c.x, cz = c.z + 1 + r + 0.5;
  const dir = c.rng.sign();
  c.plat({ x: cx, y: c.y + n * 0.95 + 1, z: cz, w: 2.4, d: 2.4, h: n * 0.95 + 6, cyl: true, color: 0x3a3f55, perfect: false });
  let a = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: cx + Math.cos(a) * r, y: c.y + (i + 1) * 0.95, z: cz + Math.sin(a) * r, w: 2, d: 2, rot: -a, color: c.col(i) });
    void b;
    a += dir * 0.85;
  }
  const endY = c.y + n * 0.95;
  const e = c.p({ x: cx, y: endY + 0.3, z: cz + r + 2.2, w: 3, d: 2.5, color: c.col(1) });
  c.end(e);
});
def("tower", "Башня-лесенка", 0.2, 1.5, (c) => {
  // Helix of platforms around a central pillar — always climbable
  const n = c.rng.int(7, 9);
  const cx = c.x, cz = c.z + 4.0;
  const stepH = 1.15;
  // central pillar (decoration + collision)
  c.plat({ x: cx, y: c.y + n * stepH * 0.5, z: cz, w: 1.8, d: 1.8, h: n * stepH + 2, cyl: true, color: 0x4a4e69, perfect: false });
  // spiral steps — each offset 90° so jumps are short
  for (let i = 0; i < n; i++) {
    const ang = (i * Math.PI / 2);
    const ox = Math.cos(ang) * 2.0;
    const oz = Math.sin(ang) * 2.0;
    const yy = c.y + (i + 1) * stepH;
    c.p({ x: cx + ox, y: yy, z: cz + oz, w: 1.7, d: 1.7, color: c.col(i) });
    c.wp(cx + ox * 0.6, yy, cz + oz * 0.6);
  }
  const topY = c.y + n * stepH + 0.3;
  const e = c.p({ x: cx, y: topY, z: cz + 4.5, w: 3.4, d: 3.2, color: c.col(1) });
  c.end(e);
});
def("elevatorShaft", "Шахта лифтов", 0.2, 1.5, (c) => {
  // Stack of rising/falling platforms with safe intermediate ledges — always completable
  const n = c.rng.int(4, 5);
  let z = c.z + 1.2;
  let y = c.y;
  // entry pad
  c.p({ x: c.x, y: y, z: z, w: 3.2, d: 2.4, color: c.col(0) });
  z += 2.8;
  for (let i = 0; i < n; i++) {
    const amp = 1.4 + (i % 2) * 0.4;
    const sp = c.rng.range(0.85, 1.25);
    const ph = i * 1.1;
    const side = i % 2 === 0 ? -1.1 : 1.1;
    // moving elevator
    const elev = c.p({
      x: c.clampX(c.x + side), y: y + amp, z: z, w: 2.8, d: 2.6,
      color: c.col(i), emissive: 0.12,
    });
    const by = elev.y;
    c.upd((t) => { elev.y = by + Math.sin(t * sp + ph) * amp; });
    // static side ledge so you can wait for the lift
    c.p({
      x: c.clampX(c.x - side * 1.6), y: y + 0.3, z: z,
      w: 1.6, d: 1.8, h: 0.35, color: 0x5e60ce,
    });
    c.wp(c.x + side * 0.4, y + 0.5, z);
    y += 1.6;
    z += 3.0;
  }
  // exit platform a bit above last elevators
  const e = c.p({ x: c.x, y: y + 0.8, z: z + 1.2, w: 3.6, d: 3.4, color: c.col(1) });
  c.end(e);
});
def("timerBridge", "Мост на время", 0.2, 1.5, (c) => {
  const n = c.rng.int(12, 17);
  const tiles: Box[] = [];
  let z = c.z + 1.2;
  for (let i = 0; i < n; i++) {
    const b = c.plat({ x: c.x, y: c.y, z: z + 0.65, w: 2.8, d: 1.25, h: 0.45, color: i % 2 ? 0xffd166 : 0xef476f, surface: "timed", perfect: false, wp: i % 4 === 0, unique: true });
    tiles.push(b);
    z += 1.35;
  }
  let startT = -1;
  const secIdx = c.sec.index;
  const course = c.course;
  c.zone("trigger", c.x, c.y + 1, c.z + 1.8, 1.6, 1.5, 0.6, 0, 0, 0, () => {
    if (startT < 0) { startT = course.localTime; course.onMsg(t("pop.bridgeRun")); }
  });
  void secIdx;
  c.local((lt, dt) => {
    if (startT < 0) return;
    const el = lt - startT - 0.8;
    tiles.forEach((b, i) => {
      const fallAt = i * (1.35 / (7.4 + c.diff * 1.6));
      const m = b.mesh as THREE.Mesh;
      const mm = m.material as THREE.MeshLambertMaterial;
      if (el > fallAt - 0.6 && b.active) mm.emissive.setHex(0xff0000), (mm.emissiveIntensity = 0.5 + 0.5 * Math.sin(lt * 30));
      if (el > fallAt && b.active) { b.active = false; b.state = 2; }
      if (b.state === 2) b.y -= dt * 12;
    });
  });
  c.onReset(() => {
    startT = -1;
    tiles.forEach((b) => { b.active = true; b.state = 0; b.y = b.baseY; const mm = (b.mesh as THREE.Mesh).material as THREE.MeshLambertMaterial; mm.emissive.setHex(0); });
  });
  c.endAt(c.x, c.y, z);
  c.wp(c.x, c.y, z);
});
