import { displayDate } from "./dates";
import { commune } from "./stats";
import type { Person } from "./types";

function agreed(base: string, sex: "M" | "F" | null) {
  if (sex === "F") return `${base}e`;
  if (sex === "M") return base;
  return `${base}(e)`;
}

/**
 * La fiche en une phrase — ce qu'on veut lire avant tout le reste.
 */
export function summarize(person: Person): string {
  const parts: string[] = [];

  const birthDate = displayDate(person.birth_date_raw, person.birth_date_iso);
  const birthPlace = commune(person.birth_place);
  if (birthDate || birthPlace || person.birth_year) {
    const when = birthDate
      ? `le ${birthDate}`
      : person.birth_year
        ? `vers ${person.birth_year}`
        : null;
    parts.push(
      [agreed("Né", person.sex), when, birthPlace ? `à ${birthPlace}` : null]
        .filter(Boolean)
        .join(" "),
    );
  }

  const union = person.unions[0];
  if (union) {
    const when = displayDate(union.date_raw, union.date_iso);
    parts.push(
      [
        agreed("marié", person.sex),
        when ? `le ${when}` : null,
        union.spouse ? `avec ${union.spouse.displayName}` : null,
        commune(union.place) ? `à ${commune(union.place)}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const deathDate = displayDate(person.death_date_raw, person.death_date_iso);
  const deathPlace = commune(person.death_place);
  if (deathDate || deathPlace) {
    parts.push(
      [
        agreed("décédé", person.sex),
        deathDate ? `le ${deathDate}` : null,
        deathPlace ? `à ${deathPlace}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  if (!parts.length) return "Aucune date ni lieu pour l’instant.";
  return `${parts.join(", ")}.`;
}

/** « Il manque l'acte de décès et les parents. » */
export function missingSentence(person: Person): string | null {
  const missing = person.completion.missing.map((m) => m.toLowerCase());
  if (!missing.length) return null;
  if (missing.length > 4) return `Il manque encore ${missing.length} éléments sur 11.`;
  const last = missing.pop()!;
  return missing.length
    ? `Il manque ${missing.join(", ")} et ${last}.`
    : `Il manque ${last}.`;
}
