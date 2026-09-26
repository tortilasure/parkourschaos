import * as THREE from "three";

export type Surface = "normal" | "ice" | "sticky" | "conveyor" | "bounce" | "vanish" | "break" | "fake" | "timed";

export interface Box {
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  rot: number;
  px: number; py: number; pz: number; prot: number;
  cyl: boolean;
  slope: number;
  surface: Surface;
  convX: number; convZ: number;
  bounce: number;
  active: boolean;
  solid: boolean;
  hazard: 0 | 1 | 2;
  wallrun: boolean;
  perfect: boolean;
  mesh: THREE.Object3D | null;
  state: number;
  timer: number;
  section: number;
  baseX: number; baseY: number; baseZ: number;
  color: number;
}

export type ZoneType = "wind" | "grav" | "flip" | "fog" | "portal" | "kill" | "checkpoint" | "finish" | "trigger";

export interface Zone {
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  type: ZoneType;
  a: number; b: number; c: number;
  fn?: () => void;
  section: number;
  inside: boolean;
  cool: number;
}

export function makeBox(p: Partial<Box> & { x: number; y: number; z: number; hx: number; hy: number; hz: number }): Box {
  return {
    rot: 0, cyl: false, slope: 0, surface: "normal", convX: 0, convZ: 0, bounce: 0, active: true, solid: true,
    hazard: 0, wallrun: false, perfect: false, mesh: null, state: 0, timer: 0, section: 0, color: 0xffffff,
    ...p,
    px: p.x, py: p.y, pz: p.z, prot: p.rot ?? 0,
    baseX: p.x, baseY: p.y, baseZ: p.z,
  };
}

export function makeZone(p: Partial<Zone> & { x: number; y: number; z: number; hx: number; hy: number; hz: number; type: ZoneType }): Zone {
  return { a: 0, b: 0, c: 0, section: 0, inside: false, cool: 0, ...p };
}

export const R = 0.38;
export const H = 1.5;
const STEP = 0.4;

export interface MoveInput {
  mx: number; // world-space desired move direction x (-1..1)
  mz: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
}

export interface LandInfo {
  box: Box;
  impact: number;
  air: number;
  edge: boolean;
  perfect: boolean;
}

export class Body {
  p = new THREE.Vector3();
  v = new THREE.Vector3();
  yaw = 0;
  up = 1;
  grounded = false;
  wasGrounded = false;
  ground: Box | null = null;
  coyote = 0;
  jumpBuf = 0;
  airTime = 0;
  wallNX = 0;
  wallNZ = 0;
  wallT = 9;
  wallBox: Box | null = null;
  wallrunT = 0;
  stun = 0;
  knock = 0;
  gravMul = 1;
  windX = 0; windY = 0; windZ = 0;
  jumping = false;
  events: string[] = [];
  land: LandInfo | null = null;
  hitHazard: Box | null = null;
  killed = false;
  speedMul = 1;

  reset(x: number, y: number, z: number, yaw = 0) {
    this.p.set(x, y, z);
    this.v.set(0, 0, 0);
    this.yaw = yaw;
    this.up = 1;
    this.grounded = false;
    this.wasGrounded = false;
    this.ground = null;
    this.stun = 0;
    this.knock = 0;
    this.airTime = 0;
    this.wallrunT = 0;
  }
}

const tmp = { x: 0, z: 0 };

function carry(b: Body) {
  const g = b.ground;
  if (!g || !g.active) return;
  const dRot = g.rot - g.prot;
  if (dRot !== 0) {
    const dx = b.p.x - g.px, dz = b.p.z - g.pz;
    const c = Math.cos(dRot), s = Math.sin(dRot);
    b.p.x = g.px + dx * c + dz * s;
    b.p.z = g.pz - dx * s + dz * c;
    b.yaw += dRot;
  }
  b.p.x += g.x - g.px;
  b.p.y += g.y - g.py;
  b.p.z += g.z - g.pz;
}

export function stepBody(b: Body, input: MoveInput, boxes: Box[], dt: number) {
  b.events.length = 0;
  b.land = null;
  b.hitHazard = null;
  b.killed = false;
  carry(b);

  // jump buffer / coyote
  if (input.jumpPressed) b.jumpBuf = 0.15;
  const steps = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 120))));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) substep(b, input, boxes, h, i === 0);
  b.jumpBuf -= dt;
  b.stun = Math.max(0, b.stun - dt);
  b.knock = Math.max(0, b.knock - dt);
}

function substep(b: Body, input: MoveInput, boxes: Box[], dt: number, first: boolean) {
  const gs = b.ground ? b.ground.surface : "normal";
  const onGround = b.grounded;
  const canCtl = b.stun <= 0;
  let maxSpeed = 8.6 * b.speedMul;
  let accel = onGround ? 75 : 32;
  if (onGround && gs === "ice") accel = 5;
  if (onGround && gs === "sticky") maxSpeed *= 0.42;
  if (b.knock > 0) accel *= 0.25;

  let mx = canCtl ? input.mx : 0, mz = canCtl ? input.mz : 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  let tvx = mx * maxSpeed, tvz = mz * maxSpeed;
  if (onGround && gs === "conveyor" && b.ground) { tvx += b.ground.convX; tvz += b.ground.convZ; }

  // accelerate toward target horizontal velocity
  const dvx = tvx - b.v.x, dvz = tvz - b.v.z;
  const dl = Math.hypot(dvx, dvz);
  const maxDv = accel * dt;
  if (dl > maxDv) { b.v.x += (dvx / dl) * maxDv; b.v.z += (dvz / dl) * maxDv; }
  else { b.v.x = tvx; b.v.z = tvz; }
  if (ml > 0.1 && canCtl) {
    const targetYaw = Math.atan2(mx, mz);
    let d = targetYaw - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * Math.min(1, dt * 16);
  }

  // wind
  b.v.x += b.windX * dt;
  b.v.z += b.windZ * dt;
  b.v.y += b.windY * dt * b.up;

  // jumping
  if (onGround) b.coyote = 0.12;
  else b.coyote -= dt;
  b.wallT += dt;

  if (first && b.jumpBuf > 0 && canCtl) {
    if (b.coyote > 0) {
      let jv = 11.6;
      if (gs === "sticky") jv *= 0.72;
      b.v.y = jv * b.up;
      b.grounded = false;
      b.ground = null;
      b.coyote = 0;
      b.jumpBuf = 0;
      b.jumping = true;
      b.events.push("jump");
    } else if (b.wallT < 0.2) {
      const vn0 = b.v.x * b.wallNX + b.v.z * b.wallNZ;
      const tx = b.v.x - vn0 * b.wallNX, tz = b.v.z - vn0 * b.wallNZ;
      b.v.x = tx * 0.9 + b.wallNX * 7.5;
      b.v.z = tz * 0.9 + b.wallNZ * 7.5;
      b.v.y = 11 * b.up;
      b.yaw = Math.atan2(b.v.x, b.v.z);
      b.wallT = 9;
      b.jumpBuf = 0;
      b.jumping = true;
      b.knock = 0.18;
      b.events.push("walljump");
    }
  }

  // gravity
  let g = 31 * b.gravMul;
  const goingUp = b.v.y * b.up > 0;
  if (goingUp && !input.jumpHeld && b.jumping) g *= 2.1; // variable jump height
  if (!goingUp) g *= 1.25;
  b.v.y -= g * dt * b.up;
  // wall run slow fall
  if (!b.grounded && b.wallT < 0.08 && b.wallBox && b.wallBox.wallrun && b.wallrunT < 1.6) {
    const hs = Math.hypot(b.v.x, b.v.z);
    if (hs > 2 && b.v.y * b.up < 0) {
      b.v.y = Math.max(b.v.y * b.up, -1.2) * b.up;
      b.wallrunT += dt;
    }
  }
  if (b.v.y * b.up < -32) b.v.y = -32 * b.up;

  const prevFeet = b.p.y;
  b.p.x += b.v.x * dt;
  b.p.y += b.v.y * dt;
  b.p.z += b.v.z * dt;

  b.wasGrounded = b.grounded;
  const wasGround = b.grounded;
  b.grounded = false;
  const oldGround = b.ground;
  b.ground = null;

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box.active || !box.solid) continue;
    const dx = b.p.x - box.x, dz = b.p.z - box.z;
    const rr = (box.cyl ? box.hx : Math.abs(box.hx) + Math.abs(box.hz)) + R + 0.2;
    if (dx * dx + dz * dz > rr * rr) continue;
    const up = b.up;
    const feet = b.p.y;

    if (box.slope !== 0) {
      // ramp: top-surface only
      const c = Math.cos(box.rot), s = Math.sin(box.rot);
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      if (Math.abs(lx) > box.hx + 0.1 || Math.abs(lz) > box.hz + 0.1) continue;
      const surf = box.y + box.slope * lz;
      if (up > 0 && b.v.y <= 0.5 && feet <= surf + 0.05 && feet >= surf - 0.8) {
        b.p.y = surf;
        if (b.v.y < 0) b.v.y = 0;
        b.grounded = true;
        b.ground = box;
      }
      continue;
    }

    const top = box.y + box.hy, bot = box.y - box.hy;
    const pMin = up > 0 ? feet : feet - H;
    const pMax = up > 0 ? feet + H : feet;
    if (pMax <= bot || pMin >= top) continue;

    let pen = 0, wx = 0, wz = 0;
    if (box.cyl) {
      const d = Math.hypot(dx, dz) || 0.0001;
      pen = box.hx + R - d;
      if (pen <= 0) continue;
      wx = dx / d; wz = dz / d;
    } else {
      const c = Math.cos(box.rot), s = Math.sin(box.rot);
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      const ox = box.hx + R - Math.abs(lx);
      const oz = box.hz + R - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      let lnx = 0, lnz = 0;
      if (ox < oz) { pen = ox; lnx = Math.sign(lx) || 1; }
      else { pen = oz; lnz = Math.sign(lz) || 1; }
      wx = lnx * c + lnz * s;
      wz = -lnx * s + lnz * c;
    }

    const upPen = up > 0 ? top - feet : feet - bot;
    const headPen = up > 0 ? feet + H - bot : top - (feet - H);
    const prevOnTop = up > 0 ? prevFeet >= top - 0.06 : prevFeet <= bot + 0.06;
    const prevHeadBelow = up > 0 ? prevFeet + H <= bot + 0.06 : prevFeet - H >= top - 0.06;
    const canStep = wasGround && upPen <= STEP && box.hazard === 0;

    if (box.hazard === 2) { b.killed = true; continue; }

    if ((prevOnTop || canStep || upPen < Math.min(pen, 0.2)) && b.v.y * up <= 2.5) {
      b.p.y = up > 0 ? top : bot;
      if (b.v.y * up < 0) b.v.y = 0;
      b.grounded = true;
      b.ground = box;
    } else if (prevHeadBelow && headPen < pen + 0.3) {
      b.p.y = up > 0 ? bot - H : top + H;
      if (b.v.y * up > 0) b.v.y = 0;
    } else {
      b.p.x += wx * pen;
      b.p.z += wz * pen;
      const vn = b.v.x * wx + b.v.z * wz;
      if (vn < 0) { b.v.x -= vn * wx; b.v.z -= vn * wz; }
      if (!b.grounded && box.hazard === 0) {
        b.wallNX = wx; b.wallNZ = wz; b.wallT = 0; b.wallBox = box;
      }
    }
    if (box.hazard === 1) {
      const ht = Math.max(dt, 1 / 60);
      const w = (box.rot - box.prot) / ht;
      tmp.x = (box.x - box.px) / ht + w * dz;
      tmp.z = (box.z - box.pz) / ht - w * dx;
      b.v.x = wx * 7 + tmp.x * 1.1;
      b.v.z = wz * 7 + tmp.z * 1.1;
      b.v.y = 7 * up;
      b.knock = 0.45;
      b.grounded = false;
      b.ground = null;
      b.hitHazard = box;
    }
  }

  if (b.grounded) {
    b.wallrunT = 0;
    b.jumping = false;
    if (!wasGround) {
      const g2 = b.ground!;
      let edge = false, perfect = false;
      if (!g2.cyl) {
        const c = Math.cos(g2.rot), s = Math.sin(g2.rot);
        const dx = b.p.x - g2.x, dz = b.p.z - g2.z;
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        edge = Math.abs(lx) > g2.hx - 0.12 || Math.abs(lz) > g2.hz - 0.12;
        perfect = Math.abs(lx) < g2.hx * 0.3 && Math.abs(lz) < g2.hz * 0.3;
      } else {
        const d = Math.hypot(b.p.x - g2.x, b.p.z - g2.z);
        edge = d > g2.hx - 0.12;
        perfect = d < g2.hx * 0.3;
      }
      b.land = { box: g2, impact: Math.abs(b.v.y), air: b.airTime, edge, perfect: perfect && g2.perfect };
      if (g2.surface === "bounce") {
        b.v.y = (g2.bounce || 17) * b.up;
        b.grounded = false;
        b.ground = null;
        b.jumping = false;
        b.events.push("bounce");
      }
    }
    b.airTime = 0;
  } else {
    b.airTime += dt;
    if (oldGround && !b.grounded && b.coyote > 0 && !b.jumping) {
      // walked off: keep coyote
    }
  }
}

export function inZone(z: Zone, x: number, y: number, zz: number) {
  return Math.abs(x - z.x) <= z.hx && Math.abs(y - z.y) <= z.hy && Math.abs(zz - z.z) <= z.hz;
}
