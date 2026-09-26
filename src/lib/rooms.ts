// In-memory realtime room manager + Postgres write-through (survives Netlify multi-instance).
import { db } from "@/db";
import { netRooms } from "@/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";

export type NetState = number[]; // [x,y,z,yaw,anim,section,stunned,finished]

export interface NetPlayer {
  id: string;
  name: string;
  look: Record<string, string>;
  s: NetState;
  lastSeen: number;
  finishMs: number | null;
  joinedAt: number;
  // movement validation
  lastMoveAt: number;
  strikes: number;
  warned: boolean;
  corrected: NetState | null;
  kicked: boolean;
  registered: boolean;
}

export interface NetEvent {
  seq: number;
  from: string;
  type: string;
  target?: string;
  data?: unknown;
  t: number;
}

export type BotDiff = "easy" | "mid" | "hard" | "mixed";

export interface Room {
  id: string;
  code: string;
  name: string;
  kind: "hub" | "match";
  hostId: string;
  isPublic: boolean;
  quick: boolean;
  maxPlayers: number;
  status: "waiting" | "countdown" | "racing" | "finished";
  seed: number;
  sectionCount: number;
  sectionMin: number;
  sectionMax: number;
  bots: number;
  botCount: number;
  botDiff: BotDiff;
  startAt: number;
  createdAt: number;
  firstFinishAt: number;
  players: Map<string, NetPlayer>;
  events: NetEvent[];
  seq: number;
}

const g = globalThis as typeof globalThis & { __rpmRooms?: Map<string, Room> };
export const rooms: Map<string, Room> = g.__rpmRooms ?? new Map();
g.__rpmRooms = rooms;

export const QUICK_WAIT_MS = 25000;
export const QUICK_TARGET = 12;
const PLAYER_TIMEOUT = 45000;

export function clampSections(n: number) {
  return Math.max(5, Math.min(25, Math.round(Number(n) || 5)));
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export function getHub(): Room {
  let hub = rooms.get("hub");
  if (!hub) {
    hub = makeRoom({ id: "hub", kind: "hub", name: "Hub", hostId: "", isPublic: true, quick: false, maxPlayers: 999 });
    rooms.set("hub", hub);
  }
  return hub;
}

export function makeRoom(o: {
  id?: string;
  kind: "hub" | "match";
  name: string;
  hostId: string;
  isPublic: boolean;
  quick: boolean;
  maxPlayers: number;
  botCount?: number;
  botDiff?: BotDiff;
  sectionMin?: number;
  sectionMax?: number;
}): Room {
  const code = genCode();
  const room: Room = {
    id: o.id ?? code,
    code,
    name: o.name,
    kind: o.kind,
    hostId: o.hostId,
    isPublic: o.isPublic,
    quick: o.quick,
    maxPlayers: Math.max(2, Math.min(12, o.maxPlayers)),
    status: "waiting",
    seed: 0,
    sectionCount: 0,
    sectionMin: clampSections(o.sectionMin ?? 5),
    sectionMax: clampSections(o.sectionMax ?? 25),
    bots: 0,
    botCount: Math.max(0, Math.min(11, Math.round(o.botCount ?? 0))),
    botDiff: o.botDiff ?? "mixed",
    startAt: 0,
    createdAt: Date.now(),
    firstFinishAt: 0,
    players: new Map(),
    events: [],
    seq: 0,
  };
  if (o.kind === "hub") room.maxPlayers = 999;
  if (o.kind === "match") rooms.set(room.id, room);
  return room;
}


export function normalizeName(name: string): string {
  return String(name ?? "").trim().slice(0, 16);
}

/** Case-insensitive name collision inside a room (other players only). */
export function nameTakenInRoom(room: Room, name: string, exceptId?: string): boolean {
  const n = normalizeName(name).toLowerCase();
  if (!n) return false;
  for (const p of room.players.values()) {
    if (exceptId && p.id === exceptId) continue;
    if (normalizeName(p.name).toLowerCase() === n) return true;
  }
  return false;
}

/** Pick a free guest name in the room: Base, Base2, Base3... */
export function uniqueNameInRoom(room: Room, desired: string, exceptId?: string): string {
  let base = normalizeName(desired) || "Guest";
  if (!nameTakenInRoom(room, base, exceptId)) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base.slice(0, 14)}${i}`;
    if (!nameTakenInRoom(room, cand, exceptId)) return cand;
  }
  return `${base.slice(0, 10)}${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function addPlayer(room: Room, p: { id: string; name: string; look: Record<string, string>; registered?: boolean }) {
  // joining a match leaves any other match; the hub is only a presence channel
  if (room.kind === "match") {
    for (const r of rooms.values()) {
      if (r.kind === "match" && r !== room && r.players.has(p.id)) removePlayer(r, p.id);
    }
  }
  const existing = room.players.get(p.id);
  if (existing) {
    existing.lastSeen = Date.now();
    const want = normalizeName(p.name);
    if (want && want.toLowerCase() !== normalizeName(existing.name).toLowerCase()) {
      existing.name = uniqueNameInRoom(room, want, p.id);
    }
    if (p.look) existing.look = p.look;
    if (p.registered !== undefined) existing.registered = !!p.registered;
    return existing;
  }
  const np: NetPlayer = {
    id: p.id,
    name: uniqueNameInRoom(room, p.name, p.id),
    look: p.look ?? {},
    s: [0, 0, 0, 0, 0, 0, 0, 0],
    lastSeen: Date.now(),
    finishMs: null,
    joinedAt: Date.now(),
    lastMoveAt: 0,
    strikes: 0,
    warned: false,
    corrected: null,
    kicked: false,
    registered: !!p.registered,
  };
  room.players.set(p.id, np);
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = p.id;
  return np;
}

export function removePlayer(room: Room, pid: string) {
  room.players.delete(pid);
  if (room.hostId === pid) {
    const next = room.players.keys().next();
    room.hostId = next.done ? "" : next.value;
  }
  if (room.kind === "match" && room.players.size === 0) rooms.delete(room.id);
}

export function startRoom(room: Room, fillBots: boolean) {
  if (room.status !== "waiting") return;
  const humans = room.players.size;
  room.seed = Math.floor(Math.random() * 1e9);
  const lo = Math.min(room.sectionMin, room.sectionMax);
  const hi = Math.max(room.sectionMin, room.sectionMax);
  room.sectionCount = lo + Math.floor(Math.random() * (hi - lo + 1));
  const room_space = Math.max(0, room.maxPlayers - humans);
  let bots = Math.min(room.botCount, room_space);
  if (room.quick) {
    // quick match always aims for a full 12-player grid
    bots = Math.max(bots, Math.min(room_space, QUICK_TARGET - humans));
  } else if (bots === 0 && (fillBots || humans < 2)) {
    const target = Math.max(2, Math.min(room.maxPlayers, humans + 3 + Math.floor(Math.random() * 6)));
    bots = Math.max(0, target - humans);
  }
  room.bots = Math.max(0, bots);
  room.status = "countdown";
  room.startAt = Date.now() + 4500;
}

export function tick(room: Room) {
  const now = Date.now();
  for (const p of [...room.players.values()]) {
    if (now - p.lastSeen > PLAYER_TIMEOUT) removePlayer(room, p.id);
  }
  if (room.kind === "match") {
    if (room.status === "waiting" && room.quick) {
      if (room.players.size >= QUICK_TARGET || now - room.createdAt > QUICK_WAIT_MS) startRoom(room, true);
    }
    if (room.status === "countdown" && now >= room.startAt) room.status = "racing";
    if (room.status === "racing") {
      const all = [...room.players.values()];
      if (all.length && all.every((p) => p.finishMs !== null)) room.status = "finished";
      if (room.firstFinishAt && now - room.firstFinishAt > 120000) room.status = "finished";
    }
  }
  // prune events
  const cutoff = now - 8000;
  if (room.events.length && room.events[0].t < cutoff) room.events = room.events.filter((e) => e.t >= cutoff);
}

export function cleanup() {
  const now = Date.now();
  for (const r of [...rooms.values()]) {
    tick(r);
    if (r.kind === "match" && (r.players.size === 0 || now - r.createdAt > 1000 * 60 * 40)) rooms.delete(r.id);
  }
}

export function pushEvents(room: Room, from: string, evs: unknown) {
  if (!Array.isArray(evs)) return;
  for (const raw of evs.slice(0, 10)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as { type?: string; target?: string; data?: unknown };
    if (typeof e.type !== "string") continue;
    room.seq++;
    room.events.push({ seq: room.seq, from, type: e.type.slice(0, 16), target: e.target, data: e.data, t: Date.now() });
  }
}

export function roomSummary(room: Room) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    isPublic: room.isPublic,
    quick: room.quick,
    maxPlayers: room.maxPlayers,
    status: room.status,
    seed: room.seed,
    sectionCount: room.sectionCount,
    sectionMin: room.sectionMin,
    sectionMax: room.sectionMax,
    bots: room.bots,
    botCount: room.botCount,
    botDiff: room.botDiff,
    startAt: room.startAt,
    createdAt: room.createdAt,
    waitLeft: room.quick && room.status === "waiting" ? Math.max(0, QUICK_WAIT_MS - (Date.now() - room.createdAt)) : null,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, finishMs: p.finishMs, registered: !!p.registered })),
  };
}

// ---------------------------------------------------------------- anti-cheat
// Generous limits: the game has trampolines (~17 m/s launch), wind, portals and
// gravity flips, so we only reject clearly impossible motion.
const MAX_H_SPEED = 26;      // m/s horizontal (conveyor + wind + bounce boost)
const MAX_V_SPEED = 42;      // m/s vertical
const MAX_STEP = 60;         // max distance covered in a single update
const TELEPORT_GRACE_MS = 1200;

export interface MoveVerdict {
  ok: boolean;
  corrected?: NetState;
  warn?: boolean;
  kick?: boolean;
}

/** Validates a state update. `teleportOk` covers portals/respawns the client reports. */
export function validateMove(room: Room, p: NetPlayer, next: NetState, teleportOk: boolean): MoveVerdict {
  const now = Date.now();
  const prev = p.s;
  const first = p.lastMoveAt === 0;
  const dt = Math.min(2.5, Math.max(0.03, (now - p.lastMoveAt) / 1000));
  p.lastMoveAt = now;
  if (first || room.status !== "racing") return { ok: true };
  if (!next.every((n) => Number.isFinite(n))) return { ok: false, corrected: prev };

  const dx = next[0] - prev[0], dy = next[1] - prev[1], dz = next[2] - prev[2];
  const dist = Math.hypot(dx, dy, dz);
  if (teleportOk && dist < MAX_STEP) return { ok: true };

  const hSpeed = Math.hypot(dx, dz) / dt;
  const vSpeed = Math.abs(dy) / dt;
  // never let anyone skip backwards-to-forwards across the course
  const jumpedAhead = next[5] - prev[5] > 2;
  const bad = dist > MAX_STEP || hSpeed > MAX_H_SPEED || vSpeed > MAX_V_SPEED || jumpedAhead;
  if (!bad) {
    if (p.strikes > 0 && now - p.joinedAt > 5000) p.strikes = Math.max(0, p.strikes - 0.02);
    return { ok: true };
  }
  // soft rollback: keep the old position, let the client resync
  p.strikes += 1;
  const verdict: MoveVerdict = { ok: false, corrected: prev, warn: p.strikes >= 3 && !p.warned };
  if (verdict.warn) p.warned = true;
  if (p.strikes >= 8) {
    p.kicked = true;
    verdict.kick = true;
  }
  return verdict;
}

export function recentTeleport(p: NetPlayer, at: number) {
  return at > 0 && Date.now() - at < TELEPORT_GRACE_MS;
}

// ---------------------------------------------------------------- DB persistence (Netlify multi-instance)
// Rooms live in Postgres so every serverless instance sees the same state.

type RoomJson = Omit<Room, "players"> & { players: NetPlayer[] };

function toJson(room: Room): RoomJson {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    kind: room.kind,
    hostId: room.hostId,
    isPublic: room.isPublic,
    quick: room.quick,
    maxPlayers: room.maxPlayers,
    status: room.status,
    seed: room.seed,
    sectionCount: room.sectionCount,
    sectionMin: room.sectionMin,
    sectionMax: room.sectionMax,
    bots: room.bots,
    botCount: room.botCount,
    botDiff: room.botDiff,
    startAt: room.startAt,
    createdAt: room.createdAt,
    firstFinishAt: room.firstFinishAt,
    players: [...room.players.values()],
    events: room.events,
    seq: room.seq,
  };
}

function fromJson(j: RoomJson): Room {
  const players = new Map<string, NetPlayer>();
  for (const p of j.players || []) players.set(p.id, p);
  return {
    id: j.id,
    code: j.code,
    name: j.name,
    kind: j.kind,
    hostId: j.hostId,
    isPublic: j.isPublic,
    quick: j.quick,
    maxPlayers: j.maxPlayers,
    status: j.status,
    seed: j.seed,
    sectionCount: j.sectionCount,
    sectionMin: j.sectionMin,
    sectionMax: j.sectionMax,
    bots: j.bots,
    botCount: j.botCount,
    botDiff: j.botDiff,
    startAt: j.startAt,
    createdAt: j.createdAt,
    firstFinishAt: j.firstFinishAt,
    players,
    events: j.events || [],
    seq: j.seq || 0,
  };
}

let schemaReady = false;
export async function ensureRoomsSchema() {
  if (schemaReady) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS net_rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS net_rooms_code_idx ON net_rooms(code);
      CREATE INDEX IF NOT EXISTS net_rooms_kind_status_idx ON net_rooms(kind, status);
    `);
    schemaReady = true;
  } catch (e) {
    console.error("[rooms] ensure schema", e);
    // still try to use the table — it may already exist
    schemaReady = true;
  }
}

/** Load room by id from DB (and refresh memory cache). */
export async function loadRoom(id: string): Promise<Room | null> {
  await ensureRoomsSchema();
  try {
    const rows = await db.select().from(netRooms).where(eq(netRooms.id, id)).limit(1);
    if (!rows.length) {
      rooms.delete(id);
      return null;
    }
    const room = fromJson(rows[0].data as RoomJson);
    rooms.set(room.id, room);
    return room;
  } catch (e) {
    console.error("[rooms] load", id, e);
    return rooms.get(id) ?? null;
  }
}

/** Load room by 5-char code. */
export async function loadRoomByCode(code: string): Promise<Room | null> {
  await ensureRoomsSchema();
  const c = code.toUpperCase().trim();
  try {
    const rows = await db.select().from(netRooms).where(eq(netRooms.code, c)).limit(1);
    if (!rows.length) return null;
    const room = fromJson(rows[0].data as RoomJson);
    rooms.set(room.id, room);
    return room;
  } catch (e) {
    console.error("[rooms] loadByCode", c, e);
    for (const r of rooms.values()) if (r.code === c) return r;
    return null;
  }
}

/** Persist room to Postgres (write-through). */
export async function saveRoom(room: Room): Promise<void> {
  rooms.set(room.id, room);
  await ensureRoomsSchema();
  const payload = toJson(room);
  try {
    await db
      .insert(netRooms)
      .values({
        id: room.id,
        code: room.code,
        kind: room.kind,
        status: room.status,
        data: payload as never,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: netRooms.id,
        set: {
          code: room.code,
          kind: room.kind,
          status: room.status,
          data: payload as never,
          updatedAt: new Date(),
        },
      });
  } catch (e) {
    console.error("[rooms] save", room.id, e);
  }
}

/** Delete room from DB + memory. */
export async function deleteRoom(id: string): Promise<void> {
  rooms.delete(id);
  try {
    await ensureRoomsSchema();
    await db.delete(netRooms).where(eq(netRooms.id, id));
  } catch (e) {
    console.error("[rooms] delete", id, e);
  }
}

/** List public waiting match rooms (for lobby browser). */
export async function listPublicRooms(): Promise<Room[]> {
  await ensureRoomsSchema();
  try {
    const rows = await db
      .select()
      .from(netRooms)
      .where(and(eq(netRooms.kind, "match"), eq(netRooms.status, "waiting")));
    const out: Room[] = [];
    for (const row of rows) {
      const room = fromJson(row.data as RoomJson);
      if (!room.isPublic || room.quick) continue;
      rooms.set(room.id, room);
      out.push(room);
    }
    return out;
  } catch (e) {
    console.error("[rooms] list", e);
    return [...rooms.values()].filter((r) => r.kind === "match" && r.status === "waiting" && r.isPublic && !r.quick);
  }
}

/** Find an open quick-match lobby. */
export async function findQuickRoom(): Promise<Room | null> {
  await ensureRoomsSchema();
  try {
    const rows = await db
      .select()
      .from(netRooms)
      .where(and(eq(netRooms.kind, "match"), eq(netRooms.status, "waiting")));
    for (const row of rows) {
      const room = fromJson(row.data as RoomJson);
      if (room.quick && room.players.size < room.maxPlayers) {
        rooms.set(room.id, room);
        return room;
      }
    }
  } catch (e) {
    console.error("[rooms] findQuick", e);
  }
  for (const r of rooms.values()) {
    if (r.kind === "match" && r.quick && r.status === "waiting" && r.players.size < r.maxPlayers) return r;
  }
  return null;
}

/** Hub is always id "hub". */
export async function loadHub(): Promise<Room> {
  let hub = await loadRoom("hub");
  if (!hub) {
    hub = makeRoom({ id: "hub", kind: "hub", name: "Hub", hostId: "", isPublic: true, quick: false, maxPlayers: 999 });
    rooms.set("hub", hub);
    await saveRoom(hub);
  }
  return hub;
}

/** Cleanup stale rooms in DB. */
export async function cleanupDb() {
  await ensureRoomsSchema();
  const now = Date.now();
  try {
    const rows = await db.select().from(netRooms);
    for (const row of rows) {
      const room = fromJson(row.data as RoomJson);
      tick(room);
      if (room.kind === "match" && (room.players.size === 0 || now - room.createdAt > 1000 * 60 * 40)) {
        await deleteRoom(room.id);
      } else {
        await saveRoom(room);
      }
    }
    // prune very old finished rooms
    await db.delete(netRooms).where(
      and(eq(netRooms.kind, "match"), lt(netRooms.updatedAt, new Date(now - 1000 * 60 * 45)))
    );
  } catch (e) {
    console.error("[rooms] cleanupDb", e);
  }
}
