import { createClient, type Client, type InStatement } from "@libsql/client";
import path from "node:path";

function createDbClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    // Pendant le build Next.js (multi-workers concurrents) ou si désactivé explicitement : connexion directe
    if (process.env.TURSO_DISABLE_REPLICA || process.env.NEXT_PHASE === "phase-production-build") {
      return createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
    }

    try {
      // Mode Réplique locale embarquée (Embedded Replica) :
      // Les requêtes SELECT tournent en local en < 1ms, tandis que les écritures
      // sont transmises à Turso Cloud et synchronisées avec le fichier local.
      const replicaPath =
        process.env.ARIANE_REPLICA_DB ?? path.join(process.cwd(), "data", "ariane-replica.db");

      return createClient({
        url: `file:${replicaPath}`,
        syncUrl: tursoUrl,
        authToken: tursoToken,
      });
    } catch (e) {
      console.warn("[Turso] Embedded replica indisponible, fallback direct vers Turso Cloud:", e);
      return createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
    }
  }

  // Fallback local file pur
  const localPath = process.env.ARIANE_DB ?? path.join(process.cwd(), "data", "ariane.db");
  return createClient({
    url: `file:${localPath}`,
  });
}

// Conserver l'instance unique pendant le rechargement à chaud (Hot Module Replacement)
const globalForDb = globalThis as unknown as { __arianeClient?: Client };
export const db = globalForDb.__arianeClient ?? createDbClient();
if (process.env.NODE_ENV !== "production") globalForDb.__arianeClient = db;

let isSynced = false;
let syncPromise: Promise<void> | null = null;

export async function syncDb(): Promise<void> {
  const client = db as Client & { sync?: () => Promise<void> };
  if (typeof client.sync === "function") {
    try {
      await client.sync();
      isSynced = true;
    } catch (err) {
      console.warn("[Turso] Avertissement de synchronisation de la réplique:", err);
    }
  }
}

export async function ensureSynced(): Promise<void> {
  if (isSynced) return;
  const client = db as Client & { sync?: () => Promise<void> };
  if (typeof client.sync !== "function") {
    isSynced = true;
    return;
  }
  if (!syncPromise) {
    syncPromise = syncDb().finally(() => {
      syncPromise = null;
    });
  }
  await syncPromise;
}

export async function queryAll<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  await ensureSynced();
  const res = await db.execute({ sql, args: args as never[] });
  // Normalisation en objets JS purs pour éviter l'erreur RSC
  // "Only plain objects can be passed to Client Components from Server Components"
  return res.rows.map((row) => ({ ...row })) as unknown as T[];
}

export async function queryOne<T>(sql: string, args: unknown[] = []): Promise<T | null> {
  await ensureSynced();
  const res = await db.execute({ sql, args: args as never[] });
  return res.rows[0] ? ({ ...res.rows[0] } as unknown as T) : null;
}

export async function execute(
  sql: string,
  args: unknown[] = [],
): Promise<{ lastInsertRowid: number | null; rowsAffected: number }> {
  await ensureSynced();
  const res = await db.execute({ sql, args: args as never[] });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null,
    rowsAffected: res.rowsAffected,
  };
}

export async function batch(statements: InStatement[]): Promise<void> {
  await ensureSynced();
  await db.batch(statements, "write");
}

/**
 * Checkpoint / synchronisation WAL : synchronise la réplique locale avec Turso.
 */
export async function checkpointDb() {
  await syncDb();
}
