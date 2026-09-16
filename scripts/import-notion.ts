/**
 * Import d'un export CSV de la base Notion « Généalogie » vers un profil du dashboard.
 *
 *   npm run import -- "chemin/vers/export_all.csv" --profil "Famille Tual"
 *   (option --remplacer pour écraser un profil du même nom)
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { db } from "../src/lib/db";
import { normalizePlace, parseDateInput } from "../src/lib/dates";
import { inferSex, splitName } from "../src/lib/names";
import { STATUSES, type Kinship, type Status } from "../src/lib/types";
import { createProfile, deleteProfile, recomputeSosa } from "../src/lib/queries";

type Row = Record<string, string>;

const NOTION_ID = /([0-9a-f]{32})/g;

function ids(cell?: string): string[] {
  if (!cell) return [];
  return [...cell.matchAll(NOTION_ID)].map((m) => m[1]);
}

/**
 * « Nom Prénom (https://app.notion.com/p/Slug-<id>?pvs=21) » → [{ name, id }]
 * Le nom peut lui-même contenir des parenthèses — « Marie FARGES (1) »,
 * « Julien MALLE (fils) » — donc on repère l'URL puis on prend le texte devant.
 */
function namedRefs(cell?: string): { name: string; id: string }[] {
  if (!cell) return [];
  const out: { name: string; id: string }[] = [];
  const re = /\((https?:\/\/[^)\s]*)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cell)) !== null) {
    const name = cell.slice(cursor, match.index).replace(/^[\s,]+|[\s,]+$/g, "");
    const id = match[1].match(/([0-9a-f]{32})/)?.[1];
    if (name && id) out.push({ name, id });
    cursor = re.lastIndex;
  }
  return out;
}

function clean(v?: string): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function toYear(v?: string): number | null {
  const m = (v ?? "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Le vocabulaire Notion (cinq états) vers les quatre du dashboard. */
const STATUS_FROM_NOTION: Record<string, Status> = {
  "À définir": "Pas commencé",
  "À rechercher": "Pas commencé",
  "En recherche": "En recherche",
  "Bloqué / Stoppé": "Bloqué",
  Complet: "Complet",
};

function toStatus(v?: string): Status {
  const s = (v ?? "").trim();
  if (STATUS_FROM_NOTION[s]) return STATUS_FROM_NOTION[s];
  return (STATUSES as readonly string[]).includes(s) ? (s as Status) : "Pas commencé";
}

function toKinship(v?: string): Kinship | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("SOSA")) return "SOSA";
  if (s.startsWith("Collat")) return "Collatéral";
  if (s.startsWith("Pas de lien")) return "Pas de lien de parenté";
  return "Inconnu";
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const profileName = valueOf("--profil") ?? "Import Notion";
  const replace = args.includes("--remplacer");

  function valueOf(flag: string) {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  }

  if (!file || !fs.existsSync(file)) {
    console.error("Fichier CSV introuvable. Usage : npm run import -- <fichier.csv> --profil \"Nom\"");
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(path.resolve(file)), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Row[];

  console.log(`Lecture de ${rows.length} lignes.`);

  // 1. Carte « id Notion → nom », reconstruite depuis toutes les colonnes relationnelles.
  const nameById = new Map<string, string>();
  for (const row of rows) {
    for (const col of ["Parents", "Enfant", "TEMP1 Relation", "TEMP2 Relation"]) {
      for (const ref of namedRefs(row[col])) nameById.set(ref.id, ref.name);
    }
  }
  const idsByName = new Map<string, string[]>();
  for (const [id, name] of nameById) {
    const list = idsByName.get(name);
    if (list) list.push(id);
    else idsByName.set(name, [id]);
  }

  // 2. Identifiant propre de chaque ligne (les homonymes sont départagés par
  //    les colonnes Mariage / Fratrie, qui contiennent la personne elle-même).
  const used = new Set<string>();
  const selfIds: string[] = rows.map((row, index) => {
    const name = (row["Nom"] ?? "").trim();
    const candidates = (idsByName.get(name) ?? []).filter((c) => !used.has(c));
    let chosen: string | undefined;

    if (candidates.length === 1) {
      chosen = candidates[0];
    } else if (candidates.length > 1) {
      // Homonymes : la personne figure dans ses propres colonnes Mariage/Fratrie.
      const own = new Set([...ids(row["Mariage"]), ...ids(row["Fratrie"])]);
      chosen = candidates.find((c) => own.has(c));
    }

    if (!chosen) {
      // Jamais citée ailleurs : on ne garde un id que s'il n'appartient à personne d'autre.
      chosen = [...ids(row["Fratrie"]), ...ids(row["Mariage"])].find(
        (id) => !used.has(id) && (nameById.get(id) ?? name) === name,
      );
    }

    chosen ??= `ligne-${index}`;
    used.add(chosen);
    return chosen;
  });

  // 3. Profil
  const existing = db.prepare(`SELECT * FROM profiles WHERE name = ?`).get(profileName) as
    | { id: number }
    | undefined;
  if (existing) {
    if (!replace) {
      console.error(`Le profil « ${profileName} » existe déjà. Ajoute --remplacer pour l'écraser.`);
      process.exit(1);
    }
    deleteProfile(existing.id);
  }
  const profile = createProfile(
    profileName,
    "Importé depuis la base Notion « Généalogie ».",
  );

  // 4. Personnes
  const insertPerson = db.prepare(
    `INSERT INTO persons (profile_id, given_names, surname, sex, kinship, status, occupation,
       birth_date_raw, birth_date_iso, birth_year, birth_year_estimated, birth_place, birth_source,
       death_date_raw, death_date_iso, death_year, death_place, death_source,
       proximity_year, notion_id)
     VALUES (@profile_id, @given_names, @surname, @sex, @kinship, @status, @occupation,
       @birth_date_raw, @birth_date_iso, @birth_year, @birth_year_estimated, @birth_place, @birth_source,
       @death_date_raw, @death_date_iso, @death_year, @death_place, @death_source,
       @proximity_year, @notion_id)`,
  );

  const idByNotion = new Map<string, number>();
  const marriageInfo = new Map<number, Row>();

  const insertAll = db.transaction(() => {
    rows.forEach((row, index) => {
      const fullName = (row["Nom"] ?? "").trim();
      const { given_names, surname } = splitName(fullName);
      const birth = parseDateInput(row["Date de naissance"]);
      const death = parseDateInput(row["Date de décès"]);
      const estimatedBirth = toYear(row["Année de naissance"]);

      const info = insertPerson.run({
        profile_id: profile.id,
        given_names,
        surname,
        sex: inferSex(given_names),
        kinship: toKinship(row["Type"]),
        status: toStatus(row["État"]),
        occupation: clean(row["Métier"]),
        birth_date_raw: birth.canonical,
        birth_date_iso: birth.iso,
        birth_year: birth.year ?? estimatedBirth,
        birth_year_estimated: birth.year ? 0 : estimatedBirth ? 1 : 0,
        birth_place: normalizePlace(row["Lieu de naissance"]),
        birth_source: clean(row["Acte de naissance"]),
        death_date_raw: death.canonical,
        death_date_iso: death.iso,
        death_year: death.year,
        death_place: normalizePlace(row["Lieu de décès"]),
        death_source: clean(row["Acte de décès"]),
        proximity_year: toYear(row["Année de proximité"]),
        notion_id: selfIds[index],
      });
      const personId = Number(info.lastInsertRowid);
      idByNotion.set(selfIds[index], personId);
      marriageInfo.set(personId, row);
    });
  });
  insertAll();
  console.log(`${idByNotion.size} personnes créées.`);

  // 5. Filiations
  const linkParent = db.prepare(
    `INSERT OR IGNORE INTO parent_child (parent_id, child_id) VALUES (?, ?)`,
  );
  let links = 0;
  const linkAll = db.transaction(() => {
    rows.forEach((row, index) => {
      const childId = idByNotion.get(selfIds[index]);
      if (!childId) return;
      for (const ref of namedRefs(row["Parents"])) {
        const parentId = idByNotion.get(ref.id);
        if (parentId && parentId !== childId) {
          // INSERT OR IGNORE : on ne compte que les liens réellement créés,
          // puisque « Parents » et « Enfant » décrivent souvent la même arête.
          links += linkParent.run(parentId, childId).changes;
        }
      }
      for (const ref of namedRefs(row["Enfant"])) {
        const kidId = idByNotion.get(ref.id);
        if (kidId && kidId !== childId) {
          links += linkParent.run(childId, kidId).changes;
        }
      }
    });
  });
  linkAll();
  console.log(`${links} liens de filiation créés.`);

  // 6. Unions : une par couple, les deux conjoints apportant leurs infos d'acte.
  type Pending = {
    a: number;
    b: number;
    date_raw: string | null;
    date_iso: string | null;
    year: number | null;
    place: string | null;
    source: string | null;
  };
  const pending = new Map<string, Pending>();

  const addUnion = (a: number, b: number, row?: Row) => {
    if (!a || !b || a === b) return;
    const key = [a, b].sort((x, y) => x - y).join("-");
    const marriage = parseDateInput(row?.["Date de mariage"]);
    const current = pending.get(key) ?? {
      a,
      b,
      date_raw: null,
      date_iso: null,
      year: null,
      place: null,
      source: null,
    };
    pending.set(key, {
      ...current,
      date_raw: current.date_raw ?? marriage.canonical,
      date_iso: current.date_iso ?? marriage.iso,
      year: current.year ?? marriage.year,
      place: current.place ?? normalizePlace(row?.["Lieu de mariage"]),
      source: current.source ?? clean(row?.["Acte de mariage"]),
    });
  };

  rows.forEach((row, index) => {
    const selfId = idByNotion.get(selfIds[index]);
    if (!selfId) return;
    for (const other of ids(row["Mariage"])) {
      const otherId = idByNotion.get(other);
      if (otherId) addUnion(selfId, otherId, row);
    }
    // Conjoints sans acte de mariage (colonnes temporaires de la base Notion)
    for (const col of ["TEMP1 Relation", "TEMP2 Relation"]) {
      for (const ref of namedRefs(row[col])) {
        const otherId = idByNotion.get(ref.id);
        if (otherId) addUnion(selfId, otherId, row);
      }
    }
  });

  const insertUnion = db.prepare(
    `INSERT INTO unions (profile_id, partner1_id, partner2_id, date_raw, date_iso, year, place, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const unionAll = db.transaction(() => {
    for (const u of pending.values()) {
      insertUnion.run(profile.id, u.a, u.b, u.date_raw, u.date_iso, u.year, u.place, u.source);
    }
  });
  unionAll();

  /* Certaines lignes Notion portent une date, un lieu et un acte de mariage sans
     que les deux conjoints soient reliés entre eux. On rapproche alors les
     personnes qui partagent la même date et le même lieu ; celles qui restent
     seules gardent leur mariage avec un conjoint inconnu, pour ne rien perdre. */
  const paired = new Set<number>();
  for (const u of pending.values()) {
    paired.add(u.a);
    paired.add(u.b);
  }

  const orphans = new Map<string, { personId: number; row: Row }[]>();
  rows.forEach((row, index) => {
    const personId = idByNotion.get(selfIds[index]);
    if (!personId || paired.has(personId)) return;
    const date = clean(row["Date de mariage"]);
    const place = clean(row["Lieu de mariage"]);
    const source = clean(row["Acte de mariage"]);
    if (!date && !place && !source) return;
    const key = `${date ?? ""}|${(place ?? "").toLowerCase()}`;
    const list = orphans.get(key);
    if (list) list.push({ personId, row });
    else orphans.set(key, [{ personId, row }]);
  });

  let recovered = 0;
  let solo = 0;
  const orphanAll = db.transaction(() => {
    for (const [key, group] of orphans) {
      const [date] = key.split("|");
      const parsed = parseDateInput(date);
      const first = group[0].row;
      const place = clean(first["Lieu de mariage"]);
      const source = clean(first["Acte de mariage"]);

      if (group.length === 2 && date) {
        insertUnion.run(
          profile.id,
          group[0].personId,
          group[1].personId,
          date,
          parsed.iso,
          parsed.year,
          place,
          source,
        );
        recovered++;
        continue;
      }
      for (const member of group) {
        insertUnion.run(
          profile.id,
          member.personId,
          null,
          clean(member.row["Date de mariage"]),
          parseDateInput(member.row["Date de mariage"]).iso,
          parseDateInput(member.row["Date de mariage"]).year,
          clean(member.row["Lieu de mariage"]),
          clean(member.row["Acte de mariage"]),
        );
        solo++;
      }
    }
  });
  orphanAll();

  console.log(
    `${pending.size} unions issues des relations, ${recovered} couples reconstitués ` +
      `par date et lieu, ${solo} mariages conservés sans conjoint identifié.`,
  );

  // 7. Liens d'archives utiles (repris des notes Notion)
  const resources: [string, string, string][] = [
    ["Archives d'Ille-et-Vilaine", "https://archives-en-ligne.ille-et-vilaine.fr/thot_internet/FrmSommaireFrame.asp", "Archives départementales"],
    ["Archives de la Mayenne", "https://archives.lamayenne.fr/archives-en-ligne/etat-civil-search-form.html", "Archives départementales"],
    ["Archives de la Corrèze", "https://www.archives.correze.fr/search/form/3b1ba8cc-6c08-47cd-a90e-f9b231fdc30f", "Archives départementales"],
    ["Archives de Seine-Maritime", "https://www.archivesdepartementales76.net/", "Archives départementales"],
    ["Fichier des décès Insee", "https://arbre.app/insee", "Outil"],
    ["Convertisseur calendrier républicain", "https://genea.kilyantual.com/", "Outil"],
  ];
  const insertResource = db.prepare(
    `INSERT INTO resources (profile_id, label, url, category) VALUES (?, ?, ?, ?)`,
  );
  for (const [label, url, category] of resources) {
    insertResource.run(profile.id, label, url, category);
  }

  recomputeSosa(profile.id);

  console.log(`\nProfil « ${profile.name} » prêt : /p/${profile.slug}`);
}

main();
