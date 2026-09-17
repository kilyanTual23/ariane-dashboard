import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

// Charger .env.local manuellement si process.env n'a pas encore été injecté
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  }
}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error("❌ ERREUR: TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN manquant dans .env.local");
  process.exit(1);
}

console.log("🚀 Connexion à Turso sur :", tursoUrl);
const turso = createClient({ url: tursoUrl, authToken: tursoToken });

const localDbPath = path.join(process.cwd(), "data", "ariane.db");
const local = new Database(localDbPath);

async function run() {
  // 1. Tester la connexion
  await turso.execute("SELECT 1");
  console.log("✓ Connexion Turso réussie !");

  // 2. Créer le schéma dans Turso
  console.log("📦 Application du schéma SQL...");
  const schemaSql = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8");
  
  // Exécuter chaque instruction du schéma (séparées par des points-virgules)
  const statements = schemaSql
    .split(";")
    .map((s) => s.replace(/^(\s*--[^\n]*\n)+/g, "").trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log("  Executing:", stmt.slice(0, 50).replace(/\n/g, " ") + "...");
    await turso.execute(stmt);
  }
  console.log("✓ Schéma appliqué avec succès sur Turso !");

  // 3. Liste des tables à transférer dans l'ordre des dépendances
  const tables = [
    "profiles",
    "persons",
    "unions",
    "parent_child",
    "tasks",
    "sources",
    "resources",
  ];

  console.log("🚚 Copie des données vers Turso...");

  for (const table of tables) {
    const rows = local.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    console.log(`  - Table ${table}: ${rows.length} lignes à transférer`);

    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => "?").join(", ");
    const insertSql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;

    // Envoyer par lots de 50
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const batchStatements = chunk.map((r) => ({
        sql: insertSql,
        args: cols.map((col) => r[col] ?? null) as never[],
      }));
      await turso.batch(batchStatements, "write");
    }
  }

  // 4. Vérification finale
  console.log("\n🔍 Vérification des décomptes dans Turso :");
  for (const table of tables) {
    const localCount = (local.prepare(`SELECT count(*) as c FROM ${table}`).get() as { c: number }).c;
    const tursoCount = (await turso.execute(`SELECT count(*) as c FROM ${table}`)).rows[0].c;
    const match = localCount === Number(tursoCount);
    console.log(`  ${match ? "✅" : "⚠️"} ${table.padEnd(15)}: local = ${localCount}, Turso = ${tursoCount}`);
  }

  console.log("\n🎉 Migration vers Turso terminée avec succès !");
}

run().catch((err) => {
  console.error("❌ Erreur pendant la migration :", err);
  process.exit(1);
});
