import { def } from "../courseCore";

def("wallrunCorridor", "Бег по стенам", 0.2, 2, (c) => {
  const L = c.rng.range(8, 10.5);
  const z0 = c.z;
  const side = c.rng.sign();
  // entry pad
  c.p({ x: c.x, y: c.y, z: z0 + 0.6, w: 3.0, d: 2.0, color: c.col(0) });
  c.plat({ x: c.x + side * 1.65, y: c.y + 3.5, z: z0 + 0.3 + (L + 0.7) / 2, w: 0.55, d: L + 0.7, h: 7, color: 0x5e60ce, wallrun: true, perfect: false });
  for (let k = 0; k < 3; k++) c.arrow(c.x + side * 1.25, c.y + 1.6, z0 + 1 + k * 3, 0, 0xffffff);
  c.wp(c.x + side * 1.0, c.y + 0.6, z0 + L * 0.5);
  // recovery pad under the run
  c.p({ x: c.x, y: c.y - 0.6, z: z0 + L / 2, w: 1.5, d: 1.5, color: c.col(1) });
  const e = c.p({ x: c.x + side * 0.4, y: c.y, z: z0 + L + 2.55, w: 4.4, d: 4.2, color: c.col(0) });
  c.end(e);
});
def("wallJumpShaft", "Шахта прыжков от стен", 0.3, 1.5, (c) => {
  const hgt = c.rng.int(4, 6) * 1.6;
  const cz = c.z + 3;
  c.plat({ x: c.x - 2, y: c.y + hgt + 1, z: cz, w: 0.6, d: 3.4, h: hgt + 4, color: 0x7209b7, wallrun: true, perfect: false });
  c.plat({ x: c.x + 2, y: c.y + hgt + 1, z: cz, w: 0.6, d: 3.4, h: hgt + 4, color: 0x7209b7, wallrun: true, perfect: false });
  const floor = c.plat({ x: c.x, y: c.y, z: cz, w: 3.4, d: 3.4, color: c.col(0) });
  void floor;
  c.plat({ x: c.x, y: c.y + hgt - 1, z: cz + 1.95, w: 4.6, d: 0.5, h: hgt + 3, color: 0x560bad, perfect: false });
  for (let k = 1; k * 1.6 < hgt; k++) {
    const sx = k % 2 ? -1 : 1;
    c.p({ x: c.x + sx * 1.15, y: c.y + k * 1.6, z: cz, w: 1.0, d: 1.2, h: 0.3, color: 0xf72585 });
  }
  const top = c.p({ x: c.x, y: c.y + hgt, z: cz + 3.7, w: 4, d: 3, color: c.col(1) });
  c.end(top);
});
def("alternateWalls", "Стена-стена", 0.4, 1.5, (c) => {
  // Closer walls + floor pads + clearer wallrun path so section is completable
  const n = c.rng.int(3, 5);
  let z = c.z + 0.8;
  let side = c.rng.sign();
  // start pad
  c.p({ x: c.x, y: c.y, z: z, w: 3.2, d: 2.2, color: c.col(0) });
  z += 2.4;
  for (let i = 0; i < n; i++) {
    const wallLen = 5.4;
    // wallrun surface closer to center (1.55) so jumps between sides are short
    c.plat({
      x: c.x + side * 1.55, y: c.y + 3.2, z: z + wallLen / 2,
      w: 0.55, d: wallLen, h: 6.5,
      color: i % 2 ? 0x4361ee : 0x4cc9f0, wallrun: true, perfect: false,
    });
    // small floor pad mid-segment as recovery / timing help
    c.p({
      x: c.x + side * 0.35, y: c.y - 0.15, z: z + wallLen * 0.55,
      w: 1.5, d: 1.3, h: 0.3, color: 0x7209b7,
    });
    c.arrow(c.x + side * 1.15, c.y + 1.4, z + 1.2, 0, 0xffffff);
    c.wp(c.x + side * 0.95, c.y + 0.7, z + wallLen * 0.45);
    z += wallLen + 0.9;
    side = -side;
  }
  const e = c.p({ x: c.x, y: c.y, z: z + 1.4, w: 4.0, d: 4.2, color: c.col(0) });
  c.end(e);
});
