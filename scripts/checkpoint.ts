import Database from "better-sqlite3";
import path from "node:path";

const dbPath = process.env.ARIANE_DB ?? path.join(process.cwd(), "data", "ariane.db");
const db = new Database(dbPath);
const res = db.pragma("wal_checkpoint(TRUNCATE)");
console.log("✓ Base de données consolidée avec succès (WAL vidé dans data/ariane.db) :", res);
db.close();
