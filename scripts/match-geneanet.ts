/**
 * Confronte un export GEDCOM (Geneanet, MyHeritage…) au profil Ariane, et
 * n'archive que les cartes dont les *données* figurent bien dans l'arbre publié
 * — pas seulement le nom.
 *
 *   npm run geneanet -- "chemin/export.ged" --profil "Famille Tual"
 *   npm run geneanet -- "chemin/export.ged" --profil "Famille Tual" --appliquer
 */
import fs from "node:fs";
import path from "node:path";

import { db } from "../src/lib/db";
import { listPersons, updatePerson } from "../src/lib/queries";
import type { Person } from "../src/lib/types";

/* ------------------------------------------------------------ lecture GEDCOM */

type Event = { year: number | null; iso: string | null; place: string | null };
type Indi = {
  id: string;
  given: string;
  surname: string;
  sex: string | null;
  birth: Event;
  death: Event;
  fams: string[];
  famc: string[];
  marriage: Event;
};
type Fam = { id: string; husb: string | null; wife: string | null; marr: Event };

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const EMPTY: Event = { year: null, iso: null, place: null };

function parseGedDate(value?: string | null): { year: number | null; iso: string | null } {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return { year: null, iso: null };
  const full = raw.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/);
  if (full && MONTHS[full[2]]) {
    const [d, m, y] = [Number(full[1]), MONTHS[full[2]], Number(full[3])];
    return { year: y, iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
  }
  const year = raw.match(/(\d{4})/);
  return { year: year ? Number(year[1]) : null, iso: null };
}

function parseGedcom(text: string) {
  const individuals = new Map<string, Indi>();
  const families = new Map<string, Fam>();

  let indi: Indi | null = null;
  let fam: Fam | null = null;
  let section: "BIRT" | "DEAT" | "MARR" | null = null;

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const [, levelRaw, xref, tag, value] = m;
    const level = Number(levelRaw);

    if (level === 0) {
      indi = null;
      fam = null;
      section = null;
      if (tag === "INDI" && xref) {
        indi = {
          id: xref,
          given: "",
          surname: "",
          sex: null,
          birth: { ...EMPTY },
          death: { ...EMPTY },
          fams: [],
          famc: [],
          marriage: { ...EMPTY },
        };
        individuals.set(xref, indi);
      } else if (tag === "FAM" && xref) {
        fam = { id: xref, husb: null, wife: null, marr: { ...EMPTY } };
        families.set(xref, fam);
      }
      continue;
    }

    if (indi) {
      if (level === 1) {
        section = tag === "BIRT" || tag === "DEAT" ? tag : null;
        if (tag === "NAME" && value) {
          const parts = value.match(/^(.*?)\s*\/(.*?)\/\s*$/);
          if (parts) {
            if (!indi.given) indi.given = parts[1].trim();
            if (!indi.surname) indi.surname = parts[2].trim();
          } else if (!indi.given) {
            indi.given = value.trim();
          }
        }
        if (tag === "GIVN" && value) indi.given = value.trim();
        if (tag === "SURN" && value) indi.surname = value.trim();
        if (tag === "SEX" && value) indi.sex = value.trim();
        if (tag === "FAMS" && value) indi.fams.push(value.trim());
        if (tag === "FAMC" && value) indi.famc.push(value.trim());
      } else if (level === 2 && section) {
        const target = section === "BIRT" ? indi.birth : indi.death;
        if (tag === "DATE") {
          const d = parseGedDate(value);
          target.year = d.year;
          target.iso = d.iso;
        }
        if (tag === "PLAC" && value) target.place = value.trim();
      } else if (level === 2 && tag === "GIVN" && value) {
        indi.given = value.trim();
      } else if (level === 2 && tag === "SURN" && value) {
        indi.surname = value.trim();
      }
      continue;
    }

    if (fam) {
      if (level === 1) {
        section = tag === "MARR" ? "MARR" : null;
        if (tag === "HUSB" && value) fam.husb = value.trim();
        if (tag === "WIFE" && value) fam.wife = value.trim();
      } else if (level === 2 && section === "MARR") {
        if (tag === "DATE") {
          const d = parseGedDate(value);
          fam.marr.year = d.year;
          fam.marr.iso = d.iso;
        }
        if (tag === "PLAC" && value) fam.marr.place = value.trim();
      }
    }
  }

  // Le mariage d'un individu : le premier de ses foyers qui porte une date ou un lieu.
  for (const person of individuals.values()) {
    for (const famId of person.fams) {
      const f = families.get(famId);
      if (f && (f.marr.year || f.marr.place)) {
        person.marriage = f.marr;
        break;
      }
    }
  }

  return { individuals: [...individuals.values()], families };
}

/* ------------------------------------------------------ comparaison de valeurs */

const strip = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* Les deux sources n'écrivent pas les lieux pareil : « Lieu-dit La Renardière,
   35133 Billé, France » et « Billé, Ille-Et-Vilaine, Bretagne, France » désignent
   la même commune. On compare donc les segments porteurs de sens, en écartant
   pays, régions et départements. */
const GENERIC = new Set([
  "france", "brittany", "bretagne", "normandie", "pays de la loire", "nouvelle aquitaine",
  "ile de france", "centre val de loire", "occitanie", "auvergne rhone alpes", "grand est",
  "hauts de france", "provence alpes cote d azur", "bourgogne franche comte", "corse",
  "ille et vilaine", "mayenne", "correze", "seine maritime", "manche", "orne",
  "loire atlantique", "morbihan", "cotes d armor", "finistere", "maine et loire", "sarthe",
  "calvados", "eure", "eure et loir", "vendee", "deux sevres", "haute vienne", "creuse",
]);

function placeKeys(place?: string | null): string[] {
  const keys = new Set<string>();
  for (const rawSegment of (place ?? "").split(",")) {
    let segment = rawSegment.trim();
    if (!segment) continue;

    // « (Luitré) Luitré-Dompierre » : les deux formes comptent.
    const parenthesised = segment.match(/^\(([^)]+)\)\s*(.*)$/);
    if (parenthesised) {
      const inner = strip(parenthesised[1]);
      if (inner && !GENERIC.has(inner)) keys.add(inner);
      segment = parenthesised[2];
    }

    // Un code postal en tête ne sert qu'à introduire la commune.
    segment = segment.replace(/^\d{4,5}\s+/, "");
    const key = strip(segment);
    if (!key || GENERIC.has(key) || /^\d+$/.test(key)) continue;
    keys.add(key);
  }
  return [...keys];
}

function sameYear(a: number | null, b: number | null) {
  return a != null && b != null && a === b;
}

function samePlace(a?: string | null, b?: string | null) {
  const xs = placeKeys(a);
  const ys = placeKeys(b);
  if (!xs.length || !ys.length) return false;
  return xs.some((x) =>
    ys.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)))),
  );
}

/* ---------------------------------------------------------------- appariement */

function nameScore(person: Person, indi: Indi) {
  const surnameA = strip(person.surname);
  const surnameB = strip(indi.surname);
  if (!surnameA || !surnameB) return 0;

  const givenA = strip(person.given_names).split(" ").filter(Boolean);
  const givenB = strip(indi.given).split(" ").filter(Boolean);
  const shared = givenA.filter((g) => givenB.includes(g)).length;

  let score = 0;
  if (surnameA === surnameB) score += 5;
  else if (surnameA.includes(surnameB) || surnameB.includes(surnameA)) score += 3;
  else return 0; // patronyme différent : on ne devine pas

  score += shared * 2;
  // Un prénom proche mais pas identique (Simonne / Simone) reste un indice.
  if (!shared && givenA[0] && givenB[0] && givenA[0].slice(0, 4) === givenB[0].slice(0, 4)) score += 1;

  if (sameYear(person.birth_year, indi.birth.year)) score += 4;
  if (sameYear(person.death_year, indi.death.year)) score += 3;
  if (
    person.birth_year &&
    indi.birth.year &&
    Math.abs(person.birth_year - indi.birth.year) > 3
  ) {
    score -= 4; // années franchement incompatibles
  }
  return score;
}

type Verdict = {
  person: Person;
  indi: Indi | null;
  covered: string[];
  missing: string[];
  facts: number;
};

function compare(person: Person, indi: Indi): Verdict {
  const covered: string[] = [];
  const missing: string[] = [];
  const union = person.unions[0] ?? null;

  const check = (label: string, known: boolean, present: boolean) => {
    if (!known) return;
    (present ? covered : missing).push(label);
  };

  check("date de naissance", !!person.birth_year, sameYear(person.birth_year, indi.birth.year));
  check("lieu de naissance", !!person.birth_place, samePlace(person.birth_place, indi.birth.place));
  check("date de décès", !!person.death_year, sameYear(person.death_year, indi.death.year));
  check("lieu de décès", !!person.death_place, samePlace(person.death_place, indi.death.place));
  check("date de mariage", !!union?.year, sameYear(union?.year ?? null, indi.marriage.year));
  check("lieu de mariage", !!union?.place, samePlace(union?.place, indi.marriage.place));

  return { person, indi, covered, missing, facts: covered.length + missing.length };
}

/* ---------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--profil") + 1]);
const profileName = args[args.indexOf("--profil") + 1] ?? "Famille Tual";
const apply = args.includes("--appliquer");

if (!file || !fs.existsSync(file)) {
  console.error("Fichier GEDCOM introuvable. Usage : npm run geneanet -- <fichier.ged> --profil \"Nom\"");
  process.exit(1);
}

const profile = db.prepare(`SELECT * FROM profiles WHERE name = ?`).get(profileName) as
  | { id: number }
  | undefined;
if (!profile) {
  console.error(`Profil « ${profileName} » introuvable.`);
  process.exit(1);
}

const text = fs.readFileSync(path.resolve(file), "latin1").includes("CHAR UTF-8")
  ? fs.readFileSync(path.resolve(file), "utf8")
  : fs.readFileSync(path.resolve(file), "utf8");

const { individuals } = parseGedcom(text);
const persons = listPersons(profile.id);

console.log(`GEDCOM : ${individuals.length} individus · Ariane : ${persons.length} cartes\n`);

const usedIndi = new Set<string>();
const verdicts: Verdict[] = [];

// Les meilleurs appariements d'abord, pour qu'un individu ne serve qu'une fois.
const pairs: { person: Person; indi: Indi; score: number }[] = [];
for (const person of persons) {
  for (const indi of individuals) {
    const score = nameScore(person, indi);
    if (score >= 5) pairs.push({ person, indi, score });
  }
}
pairs.sort((a, b) => b.score - a.score);

const matchedPersons = new Set<number>();
for (const { person, indi } of pairs) {
  if (matchedPersons.has(person.id) || usedIndi.has(indi.id)) continue;
  matchedPersons.add(person.id);
  usedIndi.add(indi.id);
  verdicts.push(compare(person, indi));
}

const toArchive = verdicts.filter((v) => v.missing.length === 0 && v.facts >= 2);
const partial = verdicts.filter((v) => v.missing.length > 0);
const thin = verdicts.filter((v) => v.missing.length === 0 && v.facts < 2);

const line = (v: Verdict) =>
  `${v.person.displayName} (${v.person.birth_year ?? "?"})`.padEnd(46) +
  `↔ ${v.indi ? `${v.indi.given} ${v.indi.surname}` : "?"}`.padEnd(42) +
  (v.missing.length
    ? `manque côté arbre : ${v.missing.join(", ")}`
    : `${v.covered.length} donnée(s) confirmée(s)`);

console.log(`✓ ${toArchive.length} carte(s) intégralement reportées — à archiver`);
for (const v of toArchive) console.log("   " + line(v));

console.log(`\n~ ${partial.length} carte(s) présentes mais incomplètes dans l'arbre`);
for (const v of partial) console.log("   " + line(v));

if (thin.length) {
  console.log(`\n· ${thin.length} carte(s) trop maigres pour trancher (nom seul des deux côtés)`);
  for (const v of thin) console.log("   " + v.person.displayName);
}

const absent = individuals.filter((i) => !usedIndi.has(i.id));
console.log(`\n→ ${absent.length} individu(s) de l'arbre sans carte Ariane`);
for (const i of absent.slice(0, 40)) {
  console.log(`   ${i.given} ${i.surname}`.padEnd(48) + (i.birth.year ?? i.death.year ?? ""));
}
if (absent.length > 40) console.log(`   … et ${absent.length - 40} autres`);

if (apply) {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const run = db.transaction(() => {
    for (const v of toArchive) updatePerson(v.person.id, { geneanet_at: stamp });
  });
  run();
  console.log(`\n${toArchive.length} carte(s) archivées dans Ariane (reportées sur Geneanet).`);
} else {
  console.log("\n(simulation — ajoute --appliquer pour archiver ces cartes)");
}
