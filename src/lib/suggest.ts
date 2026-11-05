import { commune } from "./stats";
import type { Person } from "./types";

/*
 * Suggestions de rattachement : quand on ouvre « Rattacher un enfant / un parent /
 * un conjoint », on propose d'abord les fiches plausibles, avec la raison.
 * Plausible = dates compatibles, même nom, même commune, fiche encore isolée.
 */

export type Suggestion = { id: number; reason: string };

type Kind = "child" | "father" | "mother" | "spouse";

function placesOf(p: Person) {
  return new Set(
    [p.birth_place, p.death_place, ...p.unions.map((u) => u.place)]
      .map((x) => commune(x))
      .filter((x): x is string => Boolean(x)),
  );
}

const sameName = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.localeCompare(b, "fr", { sensitivity: "base" }) === 0);

export function suggestRelatives(person: Person, all: Person[], kind: Kind, limit = 6): Suggestion[] {
  const born = person.birth_year;
  const myPlaces = placesOf(person);
  const excluded = new Set<number>([
    person.id,
    ...person.parents.map((p) => p.id),
    ...person.children.map((p) => p.id),
    ...person.unions.map((u) => u.spouse?.id).filter((id): id is number => typeof id === "number"),
  ]);
  // Le nom attendu pour un enfant : celui du père (la personne, ou son conjoint si c'est une femme).
  const byId = new Map(all.map((p) => [p.id, p]));
  const spouseSurnames = person.unions
    .map((u) => (u.spouse ? byId.get(u.spouse.id)?.surname : null))
    .filter((s): s is string => Boolean(s));

  const scored: { id: number; score: number; reason: string }[] = [];
  for (const c of all) {
    if (excluded.has(c.id)) continue;
    const reasons: string[] = [];
    let score = 0;

    // Écart d'âge plausible pour le lien demandé ; incompatible = écarté.
    if (born && c.birth_year) {
      const gap = c.birth_year - born;
      const ok =
        kind === "child"
          ? gap >= 14 && gap <= 55
          : kind === "spouse"
            ? Math.abs(gap) <= 20
            : -gap >= 14 && -gap <= 60;
      if (!ok) continue;
      score += 3;
    }
    if (kind === "father" && c.sex === "F") continue;
    if (kind === "mother" && c.sex === "M") continue;
    if (kind === "spouse" && person.sex && c.sex === person.sex) continue;
    if (kind === "child" && c.parents.length >= 2) continue;

    if (kind === "child") {
      const expected = person.sex === "F" ? spouseSurnames : [person.surname];
      if (expected.some((s) => sameName(s, c.surname))) {
        score += 4;
        reasons.push("même nom");
      }
      if (c.parents.length === 0) {
        score += 2;
        reasons.push("sans parents");
      }
    } else if (kind === "father") {
      if (sameName(person.surname, c.surname)) {
        score += 4;
        reasons.push("même nom");
      }
    } else if (kind === "spouse") {
      if (c.unions.length === 0) score += 1;
    }

    const shared = [...placesOf(c)].find((x) => myPlaces.has(x));
    if (shared) {
      score += 3;
      reasons.push(shared);
    }
    if (score < 4) continue;

    const when = c.birth_year ? `${c.sex === "F" ? "née" : c.sex === "M" ? "né" : "né(e)"} en ${c.birth_year}` : null;
    scored.push({ id: c.id, score, reason: [when, ...reasons].filter(Boolean).join(" · ") });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, reason }) => ({ id, reason }));
}
