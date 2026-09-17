import { createClient, type Client, type InStatement } from "@libsql/client";
import path from "node:path";

function createDbClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    return createClient({
      url: tursoUrl,
      authToken: tursoToken,
    });
  }

  // Fallback local file
  const localPath = process.env.ARIANE_DB ?? path.join(process.cwd(), "data", "ariane.db");
  return createClient({
    url: `file:${localPath}`,
  });
}

// Conserver l'instance unique pendant le rechargement à chaud (Hot Module Replacement)
const globalForDb = globalThis as unknown as { __arianeClient?: Client };
export const db = globalForDb.__arianeClient ?? createDbClient();
if (process.env.NODE_ENV !== "production") globalForDb.__arianeClient = db;

export async function queryAll<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const res = await db.execute({ sql, args: args as never[] });
  return res.rows as unknown as T[];
}

export async function queryOne<T>(sql: string, args: unknown[] = []): Promise<T | null> {
  const res = await db.execute({ sql, args: args as never[] });
  return (res.rows[0] as unknown as T) ?? null;
}

export async function execute(
  sql: string,
  args: unknown[] = [],
): Promise<{ lastInsertRowid: number | null; rowsAffected: number }> {
  const res = await db.execute({ sql, args: args as never[] });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null,
    rowsAffected: res.rowsAffected,
  };
}

export async function batch(statements: InStatement[]): Promise<void> {
  await db.batch(statements, "write");
}

/**
 * Checkpoint WAL : sur Turso Cloud, chaque requête d'écriture est persistée
 * directement et immédiatement dans le cloud, cette fonction est conservée pour
 * rétrocompatibilité d'appel.
 */
export function checkpointDb() {}
