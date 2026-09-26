import * as THREE from "three";
import { def, getUnitBox, mat, spinner } from "../courseCore";

def("spinDiscs", "Вращающиеся диски", 0.1, 2, (c) => {
  const n = c.rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const r = c.rng.range(1.85, 2.6), sp = c.rng.range(1.25, 2.7) * c.rng.sign();
    const b = c.p({ x: c.clampX(c.x + c.rng.range(-1.5, 1.5)), y: c.y + c.rng.range(-0.3, 0.6), z: c.z + c.gap() + r, w: r * 2, d: r * 2, cyl: true, color: c.col(i) });
    const mark = new THREE.Mesh(getUnitBox(), mat(0xffffff));
    mark.scale.set(0.35 / b.hx, 0.1 / (2 * b.hy), 1.6 / b.hx);
    mark.position.set(0, 0.5, 0.5);
    b.mesh!.add(mark);
    c.upd((t) => { b.rot = t * sp; });
    c.end(b);
  }
});
def("sweeper", "Сметатель", 0.2, 2.5, (c) => {
  const r = 5.2;
  const disc = c.p({ x: c.x, y: c.y, z: c.z + 1.5 + r, w: r * 2, d: r * 2, cyl: true, color: c.col(0), perfect: false });
  spinner(c, disc.x, c.y, disc.z, r - 0.2, 1.55 + c.diff * 1.35, c.rng.sign());
  c.wp(disc.x + 3, c.y, disc.z);
  c.end(disc);
});
def("doubleSweeper", "Двойной сметатель", 0.4, 1.5, (c) => {
  const len = 16;
  const p = c.plat({ x: c.x, y: c.y, z: c.z + 1.2 + len / 2, w: 7, d: len, color: c.col(0), perfect: false });
  spinner(c, c.x, c.y, p.z - 4, 3.3, 2.25, 1, 0.5);
  spinner(c, c.x, c.y, p.z + 4, 3.3, 2.25, -1, 0.5, 1.5);
  c.wp(c.x + 2.5, c.y, p.z - 4); c.wp(c.x - 2.5, c.y, p.z + 4); c.wp(c.x, c.y, p.z + len / 2 - 0.5);
  c.end(p);
});
def("rotBeam", "Вращающийся мост", 0.3, 1.5, (c) => {
  const len = 12;
  const cz = c.z + 1.5 + len / 2;
  const sp = c.rng.range(0.35, 0.6) * c.rng.sign();
  const b = c.plat({ x: c.x, y: c.y, z: cz, w: 1.4, d: len, color: c.col(1), perfect: false });
  c.upd((t) => { b.rot = Math.sin(t * sp) * 0.9; });
  c.wp(c.x, c.y, cz);
  c.endAt(c.x, c.y, cz + len / 2 + 0.5);
  const e = c.p({ x: c.x, y: c.y, z: c.z + 1.5, w: 4, d: 3, color: c.col(0) });
  c.end(e);
});
def("crossSpin", "Крестовина", 0.3, 1.5, (c) => {
  const len = 10;
  const cz = c.z + 1.8 + len / 2;
  const sp = c.rng.range(0.5, 0.9) * c.rng.sign();
  const a = c.plat({ x: c.x, y: c.y, z: cz, w: 1.6, d: len, color: c.col(0), perfect: false });
  const b = c.plat({ x: c.x, y: c.y, z: cz, w: 1.6, d: len, color: c.col(1), perfect: false });
  c.upd((t) => { a.rot = t * sp; b.rot = t * sp + Math.PI / 2; });
  c.wp(c.x, c.y, cz);
  c.endAt(c.x, c.y, cz + len / 2 + 0.3);
  const e = c.p({ x: c.x, y: c.y, z: c.z + 1.8, w: 4, d: 3, color: c.col(2) });
  c.end(e);
});
