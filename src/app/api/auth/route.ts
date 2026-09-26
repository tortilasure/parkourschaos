import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, destroySession, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

function digError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else if (typeof cur === "object" && cur !== null && "message" in cur) {
      parts.push(String((cur as { message: unknown }).message));
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.filter(Boolean).join(" | ");
}

function friendlyError(e: unknown): string {
  const message = digError(e);
  console.error("[auth]", message, e);

  if (message.includes("DATABASE_URL")) {
    return "База данных не настроена (DATABASE_URL в Netlify)";
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|connect|Connection terminated|getaddrinfo|SSL|self-signed/i.test(message)) {
    return "Нет связи с БД. В Netlify укажи Supabase Connection Pooler URI (порт 6543), не прямой :5432";
  }
  if (/relation .* does not exist|does not exist/i.test(message)) {
    return "Таблицы не созданы — в Supabase SQL Editor выполни src/db/migrate.sql";
  }
  if (/password authentication failed|Invalid password|28P01/i.test(message)) {
    return "Неверный пароль в DATABASE_URL (пароль БД из Supabase)";
  }
  if (/Tenant or user not found|FATAL/i.test(message)) {
    return "Неверный DATABASE_URL (проверь Project ref и пароль в Supabase → Database → Connect)";
  }
  if (/Cookies can only be modified|cookies\(\)/i.test(message)) {
    return "Ошибка сессии (cookies). Перезалей сайт и попробуй снова";
  }
  const short = message.replace(/\s+/g, " ").slice(0, 200);
  return short ? `Ошибка: ${short}` : "Ошибка сервера";
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({ user });
  } catch (e) {
    return Response.json({ user: null, error: friendlyError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let body: { action?: string; username?: string; password?: string; profile?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }
    const action = body.action;
    if (action === "logout") {
      await destroySession();
      return Response.json({ ok: true });
    }
    if (action === "checkName") {
      const name = String(body.username ?? "").trim().slice(0, 16);
      if (name.length < 2) return Response.json({ ok: false, error: "Слишком короткое имя" }, { status: 400 });
      try {
        const me = await getCurrentUser();
        // Own account — always OK (exact or case-insensitive)
        if (me && me.username.toLowerCase() === name.toLowerCase()) {
          return Response.json({ ok: true, name: me.username });
        }
        const existing = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.username, name))
          .limit(1);
        if (existing.length) {
          return Response.json({ ok: false, error: "Это имя уже занято зарегистрированным игроком" }, { status: 409 });
        }
        // Case-insensitive collision
        const all = await db.select({ username: users.username }).from(users).limit(5000);
        const hit = all.find((u) => u.username.toLowerCase() === name.toLowerCase());
        if (hit) {
          return Response.json({ ok: false, error: "Это имя уже занято зарегистрированным игроком" }, { status: 409 });
        }
      } catch (e) {
        console.error("[checkName]", e);
      }
      return Response.json({ ok: true, name });
    }
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!/^[A-Za-z0-9_\-а-яА-ЯёЁ]{3,16}$/.test(username)) {
      return Response.json({ error: "Имя: 3–16 символов (буквы, цифры, _ -)" }, { status: 400 });
    }
    if (password.length < 4 || password.length > 64) {
      return Response.json({ error: "Пароль: минимум 4 символа" }, { status: 400 });
    }
    if (action === "register") {
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (existing.length) return Response.json({ error: "Такое имя уже занято" }, { status: 409 });
      const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
      const [u] = await db
        .insert(users)
        .values({ username, passwordHash: hashPassword(password), profile })
        .returning({ id: users.id, username: users.username, profile: users.profile });
      if (!u) return Response.json({ error: "Не удалось создать пользователя" }, { status: 500 });
      await createSession(u.id);
      return Response.json({ user: u });
    }
    if (action === "login") {
      const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (!u || !verifyPassword(password, u.passwordHash)) {
        return Response.json({ error: "Неверное имя или пароль" }, { status: 401 });
      }
      await createSession(u.id);
      return Response.json({ user: { id: u.id, username: u.username, profile: u.profile } });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: friendlyError(e) }, { status: 500 });
  }
}
