/**
 * Recherche tolérante partagée par la palette de commandes, la liste des
 * fiches et les sélecteurs de personne : sans accents, sans casse, multi-mots
 * (« tual 1882 billé »), et les numéros Sosa reconnus (« 16 », « #16 », « sosa 16 »).
 */

export function normalize(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[()[\]{},;:'"«»_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(query: string): string[] {
  return normalize(query).split(" ").filter(Boolean);
}

export type Searchable = {
  name: string;
  givenNames?: string | null;
  surname?: string | null;
  sosa?: number | null;
  birthYear?: number | null;
  deathYear?: number | null;
  marriageYear?: number | null;
  places?: (string | null | undefined)[];
  extra?: (string | null | undefined)[];
};

type Prepared = {
  pool: string;
  name: string;
  given: string;
  surname: string;
  sosa: string;
  years: string[];
};

function prepare(p: Searchable): Prepared {
  const name = normalize(p.name);
  const given = normalize(p.givenNames);
  const surname = normalize(p.surname);
  const sosa = p.sosa ? String(p.sosa) : "";
  const years = [p.birthYear, p.deathYear, p.marriageYear].filter(Boolean).map(String);
  const pool = [
    name,
    given,
    surname,
    ...(p.places ?? []).map(normalize),
    ...(p.extra ?? []).map(normalize),
    sosa ? `sosa ${sosa} #${sosa}` : "",
    ...years,
  ].join(" ");
  return { pool, name, given, surname, sosa, years };
}

/**
 * Score de pertinence, ou null si un des mots n'est trouvé nulle part.
 * Le nom pèse plus que le lieu, un Sosa exact passe devant tout.
 */
export function scoreMatch(p: Searchable, tokens: string[], whole = tokens.join(" ")): number | null {
  if (!tokens.length) return 0;
  const x = prepare(p);
  let score = 0;
  for (const token of tokens) {
    const bare = token.replace(/^(#|sosa:?)/, "");
    const hit =
      x.pool.includes(token) || (bare && x.sosa === bare) || (bare && x.years.includes(bare));
    if (!hit) return null;
    if (x.surname.startsWith(token) || x.given.startsWith(token)) score += 15;
    if (x.name.includes(token)) score += 10;
    if (bare && x.years.includes(bare)) score += 12;
    if (bare && x.sosa === bare) score += 30;
  }
  if (x.sosa && (whole === x.sosa || whole === `#${x.sosa}` || whole === `sosa ${x.sosa}`)) score += 100;
  if (x.surname === whole || x.name === whole) score += 90;
  else if (x.surname.startsWith(whole) || x.name.startsWith(whole)) score += 60;
  else if (x.name.includes(whole)) score += 35;
  return score;
}

/** Filtre et trie une liste ; sans requête, la liste est rendue telle quelle. */
export function searchList<T>(
  items: T[],
  query: string,
  toSearchable: (item: T) => Searchable,
  limit?: number,
): T[] {
  const tokens = tokenize(query);
  if (!tokens.length) return limit ? items.slice(0, limit) : items;
  const whole = tokens.join(" ");
  const scored: { item: T; score: number; name: string }[] = [];
  for (const item of items) {
    const s = toSearchable(item);
    const score = scoreMatch(s, tokens, whole);
    if (score !== null) scored.push({ item, score, name: s.name });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"));
  const out = scored.map((s) => s.item);
  return limit ? out.slice(0, limit) : out;
}

/** Vrai si tous les mots de la requête se retrouvent dans la fiche. */
export function matches(p: Searchable, query: string): boolean {
  const tokens = tokenize(query);
  return !tokens.length || scoreMatch(p, tokens) !== null;
}
