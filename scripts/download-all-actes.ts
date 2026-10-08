import fs from "node:fs";
import { createClient } from "@libsql/client";
import path from "node:path";
import { downloadAct, hasLocalAct, type ActTarget } from "../src/lib/act-downloader";

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

async function main() {
  console.log("==================================================");
  console.log("   Ariane — Téléchargement des actes d'archives   ");
  console.log("==================================================\n");

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const replicaPath = path.join(process.cwd(), "data", "ariane-replica.db");

  const client = createClient(
    tursoUrl
      ? { url: `file:${replicaPath}`, syncUrl: tursoUrl, authToken: tursoToken }
      : { url: `file:${path.join(process.cwd(), "data", "ariane.db")}` },
  );

  const [personsRes, unionsRes] = await Promise.all([
    client.execute(
      "SELECT id, given_names, surname, birth_year, death_year, birth_source, death_source FROM persons",
    ),
    client.execute("SELECT id, year, source FROM unions"),
  ]);

  type ItemToDownload = {
    target: ActTarget;
    label: string;
    url: string;
  };

  const items: ItemToDownload[] = [];

  for (const row of personsRes.rows) {
    const id = Number(row.id);
    const name = `${row.given_names ?? ""} ${row.surname ?? ""}`.trim() || `Personne #${id}`;
    if (row.birth_source && typeof row.birth_source === "string" && row.birth_source.startsWith("http")) {
      items.push({
        target: { kind: "person", personId: id, actKind: "birth" },
        label: `${name} — Naissance (${row.birth_year ?? "?"})`,
        url: row.birth_source,
      });
    }
    if (row.death_source && typeof row.death_source === "string" && row.death_source.startsWith("http")) {
      items.push({
        target: { kind: "person", personId: id, actKind: "death" },
        label: `${name} — Décès (${row.death_year ?? "?"})`,
        url: row.death_source,
      });
    }
  }

  for (const row of unionsRes.rows) {
    const id = Number(row.id);
    if (row.source && typeof row.source === "string" && row.source.startsWith("http")) {
      items.push({
        target: { kind: "union", unionId: id },
        label: `Mariage #${id} (${row.year ?? "?"})`,
        url: row.source,
      });
    }
  }

  console.log(`📋 Total d'actes trouvés dans la base : ${items.length}\n`);

  let downloaded = 0;
  let alreadyPresent = 0;
  let failed = 0;
  const failedList: { label: string; url: string; error: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `[${i + 1}/${items.length}]`;

    if (hasLocalAct(item.target)) {
      console.log(`${prefix} ⏭️  Déjà présent : ${item.label}`);
      alreadyPresent++;
      continue;
    }

    process.stdout.write(`${prefix} ⏳ Téléchargement : ${item.label}... `);

    const result = await downloadAct(item.url, item.target);

    if (result.ok) {
      const sizeMb = ((result.size ?? 0) / 1024 / 1024).toFixed(2);
      console.log(`✅ OK (${sizeMb} Mo)`);
      downloaded++;
    } else {
      console.log(`❌ Échec (${result.error})`);
      failed++;
      failedList.push({ label: item.label, url: item.url, error: result.error ?? "Inconnu" });
    }

    // Petite pause de 300ms pour être courtois avec les serveurs d'archives
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n==================================================");
  console.log("                   Bilan final                   ");
  console.log("==================================================");
  console.log(`✅ Nouveaux actes téléchargés : ${downloaded}`);
  console.log(`⏭️  Actes déjà en stock local  : ${alreadyPresent}`);
  console.log(`❌ Actes non récupérables    : ${failed}`);

  if (failedList.length > 0) {
    console.log("\nDétail des actes non téléchargeables automatiquement (liens externes protégés ou spécifiques) :");
    for (const f of failedList) {
      console.log(` - ${f.label} (${f.error})\n   URL : ${f.url}`);
    }
  }

  console.log("\nLes images sont stockées en sécurité dans le dossier local : data/actes/");
}

main().catch(console.error);
