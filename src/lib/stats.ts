import type { Person } from "./types";
import { STATUSES } from "./types";

/** « Billé, Bretagne, France » → « Billé ». */
export function commune(place?: string | null): string | null {
  const first = (place ?? "").split(",")[0]?.trim();
  return first || null;
}

export function generationOf(sosa?: number | null): number | null {
  if (!sosa || sosa < 1) return null;
  return Math.floor(Math.log2(sosa)) + 1;
}

export type ProfileStats = ReturnType<typeof computeStats>;

export function computeStats(persons: Person[]) {
  const total = persons.length;
  const avgCompletion = total
    ? Math.round(persons.reduce((s, p) => s + p.completion.percent, 0) / total)
    : 0;

  const byStatus = STATUSES.map((status) => ({
    status,
    count: persons.filter((p) => p.status === status).length,
  })).filter((s) => s.count > 0);

  const sosa = persons.filter((p) => p.kinship === "SOSA");

  const missingActs = [
    {
      label: "Actes de naissance",
      missing: persons.filter((p) => !p.birth_source).length,
    },
    {
      label: "Actes de mariage",
      missing: persons.filter((p) => !p.unions[0]?.source).length,
    },
    {
      label: "Actes de décès",
      missing: persons.filter((p) => !p.death_source).length,
    },
  ];

  // Générations Sosa (disponibles seulement si une racine est définie).
  const generations = (() => {
    const numbered = persons.filter((p) => p.sosa);
    if (!numbered.length) return null;
    const maxGen = Math.max(...numbered.map((p) => generationOf(p.sosa)!));
    return Array.from({ length: maxGen }, (_, i) => {
      const gen = i + 1;
      const found = numbered.filter((p) => generationOf(p.sosa) === gen);
      const expected = 2 ** (gen - 1);
      return {
        gen,
        found: found.length,
        expected,
        percent: Math.round((found.length / expected) * 100),
        avgCompletion: found.length
          ? Math.round(found.reduce((s, p) => s + p.completion.percent, 0) / found.length)
          : 0,
      };
    });
  })();

  // Communes les plus présentes, tous événements confondus.
  const placeCount = new Map<string, number>();
  for (const p of persons) {
    const places = [p.birth_place, p.death_place, ...p.unions.map((u) => u.place)];
    for (const place of places) {
      const c = commune(place);
      if (c) placeCount.set(c, (placeCount.get(c) ?? 0) + 1);
    }
  }
  const topPlaces = [...placeCount.entries()]
    .map(([place, count]) => ({ place, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Siècles de naissance, utile tant qu'aucune racine Sosa n'est choisie.
  const centuryCount = new Map<number, number>();
  for (const p of persons) {
    if (!p.birth_year) continue;
    const century = Math.floor(p.birth_year / 100) * 100;
    centuryCount.set(century, (centuryCount.get(century) ?? 0) + 1);
  }
  const byCentury = [...centuryCount.entries()]
    .map(([century, count]) => ({ century, count }))
    .sort((a, b) => a.century - b.century);

  const recent = [...persons]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, 6);

  return {
    total,
    avgCompletion,
    complete: persons.filter((p) => p.completion.percent === 100).length,
    byStatus,
    sosaCount: sosa.length,
    blocked: persons.filter((p) => p.status === "Bloqué"),
    missingActs,
    generations,
    topPlaces,
    byCentury,
    recent,
    oldestYear: persons.reduce<number | null>(
      (min, p) => (p.birth_year && (!min || p.birth_year < min) ? p.birth_year : min),
      null,
    ),
  };
}

/**
 * Les morceaux d'arbre qui ne se rejoignent pas : deux personnes appartiennent
 * au même morceau si un lien de filiation ou une union les relie, de proche en
 * proche. Plusieurs morceaux = des branches que rien ne raccorde encore.
 */
export function computeComponents(persons: Person[]) {
  const byId = new Map(persons.map((p) => [p.id, p]));
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
  const groups: { size: number; members: Person[] }[] = [];

  for (const p of persons) {
    if (seen.has(p.id)) continue;
    const stack = [p.id];
    const members: Person[] = [];
    seen.add(p.id);
    while (stack.length) {
      const id = stack.pop()!;
      const person = byId.get(id);
      if (person) members.push(person);
      for (const n of neighbours.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    // Le plus jeune de chaque morceau : c'est par là qu'il faudrait le raccorder.
    members.sort((a, b) => (b.birth_year ?? 0) - (a.birth_year ?? 0));
    groups.push({ size: members.length, members });
  }

  return groups.sort((a, b) => b.size - a.size);
}

export type Lead = {
  person: Person;
  missing: string[];
  score: number;
  why: string;
};

/**
 * Pistes de recherche : ce qui manque, trié par « facilité » —
 * on privilégie les ancêtres directs dont on connaît déjà lieu et période.
 */
export function computeLeads(persons: Person[], limit = 20): Lead[] {
  const leads: Lead[] = [];

  for (const person of persons) {
    if (person.completion.percent === 100) continue;
    const missing = person.completion.missing;
    if (!missing.length) continue;

    let score = 0;
    const reasons: string[] = [];

    if (person.kinship === "SOSA") score += 40;
    else if (person.kinship === "Collatéral") score += 10;

    if (person.status === "En recherche") score += 15;
    if (person.status === "Pas commencé") score += 8;
    if (person.status === "Bloqué") score -= 15;

    const knownPlace = commune(person.birth_place ?? person.death_place ?? person.unions[0]?.place);
    const knownYear = person.birth_year ?? person.proximity_year ?? person.death_year;
    if (knownPlace && knownYear) {
      score += 25;
      reasons.push(`${knownPlace} vers ${knownYear}`);
    } else if (knownPlace) {
      score += 12;
      reasons.push(knownPlace);
    } else if (knownYear) {
      score += 8;
      reasons.push(`vers ${knownYear}`);
    }

    // Une fiche presque bouclée mérite d'être terminée avant d'ouvrir une branche.
    score += Math.round(person.completion.percent / 10);

    leads.push({
      person,
      missing,
      score,
      why: reasons.join(" · ") || "Aucun repère de lieu ni de date",
    });
  }

  return leads.sort((a, b) => b.score - a.score).slice(0, limit);
}
