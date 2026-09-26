import * as THREE from "three";
import { Course, Ctx, RNG, Section, ensureShade, getUnitBox, getUnitCyl, mat, textSprite } from "./course";
import { Box } from "./physics";
import { t } from "./i18n";
import { fmtTime } from "./data";

export interface HubCoin { mesh: THREE.Object3D; pos: THREE.Vector3; taken: boolean }
export interface RaceGate { pos: THREE.Vector3; ring: THREE.Mesh }
export interface HoloEntry { name: string; timeMs: number }

export interface Hub {
  course: Course;
  tags: Map<Box, string>;
  spawn: THREE.Vector3;
  wander: THREE.Vector3[];
  coins: HubCoin[];
  raceGates: RaceGate[];
  balanceDisc: Box;
  drawHolo: (rows: HoloEntry[]) => void;
  signs: { mesh: THREE.Mesh; key: string; color: string }[];
  refreshSigns: () => void;
}

/** Main island radius (~5× original 32) */
const ISLAND_R = 155;
const ISLAND_D = ISLAND_R * 2;

function makeSign(c: Ctx, key: string, x: number, y: number, z: number, color: string, yaw: number, out: { mesh: THREE.Mesh; key: string; color: string }[]) {
  const tex = textSprite(t(key), color, "rgba(0,0,0,0)", 1024, 160, 92);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  c.add(m);
  c.course.track(tex); c.course.track(m.geometry);
  c.course.animated.push({ obj: m, fn: (tt) => { m.position.y = y + Math.sin(tt * 1.5 + x) * 0.15; } });
  out.push({ mesh: m, key, color });
  return m;
}

function archGate(c: Ctx, x: number, z: number, yaw: number, color: number, w = 6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(getUnitCyl(), mat(color));
    post.scale.set(0.28, 4.4, 0.28);
    post.position.set((sx * w) / 2, 2.2, 0);
    post.castShadow = true;
    g.add(post);
  }
  const top = new THREE.Mesh(getUnitBox(), mat(color));
  top.scale.set(w + 0.8, 0.5, 0.5);
  top.position.y = 4.5;
  g.add(top);
  for (let i = 0; i < 5; i++) {
    const flag = new THREE.Mesh(getUnitBox(), mat(i % 2 ? 0xffd23f : 0xff5fc8, 0.2));
    flag.scale.set(0.5, 0.6, 0.05);
    flag.position.set(-w / 2 + 0.6 + i * (w / 5), 4.05, 0);
    g.add(flag);
    c.course.animated.push({ obj: flag, fn: (tt) => { flag.rotation.x = Math.sin(tt * 3 + i) * 0.35; } });
  }
  c.add(g);
  return g;
}

/** Registered path corridors — used to keep props off roads */
const PATH_CORRIDORS: { x0: number; z0: number; x1: number; z1: number; halfW: number }[] = [];

function nearPath(x: number, z: number, margin = 0): boolean {
  for (const p of PATH_CORRIDORS) {
    const dx = p.x1 - p.x0, dz = p.z1 - p.z0;
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - p.x0) * dx + (z - p.z0) * dz) / (len * len)));
    const px = p.x0 + dx * t, pz = p.z0 + dz * t;
    if (Math.hypot(x - px, z - pz) < p.halfW + margin) return true;
  }
  return false;
}

/** Path of flat plates from (x0,z0) toward (x1,z1) — single strip, no overlap mess */
function pathTo(c: Ctx, x0: number, z0: number, x1: number, z1: number, color = 0xe8d5bd, w = 3.2) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 1) return;
  PATH_CORRIDORS.push({ x0, z0, x1, z1, halfW: w * 0.55 });
  const ang = Math.atan2(dx, dz);
  // one continuous row of non-overlapping tiles
  const step = 3.6;
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + dx * t, z = z0 + dz * t;
    c.plat({ x, y: 0.1, z, w, d: step + 0.15, h: 0.16, rot: ang, color, perfect: false });
  }
}

/** Small candy building — roof sits flush on the walls */
function littleHouse(c: Ctx, x: number, z: number, col: number, roof: number, h = 3.2, s = 3.4) {
  // walls (collision + visual). Ctx.plat treats `y` as the TOP surface height
  // (it subtracts h/2 internally), so pass the full wall height here — not
  // half of it — or the walls sink into the ground and the roof ends up
  // floating above them with a visible gap.
  c.plat({ x, y: h, z, w: s, d: s, h, color: col, perfect: false });
  // roof cone: bottom of cone rests on top of walls
  const roofH = s * 0.5;
  c.deco(new THREE.ConeGeometry(s * 0.78, roofH, 6), roof, x, h + roofH * 0.5, z);
  // door slightly inset on front face
  c.deco(getUnitBox(), 0x3b2a1a, x, 0.95, z + s * 0.5 + 0.02, 0.65, 1.5, 0.06);
  // window
  c.deco(getUnitBox(), 0xfff3b0, x + s * 0.25, 1.85, z + s * 0.5 + 0.02, 0.5, 0.5, 0.05, 0.35);
}

/**
 * Tall unclimbable hex mountain.
 * Clean hex cylinder body + snow peak (no misaligned side boxes).
 */
function hexMountain(c: Ctx, x: number, z: number, radius: number, height: number, col: number, rng: RNG) {
  const h = height;
  // Every mountain sharing the exact same yaw (PI/6) made the whole range
  // look like copy-pasted hexagons from most angles. Randomize it per peak.
  const yaw = Math.PI / 6 + rng.range(0, Math.PI / 3);
  const tint = new THREE.Color(col);
  const baseCol = tint.clone().multiplyScalar(0.9).getHex();

  // Collision slightly smaller than visual
  c.plat({ x, y: h * 0.45, z, w: radius * 1.55, d: radius * 1.55, h: h * 0.9, color: col, perfect: false });

  // darker foot ring, a subtle two-tone base so the silhouette doesn't read flat
  const foot = new THREE.Mesh(
    ensureShade(new THREE.CylinderGeometry(radius * 1.08, radius * 1.22, h * 0.22, 6)),
    mat(tint.clone().multiplyScalar(0.72).getHex()),
  );
  foot.position.set(x, h * 0.11, z);
  foot.rotation.y = yaw;
  foot.castShadow = true;
  foot.receiveShadow = true;
  c.add(foot);
  c.course.track(foot.geometry);

  const body = new THREE.Mesh(
    ensureShade(new THREE.CylinderGeometry(radius * 0.92, radius * 1.05, h, 6)),
    mat(baseCol),
  );
  body.position.set(x, h * 0.5, z);
  body.rotation.y = yaw;
  body.castShadow = true;
  body.receiveShadow = true;
  c.add(body);
  c.course.track(body.geometry);

  const shoulder = new THREE.Mesh(
    ensureShade(new THREE.CylinderGeometry(radius * 0.55, radius * 0.85, h * 0.35, 6)),
    mat(tint.clone().multiplyScalar(0.85).getHex()),
  );
  shoulder.position.set(x, h * 0.72, z);
  shoulder.rotation.y = yaw;
  shoulder.castShadow = true;
  c.add(shoulder);
  c.course.track(shoulder.geometry);

  const peakH = radius * 1.15 + rng.range(2, 5);
  const peak = new THREE.Mesh(ensureShade(new THREE.ConeGeometry(radius * 0.72, peakH, 6)), mat(col));
  peak.position.set(x, h + peakH * 0.35, z);
  peak.rotation.y = yaw;
  peak.castShadow = true;
  c.add(peak);
  c.course.track(peak.geometry);

  // snow line height varies so peaks don't all get capped identically
  const snowFrac = rng.range(0.34, 0.7);
  const snow = new THREE.Mesh(
    ensureShade(new THREE.ConeGeometry(radius * 0.38, peakH * snowFrac, 6)),
    mat(0xf0f4ff),
  );
  snow.position.set(x, h + peakH * (0.85 - snowFrac / 2), z);
  snow.rotation.y = yaw;
  c.add(snow);
  c.course.track(snow.geometry);
}

export function buildHub(): Hub {
  PATH_CORRIDORS.length = 0;
  const course = new Course();
  const sec: Section = { index: 0, type: "hub", name: "Hub", zStart: -999, zEnd: 999, minY: -2, maxY: 80, spawn: new THREE.Vector3(0, 0, -4), boxes: [], zones: [], updaters: [], locals: [], resets: [], wps: [], visible: true };
  course.sections = [sec];
  const rng = new RNG(777);
  const c = new Ctx(course, sec, rng, 0, 0, 0, 0);
  const tags = new Map<Box, string>();
  const signs: { mesh: THREE.Mesh; key: string; color: string }[] = [];
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc1 = new THREE.Vector3(1, 1, 1);

  // ===================== BIG ISLAND (~5×) =====================
  c.plat({ x: 0, y: 0, z: 0, w: ISLAND_D, d: ISLAND_D, h: 3, cyl: true, color: 0x7bd88f, perfect: false });
  c.deco(getUnitCyl(), 0x6bc47d, 0, -1.4, 0, ISLAND_R - 1, 1.2, ISLAND_R - 1);
  c.deco(getUnitCyl(), 0xc9a36b, 0, -4.2, 0, ISLAND_R - 4, 5, ISLAND_R - 4);
  c.deco(getUnitCyl(), 0xa37b4b, 0, -9, 0, ISLAND_R - 18, 6, ISLAND_R - 18);
  c.deco(getUnitCyl(), 0x8a6239, 0, -14, 0, ISLAND_R - 40, 7, ISLAND_R - 40);

  // central plaza
  c.plat({ x: 0, y: 0.08, z: 0, w: 28, d: 28, h: 0.2, cyl: true, color: 0xf6ead8, perfect: false });
  c.deco(getUnitCyl(), 0xe8d5bd, 0, 0.1, 0, 11, 0.06, 11);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    c.deco(getUnitBox(), i % 2 ? 0xffd9a0 : 0xffc06c, Math.cos(a) * 12.5, 0.1, Math.sin(a) * 12.5, 2, 0.06, 2);
  }

  // fountain
  c.plat({ x: 0, y: 0.95, z: 0, w: 6.4, d: 6.4, h: 0.95, cyl: true, color: 0xb6c0e6, perfect: false });
  const water = c.deco(getUnitCyl(), 0x4cc9f0, 0, 0.97, 0, 2.8, 0.05, 2.8, 0.35);
  c.plat({ x: 0, y: 2.7, z: 0, w: 1.0, d: 1.0, h: 1.8, cyl: true, color: 0xb6c0e6, perfect: false });
  const jet = c.deco(getUnitCyl(), 0xaaf0ff, 0, 3.5, 0, 0.28, 1.8, 0.28, 0.7);
  const dropsMesh = new THREE.InstancedMesh(ensureShade(new THREE.IcosahedronGeometry(0.12, 0)), mat(0xaaf0ff, 0.5), 28);
  dropsMesh.frustumCulled = false;
  c.add(dropsMesh);
  course.animated.push({
    obj: water,
    fn: (tt) => {
      jet.scale.y = 1.5 + Math.sin(tt * 6) * 0.35;
      for (let i = 0; i < 28; i++) {
        const ph = (tt * 0.9 + i / 28) % 1;
        const a = i * 2.3;
        const r = ph * 2.4;
        m4.compose(new THREE.Vector3(Math.cos(a) * r, 4.8 - 9 * (ph - 0.35) * (ph - 0.35) - 0.5, Math.sin(a) * r), qq, sc1);
        dropsMesh.setMatrixAt(i, m4);
      }
      dropsMesh.instanceMatrix.needsUpdate = true;
    },
  });
  makeSign(c, "app.title", 0, 6.8, 0, "#ff5fc8", Math.PI, signs);

  // ---------------- minigame anchors (spread across big island) ----------------
  // N  parkour     (0, 55)
  // E  precision   (70, 0)
  // W  reaction    (-70, 0)
  // S  tower       (0, -55)
  // NE coins       (55, 55)
  // NW balance     (-55, 55)
  // SE race        (55, -55)
  // SW practice/weekly near south-west plaza edge
  const P = {
    parkour: { x: 0, z: 55 },
    precision: { x: 70, z: 0 },
    reaction: { x: -70, z: 0 },
    tower: { x: 0, z: -55 },
    coins: { x: 55, z: 55 },
    balance: { x: -55, z: 55 },
    race: { x: 55, z: -55 },
    practice: { x: -35, z: -40 },
    // Was (35, -40) — almost the same bearing from the plaza as `race`
    // (55, -55), so their road strips ran side by side and overlapped
    // ("path on path"). Moved further south, roughly bisecting the gap
    // between `tower` and `race`, so its road fans out at a clearly
    // different angle.
    weekly: { x: 20, z: -49 },
  };

  // paths from plaza (~12 radius) toward each zone
  pathTo(c, 0, 14, P.parkour.x, P.parkour.z - 8, 0x7dffcf, 3.6);
  pathTo(c, 14, 0, P.precision.x - 10, P.precision.z, 0xffd166, 3.6);
  pathTo(c, -14, 0, P.reaction.x + 10, P.reaction.z, 0xff8fa3, 3.6);
  pathTo(c, 0, -14, P.tower.x, P.tower.z + 8, 0x9dffc4, 3.6);
  pathTo(c, 10, 10, P.coins.x - 8, P.coins.z - 8, 0xffe39a, 3.4);
  pathTo(c, -10, 10, P.balance.x + 8, P.balance.z - 8, 0xd3b6ff, 3.4);
  pathTo(c, 12, -6, P.race.x - 8, P.race.z + 8, 0xa5e9ff, 3.4);
  pathTo(c, -8, -12, P.practice.x, P.practice.z + 4, 0x8ecae6, 3.2);
  pathTo(c, 4, -14, P.weekly.x, P.weekly.z + 4, 0xffe39a, 3.2);

  // blocked regions: plaza, minigames, ALL paths (keep roads clear)
  const blocked = (x: number, z: number) => {
    if (Math.hypot(x, z) < 18) return true;
    if (nearPath(x, z, 2.2)) return true; // nothing on roads
    const near = (px: number, pz: number, r: number) => Math.hypot(x - px, z - pz) < r;
    if (near(P.parkour.x, P.parkour.z, 20)) return true;
    if (near(P.precision.x, P.precision.z, 16)) return true;
    if (near(P.reaction.x, P.reaction.z, 14)) return true;
    if (near(P.tower.x, P.tower.z, 18)) return true;
    if (near(P.coins.x, P.coins.z, 18)) return true;
    if (near(P.balance.x, P.balance.z, 10)) return true; // empty path zone only
    if (near(P.race.x, P.race.z, 16)) return true;
    if (near(P.practice.x, P.practice.z, 10)) return true;
    if (near(P.weekly.x, P.weekly.z, 10)) return true;
    if (Math.hypot(x, z) > ISLAND_R - 22) return true;
    return false;
  };

  // ---------------- nature + small buildings (never on paths) ----------------
  for (let i = 0; i < 340; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(20, ISLAND_R - 26);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blocked(x, z)) continue;
    const kind = rng.next();
    if (kind < 0.46) {
      // trees — more & taller
      c.plat({ x, y: 1.8, z, w: 0.75, d: 0.75, h: 1.8, cyl: true, color: 0x8d5a3b, perfect: false });
      const s = rng.range(1.8, 3.6);
      const tree = new THREE.Mesh(ensureShade(new THREE.ConeGeometry(s, s * 2.4, 7)), mat(rng.pick([0x2ec27e, 0x57cc99, 0x38b000, 0xff8fab, 0x9be564, 0x40916c])));
      tree.position.set(x, 1.8 + s * 1.15, z);
      tree.castShadow = true;
      c.add(tree);
      course.track(tree.geometry);
      course.animated.push({ obj: tree, fn: (tt) => { tree.rotation.z = Math.sin(tt * 1.2 + x) * 0.03; } });
    } else if (kind < 0.72) {
      // rocks — explicit size tiers (huge / big / medium / small) instead of
      // one continuous range, so every scale actually shows up.
      const tierRoll = rng.next();
      let rw: number, rh: number;
      if (tierRoll < 0.08) { rw = rng.range(4.0, 5.6); rh = rng.range(2.2, 3.4); } // huge
      else if (tierRoll < 0.28) { rw = rng.range(2.4, 3.6); rh = rng.range(1.3, 2.0); } // big
      else if (tierRoll < 0.62) { rw = rng.range(1.1, 2.2); rh = rng.range(0.6, 1.2); } // medium
      else { rw = rng.range(0.4, 0.9); rh = rng.range(0.22, 0.5); } // small
      const rockCol = rng.pick([0xb8b8d1, 0x9aa0b8, 0x8b8fa3, 0xc5c9d6]);
      c.plat({ x, y: rh / 2, z, w: rw, d: rw * rng.range(0.7, 1.2), rot: rng.range(0, 3), h: rh, color: rockCol, perfect: false });
      // big rocks get a couple of small pebbles scattered beside them
      if (rw > 2.4) {
        for (let k = 0; k < 2; k++) {
          const ox = x + rng.range(-rw, rw), oz = z + rng.range(-rw, rw);
          if (blocked(ox, oz)) continue;
          const prw = rng.range(0.3, 0.7), prh = rng.range(0.18, 0.4);
          c.plat({ x: ox, y: prh / 2, z: oz, w: prw, d: prw * rng.range(0.7, 1.2), rot: rng.range(0, 3), h: prh, color: rng.pick([0xb8b8d1, 0x9aa0b8, 0x8b8fa3, 0xc5c9d6]), perfect: false });
        }
      }
    } else if (kind < 0.82) {
      // houses: 1.5x bigger, and kept away from the central plaza so they
      // read as an outer "village ring" rather than crowding the hub.
      if (Math.hypot(x, z) < 45) continue;
      littleHouse(
        c, x, z,
        rng.pick([0xffb3c1, 0xa5d8ff, 0xffe066, 0xd0bfff, 0xb2f2bb]),
        rng.pick([0xff5d8f, 0x4cc9f0, 0xff9f1c, 0x9b5de5, 0x06d6a0]),
        rng.range(2.8, 4.0) * 1.5,
        rng.range(3.0, 4.0) * 1.5,
      );
    } else if (kind < 0.9) {
      const h = rng.range(2.2, 4.5);
      c.plat({ x, y: h / 2, z, w: 1.3, d: 1.3, h, color: rng.pick([0xff5d8f, 0x4cc9f0, 0xffb703, 0xb388eb]), perfect: false });
      c.deco(new THREE.SphereGeometry(0.5, 8, 6), 0xffd23f, x, h + 0.35, z, 1, 1, 1, 0.3);
    } else {
      c.deco(new THREE.SphereGeometry(rng.range(0.8, 1.4), 8, 6), rng.pick([0x57cc99, 0x2ec27e, 0x74c69d]), x, 0.55, z);
    }
  }

  // taller denser grass
  const tuft = new THREE.InstancedMesh(ensureShade(new THREE.ConeGeometry(0.18, 0.85, 4)), mat(0x5fce7d), 900);
  tuft.frustumCulled = false;
  for (let i = 0; i < 900; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(16, ISLAND_R - 14);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hide = blocked(x, z);
    m4.compose(
      new THREE.Vector3(x, hide ? -99 : 0.25, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 3)),
      new THREE.Vector3(1, rng.range(0.9, 2.2), 1),
    );
    tuft.setMatrixAt(i, m4);
  }
  c.add(tuft);

  // low, dense understory grass beneath/around the tall tufts
  const lowGrass = new THREE.InstancedMesh(ensureShade(new THREE.ConeGeometry(0.1, 0.32, 4)), mat(0x7fe28f), 1100);
  lowGrass.frustumCulled = false;
  for (let i = 0; i < 1100; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(14, ISLAND_R - 12);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hide = blocked(x, z);
    m4.compose(
      new THREE.Vector3(x, hide ? -99 : 0.1, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 3)),
      new THREE.Vector3(rng.range(0.8, 1.3), rng.range(0.45, 1.0), rng.range(0.8, 1.3)),
    );
    lowGrass.setMatrixAt(i, m4);
  }
  c.add(lowGrass);

  // fireflies across the big island
  const flies = new THREE.InstancedMesh(ensureShade(new THREE.IcosahedronGeometry(0.09, 0)), mat(0xfff3b0, 1), 100);
  flies.frustumCulled = false;
  c.add(flies);
  course.animated.push({
    obj: flies,
    fn: (tt) => {
      for (let i = 0; i < 100; i++) {
        const a = i * 1.7 + tt * (0.2 + (i % 5) * 0.05);
        const r = 14 + (i % 14) * 8;
        m4.compose(new THREE.Vector3(Math.cos(a) * r, 1.5 + Math.sin(tt * 1.5 + i) * 0.8 + (i % 4) * 0.35, Math.sin(a) * r), qq, sc1);
        flies.setMatrixAt(i, m4);
      }
      flies.instanceMatrix.needsUpdate = true;
    },
  });

  // lamps around plaza
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const lx = Math.cos(a) * 14.5, lz = Math.sin(a) * 14.5;
    c.deco(getUnitCyl(), 0x2b2d42, lx, 1.7, lz, 0.1, 3.4, 0.1);
    const bulb = c.deco(new THREE.SphereGeometry(0.32, 10, 8), 0xfff3b0, lx, 3.5, lz, 1, 1, 1, 1);
    course.animated.push({ obj: bulb, fn: (tt) => { (bulb.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.75 + Math.sin(tt * 2 + i) * 0.25; } });
  }
  // balloons
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const bx = Math.cos(a) * 22, bz = Math.sin(a) * 22;
    const col = [0xff5d8f, 0x4cc9f0, 0xffd23f, 0x9b5de5, 0x06d6a0][i % 5];
    const balloon = c.deco(new THREE.SphereGeometry(0.8, 10, 8), col, bx, 6.5, bz, 1, 1.25, 1, 0.25);
    c.deco(getUnitCyl(), 0xffffff, bx, 4.8, bz, 0.03, 2.2, 0.03);
    course.animated.push({ obj: balloon, fn: (tt) => { balloon.position.y = 6.5 + Math.sin(tt * 1.1 + i) * 0.55; balloon.rotation.z = Math.sin(tt + i) * 0.12; } });
  }

  // windmill (decorative) — blades clear of the tower body
  {
    const wx = -40, wz = -30;
    // tower body
    c.plat({ x: wx, y: 4.5, z: wz, w: 2.8, d: 2.8, h: 9, cyl: true, color: 0xf3e9dc, perfect: false });
    c.deco(new THREE.ConeGeometry(2.0, 1.8, 8), 0xff5d8f, wx, 9.5, wz);
    // hub on the FRONT face only (outside the cylinder)
    const rotor = new THREE.Group();
    rotor.position.set(wx, 6.2, wz + 1.55);
    const hub = new THREE.Mesh(getUnitCyl(), mat(0x5a5a6e));
    hub.scale.set(0.35, 0.25, 0.35);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(getUnitBox(), mat(0xf8f8ff));
      blade.scale.set(0.28, 2.8, 0.07);
      blade.position.y = 1.5;
      const holder = new THREE.Group();
      holder.rotation.z = (i / 4) * Math.PI * 2;
      holder.add(blade);
      rotor.add(holder);
    }
    c.add(rotor);
    course.animated.push({ obj: rotor, fn: (tt) => { rotor.rotation.z = tt * 0.7; } });
  }

  // ===================== N: MINI PARKOUR (stays inside island) =====================
  {
    const px = P.parkour.x, pz = P.parkour.z;
    archGate(c, px, pz - 10, 0, 0x06d6a0, 8);
    const ms = c.plat({ x: px, y: 0.3, z: pz - 6, w: 4.5, d: 3.2, h: 0.4, color: 0x06d6a0, perfect: false });
    tags.set(ms, "mini_start");
    makeSign(c, "mini.parkour", px, 3.5, pz - 6, "#7dffcf", Math.PI, signs);

    // compact course — finishes well before island edge (z max ~ pz+35 < 100 < 155)
    let z = pz - 3, y = 0.3;
    const mini: [number, number, number, number][] = [
      [2.2, 1.0, 2.6, 2.0],
      [-2.4, 1.8, 2.4, 1.9],
      [0, 2.6, 2.5, 1.8],
      [2.8, 3.4, 2.8, 1.7],
      [-1.5, 4.0, 2.2, 1.6],
      [2.0, 4.6, 2.4, 1.6],
      [-2.6, 5.2, 2.5, 1.5],
      [0.5, 5.8, 2.3, 1.5],
      [2.2, 6.3, 2.4, 1.6],
      [-1.8, 6.8, 2.2, 1.5],
    ];
    for (const [dx, dy, gap, s] of mini) {
      y = dy; z += gap + s / 2;
      const b = c.plat({ x: px + dx, y, z, w: s, d: s, color: rng.pick([0xff5d8f, 0x4cc9f0, 0xffb703, 0xb388eb, 0x80ed99]) });
      if (dy > 3 && dy < 4.5) {
        const bx = b.x;
        c.upd((tt) => { b.x = bx + Math.sin(tt * 1.25) * 1.4; });
      }
      z += s / 2;
    }
    const mf = c.plat({ x: px, y: 7.2, z: z + 2.5, w: 4.2, d: 3.2, h: 0.4, color: 0xffd23f, perfect: false });
    tags.set(mf, "mini_finish");
    // return ramp stays on island
    c.plat({ x: px, y: 3.6, z: z + 5, w: 2, d: 2.5, slope: -3.6 / 2.5, color: 0xffd23f, perfect: false });
    c.plat({ x: px, y: 0.1, z: z + 8, w: 3.5, d: 4, surface: "conveyor", convZ: -6, color: 0xffffff, perfect: false });
  }

  // hologram near parkour start
  const holoCanvas = document.createElement("canvas");
  holoCanvas.width = 512; holoCanvas.height = 384;
  const holoTex = new THREE.CanvasTexture(holoCanvas);
  holoTex.colorSpace = THREE.SRGBColorSpace;
  course.track(holoTex);
  const drawHolo = (rows: HoloEntry[]) => {
    const g = holoCanvas.getContext("2d")!;
    g.clearRect(0, 0, 512, 384);
    g.fillStyle = "rgba(20,230,255,0.12)";
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = "rgba(120,245,255,0.85)";
    g.lineWidth = 6;
    g.strokeRect(6, 6, 500, 372);
    g.fillStyle = "#b8faff";
    g.font = "900 40px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(t("mini.holoTitle"), 256, 56);
    g.font = "800 30px system-ui, sans-serif";
    if (!rows.length) {
      g.fillStyle = "#8fe9ff";
      g.fillText(t("mini.holoEmpty"), 256, 200);
    }
    rows.slice(0, 6).forEach((r, i) => {
      const yy = 110 + i * 44;
      g.textAlign = "left";
      g.fillStyle = i === 0 ? "#fff27a" : "#d9fbff";
      g.fillText(`${i + 1}.`, 34, yy);
      g.fillText(r.name.slice(0, 12), 86, yy);
      g.textAlign = "right";
      g.fillText(fmtTime(r.timeMs), 478, yy);
      g.fillStyle = "rgba(120,245,255,0.25)";
      g.fillRect(30, yy + 10, 450, 2);
    });
    holoTex.needsUpdate = true;
  };
  drawHolo([]);
  {
    const hx = P.parkour.x - 8, hz = P.parkour.z - 8;
    c.plat({ x: hx, y: 0.7, z: hz, w: 3.2, d: 3.2, h: 0.7, cyl: true, color: 0x3a3f55, perfect: false });
    c.deco(getUnitCyl(), 0x4cc9f0, hx, 0.78, hz, 1.3, 0.1, 1.3, 0.8);
    for (let i = 0; i < 3; i++) c.deco(getUnitCyl(), 0x2b2d42, hx + Math.cos(i * 2.1) * 1.1, 1.6, hz + Math.sin(i * 2.1) * 1.1, 0.12, 2, 0.12);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.45), new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    panel.position.set(hx, 3.9, hz);
    panel.rotation.y = -0.45;
    c.add(panel);
    course.track(panel.geometry);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.9, 3.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(hx, 2.5, hz);
    c.add(beam);
    course.track(beam.geometry);
    course.animated.push({
      obj: panel,
      fn: (tt) => {
        panel.position.y = 3.9 + Math.sin(tt * 1.3) * 0.12;
        (panel.material as THREE.MeshBasicMaterial).opacity = 0.82 + Math.sin(tt * 9) * 0.07;
        beam.rotation.y = tt * 0.6;
      },
    });
  }

  // ===================== E: precision =====================
  {
    const px = P.precision.x, pz = P.precision.z;
    archGate(c, px - 8, pz, Math.PI / 2, 0xff9f1c, 7);
    c.plat({ x: px - 4, y: 3.5, z: pz, w: 3.4, d: 3.4, h: 3.5, color: 0xff9f1c, perfect: false });
    c.plat({ x: px - 6.5, y: 1.75, z: pz, w: 2.2, d: 3.2, color: 0xffb703, perfect: false, h: 1.75 });
    makeSign(c, "mini.precision", px - 4, 7, pz, "#ffd166", -Math.PI / 2, signs);
    for (const [tx, tz] of [[px + 2, pz + 3], [px + 6, pz - 2.5], [px + 10, pz + 1.5]] as [number, number][]) {
      const tb = c.plat({ x: tx, y: 1.2, z: tz, w: 2.5, d: 2.5, h: 1.2, cyl: true, color: 0xffffff, perfect: false });
      for (const [rr, col] of [[0.95, 0xff3355], [0.55, 0xffffff], [0.25, 0xff3355]] as [number, number][]) {
        c.deco(getUnitCyl(), col, tx, 1.21, tz, rr, 0.02, rr);
      }
      tags.set(tb, "target");
    }
  }

  // ===================== W: reaction =====================
  {
    const px = P.reaction.x, pz = P.reaction.z;
    archGate(c, px + 8, pz, Math.PI / 2, 0xef476f, 7);
    const rp = c.plat({ x: px + 4, y: 0.35, z: pz, w: 3.4, d: 3.4, h: 0.5, cyl: true, color: 0xef233c, perfect: false, emissive: 0.3 });
    tags.set(rp, "reaction");
    c.plat({ x: px + 0.5, y: 2.2, z: pz, w: 0.5, d: 3.2, h: 2.2, color: 0x2b2d42, perfect: false });
    const lamp = c.deco(getUnitCyl(), 0x00ff88, px + 1, 3.4, pz, 0.55, 0.22, 0.55, 1);
    lamp.rotation.z = Math.PI / 2;
    course.animated.push({ obj: lamp, fn: (tt) => { (lamp.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.5 + Math.abs(Math.sin(tt * 2)) * 0.8; } });
    makeSign(c, "mini.reaction", px + 4, 4.8, pz, "#ff8fa3", Math.PI / 2, signs);
  }

  // ===================== S: trampoline tower =====================
  {
    const px = P.tower.x, pz = P.tower.z;
    archGate(c, px, pz + 10, 0, 0x3cff9e, 7);
    const tb0 = c.plat({ x: px, y: 0.35, z: pz + 6, w: 2.8, d: 2.8, h: 0.4, cyl: true, color: 0x3cff9e, surface: "bounce", bounce: 16 });
    tags.set(tb0, "tower_start");
    for (const [sx, sy, sz] of [[3, 4, pz + 2], [0, 7.5, pz - 2], [-3, 11, pz + 1], [0, 14.5, pz + 4]] as [number, number, number][]) {
      c.plat({ x: sx, y: sy, z: sz, w: 2.4, d: 2.4, h: 0.4, cyl: true, color: 0x3cff9e, surface: "bounce", bounce: 16 });
    }
    const top = c.plat({ x: px, y: 17, z: pz, w: 3.4, d: 3.4, color: 0xffd23f, perfect: false });
    tags.set(top, "tower_top");
    const star = new THREE.Mesh(ensureShade(new THREE.OctahedronGeometry(0.65)), mat(0xffe14d, 0.8));
    star.position.set(px, 18.4, pz);
    c.add(star);
    course.track(star.geometry);
    course.animated.push({ obj: star, fn: (tt) => { star.rotation.y = tt * 2; star.position.y = 18.4 + Math.sin(tt * 3) * 0.2; } });
    makeSign(c, "mini.tower", px, 3.6, pz + 10, "#9dffc4", 0, signs);
  }

  // ===================== NE: coin rush =====================
  const coins: HubCoin[] = [];
  {
    const cxx = P.coins.x, czz = P.coins.z;
    archGate(c, cxx - 10, czz - 10, -Math.PI / 4, 0xffd23f, 6);
    const coinPad = c.plat({ x: cxx - 6, y: 0.35, z: czz - 6, w: 3.2, d: 3.2, h: 0.5, cyl: true, color: 0xffd23f, perfect: false, emissive: 0.25 });
    tags.set(coinPad, "coin_start");
    makeSign(c, "mini.coins", cxx - 6, 3.4, czz - 6, "#ffe39a", -Math.PI / 4, signs);
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20);
    course.track(coinGeo);
    const coinCanvas = document.createElement("canvas");
    coinCanvas.width = 128; coinCanvas.height = 128;
    {
      const g = coinCanvas.getContext("2d")!;
      g.fillStyle = "#ffd23f";
      g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#b8860b"; g.lineWidth = 10; g.stroke();
      g.strokeStyle = "#ffe9a0"; g.lineWidth = 4;
      g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#8b6914"; g.font = "bold 72px system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", 64, 68);
    }
    const coinTex = new THREE.CanvasTexture(coinCanvas);
    coinTex.colorSpace = THREE.SRGBColorSpace;
    const coinMat = new THREE.MeshLambertMaterial({ map: coinTex, color: 0xffffff, emissive: 0xffd23f, emissiveIntensity: 0.35 });
    course.track(coinMat);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.25;
      const r = 4 + (i % 4) * 2.4;
      const px = cxx + Math.cos(a) * r;
      const py = 1.1 + (i % 5) * 0.85;
      const pz = czz + Math.sin(a) * r;
      if (py > 1.4) c.plat({ x: px, y: py - 0.9, z: pz, w: 1.7, d: 1.7, h: 0.35, cyl: true, color: 0xffb703, perfect: false });
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.rotation.x = Math.PI / 2;
      m.position.set(px, py, pz);
      m.castShadow = true;
      c.add(m);
      const coin: HubCoin = { mesh: m, pos: new THREE.Vector3(px, py, pz), taken: false };
      coins.push(coin);
      course.animated.push({
        obj: m,
        fn: (tt) => {
          m.rotation.z = tt * 3;
          m.position.y = py + Math.sin(tt * 2.5 + px) * 0.18;
          const target = coin.taken ? 0 : 1;
          const s = m.scale.x + (target - m.scale.x) * 0.15;
          m.scale.setScalar(s);
          m.visible = s > 0.05;
        },
      });
    }
  }

  // ===================== NW: empty path (balance minigame removed) =====================
  // Invisible dummy disc so Hub.balanceDisc type stays valid; no gameplay tags
  const balanceDisc = c.plat({ x: P.balance.x, y: -50, z: P.balance.z, w: 1, d: 1, h: 0.2, color: 0x000000, perfect: false });
  balanceDisc; // kept for return


  // Practice + Weekly
  {
    const pracPad = c.plat({ x: P.practice.x, y: 0.3, z: P.practice.z, w: 3.5, d: 3.5, h: 0.4, cyl: true, color: 0x3a86ff, perfect: false, emissive: 0.2 });
    tags.set(pracPad, "practice_start");
    makeSign(c, "mode.practice", P.practice.x, 3.3, P.practice.z, "#8ecae6", 0, signs);
    const weekPad = c.plat({ x: P.weekly.x, y: 0.3, z: P.weekly.z, w: 3.5, d: 3.5, h: 0.4, cyl: true, color: 0xffd23f, perfect: false, emissive: 0.25 });
    tags.set(weekPad, "weekly_start");
    makeSign(c, "mode.weekly", P.weekly.x, 3.3, P.weekly.z, "#ffe39a", 0, signs);
  }

  // ===================== SE: sprint race =====================
  const raceGates: RaceGate[] = [];
  {
    const rx = P.race.x, rz = P.race.z;
    archGate(c, rx - 8, rz + 8, (-Math.PI * 3) / 4, 0x4cc9f0, 6);
    const racePad = c.plat({ x: rx, y: 0.35, z: rz, w: 3.4, d: 3.4, h: 0.5, cyl: true, color: 0x4cc9f0, perfect: false, emissive: 0.25 });
    tags.set(racePad, "race_start");
    makeSign(c, "mini.race", rx, 3.6, rz, "#a5e9ff", (-Math.PI * 3) / 4, signs);
    // gates loop inside the island
    const gateSpots: [number, number][] = [
      [rx + 12, rz + 8],
      [rx + 18, rz - 5],
      [rx + 8, rz - 18],
      [rx - 5, rz - 12],
      [rx - 12, rz + 2],
      [rx, rz],
    ];
    for (let i = 0; i < gateSpots.length; i++) {
      const [gx, gz] = gateSpots[i];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 8, 20), mat(0x4cc9f0, 0.4));
      ring.position.set(gx, 2, gz);
      ring.rotation.y = Math.atan2(gx - rx, gz - rz);
      c.add(ring);
      course.track(ring.geometry);
      course.animated.push({ obj: ring, fn: (tt) => { ring.rotation.z = tt * 0.7 + i; } });
      raceGates.push({ pos: new THREE.Vector3(gx, 0, gz), ring });
    }
  }

  // ===================== HEX MOUNTAINS — full contour ring (uncclimbable) =====================
  const mountainCols = [0x6d5d7a, 0x5a4a6e, 0x7a6a8a, 0x4a3a5e, 0x8a7a9a, 0x554466, 0x3d2f4f, 0x6b5b7b];
  // Dense outer ring around the whole island edge
  const RING = 36;
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    const r = ISLAND_R - 6 + (i % 3 === 0 ? 2 : i % 3 === 1 ? -1 : 0);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rad = 9 + (i % 5) * 1.4 + rng.range(0, 1.5);
    const h = 22 + (i % 7) * 3 + rng.range(0, 6);
    hexMountain(c, x, z, rad, h, mountainCols[i % mountainCols.length], rng);
  }
  // Inner staggered ring so the silhouette is continuous (no gaps)
  const RING2 = 24;
  for (let i = 0; i < RING2; i++) {
    const a = (i / RING2) * Math.PI * 2 + Math.PI / RING2;
    const r = ISLAND_R - 16 + (i % 2) * 3;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rad = 7 + (i % 4) * 1.2;
    const h = 14 + (i % 6) * 2.5;
    hexMountain(c, x, z, rad, h, mountainCols[(i + 3) % mountainCols.length], rng);
  }
  // A few landmark tall peaks evenly spaced
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.12;
    const r = ISLAND_R - 4;
    hexMountain(c, Math.cos(a) * r, Math.sin(a) * r, 12 + (i % 3), 40 + i * 2, 0x4a3a5e, rng);
  }

  // floating decorative islands far out
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3;
    const r = rng.range(ISLAND_R + 25, ISLAND_R + 55);
    const isl = c.deco(getUnitCyl(), 0x7bd88f, Math.cos(a) * r, rng.range(-4, 18), Math.sin(a) * r, rng.range(4, 8), 1.4, rng.range(4, 8));
    c.deco(getUnitCyl(), 0xc9a36b, isl.position.x, isl.position.y - 1.8, isl.position.z, isl.scale.x * 0.8, 2.2, isl.scale.z * 0.8);
    c.deco(new THREE.ConeGeometry(1.6, 3.2, 6), 0x2ec27e, isl.position.x, isl.position.y + 2.3, isl.position.z);
    const by = isl.position.y;
    course.animated.push({ obj: isl, fn: (tt) => { isl.position.y = by + Math.sin(tt * 0.45 + i) * 0.7; } });
  }

  const wander: THREE.Vector3[] = [];
  for (let i = 0; i < 28; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(8, 45);
    wander.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  const refreshSigns = () => {
    for (const s of signs) {
      const mb = s.mesh.material as THREE.MeshBasicMaterial;
      const old = mb.map;
      mb.map = textSprite(t(s.key), s.color, "rgba(0,0,0,0)", 1024, 160, 92);
      mb.needsUpdate = true;
      old?.dispose();
    }
  };

  return {
    course, tags, spawn: new THREE.Vector3(0, 0.2, -10), wander, coins, raceGates, balanceDisc, drawHolo,
    signs, refreshSigns,
  };
}
