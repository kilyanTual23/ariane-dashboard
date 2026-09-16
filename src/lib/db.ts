import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.ARIANE_DB ?? path.join(process.cwd(), "data", "ariane.db");

function create(): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "schema.sql"),
    "utf8",
  );
  db.exec(schema);
  ensureColumns(db);
  return db;
}

/**
 * Les tables existantes ne sont pas recréées par `CREATE TABLE IF NOT EXISTS` :
 * on ajoute donc à la main les colonnes apparues après coup.
 */
function ensureColumns(db: Database.Database) {
  const additions: [table: string, column: string, type: string][] = [
    ["persons", "geneanet_at", "TEXT"],
  ];
  for (const [table, column, type] of additions) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// Une seule connexion, conservée entre les rechargements à chaud du dev server.
const globalForDb = globalThis as unknown as { __arianeDb?: Database.Database };
export const db = globalForDb.__arianeDb ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.__arianeDb = db;
