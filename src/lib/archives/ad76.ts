import { fetchAnubis } from "./anubis";
import type { ArchiveRegister, ArchiveSearchResult, DepartmentConnector } from "./types";
import { communeKey as baseKey, kindsOf, mapLimit, registerLabel, stripTags, withoutArticle } from "./util";

/**
 * Seine-Maritime (76) — recherche « État civil » du site des Archives (protégé par Anubis).
 * Le texte « commune » ramène aussi les communes voisines (« Senneville-sur-Fécamp ») :
 * on ne garde que la commune cherchée, ses paroisses et les anciennes communes du même nom.
 * 20 notices par page ; chaque notice donne paroisse, typologie, types d'actes, cote, vues.
 * Le site rejette l'article à la fin (« Neuville-Chant-d'Oisel (La) ») et ne trouve rien
 * si on le met devant : on cherche sans article, et on compare les noms sans article.
 */
const BASE = "https://www.archivesdepartementales76.net";
const MAX_PAGES = 10;

/** Clé de comparaison d'un nom de commune, article ôté (devant ou entre parenthèses). */
const communeKey = (name: string) => baseKey(withoutArticle(name));

type Row = {
  commune: string;
  fields: Record<string, string>;
  years: string;
  ark: string;
  pages: number | null;
};

function resultsUrl(commune: string, year: number, page: number) {
  const q = new URLSearchParams({ RECH_commune: commune, RECH_unitdate_exacte: String(year), type: "etatcivil" });
  return `${BASE}/archive/resultats/etatcivil/lineaire/n:113${page > 1 ? `/page:${page}` : ""}?${q}`;
}

/** « 01/01/1770-31/12/1780 » → « 1770-1780 », « 01/01/1850-31/12/1850 » → « 1850 ». */
function yearsOf(raw: string): string {
  const ys = raw.match(/\d{4}/g) ?? [];
  if (!ys.length) return raw;
  const [a, b] = [ys[0], ys[ys.length - 1]];
  return a === b ? a : `${a}-${b}`;
}

function parse(html: string): { total: number; rows: Row[] } {
  const total = Number(html.match(/arc_nbr_reponses">\s*(\d+)/)?.[1] ?? 0);
  const rows: Row[] = [];
  for (const [, tr] of html.matchAll(/<tr class="arc_(?:im)?pair">([\s\S]*?)<\/tr>/g)) {
    const ark = tr.match(/href="(\/ark:\/50278\/[0-9a-f]+)\/dao/)?.[1];
    if (!ark) continue;
    const title = stripTags(tr.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const [commune, dates = ""] = title.split(/\s+-\s+/);
    const fields: Record<string, string> = {};
    for (const [, k, v] of tr.matchAll(/<strong class="arc_libelle_strong">([\s\S]*?)<\/strong>([\s\S]*?)<\/div>/g)) {
      fields[stripTags(k).replace(/[\s:]+$/, "")] = stripTags(v);
    }
    rows.push({
      commune,
      fields,
      years: yearsOf(dates),
      ark,
      pages: Number(tr.match(/nb_vues">\s*(\d+)/)?.[1] ?? 0) || null,
    });
  }
  return { total, rows };
}

async function search(commune: string, year: number): Promise<ArchiveSearchResult> {
  let query = withoutArticle(commune) || commune;
  let first = parse(await fetchAnubis(resultsUrl(query, year, 1)));
  // Rien avec le nom entier (écrit sans tirets, par exemple) : on cherche son mot le plus long,
  // les registres d'autres communes sont écartés plus bas.
  const longest = query.split(/[\s'’-]+/).sort((a, b) => b.length - a.length)[0];
  if (!first.total && longest && longest.length >= 4 && longest !== query) {
    query = longest;
    first = parse(await fetchAnubis(resultsUrl(query, year, 1)));
  }
  const perPage = first.rows.length || 20;
  const pages = Math.min(Math.ceil(first.total / perPage), MAX_PAGES);
  const rest = await mapLimit(
    Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => i + 2),
    3,
    async (p) => parse(await fetchAnubis(resultsUrl(query, year, p))).rows,
  );
  const rows = [...first.rows, ...rest.flat()];

  const key = communeKey(commune);
  // « Fécamp (paroisse Saint-Étienne) » → commune « Fécamp », paroisse « Saint-Étienne ».
  const parishOf = (r: Row) => {
    const m = (r.fields["Paroisse ou communauté"] ?? "").match(/^(.*?)\s*\((.*)\)\s*$/);
    return m ? { commune: m[1], parish: m[2].replace(/^paroisse\s+/i, "") } : null;
  };
  const mine = rows.filter(
    (r) =>
      communeKey(r.commune) === key ||
      communeKey(r.fields["Ancienne commune"] ?? "") === key ||
      communeKey(parishOf(r)?.commune ?? "") === key,
  );
  if (!mine.length) {
    const others = [...new Set(rows.map((r) => r.commune).filter(Boolean))];
    return {
      ok: false,
      error: `Aucun registre de ${year} trouvé pour « ${commune} » aux Archives de la Seine-Maritime.`,
      suggestions: others.slice(0, 6),
    };
  }

  const registers: ArchiveRegister[] = mine.map((r) => {
    const typo = r.fields["Typologie"] ?? "";
    const acts = r.fields["Type d'acte"] ?? r.fields["Type d’acte"] ?? "";
    const { kinds, isTable } = kindsOf(`${typo} ${acts}`);
    const old = r.fields["Ancienne commune"];
    const parish = parishOf(r)?.parish ?? (old && communeKey(old) !== key ? old : null);
    return {
      id: r.ark,
      dept: "76",
      commune: communeKey(r.commune) === key ? r.commune : commune,
      parish,
      typeLabel: isTable ? `${typo}${acts ? ` (${acts.toLowerCase()})` : ""}` : registerLabel(acts, r.years),
      kinds,
      isTable,
      years: r.years,
      cote: r.fields["Cote"] || null,
      pages: r.pages,
      url: `${BASE}${r.ark}/dao/0/1`,
    };
  });
  const exact = mine.find((r) => communeKey(r.commune) === key)?.commune ?? commune;
  return {
    ok: true,
    dept: "76",
    deptName: "Seine-Maritime",
    commune: exact,
    year,
    registers,
    note: first.total > MAX_PAGES * perPage ? "Beaucoup de résultats : seuls les premiers registres sont listés." : undefined,
  };
}

export const ad76: DepartmentConnector = { code: "76", name: "Seine-Maritime", platform: "Arkothèque", search };
