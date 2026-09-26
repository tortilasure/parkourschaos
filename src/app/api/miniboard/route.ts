import { db } from "@/db";
import { miniScores } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const top = await db
      .select({ name: miniScores.name, timeMs: miniScores.timeMs, plays: miniScores.plays })
      .from(miniScores)
      .orderBy(asc(miniScores.timeMs))
      .limit(10);
    return Response.json({ top });
  } catch (e) {
    console.error("[miniboard GET]", e);
    return Response.json({ top: [], error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let body: { name?: string; timeMs?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "bad" }, { status: 400 });
    }
    const name = String(body.name ?? "").trim().slice(0, 16);
    const timeMs = Math.round(Number(body.timeMs));
    if (!name || !Number.isFinite(timeMs) || timeMs < 2000 || timeMs > 300000) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const [row] = await db.select().from(miniScores).where(eq(miniScores.name, name)).limit(1);
    if (!row) {
      await db.insert(miniScores).values({ name, timeMs }).onConflictDoNothing();
      return Response.json({ ok: true, improved: true });
    }
    const improved = timeMs < row.timeMs;
    await db
      .update(miniScores)
      .set({ timeMs: improved ? timeMs : row.timeMs, plays: sql`${miniScores.plays} + 1`, updatedAt: new Date() })
      .where(eq(miniScores.name, name));
    return Response.json({ ok: true, improved });
  } catch (e) {
    console.error("[miniboard POST]", e);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
