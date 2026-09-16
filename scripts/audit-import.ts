/**
 * Contrôle d'intégrité d'un profil importé : références du CSV qui n'ont pas
 * trouvé preneur, et morceaux d'arbre qui ne se rejoignent pas.
 *
 *   npm run audit -- "chemin/export_all.csv" --profil "Famille Tual"
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

const profile = db.prepare(`SELECT * FROM profiles WHERE name = ?`).get(profileName) as
  | { id: number }
  | undefined;
if (!profile) {
  console.error(`Profil « ${profileName} » introuvable.`);
  process.exit(1);
}

const persons = listPersons(profile.id);
const byId = new Map(persons.map((p) => [p.id, p]));
const byNotion = new Map(persons.filter((p) => p.notion_id).map((p) => [p.notion_id!, p]));

/* ------------------------------------------------- 1. fidélité au CSV */

if (file && fs.existsSync(file)) {
  const rows = parse(fs.readFileSync(path.resolve(file)), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Row[];

  const refRe = /\((https?:\/\/[^)\s]*)\)/g;
  const namedRefs = (cell?: string) => {
    const out: { name: string; id: string }[] = [];
    if (!cell) return out;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(cell)) !== null) {
      const name = cell.slice(cursor, m.index).replace(/^[\s,]+|[\s,]+$/g, "");
      const id = m[1].match(/([0-9a-f]{32})/)?.[1];
      if (name && id) out.push({ name, id });
      cursor = refRe.lastIndex;
    }
    refRe.lastIndex = 0;
    return out;
  };

  const dangling: string[] = [];
  let expectedLinks = 0;

  for (const row of rows) {
    const self = (row["Nom"] ?? "").trim();
    for (const col of ["Parents", "Enfant"]) {
      for (const ref of namedRefs(row[col])) {
        expectedLinks++;
        if (!byNotion.has(ref.id)) dangling.push(`${self} → ${col} « ${ref.name} » (${ref.id})`);
      }
    }
  }

  console.log(`CSV : ${rows.length} lignes · base : ${persons.length} cartes`);
  console.log(`Références de parenté dans le CSV : ${expectedLinks}`);
  console.log(
    dangling.length
      ? `⚠ ${dangling.length} référence(s) sans destinataire :\n  ` + dangling.join("\n  ")
      : "✓ toutes les références de parenté ont trouvé leur carte",
  );
} else {
  console.log("(CSV non fourni : contrôle limité à la base)");
}

/* --------------------------------- 2. morceaux d'arbre non reliés */

const neighbours = new Map<number, Set<number>>();
const connect = (a: number, b: number) => {
  if (!neighbours.has(a)) neighbours.set(a, new Set());
  if (!neighbours.has(b)) neighbours.set(b, new Set());
  neighbours.get(a)!.add(b);
  neighbours.get(b)!.add(a);
};
for (const p of persons) {
  if (!neighbours.has(p.id)) neighbours.set(p.id, new Set());
  for (const parent of p.parents) connect(p.id, parent.id);
  for (const child of p.children) connect(p.id, child.id);
  for (const u of p.unions) if (u.spouse) connect(p.id, u.spouse.id);
}

const seen = new Set<number>();
const components: number[][] = [];
for (const p of persons) {
  if (seen.has(p.id)) continue;
  const stack = [p.id];
  const group: number[] = [];
  seen.add(p.id);
  while (stack.length) {
    const id = stack.pop()!;
    group.push(id);
    for (const n of neighbours.get(id) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  components.push(group);
}
components.sort((a, b) => b.length - a.length);

console.log(`\nMorceaux d'arbre : ${components.length}`);
for (const group of components) {
  const names = group
    .map((id) => byId.get(id)!)
    .sort((a, b) => (a.birth_year ?? 9999) - (b.birth_year ?? 9999));
  const head = names.slice(0, 6).map((p) => `${p.displayName} ${p.birth_year ?? "?"}`);
  console.log(
    `  ${String(group.length).padStart(3)} carte(s) — ${head.join(" · ")}${
      names.length > 6 ? ` … +${names.length - 6}` : ""
    }`,
  );
}

/* ------------------------------------------- 3. focus sur un patronyme */

const surname = args[args.indexOf("--nom") + 1];
if (args.includes("--nom") && surname) {
  console.log(`\nPatronyme « ${surname} » :`);
  for (const p of persons.filter((x) => x.surname.toUpperCase().includes(surname.toUpperCase()))) {
    console.log(
      `  ${p.displayName} (${p.birth_year ?? "?"}) — parents: ${
        p.parents.map((r) => r.displayName).join(", ") || "aucun"
      } | enfants: ${p.children.map((r) => r.displayName).join(", ") || "aucun"} | conjoint: ${
        p.unions.map((u) => u.spouse?.displayName ?? "?").join(", ") || "aucun"
      }`,
    );
  }
}
