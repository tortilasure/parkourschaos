import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __rpmPool?: Pool;
  __rpmDb?: NodePgDatabase;
};

function normalizeDatabaseUrl(raw: string): string {
  let url = raw.trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }

  // Strip existing sslmode — we set SSL via Pool options (avoid verify conflicts)
  url = url.replace(/[?&]sslmode=[^&]*/gi, "");
  url = url.replace(/\?&/, "?").replace(/[?&]$/, "");

  const isPooler =
    url.includes("pooler.supabase") ||
    url.includes(":6543") ||
    url.includes("pgbouncer=true");

  if (isPooler && !url.includes("pgbouncer=")) {
    url += url.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
  }

  // no-verify: required for Supabase on Netlify serverless (self-signed chain)
  url += url.includes("?") ? "&sslmode=no-verify" : "?sslmode=no-verify";

  return url;
}

function getPool(): Pool {
  if (globalForDb.__rpmPool) return globalForDb.__rpmPool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Add it in Netlify → Site configuration → Environment variables"
    );
  }

  const connectionString = normalizeDatabaseUrl(databaseUrl);

  const pool = new Pool({
    connectionString,
    // Critical for Supabase pooler on Netlify
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 8_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  pool.on("error", (err) => {
    console.error("[pg pool]", err.message);
  });

  globalForDb.__rpmPool = pool;
  return pool;
}

function getDb(): NodePgDatabase {
  if (globalForDb.__rpmDb) return globalForDb.__rpmDb;
  const db = drizzle(getPool());
  globalForDb.__rpmDb = db;
  return db;
}

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export function getPoolInstance(): Pool {
  return getPool();
}

export const pool = {
  get instance() {
    return getPool();
  },
};
