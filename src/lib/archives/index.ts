import { ad35 } from "./ad35";
import { ad53 } from "./ad53";
import type { ActKind, ArchiveRegister, ArchiveSearchResult, DepartmentConnector } from "./types";
import { communeKey } from "./util";

export type { ActKind, ArchiveRegister, ArchiveSearchResult } from "./types";

/** Départements branchés. En ajouter un = écrire son connecteur et l'inscrire ici. */
export const CONNECTORS: Record<string, DepartmentConnector> = { "35": ad35, "53": ad53 };
export const SUPPORTED_DEPTS = Object.values(CONNECTORS).map((c) => ({ code: c.code, name: c.name }));

/* ------------------------------------------------- lieu → commune + département */

const REGIONS = new Set(
  [
    "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire", "Corse", "Grand Est",
    "Hauts-de-France", "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire",
    "Provence-Alpes-Côte d'Azur", "France",
  ].map(communeKey),
);

type GeoCommune = { nom: string; codeDepartement: string; region?: { nom: string } };
const geoCache = new Map<string, GeoCommune[]>();

async function geo(name: string): Promise<GeoCommune[]> {
  const key = communeKey(name);
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=nom,codeDepartement,region&boost=population&limit=10`,
      { signal: AbortSignal.timeout(4000) },
    );
    const list = res.ok ? ((await res.json()) as GeoCommune[]) : [];
    geoCache.set(key, list);
    return list;
  } catch {
    return [];
  }
}

/**
 * « Fleurigné, La Chapelle-Fleurigné, Bretagne, France » → { commune: "Fleurigné", dept: "35" }.
 * La première partie est la commune d'époque (celle des registres) ; les suivantes aident à
 * trouver le département (commune actuelle, région, code postal).
 */
export async function resolvePlace(place: string): Promise<{ commune: string; dept: string | null }> {
  const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
  const postal = place.match(/\b(\d{5})\s+([^,]+)/);
  if (postal) return { commune: postal[2].trim(), dept: postal[1].slice(0, 2) };
  const named = parts.filter((p) => !REGIONS.has(communeKey(p)) && !/^lieu-dit/i.test(p));
  const commune = named[0] ?? parts[0] ?? "";
  const region = parts.find((p) => REGIONS.has(communeKey(p)) && communeKey(p) !== "FRANCE");
  for (const candidate of named.slice(0, 2)) {
    const found = (await geo(candidate)).filter((c) => communeKey(c.nom) === communeKey(candidate));
    const inRegion = region ? found.filter((c) => communeKey(c.region?.nom ?? "") === communeKey(region)) : found;
    const pick = inRegion[0] ?? found[0];
    if (pick) return { commune, dept: pick.codeDepartement };
  }
  return { commune, dept: null };
}

/* ------------------------------------------------------------ recherche + cache */

const cache = new Map<string, { at: number; result: ArchiveSearchResult }>();
const TTL = 12 * 3600 * 1000;

export async function searchRegisters(dept: string, commune: string, year: number): Promise<ArchiveSearchResult> {
  const connector = CONNECTORS[dept];
  if (!connector) {
    return {
      ok: false,
      error: `Les archives de ce département ne sont pas encore branchées. Disponibles : ${SUPPORTED_DEPTS.map((d) => `${d.name} (${d.code})`).join(", ")}.`,
    };
  }
  const key = `${dept}|${communeKey(commune)}|${year}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.result;
  const result = await connector.search(commune, year);
  if (result.ok) cache.set(key, { at: Date.now(), result });
  return result;
}

/** Les registres utiles d'abord : le bon type d'acte, puis les autres, les tables à la fin. */
export function rankRegisters(registers: ArchiveRegister[], kind: ActKind): ArchiveRegister[] {
  const score = (r: ArchiveRegister) => (r.isTable ? 2 : r.kinds.includes(kind) ? 0 : 1);
  const span = (r: ArchiveRegister) => {
    const [a, b] = r.years.split("-").map(Number);
    return (b || a) - a;
  };
  return [...registers].sort(
    (a, b) => score(a) - score(b) || span(a) - span(b) || (a.parish ?? "").localeCompare(b.parish ?? "", "fr"),
  );
}
