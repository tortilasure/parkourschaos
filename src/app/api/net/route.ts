import {
  addPlayer,
  clampSections,
  validateMove,
  cleanup,
  cleanupDb,
  deleteRoom,
  findQuickRoom,
  loadHub,
  loadRoom,
  loadRoomByCode,
  listPublicRooms,
  makeRoom,
  normalizeName,
  uniqueNameInRoom,
  pushEvents,
  removePlayer,
  roomSummary,
  saveRoom,
  startRoom,
  tick,
  type Room,
} from "@/lib/rooms";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

type Body = {
  op?: string;
  pid?: string;
  name?: string;
  look?: Record<string, string>;
  s?: number[];
  ev?: unknown[];
  lastSeq?: number;
  roomId?: string;
  code?: string;
  roomName?: string;
  maxPlayers?: number;
  isPublic?: boolean;
  fillBots?: boolean;
  botCount?: number;
  botDiff?: string;
  sectionMin?: number;
  sectionMax?: number;
  tp?: number;
  finishMs?: number;
};

function others(room: Room, pid: string, limit = 40) {
  const me = room.players.get(pid);
  let list = [...room.players.values()].filter((p) => p.id !== pid);
  if (room.kind === "hub" && me && list.length > limit) {
    list = list
      .map((p) => ({ p, d: (p.s[0] - me.s[0]) ** 2 + (p.s[2] - me.s[2]) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map((x) => x.p);
  }
  return list.map((p) => ({ id: p.id, name: p.name, look: p.look, s: p.s, finishMs: p.finishMs, registered: !!p.registered }));
}

function events(room: Room, pid: string, lastSeq: number) {
  return room.events.filter((e) => e.seq > lastSeq && e.from !== pid && (!e.target || e.target === pid || e.type === "emoji" || e.type === "push" || e.type === "chat" || e.type === "blind" || e.type === "hit"));
}


/** Reject guest names that belong to a registered account (unless this session owns it). */
async function resolvePlayerName(raw: string): Promise<{ name: string; error?: string }> {
  const name = normalizeName(raw) || "Guest";
  try {
    const session = await getCurrentUser();
    // Case-insensitive match against registered usernames
    const rows = await db.select({ username: users.username }).from(users).limit(8000);
    const hit = rows.find((u) => u.username.toLowerCase() === name.toLowerCase());
    if (hit) {
      if (session && session.username.toLowerCase() === hit.username.toLowerCase()) {
        return { name: session.username };
      }
      return { name, error: "Это имя уже занято зарегистрированным игроком" };
    }
  } catch {
    // DB down — allow play; room-level uniqueness still applies
  }
  return { name };
}

export async function POST(req: Request) {
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "bad" }, { status: 400 });
  }
  const pid = String(b.pid ?? "").slice(0, 40);
  if (!pid) return Response.json({ error: "no pid" }, { status: 400 });
  const look = b.look && typeof b.look === "object" ? b.look : {};
  if (Math.random() < 0.03) void cleanupDb().catch(() => {});

  const resolved = await resolvePlayerName(String(b.name ?? "Guest"));
  if (resolved.error && b.op !== "leave" && b.op !== "list" && b.op !== "poll") {
    return Response.json({ error: resolved.error }, { status: 409 });
  }
  const name = resolved.name;
  let registered = false;
  try {
    const session = await getCurrentUser();
    registered = !!(session && session.username.toLowerCase() === name.toLowerCase());
  } catch { /* ignore */ }

  switch (b.op) {
    case "hub": {
      const hub = await loadHub();
      const p = addPlayer(hub, { id: pid, name, look, registered });
      p.look = look;
      p.name = uniqueNameInRoom(hub, name, pid);
      if (Array.isArray(b.s)) p.s = b.s.slice(0, 8).map(Number);
      p.lastSeen = Date.now();
      pushEvents(hub, pid, b.ev);
      tick(hub);
      await saveRoom(hub);
      const online = hub.players.size;
      return Response.json({ players: others(hub, pid, 30), events: events(hub, pid, b.lastSeq ?? 0), seq: hub.seq, online });
    }
    case "list": {
      const list = (await listPublicRooms())
        .filter((r) => r.players.size < r.maxPlayers)
        .map(roomSummary)
        .slice(0, 30);
      return Response.json({ rooms: list });
    }
    case "create": {
      const d = String(b.botDiff ?? "mixed");
      const maxPlayers = Math.max(2, Math.min(12, Math.round(Number(b.maxPlayers) || 12)));
      const room = makeRoom({
        kind: "match",
        name: String(b.roomName || `${name}'s lobby`).slice(0, 24),
        hostId: pid,
        isPublic: b.isPublic !== false,
        quick: false,
        maxPlayers,
        botCount: Math.max(0, Math.min(maxPlayers - 1, Math.round(Number(b.botCount) || 0))),
        botDiff: d === "easy" || d === "mid" || d === "hard" ? d : "mixed",
        sectionMin: clampSections(Number(b.sectionMin ?? 5)),
        sectionMax: clampSections(Number(b.sectionMax ?? 25)),
      });
      addPlayer(room, { id: pid, name, look, registered });
      await saveRoom(room);
      return Response.json({ room: roomSummary(room) });
    }
    case "quick": {
      let room = await findQuickRoom();
      if (!room) {
        room = makeRoom({ kind: "match", name: "Quick Match", hostId: pid, isPublic: true, quick: true, maxPlayers: 12 });
      }
      addPlayer(room, { id: pid, name, look, registered });
      tick(room);
      await saveRoom(room);
      return Response.json({ room: roomSummary(room) });
    }
    case "join": {
      const code = String(b.code ?? "").toUpperCase().trim();
      let room = await loadRoomByCode(code);
      if (!room) room = await loadRoom(code);
      if (!room) return Response.json({ error: "Лобби не найдено" }, { status: 404 });
      if (room.status !== "waiting") return Response.json({ error: "Матч уже начался" }, { status: 409 });
      if (room.players.size >= room.maxPlayers) return Response.json({ error: "Лобби заполнено" }, { status: 409 });
      addPlayer(room, { id: pid, name, look, registered });
      await saveRoom(room);
      return Response.json({ room: roomSummary(room) });
    }
    case "leave": {
      const room = await loadRoom(String(b.roomId));
      if (room) {
        removePlayer(room, pid);
        if (room.kind === "match" && room.players.size === 0) await deleteRoom(room.id);
        else await saveRoom(room);
      }
      return Response.json({ ok: true });
    }
    case "bots": {
      const room = await loadRoom(String(b.roomId));
      if (!room) return Response.json({ error: "no room" }, { status: 404 });
      if (room.hostId !== pid) return Response.json({ error: "Only the host can change bots" }, { status: 403 });
      room.botCount = Math.max(0, Math.min(room.maxPlayers - 1, Math.round(Number(b.botCount) || 0)));
      const d = String(b.botDiff ?? "mixed");
      room.botDiff = d === "easy" || d === "mid" || d === "hard" ? d : "mixed";
      if (b.sectionMin !== undefined) room.sectionMin = clampSections(Number(b.sectionMin));
      if (b.sectionMax !== undefined) room.sectionMax = clampSections(Number(b.sectionMax));
      await saveRoom(room);
      return Response.json({ room: roomSummary(room) });
    }
    case "start": {
      const room = await loadRoom(String(b.roomId));
      if (!room) return Response.json({ error: "no room" }, { status: 404 });
      if (room.hostId !== pid) return Response.json({ error: "Только хост может начать" }, { status: 403 });
      startRoom(room, !!b.fillBots);
      await saveRoom(room);
      return Response.json({ room: roomSummary(room) });
    }
    case "sync": {
      const room = await loadRoom(String(b.roomId));
      if (!room) return Response.json({ error: "gone" }, { status: 404 });
      const p = room.players.get(pid);
      if (!p) return Response.json({ error: "not in room" }, { status: 404 });
      p.lastSeen = Date.now();
      let cheatMsg: string | null = null;
      let correction: number[] | null = null;
      if (Array.isArray(b.s)) {
        const next = b.s.slice(0, 8).map(Number);
        const v = validateMove(room, p, next, b.tp === 1);
        if (v.ok) p.s = next;
        else {
          correction = v.corrected ?? p.s;
          if (v.kick) {
            removePlayer(room, pid);
            await saveRoom(room);
            return Response.json({ error: "kicked" }, { status: 403 });
          }
          if (v.warn) cheatMsg = "warn";
        }
      }
      if (typeof b.finishMs === "number" && p.finishMs === null && room.status === "racing") {
        p.finishMs = Math.round(b.finishMs);
        if (!room.firstFinishAt) room.firstFinishAt = Date.now();
      }
      pushEvents(room, pid, b.ev);
      tick(room);
      if (room.kind === "match" && room.players.size === 0) {
        await deleteRoom(room.id);
      } else {
        await saveRoom(room);
      }
      return Response.json({
        room: roomSummary(room),
        players: others(room, pid),
        events: events(room, pid, b.lastSeq ?? 0),
        seq: room.seq,
        now: Date.now(),
        correction,
        cheatMsg,
      });
    }
  }
  return Response.json({ error: "unknown op" }, { status: 400 });
}
