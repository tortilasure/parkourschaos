import * as THREE from "three";
import { def } from "../courseCore";

def("vanish", "Исчезающие плитки", 0.1, 2, (c) => {
  const n = c.rng.int(6, 9);
  for (let i = 0; i < n; i++) {
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-2, 2)), y: c.y + c.rng.range(-0.3, 0.5), z: c.z + c.gap(-0.3) + 1.1, w: 2.2, d: 2.2, color: 0x7ae7ff, surface: "vanish" });
    c.end(b);
  }
});
def("breakBridge", "Хрупкий мост", 0.1, 2, (c) => {
  const n = c.rng.int(10, 15);
  let z = c.z + 1.5;
  for (let i = 0; i < n; i++) {
    const b = c.plat({ x: c.x, y: c.y, z: z + 0.6, w: 2.6, d: 1.15, h: 0.4, color: i % 2 ? 0xc49a6c : 0xa47148, surface: "break", perfect: false, wp: i % 3 === 0 });
    z += 1.25;
    void b;
  }
  c.endAt(c.x, c.y, z);
  c.wp(c.x, c.y, z);
});
def("blink", "Мигающие платформы", 0.2, 2, (c) => {
  const n = c.rng.int(5, 7);
  const period = 3.0 - c.diff * 0.95;
  for (let i = 0; i < n; i++) {
    const grp = i % 2;
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y, z: c.z + c.gap() + 1.3, w: 2.6, d: 2.6, color: grp ? 0xff9f1c : 0x2ec4b6, unique: true });
    c.upd((t) => {
      const ph = ((t / period + grp * 0.5) % 1);
      b.active = ph < 0.62;
      const m = b.mesh as THREE.Mesh;
      const mm = m.material as THREE.MeshLambertMaterial;
      mm.opacity = ph > 0.45 && ph < 0.62 ? 0.3 + 0.7 * Math.abs(Math.sin(t * 20)) : 1;
    });
    c.end(b);
  }
});
