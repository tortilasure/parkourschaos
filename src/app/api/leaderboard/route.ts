import { db } from "@/db";
import { timeAttackScores } from "@/db/schema";
import { asc, eq, lt, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const top = await db
      .select({
        username: timeAttackScores.username,
        timeMs: timeAttackScores.timeMs,
        attempts: timeAttackScores.attempts,
        updatedAt: timeAttackScores.updatedAt,
      })
      .from(timeAttackScores)
      .orderBy(asc(timeAttackScores.timeMs))
      .limit(50);
    const user = await getCurrentUser();
    let me: { timeMs: number; rank: number } | null = null;
    if (user) {
      const [row] = await db.select().from(timeAttackScores).where(eq(timeAttackScores.userId, user.id)).limit(1);
      if (row) {
        const [{ c }] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(timeAttackScores)
          .where(lt(timeAttackScores.timeMs, row.timeMs));
        me = { timeMs: row.timeMs, rank: Number(c) + 1 };
      }
    }
    return Response.json({ top, me });
  } catch (e) {
    console.error("[leaderboard GET]", e);
    return Response.json({ top: [], me: null, error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Войдите в аккаунт, чтобы попасть в топ" }, { status: 401 });
    let body: { timeMs?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }
    const timeMs = Math.round(Number(body.timeMs));
    if (!Number.isFinite(timeMs) || timeMs < 15000 || timeMs > 3600000) {
      return Response.json({ error: "Invalid time" }, { status: 400 });
    }
    const [row] = await db.select().from(timeAttackScores).where(eq(timeAttackScores.userId, user.id)).limit(1);
    let improved = false;
    if (!row) {
      await db.insert(timeAttackScores).values({ userId: user.id, username: user.username, timeMs });
      improved = true;
    } else {
      improved = timeMs < row.timeMs;
      await db
        .update(timeAttackScores)
        .set({
          timeMs: improved ? timeMs : row.timeMs,
          attempts: row.attempts + 1,
          username: user.username,
          updatedAt: improved ? new Date() : row.updatedAt,
        })
        .where(eq(timeAttackScores.userId, user.id));
    }
    return Response.json({ ok: true, improved });
  } catch (e) {
    console.error("[leaderboard POST]", e);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
