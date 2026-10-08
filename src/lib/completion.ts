import type { Completion, PersonRow, UnionRow } from "./types";

export const COMPLETION_CRITERIA = [
  "Identité",
  "Date de naissance",
  "Lieu de naissance",
  "Acte de naissance",
  "Date de mariage",
  "Lieu de mariage",
  "Acte de mariage",
  "Date de décès",
  "Lieu de décès",
  "Acte de décès",
  "Parents",
] as const;

const filled = (v?: string | null) => !!(v && v.trim());

/**
 * Même barème que la base Notion d'origine : 11 critères, chacun vaut 1/11.
 */
export function computeCompletion(
  person: Pick<
    PersonRow,
    | "given_names"
    | "surname"
    | "birth_date_raw"
    | "birth_date_iso"
    | "birth_place"
    | "birth_source"
    | "birth_source_ignored"
    | "death_date_raw"
    | "death_date_iso"
    | "death_place"
    | "death_source"
    | "death_source_ignored"
    | "is_living"
    | "is_unmarried"
  >,
  union: Pick<UnionRow, "date_raw" | "date_iso" | "place" | "source" | "source_ignored"> | null,
  parentCount: number,
): Completion {
  const isLiving = Boolean(person.is_living);
  const isUnmarried = Boolean(person.is_unmarried);
  const birthSourceIgnored = Boolean(person.birth_source_ignored);
  const deathSourceIgnored = Boolean(person.death_source_ignored);
  const marriageSourceIgnored = Boolean(union?.source_ignored);

  const ignored: string[] = [];

  const checks: [string, boolean][] = [
    ["Identité", filled(person.surname) || filled(person.given_names)],
  ];

  // 1. Naissance : si l'acte est ignoré et que la date n'est pas renseignée, elle n'est pas requise
  const hasBirthDate = filled(person.birth_date_raw) || filled(person.birth_date_iso);
  if (birthSourceIgnored) {
    ignored.push("Acte de naissance");
    if (hasBirthDate) {
      checks.push(["Date de naissance", true]);
    } else {
      ignored.push("Date de naissance");
    }
  } else {
    checks.push(["Date de naissance", hasBirthDate]);
    checks.push(["Acte de naissance", filled(person.birth_source)]);
  }
  checks.push(["Lieu de naissance", filled(person.birth_place)]);

  // 2. Mariage (si non célibataire / sans union) : dispense acte et date si ignoré
  if (!isUnmarried) {
    const hasMarriageDate = filled(union?.date_raw) || filled(union?.date_iso);
    if (marriageSourceIgnored) {
      ignored.push("Acte de mariage");
      if (hasMarriageDate) {
        checks.push(["Date de mariage", true]);
      } else {
        ignored.push("Date de mariage");
      }
    } else {
      checks.push(["Date de mariage", hasMarriageDate]);
      checks.push(["Acte de mariage", filled(union?.source)]);
    }
    checks.push(["Lieu de mariage", filled(union?.place)]);
  }

  // 3. Décès (si non vivant) : dispense acte et date si ignoré
  if (!isLiving) {
    const hasDeathDate = filled(person.death_date_raw) || filled(person.death_date_iso);
    if (deathSourceIgnored) {
      ignored.push("Acte de décès");
      if (hasDeathDate) {
        checks.push(["Date de décès", true]);
      } else {
        ignored.push("Date de décès");
      }
    } else {
      checks.push(["Date de décès", hasDeathDate]);
      checks.push(["Acte de décès", filled(person.death_source)]);
    }
    checks.push(["Lieu de décès", filled(person.death_place)]);
  }

  // 4. Parents
  checks.push(["Parents", parentCount > 0]);

  const okList = checks.filter(([, ok]) => ok).map(([label]) => label);
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  const total = checks.length;
  return {
    score: okList.length,
    total,
    percent: total > 0 ? Math.round((okList.length / total) * 100) : 100,
    missing,
    filled: okList,
    ignored,
  };
}
