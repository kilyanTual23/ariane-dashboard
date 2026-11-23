import type { ArchiveRegister, ArchiveSearchResult, DepartmentConnector } from "./types";
import { communeKey, decodeEntities, fetchText, kindsOf, mapLimit, stripTags } from "./util";

/**
 * Mayenne (53) — plateforme Pleade, base « ead2 » (registres paroissiaux et d'état civil).
 * 1. Le flux RSS des résultats (texte libre = commune, année) donne les registres et leur lien.
 * 2. Le fragment de chaque registre donne la commune, la paroisse, la cote et les types d'actes :
 *    le texte libre ramène aussi des communes voisines (« … lès Laval »), on ne garde que la bonne.
 */
const BASE = "https://archives.lamayenne.fr/archives-en-ligne";

type RssItem = { c: string; years: string; viewer: string | null };

async function rssPage(commune: string, year: number, start: number): Promise<{ total: number; items: RssItem[] }> {
  const q = new URLSearchParams({
    base: "ead2",
    rbase: "ead2",
    name: "ead2-form",
    "n-start": String(start),
    cop2: "AND",
    champ2: "extfulltext",
    query2: commune,
    cop5: "AND",
    champ5: "id_annee",
    du5: String(year),
    locale: "fr",
  });
  const xml = await fetchText(`${BASE}/syndication/rss/results/getchannel.xml?${q}`);
  const total = Number(xml.match(/CDATA\[(\d+) r[ée]sultat/)?.[1] ?? 0);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const link = decodeEntities(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const enclosure = decodeEntities(it.match(/enclosure url="([^"]+)"/)?.[1] ?? "");
    // L'adresse de l'image est préfixée deux fois par le site : on garde la dernière.
    const viewer = enclosure.includes("ark:") ? enclosure.slice(enclosure.lastIndexOf("https://")) : null;
    return {
      c: new URL(link).searchParams.get("c") ?? "",
      years: stripTags(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
      viewer,
    };
  });
  return { total, items: items.filter((i) => i.c) };
}

async function fragment(item: RssItem): Promise<Omit<ArchiveRegister, "dept"> | null> {
  const html = await fetchText(`${BASE}/ead2-fragment.xsp?c=${encodeURIComponent(item.c)}`);
  const anc = html.match(/class="pl-pgd-ancestors">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const path = [...anc.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  // [collection, commune, paroisse ou série ?] — « Registres d'actes », « Tables » sont des séries, pas des paroisses.
  const commune = path[1] ?? "";
  const series = (t: string) => /^(registres?|tables?|actes|collection)/i.test(t);
  const parish = path.slice(2).find((t) => !series(t)) ?? null;
  const cote = stripTags(html.match(/class="pl-tbl-unitid">([\s\S]*?)<\/td>/)?.[1] ?? "") || null;
  const years = stripTags(html.match(/class="pl-tbl-unitdate">([\s\S]*?)<\/td>/)?.[1] ?? "") || item.years;
  const typesBlock = html.match(/Types d(?:'|&#0?39;|&apos;|’)actes\s*:\s*<\/span>([\s\S]*?)<\/p>/)?.[1] ?? "";
  const types = [...typesBlock.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  const docType = stripTags(html.match(/Types de documents\s*:\s*<\/span>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const viewer =
    item.viewer ?? decodeEntities(html.match(/pl-pgd-medias-thumbnail"[^>]*href="([^"]+)"/)?.[1] ?? "") ?? "";
  if (!viewer) return null;
  const typeLabel = types.join(", ") || docType || "Registre";
  const { kinds, isTable } = kindsOf(`${typeLabel} ${docType}`);
  return {
    id: item.c,
    commune,
    parish: parish && communeKey(parish) !== communeKey(commune) ? parish : null,
    typeLabel,
    kinds,
    isTable,
    years,
    cote,
    pages: null,
    url: viewer,
  };
}

async function search(commune: string, year: number): Promise<ArchiveSearchResult> {
  const items: RssItem[] = [];
  let total = Infinity;
  for (let start = 0; start < Math.min(total, 100); start += 20) {
    const page = await rssPage(commune, year, start);
    total = page.total;
    items.push(...page.items);
    if (page.items.length === 0) break;
  }
  const regs = (await mapLimit(items, 6, (it) => fragment(it).catch(() => null))).filter(
    (r): r is Omit<ArchiveRegister, "dept"> => !!r,
  );
  const key = communeKey(commune);
  const mine = regs.filter((r) => communeKey(r.commune) === key);
  if (!mine.length) {
    const others = [...new Set(regs.map((r) => r.commune).filter(Boolean))];
    return {
      ok: false,
      error: `Aucun registre de ${year} trouvé pour « ${commune} » aux Archives de la Mayenne.`,
      suggestions: others.slice(0, 6),
    };
  }
  return {
    ok: true,
    dept: "53",
    deptName: "Mayenne",
    commune: mine[0].commune,
    year,
    registers: mine.map((r) => ({ ...r, dept: "53" })),
  };
}

export const ad53: DepartmentConnector = { code: "53", name: "Mayenne", platform: "Pleade", search };
