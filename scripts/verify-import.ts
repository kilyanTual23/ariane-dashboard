/**
 * Compare la complétion calculée par l'application au pourcentage que Notion
 * affichait pour chaque ligne du CSV. Sert de garde-fou après un import.
 *
 *   npm run verify -- "chemin/export_all.csv" --profil "Famille Tual"
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { db } from "../src/lib/db";
import { listPersons } from "../src/lib/queries";

type Row = Record<string, string>;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const profileName = args[args.indexOf("--profil") + 1] ?? "Famille Tual";

if (!file || !fs.existsSync(file)) {
  console.error("Fichier CSV introuvable.");
  process.exit(1);
}

const rows = parse(fs.readFileSync(path.resolve(file)), {
  columns: true,
  bom: true,
  skip_empty_lines: true,
  relax_column_count: true,
}) as Row[];

const profile = db.prepare(`SELECT * FROM profiles WHERE name = ?`).get(profileName) as
  | { id: number }
  | undefined;
if (!profile) {
  console.error(`Profil « ${profileName} » introuvable.`);
  process.exit(1);
}

const persons = listPersons(profile.id);
const byName = new Map<string, typeof persons>();
for (const p of persons) {
  const list = byName.get(p.displayName);
  if (list) list.push(p);
  else byName.set(p.displayName, [p]);
}

let ok = 0;
const mismatches: string[] = [];
const missingRows: string[] = [];

for (const row of rows) {
  const name = (row["Nom"] ?? "").trim();
  const expected = Number((row["Complétion"] ?? "").replace(/[^\d]/g, ""));
  const candidates = byName.get(name);
  if (!candidates?.length) {
    missingRows.push(name);
    continue;
  }
  const match = candidates.find((p) => p.completion.percent === expected) ?? candidates[0];
  if (match.completion.percent === expected) {
    ok++;
    candidates.splice(candidates.indexOf(match), 1);
  } else {
    mismatches.push(
      `${name.padEnd(46)} Notion ${String(expected).padStart(3)} %  ≠  app ${String(
        match.completion.percent,
      ).padStart(3)} %   manque : ${match.completion.missing.join(", ")}`,
    );
  }
}

console.log(`${ok}/${rows.length} fiches avec la même complétion que Notion.`);
if (missingRows.length) console.log(`Introuvables en base : ${missingRows.join(" | ")}`);
if (mismatches.length) {
  console.log(`\n${mismatches.length} écart(s) :`);
  for (const m of mismatches) console.log("  " + m);
}
