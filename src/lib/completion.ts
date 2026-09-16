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
    | "death_date_raw"
    | "death_date_iso"
    | "death_place"
    | "death_source"
  >,
  union: Pick<UnionRow, "date_raw" | "date_iso" | "place" | "source"> | null,
  parentCount: number,
): Completion {
  const checks: [string, boolean][] = [
    ["Identité", filled(person.surname) || filled(person.given_names)],
    ["Date de naissance", filled(person.birth_date_raw) || filled(person.birth_date_iso)],
    ["Lieu de naissance", filled(person.birth_place)],
    ["Acte de naissance", filled(person.birth_source)],
    ["Date de mariage", filled(union?.date_raw) || filled(union?.date_iso)],
    ["Lieu de mariage", filled(union?.place)],
    ["Acte de mariage", filled(union?.source)],
    ["Date de décès", filled(person.death_date_raw) || filled(person.death_date_iso)],
    ["Lieu de décès", filled(person.death_place)],
    ["Acte de décès", filled(person.death_source)],
    ["Parents", parentCount > 0],
  ];

  const okList = checks.filter(([, ok]) => ok).map(([label]) => label);
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  const total = checks.length;
  return {
    score: okList.length,
    total,
    percent: Math.round((okList.length / total) * 100),
    missing,
    filled: okList,
  };
}
