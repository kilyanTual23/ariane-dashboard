export const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Abréviations acceptées à la saisie, en plus des noms complets. */
const MONTH_ALIASES: Record<string, number> = {
  janv: 1, jan: 1, fevr: 2, fev: 2, mar: 3, avr: 4, mai: 5, juin: 6,
  juil: 7, jui: 7, aout: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_INDEX = new Map<string, number>();
MONTHS_FR.forEach((m, i) => {
  MONTH_INDEX.set(m, i + 1);
  MONTH_INDEX.set(stripAccents(m), i + 1);
});
for (const [alias, month] of Object.entries(MONTH_ALIASES)) MONTH_INDEX.set(alias, month);

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export type DatePrecision = "day" | "month" | "year" | "none";
export type DateQualifier = "exact" | "about" | "before" | "after";

export type ParsedDate = {
  iso: string | null;
  year: number | null;
  /** L'écriture normalisée : « 19 novembre 1882 », « vers 1880 », « mars 1905 ». */
  canonical: string | null;
  precision: DatePrecision;
  qualifier: DateQualifier;
  /** false quand rien n'a été reconnu : la saisie est conservée telle quelle. */
  recognized: boolean;
};

const EMPTY: ParsedDate = {
  iso: null,
  year: null,
  canonical: null,
  precision: "none",
  qualifier: "exact",
  recognized: false,
};

/**
 * Accepte ce qu'on a sous la main — « 19/11/1882 », « 19 nov 1882 »,
 * « 1882-11-19 », « nov 1882 », « vers 1880 », « avant 1900 », « >1925 » —
 * et renvoie toujours la même écriture normalisée.
 */
export function parseDateInput(input?: string | null): ParsedDate {
  const raw = (input ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return EMPTY;

  let rest = raw;
  let qualifier: DateQualifier = "exact";

  const qualified = stripAccents(rest.toLowerCase());
  if (/^(vers|v\.?|ca\.?|environ|~)\s*/.test(qualified)) {
    qualifier = "about";
    rest = rest.replace(/^\s*(vers|v\.?|ca\.?|environ|~)\s*/i, "");
  } else if (/^(avant|<)\s*/.test(qualified)) {
    qualifier = "before";
    rest = rest.replace(/^\s*(avant|<)\s*/i, "");
  } else if (/^(apres|après|>)\s*/.test(qualified)) {
    qualifier = "after";
    rest = rest.replace(/^\s*(apres|après|>)\s*/i, "");
  }

  const build = (
    year: number,
    month: number | null,
    day: number | null,
  ): ParsedDate => {
    const precision: DatePrecision = day ? "day" : month ? "month" : "year";
    const exact = qualifier === "exact";
    const text = day
      ? `${day} ${MONTHS_FR[month! - 1]} ${year}`
      : month
        ? `${MONTHS_FR[month - 1]} ${year}`
        : String(year);
    const prefix =
      qualifier === "about" ? "vers " : qualifier === "before" ? "avant " : qualifier === "after" ? "après " : "";
    return {
      iso: day && exact ? `${year}-${pad(month!)}-${pad(day)}` : null,
      year,
      canonical: `${prefix}${text}`,
      precision,
      qualifier,
      recognized: true,
    };
  };

  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  };

  // 1882-11-19
  const iso = rest.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (valid(y, m, d)) return build(y, m, d);
  }

  // 19/11/1882, 19-11-1882, 19.11.1882
  const numeric = rest.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (numeric) {
    const [d, m, y] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    if (valid(y, m, d)) return build(y, m, d);
  }

  // 11/1882
  const monthNumeric = rest.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (monthNumeric) {
    const [m, y] = [Number(monthNumeric[1]), Number(monthNumeric[2])];
    if (m >= 1 && m <= 12) return build(y, m, null);
  }

  // 19 novembre 1882 / 1er janvier 1806 / 19 nov 1882
  const literal = stripAccents(rest.toLowerCase()).match(/^(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})$/);
  if (literal) {
    const month = MONTH_INDEX.get(literal[2]);
    const [d, y] = [Number(literal[1]), Number(literal[3])];
    if (month && valid(y, month, d)) return build(y, month, d);
  }

  // novembre 1882
  const monthYear = stripAccents(rest.toLowerCase()).match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTH_INDEX.get(monthYear[1]);
    if (month) return build(Number(monthYear[2]), month, null);
  }

  // 1882
  const yearOnly = rest.match(/^(\d{4})$/);
  if (yearOnly) return build(Number(yearOnly[1]), null, null);

  // Rien de reconnu : on garde la saisie, en récupérant une année si possible.
  const anyYear = raw.match(/(\d{4})/);
  return { ...EMPTY, year: anyYear ? Number(anyYear[1]) : null, canonical: raw };
}

/** Compatibilité : l'import et les anciens appels n'ont besoin que d'iso + année. */
export function parseFrenchDate(input?: string | null): { iso: string | null; year: number | null } {
  const parsed = parseDateInput(input);
  return { iso: parsed.iso, year: parsed.year };
}

/** ISO → « 19 novembre 1882 ». */
export function formatIso(iso?: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_FR[Number(m[2]) - 1]} ${m[1]}`;
}

/** Ce qu'on affiche pour une date : la version propre si on l'a, sinon le brut. */
export function displayDate(raw?: string | null, iso?: string | null): string | null {
  return formatIso(iso) ?? (raw?.trim() || null);
}

/** Un « acte » peut être une URL, une cote, ou « >1925 » (non communicable). */
export function sourceLabel(source?: string | null): string | null {
  const s = (source ?? "").trim();
  if (!s) return null;
  if (/^>\s*\d{4}$/.test(s)) return `Non communicable (${s})`;
  if (/^https?:\/\//.test(s)) {
    try {
      return new URL(s).hostname.replace(/^www\./, "");
    } catch {
      return s;
    }
  }
  return s;
}

export function isUrl(value?: string | null): boolean {
  return !!value && /^https?:\/\//.test(value.trim());
}

/**
 * Nomenclature des lieux : « Commune, Région, France ».
 * On se contente de nettoyer l'espacement et les virgules, sans rien inventer.
 */
export function normalizePlace(input?: string | null): string | null {
  const raw = (input ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
