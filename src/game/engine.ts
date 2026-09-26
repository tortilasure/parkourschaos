import * as THREE from "three";
import { Body, stepBody, inZone, Box, H } from "./physics";
import { buildCourse, Course, RNG, TIME_ATTACK_LIST, TIME_ATTACK_SEED, Waypoint, relocalizeFinish } from "./course";
import { buildHub, Hub } from "./hub";
import { Character, Emote } from "./character";
import { Effects } from "./effects";
import { Input } from "./input";
import { sfx } from "./audio";
import {
  BOT_DIFF_STATS, BOT_NAMES, BODY_COLORS, COIN_BY_PLACE, SHOP, SKIN_IDS, Stats, weeklyChallengeSeed,
  type BotDiff, type BotStyle, type Quality, type Settings, type SkyTheme, type Weather,
} from "./data";
import { t, tOpt } from "./i18n";

export type Mode = "hub" | "solo" | "ta" | "multi" | "practice" | "weekly";
export type Phase = "hub" | "countdown" | "run" | "finished";

export interface RoomPlayer { id: string; name: string; look: Record<string, string>; finishMs: number | null; }
export interface RoomInfo {
  id: string; code: string; name: string; hostId: string; isPublic: boolean; quick: boolean; maxPlayers: number;
  status: "waiting" | "countdown" | "racing" | "finished"; seed: number; sectionCount: number; bots: number;
  botCount: number; botDiff: BotDiff;
  startAt: number; createdAt: number; waitLeft: number | null; players: RoomPlayer[];
}
export interface RosterEntry { id: string; name: string; me: boolean; bot: boolean; finishMs: number | null; progress: number; color: string; }
export interface HudState {
  mode: Mode; phase: Phase; time: number; countdown: number; section: number; sectionCount: number; sectionName: string;
  pushNear: boolean; pushCd: number; abilityCharges?: number; abilityId?: string; stunned: boolean; paused: boolean; fps: number; online: number;
  roster: RosterEntry[]; place: number; mini: { name: string; time: number } | null; room: RoomInfo | null; locked: boolean;
  combo: number; respawn: number; miniInfo: string;
  spectating: boolean; specName: string; specFree: boolean; remaining: number; myPlace: number;
}
export interface FinishResult {
  mode: Mode; timeMs: number; place: number; total: number; coins: number; perfects: number; deaths: number;
  score: number; dnf: boolean; roster: RosterEntry[]; sections: number;
}
export interface Look { color: string; hat: string; skin: string; footprint: string; landing: string; death: string; aura: string; trail: string; }
export interface Callbacks {
  hud(h: HudState): void;
  popup(text: string, color?: string, big?: boolean): void;
  stat(key: keyof Stats, n: number): void;
  finish(r: FinishResult): void;
  reaction(): void;
  mini(name: string, value: number): void;
  toast(msg: string): void;
  matchStarted(): void;
  practice?(): void;
  chat?(from: string, text: string): void;
}

interface Seg { a: number; b: number; t0: number; t1: number; kind: 0 | 1 | 2; }
interface Bot {
  id: string; name: string; color: string; char: Character; segs: Seg[]; finishT: number; shift: number;
  stunEnd: number; frozen: number; pushCd: number; pos: THREE.Vector3; lastPrint: THREE.Vector3; printSide: number; fp: string;
  emoteDone: boolean; emojiT: number; section: number; diff: Exclude<BotDiff, "mixed">; kind: number; dying: boolean;
  style: BotStyle; aura: string; trail: string; auraT: number; cheered: number;
  ability: string; abilityCd: number;
}
interface Snap { t: number; x: number; y: number; z: number; yaw: number; anim: number; extra: number; }
interface Remote {
  id: string; name: string; look: Record<string, string>; char: Character; pos: THREE.Vector3; target: THREE.Vector3;
  yaw: number; tYaw: number; s: number[]; seen: number; stunLocal: number; lastPrint: THREE.Vector3; printSide: number; finishMs: number | null;
  buf: Snap[]; clock: number; vel: THREE.Vector3; anim: number; smoothSpeed: number;
}
interface HubBot {
  char: Character; body: Body; target: THREE.Vector3; wait: number; stun: number; name: string;
  style: BotStyle; jumpCd: number; stuck: number; lastPos: THREE.Vector3; emojiT: number;
}

const EMOTE_CODES: Emote[] = ["", "win", "cheer", "dance", "wave", "flop"];
const INTERP_DELAY = 40; // low lag so other players look near real-time
const BOT_DIFF_ICON_MAP: Record<"easy" | "mid" | "hard", string> = { easy: "🟢", mid: "🟡", hard: "🔴" };
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

function item(id: string) { return SHOP.find((s) => s.id === id); }

/** Picks cosmetics weighted by rarity: common often, epic rarely. */
function randomCosmetic(cat: string, rng: RNG, allowNone = true): string {
  const pool = SHOP.filter((s) => s.cat === cat);
  if (!pool.length) return "";
  const weight = (r: string) => (r === "common" ? 60 : r === "rare" ? 28 : 12);
  const free = pool.filter((p) => p.price === 0);
  if (allowNone && free.length && rng.chance(0.45)) return rng.pick(free).id;
  let total = 0;
  for (const p of pool) total += weight(p.rarity);
  let x = rng.next() * total;
  for (const p of pool) { x -= weight(p.rarity); if (x <= 0) return p.id; }
  return pool[0].id;
}

function makeBotStyle(rng: RNG, diff: Exclude<BotDiff, "mixed">): BotStyle {
  const base = diff === "hard" ? 0.65 : diff === "mid" ? 0.45 : 0.25;
  return {
    aggression: Math.max(0, Math.min(1, base + rng.range(-0.22, 0.28))),
    chatty: rng.range(0.45, 1.9),
    reaction: diff === "hard" ? rng.range(0.75, 1.0) : diff === "mid" ? rng.range(0.9, 1.25) : rng.range(1.1, 1.6),
    risk: diff === "hard" ? rng.range(0.15, 0.4) : diff === "mid" ? rng.range(0.08, 0.25) : rng.range(0.02, 0.12),
    cheerful: rng.chance(0.55),
  };
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  input: Input;
  fx: Effects;
  body = new Body();
  char: Character;
  hub: Hub;
  course: Course | null = null;
  mode: Mode = "hub";
  phase: Phase = "hub";
  look: Look;
  name: string;
  pid: string;
  cb: Callbacks;
  sun: THREE.DirectionalLight;
  fog: THREE.Fog;
  camYaw = Math.PI;
  camPitch = 0.32;
  camDist = 7.5;
  camTarget = new THREE.Vector3();
  shake = 0;
  shakeOn = true;
  sensitivity = 1;
  invertY = false;
  paused = false;
  raceClock = -3;
  /** performance.now() origin so timer never freezes if a frame is skipped */
  raceOriginPerf = 0;
  raceOriginClock = -3;
  runStartClock = 0;
  sectionCount = 0;
  checkpoint = 0;
  curSection = 0;
  deaths = 0;
  perfects = 0;
  combo = 0;
  pushCd = 0;
  pushNear = false;
  pushTarget: { kind: "bot" | "remote" | "hub"; ref: Bot | Remote | HubBot } | null = null;
  emojiCd = 0;
  deadT = 0;
  finishT = 0;
  finishTimer = 0;
  resultSent = false;
  bots: Bot[] = [];
  remotes = new Map<string, Remote>();
  hubBots: HubBot[] = [];
  room: RoomInfo | null = null;
  serverOffset = 0;
  lastSeqHub = 0;
  lastSeqRoom = 0;
  outEvents: { type: string; target?: string; data?: unknown }[] = [];
  hubEvents: { type: string; target?: string; data?: unknown }[] = [];
  netBusyHub = false;
  netBusyRoom = false;
  netTimerHub = 0;
  netTimerRoom = 0;
  online = 0;
  onlineList: { id: string; name: string; registered: boolean }[] = [];
  finishMsSent: number | null = null;
  lastPrint = new THREE.Vector3();
  printSide = 1;
  trailT = 0;
  auraT = 0;
  hudT = 0;
  fps = 60;
  fpsAcc = 0;
  fpsN = 0;
  mini: { name: string; t0: number } | null = null;
  // performance
  perf: Settings = { } as Settings;
  particleScale = 1;
  drawDistance = 3;
  fpsLimit = 0;
  private frameAcc = 0;
  // gyroscope
  gyroOn = false;
  gyroSens = 1;
  private gyroBase: { beta: number; gamma: number } | null = null;
  private gyroLast: { beta: number; gamma: number } | null = null;
  private gyroBound = false;
  // spectator
  spectating = false;
  specIndex = 0;
  specFree = false;
  private specTargets: { id: string; name: string; pos: THREE.Vector3 }[] = [];
  private tpFlag = false;
  coinsLeft = 0;
  raceGate = 0;
  balanceGrace = 0;
  holoRows: { name: string; timeMs: number }[] = [];
  reactionCd = 0;
  targetCd = 0;
  zoneCool = 0;
  soloSeed = 0;
  firstFinishRace = Infinity;
  private raf = 0;
  private last = performance.now();
  private disposed = false;
  private collideList: Box[] = [];
  private fogTarget = { near: 60, far: 260 };
  private themeFog = { near: 60, far: 260 };
  private skyColor = new THREE.Color(0x9ad8ff);
  private weatherKind: Weather = "clear";
  private skyTheme: SkyTheme = "day";
  private weatherPts: THREE.Points | null = null;
  private weatherVel: Float32Array | null = null;
  blindUntil = 0;
  activeAbility = "ab_hit";
  lastPerfectBox: Box | null = null;
  lastPerfectAt = 0;
  lastEdgeBox: Box | null = null;
  lastEdgeAt = 0;
  lastHubTag: string | null = null;
  lastHubTagAt = 0;
  anchorUntil = 0;
  oilUntil = 0;
  oilPos = new THREE.Vector3();
  cloneMesh: THREE.Object3D | null = null;
  cloneUntil = 0;
  /** double-jump charges left (0..3) */
  djCharges = 3;
  /** true after air double-jump until land */
  djUsedInAir = false;
  /** cooldown after charges depleted */
  djCd = 0;
  abilityCd = 0;
  adminFly = false;
  adminGod = false;
  designStudio = false;
  roomGoneStrikes = 0;
  private cloudGroup = new THREE.Group();
  private startGrid: THREE.Vector3[] = [];
  private lastStun = 0;

  constructor(canvas: HTMLCanvasElement, opts: { pid: string; name: string; look: Look; quality: Quality; cb: Callbacks }) {
    this.pid = opts.pid;
    this.name = opts.name;
    this.look = opts.look;
    this.cb = opts.cb;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 600);
    this.input = new Input(canvas);
    this.fx = new Effects(this.scene);

    // sky
    const skyGeo = new THREE.SphereGeometry(500, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x4f8dff) }, mid: { value: new THREE.Color(0x9ad8ff) }, bot: { value: new THREE.Color(0xffc2e2) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid, top, smoothstep(0.0,0.6,h)) : mix(mid, bot, smoothstep(0.0,-0.4,h)); gl_FragColor=vec4(c,1.0); }",
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.scene.add(sky);
    (this as unknown as { sky: THREE.Mesh; skyMat: THREE.ShaderMaterial }).sky = sky;
    (this as unknown as { skyMat: THREE.ShaderMaterial }).skyMat = skyMat;
    this.fog = new THREE.Fog(0xbfe6ff, 60, 260);
    this.scene.fog = this.fog;
    this.scene.background = this.skyColor;

    const hemi = new THREE.HemisphereLight(0xdff2ff, 0xffc9e0, 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
    this.sun.position.set(20, 40, 10);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // cloud sea + clouds
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -70;
    this.scene.add(sea);
    (this as unknown as { sea: THREE.Mesh }).sea = sea;
    const cg = new THREE.IcosahedronGeometry(1, 1);
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const clouds = new THREE.InstancedMesh(cg, cm, 90);
    const m4 = new THREE.Matrix4();
    const r = new RNG(99);
    for (let i = 0; i < 90; i++) {
      const side = r.sign();
      const high = r.chance(0.5);
      const cx = high ? side * r.range(45, 170) : r.range(-170, 170);
      const cy = high ? r.range(-10, 45) : r.range(-60, -32);
      const cz = r.range(-170, 170);
      const s = r.range(4, 11);
      m4.compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion(), new THREE.Vector3(s * 1.6, s * 0.8, s));
      clouds.setMatrixAt(i, m4);
    }
    this.cloudGroup.add(clouds);
    this.scene.add(this.cloudGroup);

    this.char = new Character(this.look.color, this.look.hat, this.look.skin);
    this.scene.add(this.char.root);

    this.hub = buildHub();
    this.scene.add(this.hub.course.group);
    const hubRng = new RNG(4242);
    for (let i = 0; i < 6; i++) {
      const n = hubRng.pick(BOT_NAMES);
      const diff = (["easy", "mid", "hard"] as const)[i % 3];
      const body = new Body();
      const start = this.hub.wander[i % this.hub.wander.length];
      body.reset(start.x, 1.2, start.z, 0);
      const hb: HubBot = {
        char: new Character(hubRng.pick(BODY_COLORS), randomCosmetic("hat", hubRng), randomCosmetic("skin", hubRng), n, "#c8f7ff"),
        body,
        target: this.hub.wander[(i + 3) % this.hub.wander.length].clone(),
        wait: hubRng.range(0, 2), stun: 0, name: n, style: makeBotStyle(hubRng, diff),
        jumpCd: 0, stuck: 0, lastPos: new THREE.Vector3(start.x, 0, start.z), emojiT: hubRng.range(4, 18),
      };
      this.scene.add(hb.char.root);
      this.hubBots.push(hb);
    }
    this.setQuality(opts.quality);
    this.fx.scale = 1;
    this.enterHub();
    this.input.onKey = (code) => this.onKey(code);
    this.input.onSwipe = (dir) => { if (this.spectating) this.cycleSpectator(dir); };
    window.addEventListener("resize", this.resize);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ setup
  setQuality(q: Quality) {
    const dpr = window.devicePixelRatio || 1;
    const cap = q === "high" ? 2 : q === "mid" ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.resize();
  }

  /** Applies the full performance block; safe to call on every settings change. */
  applyPerf(st: Settings) {
    this.perf = st;
    this.particleScale = Math.max(0, Math.min(1, st.particles));
    this.fx.scale = this.particleScale;
    this.drawDistance = Math.max(1, Math.min(4, Math.round(st.drawDistance)));
    this.fpsLimit = st.fpsLimit ?? 0;
    const shadows = st.shadows ?? "on";
    this.renderer.shadowMap.enabled = shadows !== "off";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = shadows !== "off";
    const worldShadows = shadows === "on";
    this.char.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = shadows !== "off"; });
    for (const g of [this.hub.course.group, this.course?.group]) {
      g?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = worldShadows; m.receiveShadow = shadows !== "off"; }
      });
    }
    for (const list of [this.bots.map((b) => b.char), [...this.remotes.values()].map((r) => r.char), this.hubBots.map((h) => h.char)]) {
      for (const ch of list) ch.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = worldShadows; });
    }
    const sea = (this as unknown as { sea: THREE.Mesh }).sea;
    if (sea) sea.visible = st.postFx !== false || true;
    this.cloudGroup.visible = st.postFx !== false || this.perf.quality !== "low";
    this.sun.shadow.mapSize.set(shadows === "on" ? 1024 : 512, shadows === "on" ? 1024 : 512);
    this.setQuality(st.quality);
    this.setGyro(!!st.gyro, st.gyroSens ?? 1);
    this.sensitivity = st.sensitivity;
    this.invertY = st.invertY;
    this.shakeOn = st.shake;
    this.input.deadzone = st.deadzone ?? 0.12;
  }

  // ------------------------------------------------------------------ gyro
  setGyro(on: boolean, sens: number) {
    this.gyroSens = sens;
    if (on === this.gyroOn) return;
    this.gyroOn = on;
    if (on) this.bindGyro();
  }
  async requestGyro(): Promise<boolean> {
    type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    const DOEv = window.DeviceOrientationEvent as DOE | undefined;
    if (DOEv && typeof DOEv.requestPermission === "function") {
      try {
        const res = await DOEv.requestPermission();
        if (res !== "granted") return false;
      } catch { return false; }
    }
    this.bindGyro();
    return true;
  }
  calibrateGyro() { this.gyroBase = this.gyroLast ? { ...this.gyroLast } : null; }
  private bindGyro() {
    if (this.gyroBound) return;
    this.gyroBound = true;
    window.addEventListener("deviceorientation", this.onGyro);
  }
  private onGyro = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    this.gyroLast = { beta: e.beta, gamma: e.gamma };
    if (!this.gyroBase) this.gyroBase = { beta: e.beta, gamma: e.gamma };
  };
  private applyGyro(dt: number) {
    if (!this.gyroOn || !this.gyroLast || !this.gyroBase) return;
    const land = Math.abs(window.orientation ?? 0) === 90 || window.innerWidth > window.innerHeight;
    let dYaw = this.gyroLast.gamma - this.gyroBase.gamma;
    let dPitch = this.gyroLast.beta - this.gyroBase.beta;
    if (land) { const tmpA = dYaw; dYaw = -dPitch; dPitch = tmpA; }
    const dz = 6;
    const curve = (v: number) => (Math.abs(v) < dz ? 0 : (Math.abs(v) - dz) * Math.sign(v));
    this.camYaw -= curve(dYaw) * 0.022 * this.gyroSens * dt * 60 * 0.016;
    this.camPitch += curve(dPitch) * 0.012 * this.gyroSens * dt * 60 * 0.016 * (this.invertY ? -1 : 1);
    this.camPitch = Math.max(-0.35, Math.min(1.25, this.camPitch));
  }
  setLook(l: Look) {
    this.look = l;
    this.char.setSkin(l.skin);
    this.char.setColor(l.color);
    this.char.setHat(l.hat);
  }
  setName(n: string) { this.name = n; }
  resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 78 : 65;
    this.camera.updateProjectionMatrix();
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.input.dispose();
    if (this.room) void this.post({ op: "leave", roomId: this.room.id });
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ modes
  private clearRace() {
    if (this.course) { this.course.dispose(); this.course = null; }
    for (const b of this.bots) b.char.root.removeFromParent();
    this.bots = [];
    this.fx.clear();
    this.char.playEmote("");
    this.body.gravMul = 1;
    this.body.up = 1;
    this.paused = false;
    this.firstFinishRace = Infinity;
    this.spectating = false;
    this.specFree = false;
    this.specTargets = [];
    this.specIndex = 0;
  }

  private designPrevMode: Mode | null = null;
  /** camera orbit angle around the character in design studio (0 = front face) */
  designCamAngle = 0;
  enterDesignStudio() {
    this.designPrevMode = this.mode;
    this.clearRace();
    this.mode = "hub";
    this.phase = "hub";
    if (this.hub?.course) this.hub.course.group.visible = false;
    for (const hb of this.hubBots) hb.char.root.visible = false;
    for (const r of this.remotes.values()) r.char.root.visible = false;
    this.body.reset(0, 1.2, 0, 0);
    this.body.v.set(0, 0, 0);
    this.body.yaw = 0;
    this.designCamAngle = 0;
    this.camYaw = Math.PI; // look from +Z toward origin → face the character
    this.camPitch = 0.12;
    this.char.root.visible = true;
    this.input.enabled = false;
    this.fogTarget = { near: 80, far: 200 };
    // snap camera immediately in front
    this.camTarget.set(0, 1.3, 0);
    this.camera.position.set(0, 1.6, 4.2);
    this.camera.lookAt(0, 1.3, 0);
  }
  leaveDesignStudio() {
    if (this.hub?.course) this.hub.course.group.visible = true;
    for (const hb of this.hubBots) hb.char.root.visible = true;
    this.input.enabled = true;
    this.enterHub();
  }
  /** User pressed "rotate" — orbit camera 45° around character. */
  designRotate() {
    this.designCamAngle += Math.PI / 4;
  }
  /** Fixed camera in front of character; character hovers, does not auto-spin. */
  private designStudioTick(dt: number) {
    if (!this.char?.root) return;
    // hover in place, face fixed (yaw 0)
    this.body.p.set(0, 1.25 + Math.sin(performance.now() / 900) * 0.12, 0);
    this.body.v.set(0, 0, 0);
    this.body.yaw = 0;
    this.char.root.position.copy(this.body.p);
    this.char.root.rotation.y = 0;
    this.char.update(dt, { speed: 0, grounded: false, vy: 0, stunned: false, wall: false, up: 1 });
    // camera orbits around character; 0 = front (face visible)
    this.camTarget.set(0, 1.35, 0);
    this.camYaw = this.designCamAngle + Math.PI;
    this.camPitch = 0.1;
    // force camera distance closer for portrait view
    const dist = 3.8;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const want = tmpV2.set(
      this.camTarget.x + Math.sin(this.camYaw) * cp * dist,
      this.camTarget.y + sp * dist + 0.35,
      this.camTarget.z + Math.cos(this.camYaw) * cp * dist,
    );
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 10));
    this.camera.lookAt(this.camTarget);
  }

  enterHub() {
    this.clearRace();
    this.clearRemotes();
    this.mode = "hub";
    this.phase = "hub";
    this.hub.course.group.visible = true;
    for (const hb of this.hubBots) hb.char.root.visible = true;
    // Random spawn around the central fountain / plaza
    const ang = Math.random() * Math.PI * 2;
    const rad = 4 + Math.random() * 8;
    this.body.reset(Math.cos(ang) * rad, 1.2, Math.sin(ang) * rad - 2, ang + Math.PI);
    this.camYaw = Math.PI;
    this.char.root.visible = true;
    this.resetMini(true);
    this.coinsLeft = this.hub.coins.length;
    void this.refreshHolo();
    this.fogTarget = { near: 70, far: 280 };
    this.input.enabled = true;
  }

  private setupRace(mode: Mode, seed: number, count: number, types?: string[], fixedDiff?: number) {
    this.clearRace();
    this.clearRemotes();
    this.mode = mode;
    this.hub.course.group.visible = false;
    for (const hb of this.hubBots) hb.char.root.visible = false;
    this.course = buildCourse({ seed, count, types, fixedDiff });
    this.course.onMsg = (m) => this.cb.popup(m, "#ffd23f");
    this.scene.add(this.course.group);
    this.sectionCount = count;
    this.checkpoint = 0;
    this.curSection = 0;
    this.deaths = 0;
    this.perfects = 0;
    this.combo = 0;
    this.pushCd = 0;
    this.abilityCd = 0;
    this.djCharges = 3;
    this.djCd = 0;
    this.djUsedInAir = false;
    this.lastPerfectBox = null;
    this.deadT = 0;
    this.finishTimer = 0;
    this.resultSent = false;
    this.finishMsSent = null;
    this.phase = "countdown";
    this.lastBeep = 99;
    this.startGrid = [];
    for (let i = 0; i < 12; i++) {
      const col = i % 4, row = Math.floor(i / 4);
      this.startGrid.push(new THREE.Vector3((col - 1.5) * 2.6, 0, 2 + row * 2.4));
    }
    this.course.update(1000);
    this.course.syncMeshes();
    this.char.root.visible = true;
    this.camYaw = Math.PI;
    this.camPitch = 0.3;
  }

  startSolo() {
    this.room = null;
    this.spectating = false;
    
    this.soloSeed = Math.floor(Math.random() * 1e9);
    this.setupRace("solo", this.soloSeed, 15);
    this.raceClock = -3;
    this.raceOriginClock = -3;
    this.raceOriginPerf = performance.now();
    this.placePlayerOnGrid(0);
  }

  /** Pure client-side match with bots (no server room — fixes "no room" on serverless). */
  startWithBots(botCount = 5, botDiff: BotDiff = "mixed", sectionCount = 15) {
    this.spectating = false;
    const seed = Math.floor(Math.random() * 1e9);
    const bots = Math.max(1, Math.min(11, Math.round(botCount)));
    const secs = Math.max(5, Math.min(25, Math.round(sectionCount)));
    const fakeRoom: RoomInfo = {
      id: "local_bots",
      code: "LOCAL",
      name: "Bots",
      hostId: this.pid,
      isPublic: false,
      quick: false,
      maxPlayers: bots + 1,
      status: "countdown",
      seed,
      sectionCount: secs,
      bots,
      botCount: bots,
      botDiff,
      startAt: Date.now() + 3500,
      createdAt: Date.now(),
      waitLeft: null,
      players: [{ id: this.pid, name: this.name || "You", look: {}, finishMs: null }],
    };
    this.room = fakeRoom;
    this.startMulti(fakeRoom);
  }
  startTA() {
    this.room = null;
    this.spectating = false;
    
    this.setupRace("ta", TIME_ATTACK_SEED, 15, TIME_ATTACK_LIST, 0.9);
    this.raceClock = -3;
    this.raceOriginClock = -3;
    this.raceOriginPerf = performance.now();
    this.placePlayerOnGrid(0);
  }
  startPractice(sectionTypes: string | string[]) {
    this.room = null;
    this.spectating = false;
    const list = (Array.isArray(sectionTypes) ? sectionTypes : [sectionTypes]).filter(Boolean);
    const pool = list.length ? list : ["stones"];
    const types = Array.from({ length: 25 }, (_, i) => pool[i % pool.length]);
    this.setupRace("practice", Math.floor(Math.random() * 1e9), 25, types, 0.55);
    this.raceClock = -3;
    this.raceOriginClock = -3;
    this.raceOriginPerf = performance.now();
    this.placePlayerOnGrid(0);
  }
  startWeekly() {
    this.room = null;
    this.spectating = false;
    
    const seed = weeklyChallengeSeed();
    this.setupRace("weekly", seed, 25, undefined, 0.7);
    this.raceClock = -3;
    this.raceOriginClock = -3;
    this.raceOriginPerf = performance.now();
    this.placePlayerOnGrid(0);
  }
  restart() {
    if (this.mode === "solo") this.startSolo();
    else if (this.mode === "ta") this.startTA();
    else if (this.mode === "weekly") this.startWeekly();
  }
  private placePlayerOnGrid(i: number) {
    const g = this.startGrid[i] ?? this.startGrid[0];
    this.body.reset(g.x, 0.05, g.z, 0);
  }

  startMulti(room: RoomInfo) {
    this.setupRace("multi", room.seed, room.sectionCount);
    // Sync local race clock to server startAt when valid; otherwise standard 3s countdown
    let origin = -3;
    if (room.startAt && room.startAt > 1e12) {
      const serverT = (Date.now() + this.serverOffset - room.startAt) / 1000;
      if (Number.isFinite(serverT) && serverT > -20 && serverT < 5) origin = serverT;
    }
    this.raceOriginClock = origin;
    this.raceOriginPerf = performance.now();
    this.raceClock = origin;
    this.firstFinishRace = Infinity;
    const humans = [...room.players].sort((a, b) => a.id.localeCompare(b.id));
    const myIdx = Math.max(0, humans.findIndex((p) => p.id === this.pid));
    this.placePlayerOnGrid(myIdx);
    // bots
    const rng = new RNG(room.seed ^ 0x5bd1e995);
    const used = new Set<string>(humans.map((h) => h.name));
    for (let i = 0; i < room.bots; i++) {
      let name = rng.pick(BOT_NAMES);
      let guard = 0;
      while (used.has(name) && guard++ < 20) name = rng.pick(BOT_NAMES);
      used.add(name);
      const color = rng.pick(BODY_COLORS);
      const hat = randomCosmetic("hat", rng);
      const fp = randomCosmetic("footprint", rng);
      const skin = rng.chance(0.8) ? randomCosmetic("skin", rng, false) : "skin_bean";
      const aura = rng.chance(0.3) ? randomCosmetic("aura", rng, false) : "au_none";
      const trail = rng.chance(0.3) ? randomCosmetic("trail", rng, false) : "tr_none";
      const wanted = room.botDiff ?? "mixed";
      const diff: Exclude<BotDiff, "mixed"> = wanted === "mixed" ? (["easy", "mid", "hard"] as const)[i % 3] : wanted;
      const ch = new Character(color, hat, skin, `${BOT_DIFF_ICON_MAP[diff]} ${name}`, "#ffffff");
      this.scene.add(ch.root);
      const gridPos = this.startGrid[(humans.length + i) % 12].clone();
      const st = BOT_DIFF_STATS[diff];
      const abilities = ["ab_hit", "ab_hit", "ab_shove", "ab_blind", "ab_anchor"];
      const bot: Bot = {
        id: `bot_${i}`, name, color, char: ch, segs: [], finishT: 0, shift: 0, stunEnd: 0, frozen: 0,
        pushCd: rng.range(st.pushCd[0], st.pushCd[1]) * 0.4,
        pos: gridPos.clone(), lastPrint: gridPos.clone(), printSide: 1, fp, emoteDone: false,
        emojiT: rng.range(st.emoji[0], st.emoji[1]) * 0.35, section: 0, diff, kind: 0, dying: false,
        style: makeBotStyle(rng, diff), aura, trail, auraT: 0, cheered: 0,
        ability: rng.pick(abilities), abilityCd: rng.range(4, 12),
      };
      this.buildBotSchedule(bot, new RNG(room.seed + i * 7919), gridPos, diff);
      this.bots.push(bot);
    }
    for (const p of humans) if (p.id !== this.pid) this.ensureRemote(p.id, p.name, p.look);
    this.cb.matchStarted();
  }

  // ------------------------------------------------------------------ bots
  private botWps: { wp: Waypoint; sec: number; cp: number }[] = [];
  private buildBotSchedule(bot: Bot, rng: RNG, start: THREE.Vector3, diff: Exclude<BotDiff, "mixed"> = "mid") {
    const c = this.course!;
    if (!this.botWps.length || (this.botWps as unknown as { course?: Course }).course !== c) {
      const list: { wp: Waypoint; sec: number; cp: number }[] = [];
      c.sections.forEach((s, si) => {
        const cpIdx = list.length;
        for (const w of s.wps) list.push({ wp: w, sec: si, cp: cpIdx });
      });
      this.botWps = list;
      (this.botWps as unknown as { course?: Course }).course = c;
    }
    const W = this.botWps;
    const st = BOT_DIFF_STATS[diff];
    const skill = diff === "hard" ? 1.05 : diff === "mid" ? 0.92 : 0.8;
    const style = bot.style ?? makeBotStyle(rng, diff);
    // aggressive bots run faster but fumble tricky jumps more often
    const speed = rng.range(st.speed[0], st.speed[1]) * (0.94 + style.aggression * 0.14);
    const fail = st.fail * rng.range(0.7, 1.35) * (0.75 + style.risk * 1.6);
    const segs: Seg[] = [];
    let t = rng.range(0.1, 0.5);
    // first segment from grid to first waypoint: represent with index -1
    const p0 = start;
    const w0 = this.wpPos(0, tmpV);
    const d0 = p0.distanceTo(w0);
    segs.push({ a: -1, b: 0, t0: t, t1: t + d0 / speed, kind: 0 });
    t += d0 / speed;
    let j = 0;
    const fallsIn = new Map<number, number>();
    let guard = 0;
    while (j < W.length - 1 && guard++ < 5000) {
      const A = this.wpPos(j, tmpV).clone();
      const Bp = this.wpPos(j + 1, tmpV2);
      const dist = A.distanceTo(Bp);
      if (W[j + 1].wp.tp) { segs.push({ a: j, b: j + 1, t0: t, t1: t + 0.35, kind: 2 }); t += 0.35; j++; continue; }
      const jump = dist > 1.8 || Math.abs(Bp.y - A.y) > 0.4;
      const dur = dist / speed + (jump ? 0.1 : 0) + rng.range(0, 0.25) * (1.2 - skill) * style.reaction;
      const sec = W[j + 1].sec;
      const f = fallsIn.get(sec) ?? 0;
      if (jump && f < 2 && rng.chance(fail * (dist > 2.6 ? 1.3 : 0.5))) {
        segs.push({ a: j, b: j + 1, t0: t, t1: t + 1.3, kind: 1 });
        t += 1.3;
        const cp = W[j + 1].cp;
        segs.push({ a: cp, b: cp, t0: t, t1: t + 0.5, kind: 2 });
        t += 0.5;
        fallsIn.set(sec, f + 1);
        j = cp;
        continue;
      }
      segs.push({ a: j, b: j + 1, t0: t, t1: t + dur, kind: 0 });
      t += dur;
      j++;
    }
    bot.segs = segs;
    bot.finishT = t + 0.3;
    (bot as Bot & { start: THREE.Vector3 }).start = start.clone();
  }

  private wpPos(i: number, out: THREE.Vector3) {
    const e = this.botWps[i];
    if (!e) return out.set(0, 0, 0);
    const w = e.wp;
    if (w.box) out.set(w.box.x + w.x, w.box.y + w.box.hy + w.y, w.box.z + w.z);
    else out.set(w.x, w.y, w.z);
    return out;
  }

  private botLocalT(b: Bot, raceT: number) {
    if (raceT < b.stunEnd) return b.frozen;
    return raceT - b.shift;
  }

  /** True if bot AABB overlaps an active kill-laser (hazard === 2). */
  private botHitsLaser(pos: THREE.Vector3): boolean {
    const course = this.mode === "hub" ? this.hub?.course : this.course;
    if (!course) return false;
    const R = 0.45;
    const H = 1.55;
    for (const box of course.boxes) {
      if (!box.active || box.hazard !== 2) continue;
      const dx = pos.x - box.x, dz = pos.z - box.z;
      const feet = pos.y;
      const top = box.y + box.hy, bot = box.y - box.hy;
      if (feet + H < bot || feet > top + 0.15) continue;
      if (box.cyl) {
        if (dx * dx + dz * dz <= (box.hx + R) * (box.hx + R)) return true;
      } else {
        const c = Math.cos(box.rot), s = Math.sin(box.rot);
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        if (Math.abs(lx) <= box.hx + R && Math.abs(lz) <= box.hz + R) return true;
      }
    }
    return false;
  }

  private updateBots(dt: number, raceT: number) {
    for (const b of this.bots) {
      const lt = this.botLocalT(b, raceT);
      const start = (b as Bot & { start: THREE.Vector3 }).start;
      let grounded = true, yaw = b.char.root.rotation.y, air = false;
      const prev = tmpV2.copy(b.pos);
      if (lt <= 0 || !b.segs.length) {
        b.pos.copy(start);
      } else if (lt >= b.finishT) {
        const last = this.wpPos(this.botWps.length - 1, tmpV);
        const k = parseInt(b.id.split("_")[1] || "0", 10);
        b.pos.set(last.x + ((k % 5) - 2) * 1.6, last.y, last.z + 1 + Math.floor(k / 5) * 1.5);
        if (!b.emoteDone) {
          b.emoteDone = true;
          b.char.playEmote((["win", "cheer", "dance", "wave"] as Emote[])[k % 4]);
          this.botsCheer(b.pos, "finish");
          // Record real race-clock time (schedule finishT is only for pacing)
          (b as Bot & { actualFinish?: number }).actualFinish = Math.max(0.01, raceT);
          if (this.mode === "multi") this.firstFinishRace = Math.min(this.firstFinishRace, Math.max(0.01, raceT));
          if (Math.random() < 0.6) this.fx.emoji(["🏆", "😎", "🎉", "🔥", "💯"][k % 5], b.pos.clone().add(new THREE.Vector3(0, 2.6, 0)));
        }
      } else {
        let lo = 0, hi = b.segs.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (b.segs[mid].t0 <= lt) lo = mid; else hi = mid - 1; }
        const s = b.segs[lo];
        const f = Math.max(0, Math.min(1, (lt - s.t0) / (s.t1 - s.t0)));
        const A = s.a < 0 ? tmpV.copy(start) : this.wpPos(s.a, tmpV);
        const Ax = A.x, Ay = A.y, Az = A.z;
        const Bv = this.wpPos(s.b, new THREE.Vector3());
        b.section = this.botWps[s.b]?.sec ?? 0;
        if (s.kind === 0) {
          const dist = Math.hypot(Bv.x - Ax, Bv.z - Az);
          const jump = dist > 1.8 || Math.abs(Bv.y - Ay) > 0.4;
          b.pos.set(Ax + (Bv.x - Ax) * f, Ay + (Bv.y - Ay) * f, Az + (Bv.z - Az) * f);
          if (jump) { b.pos.y += Math.sin(Math.PI * f) * (0.9 + dist * 0.12 + Math.max(0, Bv.y - Ay) * 0.4); grounded = false; air = true; }
          if (dist > 0.05) yaw = Math.atan2(Bv.x - Ax, Bv.z - Az);
        } else if (s.kind === 1) {
          const k = Math.min(1, f * 2.2) * 0.45;
          const tf = Math.max(0, lt - s.t0 - 0.2);
          b.pos.set(Ax + (Bv.x - Ax) * k, Ay + (Bv.y - Ay) * k + Math.sin(Math.min(1, f * 2.2) * Math.PI) * 0.9 - 14 * tf * tf, Az + (Bv.z - Az) * k);
          grounded = false; air = true;
          if (f > 0.9 && !b.dying) {
            b.dying = true;
            this.fx.burst(b.pos.clone().setY(b.pos.y + 0.6), 0xffffff, 18, 5, { size: 0.24 });
            this.botsCheer(b.pos, "fall");
            if (b.pos.distanceTo(this.body.p) < 30) sfx.death();
          }
        } else {
          b.pos.copy(Bv);
          if (b.dying) {
            b.dying = false;
            this.fx.burst(b.pos.clone().setY(b.pos.y + 1), 0x9be7ff, 16, 4, { up: 2 });
            this.fx.ring(b.pos, 0x9be7ff, 2.2);
          }
        }
        b.kind = s.kind;
      }
      // Lasers kill bots too (scheduled path ignores moving hazards)
      if (lt > 0 && lt < b.finishT && !b.dying && raceT >= b.stunEnd && this.botHitsLaser(b.pos)) {
        b.dying = true;
        b.frozen = lt;
        b.shift += 2.6 + (b.diff === "easy" ? 0.6 : b.diff === "mid" ? 0.3 : 0);
        b.stunEnd = raceT + 1.8;
        this.fx.burst(b.pos.clone().setY(b.pos.y + 0.7), 0xff1e3c, 20, 6, { size: 0.22 });
        this.fx.ring(b.pos, 0xff3355, 2.4);
        this.botsCheer(b.pos, "fall");
        if (b.pos.distanceTo(this.body.p) < 32) sfx.death();
      }
      // Red hazard pushers knock bots too
      if (this.course && lt > 0 && lt < b.finishT && !b.dying && raceT >= b.stunEnd) {
        const si = this.course.sectionAt(b.pos.z);
        for (let i = Math.max(0, si - 1); i <= Math.min(this.course.sections.length - 1, si + 1); i++) {
          for (const box of this.course.sections[i].boxes) {
            if (!box.active || box.hazard !== 1) continue;
            const dx = b.pos.x - box.x, dz = b.pos.z - box.z;
            const hx = box.hx + 0.45, hz = box.hz + 0.45;
            if (Math.abs(dx) < hx && Math.abs(dz) < hz && b.pos.y < box.y + box.hy + 1.2 && b.pos.y > box.y - box.hy - 0.5) {
              const len = Math.hypot(dx, dz) || 1;
              b.pos.x += (dx / len) * 2.8;
              b.pos.z += (dz / len) * 2.8;
              b.pos.y += 1.2;
              b.shift += 0.9;
              b.stunEnd = raceT + 0.7;
              this.fx.burst(b.pos.clone().setY(b.pos.y + 0.5), 0xff3355, 10, 5);
              break;
            }
          }
        }
      }
      // Apply course wind zones to bots (scripted paths otherwise ignore physics wind)
      if (this.course && lt > 0 && lt < b.finishT && !b.dying) {
        let wx = 0, wz = 0;
        const si = this.course.sectionAt(b.pos.z);
        for (let i = Math.max(0, si - 1); i <= Math.min(this.course.sections.length - 1, si + 1); i++) {
          for (const z of this.course.sections[i].zones) {
            if (z.type !== "wind") continue;
            if (inZone(z, b.pos.x, b.pos.y + 0.8, b.pos.z)) {
              wx += z.a; wz += z.c;
            }
          }
        }
        if (wx || wz) {
          b.pos.x += wx * dt * 0.7;
          b.pos.z += wz * dt * 0.7;
        }
      }
      const stunned = raceT < b.stunEnd;
      b.char.root.position.copy(b.pos);
      let d = yaw - b.char.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      b.char.root.rotation.y += d * Math.min(1, dt * 12);
      const spd = dt > 0 ? prev.distanceTo(b.pos) / dt : 0;
      b.char.update(dt, { speed: Math.min(9, spd), grounded, vy: air ? 1 : 0, stunned, wall: false, up: 1 });
      // personal aura / trail so bots look like real customised players
      if (!stunned && this.particleScale > 0.05) {
        b.auraT -= dt;
        if (b.auraT <= 0 && b.pos.distanceTo(this.body.p) < 34) {
          b.auraT = 0.1 / Math.max(0.2, this.particleScale);
          const au = item(b.aura);
          if (au && au.id !== "au_none") {
            const a = Math.random() * Math.PI * 2;
            this.fx.spawn(b.pos.x + Math.cos(a) * 0.6, b.pos.y + Math.random() * 1.4, b.pos.z + Math.sin(a) * 0.6, 0, 1.2, 0, au.color, 0.7, 0.12, 0, 0.6, au.style === "rainbow");
          }
          const tr = item(b.trail);
          if (tr && tr.id !== "tr_none" && spd > 3) {
            this.fx.spawn(b.pos.x, b.pos.y + 0.5, b.pos.z, 0, 0.3, 0, tr.color, 0.5, 0.18, 0, 2, tr.style === "rainbow");
          }
        }
      }
      if (grounded && !stunned && b.pos.distanceTo(b.lastPrint) > 0.5) {
        const it = item(b.fp);
        this.stamp(b.pos, b.char.root.rotation.y, b.printSide, it?.color ?? "#fff", it?.style === "rainbow");
        b.printSide *= -1;
        b.lastPrint.copy(b.pos);
      }
      // bot pushes / uses random abilities on player (multi only)
      if (this.mode === "multi" && this.phase === "run" && !stunned) {
        b.pushCd -= dt;
        b.abilityCd -= dt;
        const dist = b.pos.distanceTo(this.body.p);
        if (b.pushCd <= 0 && this.body.stun <= 0 && dist < 2.4 && Math.random() < dt * (b.diff === "hard" ? 1.1 : b.diff === "mid" ? 0.8 : 0.45)) {
          b.pushCd = BOT_DIFF_STATS[b.diff].pushCd[0];
          // chance to use special ability instead of basic push
          if (b.abilityCd <= 0 && b.ability !== "ab_hit" && Math.random() < 0.45) {
            b.abilityCd = 10 + Math.random() * 8;
            if (b.ability === "ab_shove") {
              this.getPushed(b.pos, b.name);
              this.body.v.y = Math.max(this.body.v.y, 6);
              this.fx.burst(this.body.p.clone().setY(this.body.p.y + 1), 0xff3d7f, 18, 7);
            } else if (b.ability === "ab_blind") {
              this.cb.popup("🌑", "#1b1440");
              this.fogTarget = { near: 1, far: 8 };
              setTimeout(() => { this.fogTarget = { near: this.themeFog.near, far: this.themeFog.far }; }, 2500);
            } else {
              this.getPushed(b.pos, b.name);
            }
          } else {
            this.getPushed(b.pos, b.name);
          }
        }
        const st = BOT_DIFF_STATS[b.diff];
        b.emojiT -= dt * b.style.chatty;
        if (b.emojiT <= 0) {
          b.emojiT = (st.emoji[0] + Math.random() * (st.emoji[1] - st.emoji[0])) / Math.max(0.4, b.style.chatty);
          if (b.pos.distanceTo(this.body.p) < 28) this.fx.emoji(["😂", "🔥", "😎", "👋", "😭", "🐸", "💀", "🚀"][Math.floor(Math.random() * 8)], b.pos.clone().add(new THREE.Vector3(0, 2.6, 0)));
        }
        // bots also shove each other around
        if (b.pushCd <= 0) {
          for (const o of this.bots) {
            if (o === b || raceT < o.stunEnd || raceT - o.shift >= o.finishT) continue;
            if (o.pos.distanceTo(b.pos) < 2.4 && Math.random() < dt * 0.55) {
              b.pushCd = st.pushCd[0] + Math.random() * (st.pushCd[1] - st.pushCd[0]);
              o.frozen = this.botLocalT(o, raceT);
              o.shift += 2.2;
              o.stunEnd = raceT + 2.2;
              this.fx.burst(o.pos.clone().setY(o.pos.y + 1), 0xffd23f, 14, 5, { color2: 0xff3355 });
              if (o.pos.distanceTo(this.body.p) < 26) sfx.push();
              break;
            }
          }
        }
      }
    }
  }

  /** Bots react to nearby drama: someone finishing or wiping out. */
  private botsCheer(at: THREE.Vector3, kind: "finish" | "fall") {
    for (const b of this.bots) {
      if (!b.style.cheerful || b.pos.distanceTo(at) > 22) continue;
      if (performance.now() < b.cheered) continue;
      b.cheered = performance.now() + 6000;
      const set = kind === "finish" ? ["🎉", "👏", "🔥", "🏆"] : ["😂", "💀", "😭", "🤣"];
      this.fx.emoji(set[Math.floor(Math.random() * set.length)], b.pos.clone().setY(b.pos.y + 2.6));
    }
  }

  // ------------------------------------------------------------------ remotes
  private ensureRemote(id: string, name: string, look: Record<string, string>) {
    let r = this.remotes.get(id);
    if (!r) {
      const ch = new Character(look.color || "#ff4d6d", look.hat || "hat_none", look.skin || "skin_bean", name, "#ffe14d");
      this.scene.add(ch.root);
      r = {
        id, name, look, char: ch, pos: new THREE.Vector3(0, -100, 0), target: new THREE.Vector3(0, -100, 0),
        yaw: 0, tYaw: 0, s: [], seen: performance.now(), stunLocal: 0, lastPrint: new THREE.Vector3(), printSide: 1,
        finishMs: null, buf: [], clock: 0, vel: new THREE.Vector3(), anim: 0, smoothSpeed: 0,
      };
      this.remotes.set(id, r);
    }
    if (look.skin) r.char.setSkin(look.skin);
    if (look.color) r.char.setColor(look.color);
    if (look.hat) r.char.setHat(look.hat);
    r.look = look;
    return r;
  }
  private clearRemotes() {
    for (const r of this.remotes.values()) r.char.root.removeFromParent();
    this.remotes.clear();
  }
  private applyRemoteStates(list: { id: string; name: string; look: Record<string, string>; s: number[]; finishMs: number | null }[]) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of list) {
      if (!p.s || p.s.length < 8) continue;
      seen.add(p.id);
      const r = this.ensureRemote(p.id, p.name, p.look || {});
      const first = r.s.length === 0 || r.pos.y < -50;
      r.s = p.s;
      r.finishMs = p.finishMs;
      r.target.set(p.s[0], p.s[1], p.s[2]);
      r.tYaw = p.s[3];
      // snapshot buffer feeds the interpolator (rendered ~110 ms in the past)
      const last = r.buf[r.buf.length - 1];
      if (!last || last.x !== p.s[0] || last.y !== p.s[1] || last.z !== p.s[2] || last.yaw !== p.s[3] || last.anim !== p.s[4]) {
        r.buf.push({ t: now, x: p.s[0], y: p.s[1], z: p.s[2], yaw: p.s[3], anim: p.s[4], extra: p.s[7] });
        if (r.buf.length > 24) r.buf.shift();
      }
      if (first) {
        r.pos.copy(r.target);
        r.clock = now - INTERP_DELAY;
        r.buf = [{ t: now, x: p.s[0], y: p.s[1], z: p.s[2], yaw: p.s[3], anim: p.s[4], extra: p.s[7] }];
      }
      r.seen = now;
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id) && now - r.seen > 4000) { r.char.root.removeFromParent(); this.remotes.delete(id); }
    }
  }
  private updateRemotes(dt: number) {
    const now = performance.now();
    for (const r of this.remotes.values()) {
      if (r.s.length < 8 || !r.buf.length) continue;
      // playback clock trails real time; it speeds up / slows down to stay in the buffer
      if (r.clock === 0) r.clock = now - INTERP_DELAY;
      const newest = r.buf[r.buf.length - 1].t;
      const lag = newest - r.clock;
      const rate = lag > INTERP_DELAY * 2.2 ? 1.35 : lag < INTERP_DELAY * 0.5 ? 0.72 : 1;
      r.clock += dt * 1000 * rate;
      if (r.clock > newest + 420) r.clock = newest + 420;      // packet loss: hold, do not teleport
      if (r.clock < r.buf[0].t) r.clock = r.buf[0].t;

      const prevPos = tmpV2.copy(r.pos);
      let px = 0, py = 0, pz = 0, pyaw = 0, anim = r.anim, extra = r.s[7];
      if (r.clock <= r.buf[0].t || r.buf.length === 1) {
        const a = r.buf[0];
        px = a.x; py = a.y; pz = a.z; pyaw = a.yaw; anim = a.anim; extra = a.extra;
      } else {
        let i = r.buf.length - 1;
        while (i > 0 && r.buf[i - 1].t > r.clock) i--;
        const a = r.buf[i - 1] ?? r.buf[0];
        const bS = r.buf[i];
        const span = Math.max(1, bS.t - a.t);
        let f = (r.clock - a.t) / span;
        if (f > 1) {
          // brief extrapolation instead of freezing when packets stop arriving
          const over = Math.min(0.28, (r.clock - bS.t) / 1000);
          const vx = (bS.x - a.x) / span * 1000, vy = (bS.y - a.y) / span * 1000, vz = (bS.z - a.z) / span * 1000;
          px = bS.x + vx * over; py = bS.y + vy * over; pz = bS.z + vz * over;
          pyaw = bS.yaw; anim = bS.anim; extra = bS.extra;
        } else {
          f = Math.max(0, f);
          const sm = f * f * (3 - 2 * f); // smoothstep removes visible corners
          px = a.x + (bS.x - a.x) * sm;
          py = a.y + (bS.y - a.y) * sm;
          pz = a.z + (bS.z - a.z) * sm;
          let dy = bS.yaw - a.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          pyaw = a.yaw + dy * sm;
          anim = f > 0.5 ? bS.anim : a.anim;
          extra = bS.extra;
        }
      }
      const jump = Math.hypot(px - r.pos.x, py - r.pos.y, pz - r.pos.z);
      if (jump > 12) r.pos.set(px, py, pz);
      else r.pos.lerp(tmpV.set(px, py, pz), 1 - Math.exp(-dt * 26));
      let d = pyaw - r.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.yaw += d * Math.min(1, dt * 16);
      r.anim = anim;
      r.char.root.position.copy(r.pos);
      r.char.root.rotation.y = r.yaw;
      const stunned = r.s[6] > 0 || now < r.stunLocal;
      const ecode = Math.floor(extra / 10);
      const up = extra % 10 === 1 ? -1 : 1;
      const em = EMOTE_CODES[ecode] ?? "";
      if (em !== r.char.emote) r.char.playEmote(em);
      const rawSpeed = dt > 0 ? Math.hypot(r.pos.x - prevPos.x, r.pos.z - prevPos.z) / dt : 0;
      r.smoothSpeed += (Math.min(9, rawSpeed) - r.smoothSpeed) * Math.min(1, dt * 9);
      const vy = anim === 1 ? (r.pos.y - prevPos.y > 0 ? 4 : -4) : 0;
      r.char.update(dt, { speed: r.smoothSpeed, grounded: anim === 0, vy, stunned, wall: anim === 2, up });
      if (anim === 0 && r.smoothSpeed > 1 && r.pos.distanceTo(r.lastPrint) > 0.5) {
        const it = item(r.look.footprint || "fp_basic");
        this.stamp(r.pos, r.yaw, r.printSide, it?.color ?? "#fff", it?.style === "rainbow");
        r.printSide *= -1;
        r.lastPrint.copy(r.pos);
      }
      r.char.root.visible = r.pos.y > -60;
    }
  }

  // ------------------------------------------------------------------ net
  async post(body: Record<string, unknown>) {
    const res = await fetch("/api/net", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: this.pid, name: this.name, look: this.netLook(), ...body }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((j as { error?: string }).error || "Network error");
    return j;
  }
  private netLook() { return { color: this.look.color, hat: this.look.hat, skin: this.look.skin, footprint: this.look.footprint }; }
  private myState(): number[] {
    const b = this.body;
    const anim = b.grounded ? 0 : b.wallT < 0.1 ? 2 : 1;
    const ecode = Math.max(0, EMOTE_CODES.indexOf(this.char.emote));
    return [+b.p.x.toFixed(2), +b.p.y.toFixed(2), +b.p.z.toFixed(2), +b.yaw.toFixed(2), anim, this.curSection, b.stun > 0 ? 1 : 0, ecode * 10 + (b.up < 0 ? 1 : 0)];
  }

  setRoom(room: RoomInfo | null) {
    if (this.room && (!room || room.id !== this.room.id)) void this.post({ op: "leave", roomId: this.room.id }).catch(() => {});
    this.room = room;
    this.lastSeqRoom = 0;
  }

  private netTick(dt: number) {
    // hub presence
    if (this.mode === "hub") {
      this.netTimerHub -= dt;
      if (this.netTimerHub <= 0 && !this.netBusyHub) {
        this.netTimerHub = 0.25;
        this.netBusyHub = true;
        const ev = this.hubEvents.splice(0);
        this.post({ op: "hub", s: this.myState(), ev, lastSeq: this.lastSeqHub })
          .then((j: { players: { id: string; name: string; look: Record<string, string>; s: number[]; finishMs: number | null }[]; events: { type: string; target?: string; data?: unknown; from: string }[]; seq: number; online: number }) => {
            if (this.mode !== "hub") return;
            this.lastSeqHub = j.seq;
            this.online = j.online;
            this.onlineList = (j.players || []).map((p: { id: string; name: string; registered?: boolean }) => ({
              id: p.id, name: p.name, registered: !!p.registered,
            }));
            // include self
            if (!this.onlineList.some((x) => x.id === this.pid)) {
              this.onlineList.unshift({ id: this.pid, name: this.name, registered: false });
            }
            this.applyRemoteStates(j.players);
            this.handleEvents(j.events);
          })
          .catch(() => {})
          .finally(() => { this.netBusyHub = false; });
      }
    }
    if (this.room && this.room.id !== "local_bots") {
      this.netTimerRoom -= dt;
      if (this.netTimerRoom <= 0 && !this.netBusyRoom) {
        this.netTimerRoom = this.mode === "multi" ? 0.05 : 0.2;
        this.netBusyRoom = true;
        const ev = this.mode === "multi" ? this.outEvents.splice(0) : [];
        const t0 = Date.now();
        const roomId = this.room.id;
        const tp = this.tpFlag;
        this.tpFlag = false;
        const body: Record<string, unknown> = { op: "sync", roomId, s: this.myState(), ev, lastSeq: this.lastSeqRoom, tp: tp ? 1 : 0 };
        if (this.finishMsSent !== null) body.finishMs = this.finishMsSent;
        this.post(body)
          .then((j: { room: RoomInfo; players: { id: string; name: string; look: Record<string, string>; s: number[]; finishMs: number | null }[]; events: { type: string; target?: string; data?: unknown; from: string }[]; seq: number; now: number; correction?: number[] | null; cheatMsg?: string | null }) => {
            if (!this.room || this.room.id !== roomId) return;
            const t1 = Date.now();
            const off = j.now - (t0 + t1) / 2;
            this.serverOffset = this.serverOffset === 0 ? off : this.serverOffset * 0.8 + off * 0.2;
            this.room = j.room;
            this.roomGoneStrikes = 0;
            this.lastSeqRoom = j.seq;
            if (this.mode === "hub" && (j.room.status === "countdown" || j.room.status === "racing")) {
              this.startMulti(j.room);
            }
            if (this.mode === "multi") {
              this.applyRemoteStates(j.players);
              this.handleEvents(j.events);
              if (j.correction && j.correction.length >= 3 && this.phase === "run") {
                // server rejected our movement: ease back instead of snapping
                const c = j.correction;
                if (this.body.p.distanceTo(tmpV.set(c[0], c[1], c[2])) > 3) {
                  this.body.p.set(c[0], c[1], c[2]);
                  this.body.v.set(0, 0, 0);
                }
              }
              if (j.cheatMsg === "warn") this.cb.toast(t("cheat.warn"));
            }
          })
          .catch((e: Error) => {
            if (e.message === "kicked") {
              this.room = null;
              this.cb.toast(t("cheat.kick"));
              this.enterHub();
              return;
            }
            if (e.message === "gone" || e.message === "not in room") {
              // Tolerate brief server blips (Netlify cold start / multi-instance).
              // Only drop the room after several consecutive failures.
              this.roomGoneStrikes = (this.roomGoneStrikes ?? 0) + 1;
              if (this.roomGoneStrikes >= 4) {
                this.room = null;
                this.roomGoneStrikes = 0;
                if (this.mode === "hub") this.cb.toast("Лобби закрыто");
              }
            }
          })
          .finally(() => { this.netBusyRoom = false; });
      }
    }
  }

  private handleEvents(evs: { type: string; target?: string; data?: unknown; from: string }[]) {
    for (const e of evs) {
      if (e.type === "emoji") {
        const d = e.data as { e?: string; x?: number; y?: number; z?: number };
        if (d && typeof d.e === "string") this.fx.emoji(d.e.slice(0, 8), new THREE.Vector3(Number(d.x), Number(d.y), Number(d.z)));
      } else if (e.type === "push") {
        if (e.target === this.pid) {
          const r = this.remotes.get(e.from);
          this.getPushed(r ? r.pos : this.body.p.clone().add(new THREE.Vector3(0, 0, -1)), r?.name ?? "Кто-то");
        } else {
          const r = e.target ? this.remotes.get(e.target) : null;
          if (r) r.stunLocal = performance.now() + 2200;
        }
      }
    }
  }

  // ------------------------------------------------------------------ actions
  private onKey(code: string) {
    if (this.spectating) {
      if (code === "ArrowLeft" || code === "KeyA") { this.cycleSpectator(-1); return; }
      if (code === "ArrowRight" || code === "KeyD") { this.cycleSpectator(1); return; }
      if (code === "KeyF" || code === "KeyC") { this.toggleFreeCam(); return; }
    }
    if (code === "Escape" || code === "KeyP") return; // handled by UI
    if (code === "KeyR" && (this.mode === "solo" || this.mode === "ta")) return; // UI handles
    const n = parseInt(code.replace("Digit", ""), 10);
    if (code.startsWith("Digit") && n >= 1 && n <= 8) this.emojiSlot?.(n - 1);
  }
  emojiSlot: ((i: number) => void) | null = null;

  setPaused(p: boolean) {
    if (this.mode === "solo" || this.mode === "ta" || this.mode === "practice" || this.mode === "weekly") this.paused = p;
    else this.paused = false;
    if (p) this.input.exitLock();
  }

  tryPush() {
    if (this.body.stun > 0 || this.phase === "finished") return;
    const ab = this.activeAbility || "ab_hit";

    // self abilities — no target required
    if (ab === "ab_anchor") {
      if (this.abilityCd > 0) return;
      this.abilityCd = 12;
      this.anchorUntil = performance.now() + 2000;
      this.cb.popup(t("pop.anchor"), "#7dffb0");
      this.fx.ring(this.body.p, 0x7dffb0, 3);
      return;
    }
    if (ab === "ab_dash") {
      if (this.abilityCd > 0) return;
      this.abilityCd = 12;
      const yaw = this.camYaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      this.body.v.x += fx * 14;
      this.body.v.z += fz * 14;
      this.body.v.y = Math.max(this.body.v.y, 3);
      this.body.grounded = false;
      this.cb.popup(t("pop.dash"), "#4cc9f0");
      this.fx.burst(this.body.p.clone().setY(this.body.p.y + 0.5), 0x4cc9f0, 18, 8);
      this.addShake(0.2);
      return;
    }
    if (ab === "ab_clone") {
      if (this.abilityCd > 0) return;
      this.abilityCd = 14;
      this.spawnClone();
      this.cb.popup(t("pop.clone"), "#d36bff");
      return;
    }
    if (ab === "ab_oil") {
      if (this.abilityCd > 0) return;
      this.abilityCd = 16;
      this.oilUntil = performance.now() + 3000;
      this.oilPos.copy(this.body.p);
      this.cb.popup(t("pop.oil"), "#c9a36b");
      this.fx.ring(this.body.p, 0xc9a36b, 4);
      return;
    }
    if (ab === "ab_double") {
      // F activates nothing — charges used via mid-air jump; show status
      this.cb.popup(t("pop.djStatus", { n: this.djCharges }), "#7dffb0");
      return;
    }

    // targeted abilities
    if (this.pushCd > 0 || !this.pushTarget) return;
    const tgt = this.pushTarget;
    const pos = tgt.kind === "bot" ? (tgt.ref as Bot).pos : tgt.kind === "remote" ? (tgt.ref as Remote).pos : (tgt.ref as HubBot).body.p;
    this.char.jump();
    sfx.push();
    this.cb.stat("pushes", 1);

    if (ab === "ab_blind") {
      this.pushCd = 18;
      this.addShake(0.2);
      this.fx.burst(pos.clone().setY(pos.y + 1), 0x111122, 16, 5);
      this.cb.popup(t("pop.blind"), "#8888aa");
      if (tgt.kind === "remote") {
        const r = tgt.ref as Remote;
        this.outEvents.push({ type: "blind", target: r.id });
        this.hubEvents.push({ type: "blind", target: r.id });
      } else if (tgt.kind === "bot") {
        const b = tgt.ref as Bot;
        const raceT = this.raceTime();
        b.shift += 0.8;
        b.stunEnd = raceT + 0.6;
      }
      return;
    }

    if (ab === "ab_shove") {
      this.pushCd = 15;
      this.addShake(0.35);
      this.fx.burst(pos.clone().setY(pos.y + 1), 0xffd23f, 22, 7, { color2: 0xff3355 });
      this.fx.ring(pos, 0xffffff, 3);
      this.cb.popup(t("pop.bam"), "#ffd23f");
      if (tgt.kind === "bot") {
        const b = tgt.ref as Bot;
        const raceT = this.raceTime();
        b.frozen = this.botLocalT(b, raceT);
        b.shift += 2.2;
        b.stunEnd = raceT + 2.2;
      } else if (tgt.kind === "remote") {
        const r = tgt.ref as Remote;
        r.stunLocal = performance.now() + 2200;
        const ev = { type: "push", target: r.id };
        if (this.mode === "multi") this.outEvents.push(ev);
        else this.hubEvents.push(ev);
      } else {
        const hb = tgt.ref as HubBot;
        hb.stun = 2.2;
        const dx = hb.body.p.x - this.body.p.x, dz = hb.body.p.z - this.body.p.z;
        const dl = Math.hypot(dx, dz) || 1;
        hb.body.v.set((dx / dl) * 4, 4.5, (dz / dl) * 4);
        hb.body.grounded = false;
      }
      return;
    }

    // default hit
    this.pushCd = 8;
    this.addShake(0.18);
    this.fx.burst(pos.clone().setY(pos.y + 1), 0xffffff, 12, 4);
    this.cb.popup(t("pop.hit"), "#ffffff");
    if (tgt.kind === "bot") {
      const b = tgt.ref as Bot;
      const raceT = this.raceTime();
      b.shift += 0.55;
      b.stunEnd = Math.max(b.stunEnd, raceT + 0.35);
    } else if (tgt.kind === "remote") {
      const r = tgt.ref as Remote;
      r.stunLocal = performance.now() + 400;
      const ev = { type: "hit", target: r.id };
      if (this.mode === "multi") this.outEvents.push(ev);
      else this.hubEvents.push(ev);
    } else {
      const hb = tgt.ref as HubBot;
      const dx = hb.body.p.x - this.body.p.x, dz = hb.body.p.z - this.body.p.z;
      const dl = Math.hypot(dx, dz) || 1;
      hb.body.v.x += (dx / dl) * 2.2;
      hb.body.v.z += (dz / dl) * 2.2;
      hb.body.v.y += 1.5;
    }
  }

  private spawnClone() {
    if (this.cloneMesh) {
      this.scene.remove(this.cloneMesh);
      this.cloneMesh = null;
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.7, 4, 8),
      new THREE.MeshBasicMaterial({ color: this.char.root.userData?.color ?? 0xffffff, transparent: true, opacity: 0.45 }),
    );
    body.position.y = 0.9;
    g.add(body);
    g.position.copy(this.body.p);
    g.rotation.y = this.body.yaw;
    this.scene.add(g);
    this.cloneMesh = g;
    this.cloneUntil = performance.now() + 2000;
  }

  applyBlind() {
    this.blindUntil = performance.now() + 3000;
  }

  sendChat(msg: string) {
    const text = String(msg || "").trim().slice(0, 120);
    if (!text) return;
    const ev = { type: "chat", data: text };
    if (this.mode === "multi") this.outEvents.push(ev);
    this.hubEvents.push(ev);
    this.cb.chat?.(this.name, text);
  }




  private getPushed(from: THREE.Vector3, name: string) {
    if (performance.now() < this.anchorUntil) { this.cb.popup(t("pop.anchorBlock"), "#7dffb0"); return; }

    if (this.body.stun > 0 || this.phase === "finished") return;
    if (performance.now() - this.lastStun < 1000) return;
    this.lastStun = performance.now();
    const b = this.body;
    const dx = b.p.x - from.x, dz = b.p.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    b.v.x = (dx / d) * 3.5; b.v.z = (dz / d) * 3.5; b.v.y = 4 * b.up;
    b.grounded = false;
    b.stun = 2.2;
    sfx.pushed();
    this.addShake(0.6);
    this.fx.burst(b.p.clone().setY(b.p.y + 1), 0xffffff, 16, 5);
    this.cb.popup(t("pop.pushed", { n: name }), "#ff8fa3");
    this.cb.stat("pushedTimes", 1);
  }

  emoji(e: string) {
    if (this.emojiCd > 0) return;
    this.emojiCd = 0.7;
    const pos = this.body.p.clone().add(new THREE.Vector3(0, 2.7 * this.body.up, 0));
    this.fx.emoji(e, pos);
    sfx.emoji();
    this.cb.stat("emojis", 1);
    const ev = { type: "emoji", data: { e, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) } };
    if (this.mode === "multi") this.outEvents.push(ev);
    else if (this.mode === "hub") this.hubEvents.push(ev);
  }

  addShake(a: number) { if (this.shakeOn) this.shake = Math.min(1.2, this.shake + a); }


  setVisuals(sky: SkyTheme, weather: Weather) {
    this.skyTheme = sky;
    this.weatherKind = weather;
    this.applySkyTheme();
    this.rebuildWeather();
  }

  private applySkyTheme() {
    const skyMat = (this as unknown as { skyMat?: THREE.ShaderMaterial }).skyMat;
    const sea = (this as unknown as { sea?: THREE.Mesh }).sea;
    // Neon keeps a bright gradient end-to-end (no black lower sky)
    const themes: Record<SkyTheme, { top: number; mid: number; bot: number; fog: number; near: number; far: number; sea: number; hemiSky: number; hemiGround: number }> = {
      day:  { top: 0x4f8dff, mid: 0x9ad8ff, bot: 0xffc2e2, fog: 0xbfe6ff, near: 60, far: 260, sea: 0xffffff, hemiSky: 0xdff2ff, hemiGround: 0xffc9e0 },
      night:{ top: 0x0a0a2e, mid: 0x1a1a4e, bot: 0x2a1050, fog: 0x0d0826, near: 40, far: 180, sea: 0x1a1040, hemiSky: 0x3a2a7a, hemiGround: 0x1a0a30 },
      neon: { top: 0xff2bd6, mid: 0xb5179e, bot: 0x00f5d4, fog: 0x6b1fa8, near: 80, far: 340, sea: 0x2a0a50, hemiSky: 0xff66cc, hemiGround: 0x00e5c0 },
    };
    const th = themes[this.skyTheme] ?? themes.day;
    if (skyMat) {
      skyMat.uniforms.top.value.setHex(th.top);
      skyMat.uniforms.mid.value.setHex(th.mid);
      skyMat.uniforms.bot.value.setHex(th.bot);
    }
    this.skyColor.setHex(th.fog);
    this.scene.background = this.skyColor;
    this.fog.color.setHex(th.fog);
    this.themeFog = { near: th.near, far: th.far };
    this.fogTarget = { near: th.near, far: th.far };
    this.fog.near = th.near;
    this.fog.far = th.far;
    if (sea) {
      const mat = sea.material as THREE.MeshLambertMaterial;
      if (mat?.color) mat.color.setHex(th.sea);
    }
    this.scene.traverse((o) => {
      const l = o as THREE.HemisphereLight;
      if (l.isHemisphereLight) {
        l.color.setHex(th.hemiSky);
        l.groundColor.setHex(th.hemiGround);
      }
    });
  }

  private rebuildWeather() {
    if (this.weatherPts) {
      this.scene.remove(this.weatherPts);
      this.weatherPts.geometry.dispose();
      (this.weatherPts.material as THREE.Material).dispose();
      this.weatherPts = null;
      this.weatherVel = null;
    }
    if (this.weatherKind === "clear" || this.particleScale < 0.05) return;
    const n = this.weatherKind === "wind" ? 80 : 400;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40 + 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      if (this.weatherKind === "rain") {
        vel[i * 3] = 0; vel[i * 3 + 1] = -18 - Math.random() * 10; vel[i * 3 + 2] = -2;
      } else if (this.weatherKind === "snow") {
        vel[i * 3] = (Math.random() - 0.5) * 2; vel[i * 3 + 1] = -2 - Math.random() * 2; vel[i * 3 + 2] = (Math.random() - 0.5) * 2;
      } else {
        vel[i * 3] = 8 + Math.random() * 6; vel[i * 3 + 1] = (Math.random() - 0.5) * 2; vel[i * 3 + 2] = (Math.random() - 0.5) * 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const col = this.weatherKind === "snow" ? 0xffffff : this.weatherKind === "rain" ? 0x88ccee : 0xaaccff;
    const mat = new THREE.PointsMaterial({ color: col, size: this.weatherKind === "rain" ? 0.15 : 0.35, transparent: true, opacity: 0.7, depthWrite: false });
    this.weatherPts = new THREE.Points(geo, mat);
    this.weatherPts.frustumCulled = false;
    this.scene.add(this.weatherPts);
    this.weatherVel = vel;
  }

  private updateWeather(dt: number) {
    if (!this.weatherPts || !this.weatherVel) return;
    const pos = this.weatherPts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const cx = this.body.p.x, cy = this.body.p.y, cz = this.body.p.z;
    const floorY = cy - 8; // recycle below player, not world y=0
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3] += this.weatherVel[i * 3] * dt;
      arr[i * 3 + 1] += this.weatherVel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += this.weatherVel[i * 3 + 2] * dt;
      if (arr[i * 3 + 1] < floorY) {
        arr[i * 3] = cx + (Math.random() - 0.5) * 70;
        arr[i * 3 + 1] = cy + 18 + Math.random() * 20;
        arr[i * 3 + 2] = cz + (Math.random() - 0.5) * 70;
      }
      // keep particles roughly near the player horizontally
      const dx = arr[i * 3] - cx, dz = arr[i * 3 + 2] - cz;
      if (dx * dx + dz * dz > 55 * 55) {
        arr[i * 3] = cx + (Math.random() - 0.5) * 60;
        arr[i * 3 + 2] = cz + (Math.random() - 0.5) * 60;
        arr[i * 3 + 1] = cy + 5 + Math.random() * 25;
      }
    }
    pos.needsUpdate = true;
  }

  raceTime() {
    // Local wall-clock is authoritative for bots + timer (server startAt breaks on serverless / room loss)
    if (this.raceOriginPerf > 0 && this.mode !== "hub") {
      const t = this.raceOriginClock + (performance.now() - this.raceOriginPerf) / 1000;
      this.raceClock = t;
      return t;
    }
    return this.raceClock;
  }

  // ------------------------------------------------------------------ loop
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.fpsLimit > 0) {
      const minMs = 1000 / this.fpsLimit - 1.5;
      if (now - this.last < minMs) return;
    }
    // Cap dt; if tab was backgrounded, skip huge jumps for physics but raceTime uses wall clock
    let dt = (now - this.last) / 1000;
    if (!Number.isFinite(dt) || dt < 0) dt = 1 / 60;
    if (dt > 0.25) {
      // Recover from background tab without freezing raceClock (wall-clock path)
      this.last = now;
      dt = 1 / 60;
    } else {
      dt = Math.min(0.05, dt);
      this.last = now;
    }
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    try { this.update(dt); } catch (e) { console.error("[engine update]", e); }
    try { this.renderer.render(this.scene, this.camera); } catch (e) { console.error("[engine render]", e); }
  };

  private lastBeep = 99;

  private update(dt: number) {
    const [cdx, cdy] = this.input.consumeCam();
    const sens = 0.0032 * this.sensitivity;
    this.camYaw -= cdx * sens;
    this.camPitch += cdy * sens * (this.invertY ? -1 : 1);
    this.camPitch = Math.max(-0.35, Math.min(1.25, this.camPitch));
    this.applyGyro(dt);

    this.netTick(dt);

    if (this.paused) {
      this.input.consumeJump(); this.input.consumePush();
      this.sendHud(dt);
      return;
    }

    const course = this.mode === "hub" ? this.hub.course : this.course!;
    if (!course) return;
    if (this.mode === "solo" || this.mode === "ta" || this.mode === "practice" || this.mode === "weekly") this.raceClock += dt;
    const raceT = this.mode === "hub" ? performance.now() / 1000 : this.raceTime();

    // countdown
    if (this.phase === "countdown") {
      const left = -raceT;
      const sec = Math.ceil(left);
      if (sec !== this.lastBeep && sec <= 3 && sec >= 1) { this.lastBeep = sec; sfx.beep(); this.cb.popup(String(sec), "#ffffff", true); }
      if (left <= 0) {
        this.phase = "run";
        sfx.beep(true);
        this.cb.popup(t("pop.go"), "#7dffb0", true);
        this.addShake(0.3);
        this.runStartClock = 0;
      }
    }

    course.update(this.mode === "hub" ? raceT : 1000 + raceT);
    course.localUpdate(dt);
    course.syncMeshes();

    this.updatePlayer(dt, course, raceT);
    if (this.mode === "hub") { if (this.designStudio) this.designStudioTick(dt); else { this.updateHubBots(dt); this.hubPadTick(); } }
    else this.updateBots(dt, raceT);
    this.updateRemotes(dt);
    this.updatePushTarget();
    this.fx.update(dt);
    this.updateWeather(dt);
    this.updateCamera(dt);
    this.sendHud(dt);

    // multi DNF: only after someone actually finished, and never while still in countdown
    if (this.mode === "multi" && this.phase === "run") {
      for (const r of this.remotes.values()) {
        if (r.finishMs !== null && Number.isFinite(r.finishMs)) {
          this.firstFinishRace = Math.min(this.firstFinishRace, r.finishMs / 1000);
        }
      }
      if (
        Number.isFinite(this.firstFinishRace) &&
        this.firstFinishRace > 5 &&
        this.firstFinishRace < 1e6 &&
        raceT > this.firstFinishRace + 60
      ) {
        this.finishRace(true);
      }
      if (this.room && this.room.status === "finished" && this.phase === "run") {
        // room ended — only DNF if we never finished ourselves
        if (this.finishMsSent === null) this.finishRace(true);
      }
    }
    if (this.phase === "finished" && !this.resultSent) {
      this.finishTimer += dt;
      const stillRacing = this.spectating && this.refreshSpecTargets().length > 0;
      if (this.spectating && !stillRacing) this.spectating = false;
      if (this.finishTimer > 2.3 && !this.spectating) { this.resultSent = true; this.cb.finish(this.buildResult()); }
    }
  }

  private collectBoxes(course: Course) {
    const out = this.collideList;
    out.length = 0;
    if (this.mode === "hub") { for (const b of course.boxes) out.push(b); return out; }
    const si = course.sectionAt(this.body.p.z);
    this.curSection = Math.min(si, this.sectionCount);
    // collision always uses the neighbouring sections; draw distance only affects visibility
    for (let i = Math.max(0, si - 1); i <= Math.min(course.sections.length - 1, si + 1); i++) for (const b of course.sections[i].boxes) out.push(b);
    const dd = this.drawDistance;
    for (let i = 0; i < course.sections.length; i++) {
      const vis = i >= si - dd && i <= si + dd;
      const sec = course.sections[i];
      if (sec.visible !== vis) {
        sec.visible = vis;
        for (const b of sec.boxes) if (b.mesh) b.mesh.visible = vis && b.active;
      }
    }
    return out;
  }

  private updatePlayer(dt: number, course: Course, raceT: number) {
    const b = this.body;
    const inp = this.input;
    if (this.deadT > 0) {
      const before = Math.ceil(this.deadT);
      this.deadT -= dt;
      const after = Math.ceil(this.deadT);
      if (after !== before && after >= 1 && this.mode !== "hub") sfx.beep();
      this.char.root.visible = false;
      if (this.deadT <= 0) { this.respawn(); sfx.beep(true); }
      inp.consumeJump();
      return;
    }
    const frozen = this.phase === "countdown" || this.phase === "finished" || this.spectating;
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = -fz, rz = fx;
    const my = inp.moveY, mx = inp.moveX;
    // Hold Space = continuous jump (auto-bunnyhop while grounded / coyote)
    const jumpPressed = inp.consumeJump() || (inp.jumpHeld && (this.body.grounded || this.body.coyote > 0 || this.body.wallT < 0.25));
    if (inp.consumePush()) this.tryPush();

    // double-jump (ability): mid-air only, must land between uses, 3 charges then CD
    if (this.activeAbility === "ab_double" && !frozen && jumpPressed && !this.body.grounded && this.body.coyote <= 0 && this.body.wallT >= 0.25) {
      if (this.djCd <= 0 && this.djCharges > 0 && !this.djUsedInAir) {
        this.body.v.y = Math.max(this.body.v.y, 9.2);
        this.body.jumping = true;
        this.djCharges--;
        this.djUsedInAir = true;
        this.char.jump();
        sfx.jump();
        this.fx.burst(this.body.p.clone().setY(this.body.p.y + 0.3), 0x7dffb0, 12, 5);
        if (this.djCharges <= 0) this.djCd = 18;
      }
    }

    const move = {
      mx: frozen ? 0 : fx * my + rx * mx,
      mz: frozen ? 0 : fz * my + rz * mx,
      jumpHeld: inp.jumpHeld,
      // hold-to-jump: fire while grounded, coyote, or briefly on wall
      jumpPressed: jumpPressed && !frozen && (this.body.grounded || this.body.coyote > 0 || this.body.wallT < 0.25),
    };
    // zones pre-pass (wind, gravity, flip, fog)
    b.windX = b.windY = b.windZ = 0;
    b.gravMul = 1;
    let flip = false;
    let fogD = 0;
    const cy = b.p.y + 0.75 * b.up;
    const si = this.mode === "hub" ? 0 : course.sectionAt(b.p.z);
    this.zoneCool -= dt;
    for (let i = Math.max(0, si - 1); i <= Math.min(course.sections.length - 1, si + 1); i++) {
      for (const z of course.sections[i].zones) {
        const inside = inZone(z, b.p.x, cy, b.p.z);
        const entered = inside && !z.inside;
        z.inside = inside;
        if (!inside) continue;
        switch (z.type) {
          case "wind": b.windX += z.a; b.windY += z.b; b.windZ += z.c; break;
          case "grav": b.gravMul = z.a; break;
          case "flip": flip = true; break;
          case "fog": fogD = z.a; break;
          case "portal":
            if (this.zoneCool <= 0) {
              this.zoneCool = 0.6;
              this.tpFlag = true;
              this.fx.burst(b.p.clone().setY(b.p.y + 1), 0xb14aed, 25, 6);
              b.p.set(z.a, z.b, z.c);
              b.v.set(0, 0, 0);
              sfx.portal();
              this.addShake(0.3);
              this.cb.stat("portals", 1);
              this.fx.burst(b.p.clone().setY(b.p.y + 1), 0x55ffcc, 25, 6);
              this.camTarget.copy(b.p);
            }
            break;
          case "kill": this.die(); return;
          case "checkpoint":
            if (entered && z.a > this.checkpoint && this.phase === "run") {
              const cleared = z.a - this.checkpoint;
              this.checkpoint = z.a;
              sfx.checkpoint();
              this.cb.stat("sectionsCleared", cleared);
              this.cb.popup(t("pop.section", { a: z.a + 1, b: this.sectionCount, n: t(`sec.${course.sections[z.a].type}`) }), "#7dffb0");
              const hint = tOpt(`hint.${course.sections[z.a].type}`);
              if (hint) setTimeout(() => this.cb.popup(hint, "#9be7ff"), 700);
              const sp = course.sections[z.a].spawn;
              this.fx.burst(new THREE.Vector3(sp.x, sp.y + 0.5, sp.z), 0x7dffb0, 30, 6, { rainbow: true });
            }
            break;
          case "finish":
            if (this.phase === "run" && this.deadT <= 0) this.finishRace(false);
            break;
          case "trigger": if (entered && z.fn) z.fn(); break;
        }
      }
    }
    const wantUp = flip ? -1 : 1;
    if (b.up !== wantUp) {
      b.p.y += wantUp < 0 ? H : -H;
      b.up = wantUp;
      b.v.y *= 0.3;
      b.grounded = false;
      b.ground = null;
      sfx.portal();
      this.cb.popup(t(wantUp < 0 ? "pop.gravFlip" : "pop.gravBack"), "#ff66cc");
    }
    this.fogTarget = fogD > 0
      ? { near: 1, far: 1 / fogD * 1.3 }
      : { near: this.themeFog.near, far: this.themeFog.far };
    this.fog.near += (this.fogTarget.near - this.fog.near) * Math.min(1, dt * 3);
    this.fog.far += (this.fogTarget.far - this.fog.far) * Math.min(1, dt * 3);

    const boxes = this.collectBoxes(course);
    if (this.adminFly) {
      // free-fly: WASD horizontal, Space up, Ctrl down
      const flySp = 14;
      b.v.x = move.mx * flySp;
      b.v.z = move.mz * flySp;
      b.v.y = (move.jumpHeld || this.input.keys.has("Space") ? flySp * 0.7 : 0) + (this.input.keys.has("ControlLeft") || this.input.keys.has("ControlRight") || this.input.keys.has("ShiftLeft") ? -flySp * 0.7 : 0);
      b.p.x += b.v.x * dt;
      b.p.y += b.v.y * dt;
      b.p.z += b.v.z * dt;
      b.grounded = false;
      b.ground = null;
    } else {
      stepBody(b, move, boxes, dt);
    }

    // events
    for (const e of b.events) {
      if (e === "jump") { sfx.jump(); this.char.jump(); this.cb.stat("jumps", 1); this.fx.burst(b.p, 0xffffff, 5, 2, { size: 0.12, life: 0.35 }); }
      else if (e === "walljump") { sfx.wallJump(); this.char.jump(); this.cb.stat("wallJumps", 1); this.fx.burst(b.p.clone().setY(b.p.y + 0.8), 0xaee6ff, 10, 4); this.cb.popup(t("pop.wallJump"), "#9be7ff"); }
      else if (e === "bounce") { sfx.bounce(); this.char.jump(); this.cb.stat("bounces", 1); this.fx.burst(b.p, 0x3cff9e, 16, 6, { up: 4 }); this.addShake(0.15); }
    }
    if (b.land) {
      const L = b.land;
      course.onLand(L.box);
      if (L.box.surface === "fake") {
        this.cb.popup(t("pop.fakeTile"), "#ff4d6d");
        this.fx.burst(b.p.clone().setY(b.p.y + 0.2), 0xe9c46a, 24, 6, { up: 1 });
        this.die();
        return;
      }
      this.char.land(L.impact);
      if (L.impact > 4) {
        sfx.land(Math.min(1.5, L.impact / 12));
        this.landFx(L.impact);
        if (L.impact > 18) this.addShake(0.25);
      }
      if (this.mode !== "hub" && this.phase === "run" && L.air > 0.38 && L.box.surface !== "bounce") {
        if (L.perfect) {
          // anti-farm: same platform or rapid re-land does not count
          const now = performance.now();
          const sameBox = this.lastPerfectBox === L.box;
          const tooSoon = sameBox && (now - this.lastPerfectAt < 2500);
          if (!tooSoon && !sameBox) {
            this.combo++;
            this.perfects++;
            this.lastPerfectBox = L.box;
            this.lastPerfectAt = now;
            sfx.perfect();
            this.cb.stat("perfectJumps", 1);
            this.cb.popup(this.combo > 1 ? t("pop.perfectCombo", { n: this.combo }) : t("pop.perfect"), "#ffe14d");
            this.fx.burst(b.p.clone().setY(b.p.y + 0.2), 0xffe14d, 20, 5, { up: 3, color2: 0xffffff });
            this.fx.ring(b.p, 0xffe14d, 2.5);
          }
        } else if (L.edge) {
          // anti-farm: jumping in place on the same edge does not spam near-miss
          const now = performance.now();
          const sameBox = this.lastEdgeBox === L.box;
          const tooSoon = sameBox && (now - this.lastEdgeAt < 1800);
          if (!tooSoon) {
            this.combo = 0;
            sfx.nearMiss();
            this.cb.stat("nearMisses", 1);
            this.cb.popup(t("pop.nearMiss"), "#ff9f1c");
            this.addShake(0.12);
            this.lastEdgeBox = L.box;
            this.lastEdgeAt = now;
          }
        } else this.combo = 0;
      }
      if (this.mode === "hub") this.hubLand(L.box, L.air);
    }
    if (b.hitHazard) { sfx.hit(); this.addShake(0.45); this.fx.burst(b.p.clone().setY(b.p.y + 0.8), 0xff3355, 14, 6); this.combo = 0; }
    if (b.killed) { this.die(); return; }

    // kill plane
    if (this.mode === "hub") {
      if (b.p.y < -12) { this.die(); return; }
      this.hubMiniUpdate(dt);
    } else {
      const s0 = course.sections[Math.max(0, this.curSection - 1)], s1 = course.sections[Math.min(course.sections.length - 1, this.curSection)];
      const minY = Math.min(s0.minY, s1.minY), maxY = Math.max(s0.maxY, s1.maxY);
      if (b.p.y < minY - 10 || b.p.y > maxY + 16) { this.die(); return; }
    }

    // visuals
    this.char.root.visible = true;
    this.char.root.position.copy(b.p);
    this.char.root.rotation.y = b.yaw;
    const hs = Math.hypot(b.v.x, b.v.z);
    this.char.update(dt, { speed: hs, grounded: b.grounded, vy: b.v.y, stunned: b.stun > 0, wall: !b.grounded && b.wallT < 0.1 && !!b.wallBox?.wallrun, up: b.up });
    if (b.grounded && hs > 1 && b.p.distanceTo(this.lastPrint) > 0.45) {
      const it = item(this.look.footprint);
      this.stamp(b.p, b.yaw, this.printSide, it?.color ?? "#fff", it?.style === "rainbow", it?.color2);
      this.printSide *= -1;
      this.lastPrint.copy(b.p);
    }
    // trail
    const tr = item(this.look.trail);
    if (tr && tr.id !== "tr_none" && hs > 3) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.025;
        const lightning = tr.id === "tr_lightning";
        this.fx.spawn(b.p.x + (Math.random() - 0.5) * 0.3, b.p.y + 0.5 * b.up + (Math.random() - 0.5) * 0.3, b.p.z + (Math.random() - 0.5) * 0.3,
          lightning ? (Math.random() - 0.5) * 4 : 0, lightning ? (Math.random() - 0.5) * 4 : 0.3, 0, tr.color, 0.6, 0.22, 0, 2, tr.style === "rainbow");
      }
    }
    const au = item(this.look.aura);
    if (au && au.id !== "au_none") {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.05;
        const a = Math.random() * Math.PI * 2;
        const rise = au.id === "au_frost" ? -0.5 : au.id === "au_void" ? 0 : 1.5;
        this.fx.spawn(b.p.x + Math.cos(a) * 0.6, b.p.y + Math.random() * 1.4 * b.up, b.p.z + Math.sin(a) * 0.6,
          au.id === "au_void" ? -Math.cos(a) * 0.8 : 0, rise, au.id === "au_void" ? -Math.sin(a) * 0.8 : 0, au.color, 0.8, 0.13, 0, 0.5, au.style === "rainbow");
      }
    }
    this.pushCd = Math.max(0, this.pushCd - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    if (this.djCd > 0) {
      this.djCd = Math.max(0, this.djCd - dt);
      if (this.djCd <= 0) this.djCharges = 3;
    }
    if (this.cloneMesh && performance.now() > this.cloneUntil) {
      this.scene.remove(this.cloneMesh);
      this.cloneMesh = null;
    }
    // oil zone slows others
    if (performance.now() < this.oilUntil) {
      for (const bot of this.bots) {
        if (bot.pos.distanceTo(this.oilPos) < 3.5) bot.shift *= 0.98;
      }
      for (const r of this.remotes.values()) {
        if (r.pos.distanceTo(this.oilPos) < 3.5) {
          r.pos.x += (Math.random() - 0.5) * 0.04;
          r.pos.z += (Math.random() - 0.5) * 0.04;
        }
      }
    }
    this.emojiCd = Math.max(0, this.emojiCd - dt);
    void raceT;
  }

  private stamp(p: THREE.Vector3, yaw: number, side: number, color: string, rainbow: boolean, color2?: string) {
    const ox = Math.cos(yaw) * 0.15 * side, oz = -Math.sin(yaw) * 0.15 * side;
    this.fx.footprint(p.x + ox, p.y, p.z + oz, yaw, color2 && Math.random() < 0.5 ? color2 : color, rainbow);
  }

  private landFx(impact: number) {
    const it = item(this.look.landing);
    const p = this.body.p;
    const n = Math.min(24, Math.round(impact));
    switch (it?.id) {
      case "ld_stars": this.fx.burst(p, 0xffe14d, n, 4, { up: 3, size: 0.22 }); break;
      case "ld_hearts": this.fx.burst(p, 0xff4d8d, n, 4, { up: 3, size: 0.22, color2: 0xffa3c4 }); break;
      case "ld_shock": this.fx.ring(p, 0x4dd2ff, 3.5); this.fx.burst(p, 0x4dd2ff, n / 2, 6, { up: 0.5 }); break;
      case "ld_confetti": this.fx.burst(p, 0xff00ff, n, 5, { up: 5, rainbow: true, g: 6 }); break;
      default: this.fx.burst(p, 0xe8dcc8, Math.round(n * 0.6), 3, { up: 0.8, size: 0.2, g: 2, life: 0.5 });
    }
  }

  die() {
    if (this.adminGod || this.adminFly) return;
    if (this.deadT > 0 || this.phase === "finished") return;
    const b = this.body;
    const it = item(this.look.death);
    const pos = b.p.clone().setY(b.p.y + 0.8 * b.up);
    switch (it?.id) {
      case "dt_pixel": this.fx.burst(pos, 0x7cff4d, 40, 7, { size: 0.3, color2: 0x1b5e20 }); break;
      case "dt_boom": this.fx.burst(pos, 0xff7a1a, 50, 10, { color2: 0xffdd00, size: 0.3 }); this.fx.ring(pos, 0xffaa00, 5); break;
      case "dt_ghost": for (let i = 0; i < 25; i++) this.fx.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, 0xc9b6ff, 1.4, 0.3, -1, 1); break;
      case "dt_rainbow": this.fx.burst(pos, 0xff00aa, 50, 8, { rainbow: true, size: 0.28 }); break;
      default: this.fx.burst(pos, 0xffffff, 30, 6, { size: 0.3 });
    }
    sfx.death();
    this.addShake(0.5);
    this.combo = 0;
    this.deadT = this.mode === "hub" ? 0.6 : 3;
    b.v.set(0, 0, 0);
    if (this.mode !== "hub") { this.deaths++; this.cb.stat("deaths", 1); }
    if (this.mini) { this.resetMini(); }
  }

  private respawn() {
    const b = this.body;
    this.tpFlag = true;
    if (this.mode === "hub") {
      const sp = this.hub.spawn;
      b.reset(sp.x, sp.y + 1, sp.z, 0);
    } else {
      const c = this.course!;
      const s = c.sections[this.checkpoint];
      c.resetSection(this.checkpoint);
      c.resetSection(this.checkpoint + 1);
      b.reset(s.spawn.x, s.spawn.y + 0.3, s.spawn.z, 0);
      this.camYaw = Math.PI;
    }
    for (const z of (this.mode === "hub" ? this.hub.course : this.course!).zones) z.inside = false;
    this.fx.burst(b.p.clone().setY(b.p.y + 1), 0x9be7ff, 20, 4, { up: 2 });
    this.fx.ring(b.p, 0x9be7ff, 2.5);
    this.char.root.visible = true;
  }

  private finishRace(dnf: boolean) {
    if (this.phase !== "run") return;
    this.phase = "finished";
    this.finishTimer = 0;
    const raceT = this.raceTime();
    this.finishT = raceT;
    this.input.exitLock();
    if (!dnf) {
      this.cb.stat("sectionsCleared", Math.max(0, this.sectionCount - this.checkpoint));
      this.checkpoint = this.sectionCount;
      this.finishMsSent = Math.round(raceT * 1000);
      this.firstFinishRace = Math.min(this.firstFinishRace, raceT);
    }
    const r = this.buildResult(dnf);
    const place = r.place;
    let emote: Emote = "cheer";
    if (dnf) emote = "flop";
    else if (this.mode === "multi") emote = place === 1 ? "win" : place <= 3 ? "cheer" : place === r.total && r.total >= 4 ? "flop" : Math.random() < 0.5 ? "dance" : "wave";
    else emote = "win";
    this.char.playEmote(emote);
    if (!dnf) {
      this.fx.burst(this.body.p.clone().setY(this.body.p.y + 1.5), 0xffd23f, 80, 12, { rainbow: true, up: 8, g: 10, life: 1.5 });
      this.addShake(0.4);
      if (this.mode !== "multi" || place <= 3) sfx.win(); else sfx.checkpoint();
      this.cb.popup(this.mode === "multi" ? (place === 1 ? t("pop.victory") : t("pop.place", { n: place })) : t("pop.finish"), "#ffe14d", true);
    } else {
      sfx.lose();
      this.cb.popup(t("pop.timeUp"), "#ff8fa3", true);
    }
    this.dnf = dnf;
    if (this.mode === "multi") {
      const others = this.roster().filter((r) => !r.me && r.finishMs === null);
      if (others.length) {
        this.spectating = true;
        this.specFree = false;
        this.specIndex = 0;
        this.input.exitLock();
      }
    }
  }
  private dnf = false;

  // ------------------------------------------------------------------ spectator
  private refreshSpecTargets() {
    const list: { id: string; name: string; pos: THREE.Vector3 }[] = [];
    const raceT = this.raceTime();
    for (const r of this.remotes.values()) {
      if (r.finishMs === null && r.pos.y > -60) list.push({ id: r.id, name: r.name, pos: r.pos });
    }
    for (const b of this.bots) {
      if (raceT - b.shift < b.finishT) list.push({ id: b.id, name: b.name, pos: b.pos });
    }
    // stable order so the camera does not jump around between frames
    list.sort((a, b) => (a.id < b.id ? -1 : 1));
    this.specTargets = list;
    if (this.specIndex >= list.length) this.specIndex = 0;
    return list;
  }
  cycleSpectator(dir: number) {
    const n = this.specTargets.length;
    if (!n) { this.specFree = true; return; }
    if (this.specFree) { this.specFree = false; return; }
    this.specIndex = (this.specIndex + dir + n) % n;
    sfx.click();
  }
  toggleFreeCam() { this.specFree = !this.specFree; sfx.click(); }
  stopSpectating() { this.spectating = false; this.specFree = false; }

  roster(): RosterEntry[] {
    const list: RosterEntry[] = [];
    const raceT = this.raceTime();
    const course = this.course;
    const total = Math.max(1, this.sectionCount);
    const myProg = this.phase === "finished" && !this.dnf ? 1 : Math.min(0.99, this.curSection / total + (course ? this.secFrac(this.body.p.z) / total : 0));
    list.push({ id: this.pid, name: this.name, me: true, bot: false, finishMs: this.finishMsSent, progress: myProg, color: this.look.color });
    for (const r of this.remotes.values()) list.push({ id: r.id, name: r.name, me: false, bot: false, finishMs: r.finishMs, progress: r.finishMs ? 1 : Math.min(0.99, (r.s[5] ?? 0) / total), color: r.look.color ?? "#fff" });
    for (const b of this.bots) {
      const fin = raceT - b.shift >= b.finishT;
      list.push({ id: b.id, name: b.name, me: false, bot: true, finishMs: fin ? Math.round((((b as Bot & { actualFinish?: number }).actualFinish ?? (b.finishT + b.shift))) * 1000) : null, progress: fin ? 1 : Math.min(0.99, b.section / total), color: b.color });
    }
    list.sort((a, b) => {
      if (a.finishMs !== null && b.finishMs !== null) return a.finishMs - b.finishMs;
      if (a.finishMs !== null) return -1;
      if (b.finishMs !== null) return 1;
      return b.progress - a.progress;
    });
    return list;
  }
  private secFrac(z: number) {
    const c = this.course;
    if (!c) return 0;
    const s = c.sections[this.curSection];
    if (!s) return 0;
    return Math.max(0, Math.min(1, (z - s.zStart) / Math.max(1, s.zEnd - s.zStart)));
  }

  private buildResult(dnf = this.dnf): FinishResult {
    const roster = this.roster();
    const place = roster.findIndex((r) => r.me) + 1;
    const total = roster.length;
    const timeMs = dnf ? 0 : Math.round(this.finishT * 1000);
    let coins = 0;
    if (this.mode === "multi") coins = dnf ? 10 : COIN_BY_PLACE[Math.min(place - 1, COIN_BY_PLACE.length - 1)] + Math.round(this.sectionCount * 2);
    else if (this.mode === "solo") coins = 45 + this.perfects * 2;
    else coins = 40 + this.perfects * 2;
    // Matches with bots always award 50% fewer coins
    if (this.bots.length > 0) coins = Math.max(1, Math.floor(coins * 0.5));
    const score = dnf ? this.checkpoint * 500 : Math.max(0, Math.round(this.sectionCount * 1000 - this.finishT * 12 + this.perfects * 75 - this.deaths * 40 + (this.mode === "multi" ? Math.max(0, total - place) * 250 : 0)));
    return { mode: this.mode, timeMs, place, total, coins, perfects: this.perfects, deaths: this.deaths, score, dnf, roster, sections: this.sectionCount };
  }

  // ------------------------------------------------------------------ hub
  private updateHubBots(dt: number) {
    const boxes = this.hub.course.boxes;
    for (const hb of this.hubBots) {
      const b = hb.body;
      let mx = 0, mz = 0;
      if (hb.stun > 0) {
        hb.stun -= dt;
      } else if (hb.wait > 0) {
        hb.wait -= dt;
      } else {
        const dx = hb.target.x - b.p.x, dz = hb.target.z - b.p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8) {
          hb.wait = 1 + Math.random() * 3 * hb.style.reaction;
          hb.target.copy(this.hub.wander[Math.floor(Math.random() * this.hub.wander.length)]);
        } else {
          mx = dx / d; mz = dz / d;
        }
      }
      hb.jumpCd -= dt;
      let jump = false;
      if (mx || mz) {
        const moved = Math.hypot(b.p.x - hb.lastPos.x, b.p.z - hb.lastPos.z);
        hb.stuck = moved < 0.04 ? hb.stuck + dt : 0;
        if (hb.stuck > 0.45 && hb.jumpCd <= 0) { jump = true; hb.jumpCd = 0.8; }
        if (hb.stuck > 1.6) {
          hb.stuck = 0;
          hb.target.copy(this.hub.wander[Math.floor(Math.random() * this.hub.wander.length)]);
        }
      } else hb.stuck = 0;
      hb.lastPos.set(b.p.x, 0, b.p.z);
      if (!jump && b.grounded && hb.jumpCd <= 0 && Math.random() < dt * 0.35 * (0.5 + hb.style.aggression)) {
        jump = true; hb.jumpCd = 1.2;
      }
      b.speedMul = hb.stun > 0 ? 0 : 0.5 + hb.style.aggression * 0.25;
      stepBody(b, { mx, mz, jumpHeld: false, jumpPressed: jump && hb.stun <= 0 }, boxes, dt);
      if (b.p.y < -8) {
        const sp = this.hub.wander[Math.floor(Math.random() * this.hub.wander.length)];
        b.reset(sp.x, 1.5, sp.z, b.yaw);
      }
      hb.char.root.position.copy(b.p);
      hb.char.root.rotation.y = b.yaw;
      const spd = Math.hypot(b.v.x, b.v.z);
      hb.char.update(dt, { speed: spd, grounded: b.grounded, vy: b.v.y, stunned: hb.stun > 0, wall: false, up: 1 });
      hb.emojiT -= dt * hb.style.chatty;
      if (hb.emojiT <= 0) {
        hb.emojiT = 9 + Math.random() * 22;
        if (b.p.distanceTo(this.body.p) < 26) {
          this.fx.emoji(["👋", "😀", "🎉", "😎", "🐸", "❤️", "🔥", "💀"][Math.floor(Math.random() * 8)], b.p.clone().setY(b.p.y + 2.7));
        }
      }
    }
  }

  private startMini(name: string) {
    this.mini = { name, t0: performance.now() };
    sfx.beep(true);
    this.cb.popup(t("pop.miniStart", { n: t(`mini.${name}`) }), "#7dffcf");
  }

  resetMini(silent = false) {
    if (!this.mini) return;
    this.mini = null;
    this.raceGate = 0;
    for (const c of this.hub.coins) c.taken = false;
    this.coinsLeft = this.hub.coins.length;
    if (!silent) this.cb.popup(t("pop.miniReset"), "#ff8fa3");
  }

  private finishMini(name: string, value: number) {
    this.mini = null;
    sfx.win();
    this.fx.burst(this.body.p.clone().setY(this.body.p.y + 1), 0xffd23f, 50, 8, { rainbow: true });
    this.cb.mini(name, value);
    if (name === "parkour") void this.submitMini(value);
  }

  async submitMini(timeMs: number) {
    try {
      await fetch("/api/miniboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: this.name, timeMs: Math.round(timeMs) }) });
      await this.refreshHolo();
    } catch { /* offline is fine */ }
  }

  async refreshHolo() {
    try {
      const r = await fetch("/api/miniboard");
      const j = (await r.json()) as { top?: { name: string; timeMs: number }[] };
      this.holoRows = j.top ?? [];
      this.hub.drawHolo(this.holoRows);
    } catch { /* ignore */ }
  }

  relocalize() {
    this.hub.refreshSigns();
    if (this.course) relocalizeFinish(this.course);
  }

  /** Trigger hub pads by standing on them (no jump required). */
  private hubPadTick() {
    if (this.mode !== "hub" || !this.body.grounded || !this.body.ground) return;
    const tag = this.hub.tags.get(this.body.ground);
    if (!tag) return;
    // fire as if landed; internal cooldowns prevent spam
    this.hubLand(this.body.ground, 1);
  }

  private hubLand(box: Box, air: number) {
    const tag = this.hub.tags.get(box);
    const now = performance.now();
    // debounce pad triggers (walking on pad shouldn't re-open every frame)
    if (tag && tag !== "balance" && tag !== "target") {
      if (this.lastHubTag === tag && now - this.lastHubTagAt < 1200) return;
      this.lastHubTag = tag;
      this.lastHubTagAt = now;
    }
    switch (tag) {
      case "mini_start":
        if (this.mini?.name !== "parkour") this.startMini("parkour");
        break;
      case "mini_finish":
        if (this.mini?.name === "parkour") this.finishMini("parkour", now - this.mini.t0);
        break;
      case "tower_start":
        if (this.mini?.name !== "tower") this.startMini("tower");
        break;
      case "tower_top":
        if (this.mini?.name === "tower") this.finishMini("tower", now - this.mini.t0);
        break;
      case "practice_start":
        this.cb.practice?.();
        break;
      case "weekly_start":
        this.startWeekly();
        break;
      case "coin_start":
        if (this.mini?.name !== "coins") {
          for (const c of this.hub.coins) c.taken = false;
          this.coinsLeft = this.hub.coins.length;
          this.startMini("coins");
        }
        break;
      case "race_start":
        if (this.mini?.name === "race" && this.raceGate >= this.hub.raceGates.length) {
          this.finishMini("race", now - this.mini.t0);
        } else if (this.mini?.name !== "race") {
          this.raceGate = 0;
          this.startMini("race");
        }
        break;
      case "balance_start":
        if (!this.mini) this.cb.popup(t("mini.balance"), "#d3b6ff");
        break;
      case "balance":
        if (this.mini?.name !== "balance") { this.startMini("balance"); this.balanceGrace = 0; }
        break;
      case "target":
        if (air > 0.35 && this.targetCd <= 0) {
          this.targetCd = 1;
          const d = Math.hypot(this.body.p.x - box.x, this.body.p.z - box.z);
          const pts = Math.max(0, Math.round(100 * (1 - d / 1.2)));
          if (pts >= 80) sfx.perfect(); else sfx.coin();
          this.fx.ring(this.body.p, pts >= 80 ? 0xffe14d : 0xffffff, 2.5);
          this.fx.burst(this.body.p, 0xff3355, 15, 5, { color2: 0xffffff });
          this.cb.mini("precision", pts);
        }
        break;
      case "reaction":
        if (this.reactionCd <= 0) { this.reactionCd = 4; this.cb.reaction(); }
        break;
    }
  }

  private hubMiniUpdate(dt: number) {
    this.reactionCd -= dt;
    this.targetCd -= dt;
    const b = this.body;
    const m = this.mini;
    // coin rush
    if (m?.name === "coins") {
      for (const c of this.hub.coins) {
        if (c.taken) continue;
        if (c.pos.distanceTo(b.p) < 1.5 || c.pos.distanceTo(tmpV.copy(b.p).setY(b.p.y + 1.1)) < 1.5) {
          c.taken = true;
          this.coinsLeft--;
          sfx.coin();
          this.fx.burst(c.pos, 0xffd23f, 14, 4, { up: 2 });
          this.fx.ring(c.pos.clone().setY(c.pos.y - 0.4), 0xffd23f, 1.6);
          if (this.coinsLeft <= 0) this.finishMini("coins", performance.now() - m.t0);
        }
      }
      return;
    }
    // sprint race
    if (m?.name === "race") {
      const gates = this.hub.raceGates;
      for (let i = 0; i < gates.length; i++) {
        const active = i === this.raceGate;
        gates[i].ring.scale.setScalar(active ? 1.15 + Math.sin(performance.now() / 180) * 0.09 : 0.75);
        (gates[i].ring.material as THREE.MeshLambertMaterial).emissiveIntensity = active ? 0.9 : 0.15;
      }
      const g = gates[this.raceGate];
      if (g && Math.hypot(b.p.x - g.pos.x, b.p.z - g.pos.z) < 2.4 && b.p.y < 6) {
        this.raceGate++;
        sfx.checkpoint();
        this.fx.ring(g.pos.clone().setY(0.2), 0x4cc9f0, 4);
        this.fx.burst(g.pos.clone().setY(2), 0x4cc9f0, 18, 5);
        if (this.raceGate >= gates.length) this.finishMini("race", performance.now() - m.t0);
      }
      return;
    }
    // balance
    if (m?.name === "balance") {
      const onDisc = b.ground === this.hub.balanceDisc;
      if (onDisc) this.balanceGrace = 0;
      else this.balanceGrace += dt;
      if (this.balanceGrace > 0.45) {
        const secs = Math.max(0, (performance.now() - m.t0) / 1000 - 0.45);
        this.mini = null;
        if (secs >= 2) {
          sfx.win();
          this.fx.burst(b.p.clone().setY(b.p.y + 1), 0x9b5de5, 36, 7, { rainbow: true });
          this.cb.mini("balance", secs);
        } else this.cb.popup(t("pop.miniReset"), "#ff8fa3");
      }
      return;
    }
    if (m && b.grounded && b.p.y < 0.35 && b.ground && !this.hub.tags.get(b.ground)) this.resetMini();
  }

  private updatePushTarget() {
    this.pushTarget = null;
    const p = this.body.p;
    let best = 2.9;
    if (this.phase === "run" || this.mode === "hub") {
      const raceT = this.raceTime();
      for (const b of this.bots) {
        if (raceT < b.stunEnd || raceT - b.shift >= b.finishT) continue;
        const d = b.pos.distanceTo(p);
        if (d < best) { best = d; this.pushTarget = { kind: "bot", ref: b }; }
      }
      for (const r of this.remotes.values()) {
        if (r.s[6] > 0 || performance.now() < r.stunLocal || r.finishMs !== null) continue;
        const d = r.pos.distanceTo(p);
        if (d < best) { best = d; this.pushTarget = { kind: "remote", ref: r }; }
      }
      if (this.mode === "hub") for (const hb of this.hubBots) {
        if (hb.stun > 0) continue;
        const d = hb.body.p.distanceTo(p);
        if (d < best) { best = d; this.pushTarget = { kind: "hub", ref: hb }; }
      }
    }
    this.pushNear = !!this.pushTarget;
  }

  // ------------------------------------------------------------------ camera/hud
  private updateCamera(dt: number) {
    const b = this.body;
    if (this.designStudio) return; // design studio owns the camera
    if (this.spectating) { this.updateSpecCamera(dt); return; }
    const hs = Math.hypot(b.v.x, b.v.z);
    if (this.phase === "finished") this.camYaw += dt * 0.5;
    else if (performance.now() - this.input.lastCamInput > 1400 && hs > 3 && b.stun <= 0) {
      const want = Math.atan2(-b.v.x, -b.v.z);
      let d = want - this.camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.9) this.camYaw += d * Math.min(1, dt * 1.1);
    }
    const tgt = tmpV.set(b.p.x, b.p.y + (b.up > 0 ? 1.4 : -1.4), b.p.z);
    if (this.deadT <= 0) this.camTarget.lerp(tgt, 1 - Math.exp(-dt * 14));
    const dist = this.camDist + Math.min(1.5, hs * 0.08);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const want = tmpV2.set(this.camTarget.x + Math.sin(this.camYaw) * cp * dist, this.camTarget.y + sp * dist + 0.6, this.camTarget.z + Math.cos(this.camYaw) * cp * dist);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 16));
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(b.p.x + 15, b.p.y + 35, b.p.z + 8);
    this.sun.target.position.set(b.p.x, b.p.y, b.p.z);
    this.cloudGroup.position.set(b.p.x * 0.7, 0, b.p.z * 0.7);
    const sky = (this as unknown as { sky: THREE.Mesh }).sky;
    sky.position.copy(this.camera.position);
    const sea = (this as unknown as { sea: THREE.Mesh }).sea;
    sea.position.x = b.p.x; sea.position.z = b.p.z;
    sea.position.y = (this.mode === "hub" ? 0 : this.body.p.y) - 70;
  }

  private miniInfoText(): string {
    const m = this.mini;
    if (!m) return "";
    if (m.name === "coins") return t("mini.coinsProgress", { a: this.hub.coins.length - this.coinsLeft, b: this.hub.coins.length });
    if (m.name === "race") return t("mini.raceGate", { a: Math.min(this.raceGate + 1, this.hub.raceGates.length), b: this.hub.raceGates.length });
    if (m.name === "balance") return t("mini.balanceTime", { t: ((performance.now() - m.t0) / 1000).toFixed(1) });
    return t(`mini.${m.name}`);
  }

  private updateSpecCamera(dt: number) {
    const list = this.specTargets.length ? this.specTargets : this.refreshSpecTargets();
    const tgt = !this.specFree && list.length ? list[Math.min(this.specIndex, list.length - 1)] : null;
    const focus = tgt ? tmpV.copy(tgt.pos).setY(tgt.pos.y + 1.4) : tmpV.copy(this.body.p).setY(this.body.p.y + 1.4);
    this.camTarget.lerp(focus, 1 - Math.exp(-dt * 5));
    if (this.specFree) this.camYaw += dt * 0.25;
    const dist = this.camDist + 2.2;
    const cp = Math.cos(this.camPitch + 0.1), sp = Math.sin(this.camPitch + 0.1);
    const want = tmpV2.set(
      this.camTarget.x + Math.sin(this.camYaw) * cp * dist,
      this.camTarget.y + sp * dist + 1.2,
      this.camTarget.z + Math.cos(this.camYaw) * cp * dist,
    );
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 6));
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x + 15, this.camTarget.y + 35, this.camTarget.z + 8);
    this.sun.target.position.copy(this.camTarget);
    const sky = (this as unknown as { sky: THREE.Mesh }).sky;
    sky.position.copy(this.camera.position);
    const sea = (this as unknown as { sea: THREE.Mesh }).sea;
    sea.position.set(this.camTarget.x, this.camTarget.y - 70, this.camTarget.z);
    this.cloudGroup.position.set(this.camTarget.x * 0.7, 0, this.camTarget.z * 0.7);
  }

  private sendHud(dt: number) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const raceT = this.mode === "hub" ? 0 : this.raceTime();
    const c = this.course;
    const multi = this.mode === "multi";
    const roster = multi ? this.roster() : [];
    this.cb.hud({
      mode: this.mode,
      phase: this.phase,
      time: this.phase === "finished" ? this.finishT : Math.max(0, raceT),
      countdown: this.phase === "countdown" ? Math.ceil(-raceT) : 0,
      section: Math.min(this.checkpoint + 1, this.sectionCount),
      sectionCount: this.sectionCount,
      sectionName: (() => {
        if (!c) return "";
        const sec = c.sections[Math.min(this.curSection, this.sectionCount - 1)];
        if (!sec) return "";
        const key = `sec.${sec.type}`;
        const tr = t(key);
        if (tr && tr !== key) return tr;
        return sec.name || sec.type;
      })(),
      pushNear: this.pushNear,
      pushCd: this.activeAbility === "ab_double"
        ? (this.djCd > 0 ? this.djCd / 18 : 0)
        : (["ab_anchor","ab_dash","ab_clone","ab_oil"].includes(this.activeAbility)
          ? this.abilityCd / 16
          : this.pushCd / 15),
      abilityCharges: this.activeAbility === "ab_double" ? this.djCharges : -1,
      abilityId: this.activeAbility,
      stunned: this.body.stun > 0,
      paused: this.paused,
      fps: this.fps,
      online: this.online,
      roster,
      place: multi ? roster.findIndex((r) => r.me) + 1 : 0,
      mini: this.mini ? { name: this.mini.name, time: performance.now() - this.mini.t0 } : null,
      room: this.room,
      locked: this.input.locked,
      combo: this.combo,
      respawn: this.deadT,
      miniInfo: this.miniInfoText(),
      spectating: this.spectating,
      specName: this.specFree ? "" : (this.specTargets[this.specIndex]?.name ?? ""),
      specFree: this.specFree,
      remaining: this.specTargets.length,
      myPlace: multi && this.finishMsSent !== null ? roster.findIndex((r) => r.me) + 1 : 0,
    });
  }
}
