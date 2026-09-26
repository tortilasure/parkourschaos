import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
    let body: { profile?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }
    if (!body.profile || typeof body.profile !== "object") {
      return Response.json({ error: "Bad profile" }, { status: 400 });
    }
    const json = JSON.stringify(body.profile);
    if (json.length > 60000) return Response.json({ error: "Too large" }, { status: 413 });
    await db.update(users).set({ profile: body.profile }).where(eq(users.id, user.id));
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("[profile]", e);
    return Response.json({ error: message.includes("DATABASE_URL") ? "База данных не настроена" : "Ошибка сервера" }, { status: 500 });
  }
}
