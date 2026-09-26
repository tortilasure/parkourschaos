export const dynamic = "force-dynamic";
export const maxDuration = 20;

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
  return parts.filter(Boolean).join(" | ").slice(0, 300);
}

export async function GET() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return Response.json(
      {
        ok: false,
        error: "DATABASE_URL is not set in Netlify environment variables",
        hint: "Site configuration → Environment variables → DATABASE_URL",
      },
      { status: 503 }
    );
  }

  // Safe metadata (no password)
  let host = "?";
  let port = "?";
  let hasPooler = false;
  try {
    const u = new URL(raw.replace(/^postgresql:/, "http:"));
    host = u.hostname;
    port = u.port || "5432";
    hasPooler = host.includes("pooler") || port === "6543";
  } catch {
    /* ignore */
  }

  try {
    const { getPoolInstance } = await import("@/db");
    const pool = getPoolInstance();
    const client = await pool.connect();
    try {
      const r = await client.query("select 1 as ok");
      if (!r.rows?.[0]) {
        return Response.json({ ok: false, error: "Empty result from select 1", host, port, hasPooler }, { status: 500 });
      }
      // Check users table
      try {
        await client.query("select 1 from users limit 1");
      } catch (te) {
        const msg = digError(te);
        if (/does not exist/i.test(msg)) {
          return Response.json(
            {
              ok: false,
              error: "Tables missing — run src/db/migrate.sql in Supabase SQL Editor",
              host,
              port,
              hasPooler,
            },
            { status: 500 }
          );
        }
        return Response.json({ ok: false, error: msg, host, port, hasPooler }, { status: 500 });
      }
      return Response.json({ ok: true, host, port, hasPooler });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = digError(e);
    return Response.json(
      {
        ok: false,
        error: message,
        host,
        port,
        hasPooler,
        hint: hasPooler
          ? "Pooler URI looks ok — check DB password in DATABASE_URL and that project is not paused"
          : "Use Supabase Connection pooling (Transaction) URI — host with pooler, port 6543",
      },
      { status: 500 }
    );
  }
}
