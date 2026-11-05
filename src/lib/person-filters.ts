/**
 * Filtres de la page Personnes, partagés entre le serveur (lecture de l'URL et
 * du cookie de mémorisation) et le client (barre d'outils).
 */

export type SortKey = "name" | "sosa" | "birth" | "death" | "filled" | "status";
export type ViewKey = "grille" | "liste" | "tableau";

export type FilterState = {
  query: string;
  status: string;
  sosaOnly: boolean;
  kinship: string;
  missing: string;
  /** Commune où un événement (naissance, mariage, décès) a eu lieu. */
  commune: string;
  /** Siècle de naissance : « 1700 » pour le XVIIIe. */
  century: string;
  /** Génération Sosa : « 3 » pour les grands-parents. */
  generation: string;
  /** Branche de l'ascendance : paternelle ou maternelle. */
  branch: string;
  sort: SortKey;
  desc: boolean;
};

export const DEFAULT_FILTERS: FilterState = {
  query: "",
  status: "",
  sosaOnly: false,
  kinship: "",
  missing: "",
  commune: "",
  century: "",
  generation: "",
  branch: "",
  sort: "name",
  desc: false,
};

export const CENTURIES = [
  { value: "1600", label: "XVIIe siècle et avant" },
  { value: "1700", label: "XVIIIe siècle" },
  { value: "1800", label: "XIXe siècle" },
  { value: "1900", label: "XXe siècle" },
  { value: "2000", label: "XXIe siècle" },
];

export const BRANCHES = [
  { value: "paternelle", label: "Branche paternelle" },
  { value: "maternelle", label: "Branche maternelle" },
];

export const SORTS: { key: SortKey; label: string; defaultDesc?: boolean }[] = [
  { key: "name", label: "Nom de famille" },
  { key: "sosa", label: "Numéro Sosa" },
  { key: "birth", label: "Année de naissance" },
  { key: "death", label: "Année de décès" },
  { key: "filled", label: "Cases remplies", defaultDesc: true },
  { key: "status", label: "Statut" },
];

export const MISSING_FILTERS = [
  "Acte de naissance",
  "Acte de mariage",
  "Acte de décès",
  "Parents",
  "Date de naissance",
  "Lieu de naissance",
  "Date de décès",
] as const;

export const VIEWS: ViewKey[] = ["grille", "liste", "tableau"];

export const filtersCookie = (slug: string) => `ariane-personnes-${slug}`;

const PARAM_KEYS = ["q", "statut", "sosa", "lien", "manquant", "commune", "siecle", "gen", "branche", "tri", "ordre"];

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export function hasFilterParams(sp: Params) {
  return PARAM_KEYS.some((k) => sp[k] !== undefined);
}

export function filtersFromParams(sp: Params): FilterState {
  const tri = one(sp.tri);
  return {
    query: one(sp.q) ?? "",
    status: one(sp.statut) ?? "",
    sosaOnly: one(sp.sosa) === "1" || one(sp.sosa) === "true",
    kinship: one(sp.lien) ?? "",
    missing: one(sp.manquant) ?? "",
    commune: one(sp.commune) ?? "",
    century: one(sp.siecle) ?? "",
    generation: one(sp.gen) ?? "",
    branch: one(sp.branche) ?? "",
    sort: SORTS.some((s) => s.key === tri) ? (tri as SortKey) : "name",
    desc: one(sp.ordre) === "desc",
  };
}

export function filtersToParams(f: FilterState, view: ViewKey): URLSearchParams {
  const params = new URLSearchParams();
  if (view !== "grille") params.set("vue", view === "tableau" ? "kanban" : view);
  if (f.query.trim()) params.set("q", f.query.trim());
  if (f.status) params.set("statut", f.status);
  if (f.sosaOnly) params.set("sosa", "1");
  if (f.kinship) params.set("lien", f.kinship);
  if (f.missing) params.set("manquant", f.missing);
  if (f.commune) params.set("commune", f.commune);
  if (f.century) params.set("siecle", f.century);
  if (f.generation) params.set("gen", f.generation);
  if (f.branch) params.set("branche", f.branch);
  if (f.sort !== "name") params.set("tri", f.sort);
  if (f.desc) params.set("ordre", "desc");
  return params;
}

export function parseView(v: string | string[] | undefined): ViewKey | null {
  const s = one(v);
  if (s === "kanban" || s === "tableau") return "tableau";
  if (s === "liste") return "liste";
  if (s === "grille") return "grille";
  return null;
}

/** Contenu du cookie de mémorisation : filtres + vue. */
export type StoredFilters = { f?: Partial<FilterState>; v?: ViewKey };

export function parseStored(raw: string | undefined): StoredFilters {
  if (!raw) return {};
  try {
    const data = JSON.parse(decodeURIComponent(raw));
    return typeof data === "object" && data ? (data as StoredFilters) : {};
  } catch {
    return {};
  }
}

export function sanitize(partial: Partial<FilterState> | undefined): FilterState {
  const f = { ...DEFAULT_FILTERS, ...(partial ?? {}) };
  return {
    query: typeof f.query === "string" ? f.query : "",
    status: typeof f.status === "string" ? f.status : "",
    sosaOnly: Boolean(f.sosaOnly),
    kinship: typeof f.kinship === "string" ? f.kinship : "",
    missing: typeof f.missing === "string" ? f.missing : "",
    commune: typeof f.commune === "string" ? f.commune : "",
    century: typeof f.century === "string" ? f.century : "",
    generation: typeof f.generation === "string" ? f.generation : "",
    branch: typeof f.branch === "string" ? f.branch : "",
    sort: SORTS.some((s) => s.key === f.sort) ? f.sort : "name",
    desc: Boolean(f.desc),
  };
}

export function countActiveFilters(f: FilterState) {
  return [f.sosaOnly, f.kinship, f.missing, f.commune, f.century, f.generation, f.branch].filter(Boolean).length;
}
