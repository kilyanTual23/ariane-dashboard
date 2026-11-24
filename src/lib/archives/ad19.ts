import type { ArchiveRegister, ArchiveSearchResult, DepartmentConnector } from "./types";
import { closest, communeKey, decodeEntities, fetchText, kindsOf, registerLabel, stripTags } from "./util";

/**
 * Corrèze (19) — plateforme Mnesys, formulaire « État civil » (recherche ciblée, en GET).
 * Le formulaire porte la liste des lieux : « Tulle (Corrèze, France) » pour une commune,
 * « Saint-Martin (Tulle, Corrèze, France ; paroisse) » pour une paroisse d'une commune.
 * On interroge la commune et ses paroisses, pour l'année, puis on lit la liste des résultats.
 */
const BASE = "https://www.archives.correze.fr";
const FORM = "3b1ba8cc-6c08-47cd-a90e-f9b231fdc30f";

let placesCache: { at: number; list: string[] } | null = null;

async function places(): Promise<string[]> {
  if (placesCache && Date.now() - placesCache.at < 24 * 3600 * 1000) return placesCache.list;
  const html = await fetchText(`${BASE}/search/form/${FORM}`);
  const raw = html.match(/data-name="0-controlledAccessGeographicName"[\s\S]*?data-options="([^"]*)"/)?.[1];
  const list = raw ? (JSON.parse(decodeEntities(raw)) as string[]) : [];
  if (list.length) placesCache = { at: Date.now(), list };
  return list;
}

/** « Saint-Martin (Tulle, Corrèze, France ; paroisse) » → { name: "Saint-Martin", parent: "Tulle" }. */
function parsePlace(label: string): { name: string; parent: string | null } {
  const m = label.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return { name: label, parent: null };
  const inner = m[2].split(";")[0].split(",").map((s) => s.trim());
  return { name: m[1], parent: inner.length > 2 ? inner[0] : null };
}

async function search(commune: string, year: number): Promise<ArchiveSearchResult> {
  const list = await places();
  const key = communeKey(commune);
  const parsed = list.map((label) => ({ label, ...parsePlace(label) }));
  // La commune elle-même (sans parent) et ses paroisses / anciennes communes rattachées.
  const own = parsed.filter((p) => communeKey(p.name) === key && !p.parent);
  const children = parsed.filter((p) => p.parent && communeKey(p.parent) === key);
  const picked = own.length ? [...own, ...children] : parsed.filter((p) => communeKey(p.name) === key);
  if (!picked.length) {
    return {
      ok: false,
      error: `« ${commune} » ne figure pas dans la liste des communes des Archives de la Corrèze.`,
      suggestions: closest(commune, [...new Set(parsed.filter((p) => !p.parent).map((p) => p.name))]),
    };
  }

  const q = new URLSearchParams({ formUuid: FORM, mode: "list", sort: "date_asc", resultsPerPage: "80", "2-date": String(year) });
  for (const p of picked) q.append("0-controlledAccessGeographicName[]", p.label);
  const html = await fetchText(`${BASE}/search/results?${q}`);

  const registers: ArchiveRegister[] = [];
  for (const [, li] of html.matchAll(/<li class="element-list">([\s\S]*?)<div class="record-actions">/g)) {
    const viewer = li.match(/href="(\/ark:\/[^"]+\/[0-9a-f-]{36})"/)?.[1];
    if (!viewer) continue; // notice sans image numérisée
    const title = stripTags(li.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    const years = stripTags(li.match(/<h3>Date<\/h3>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "").replace(/\s*-\s*/g, "-");
    const cote = stripTags(li.match(/class="referenceCodes">([\s\S]*?)<\/p>/)?.[1] ?? "") || null;
    const pages = Number(li.match(/(\d+)\s*medias?/)?.[1] ?? 0) || null;
    // Contexte : [« Contexte : … », commune, (paroisse), intitulé]
    const ctx = [...li.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => stripTags(m[1])).filter((t) => !/^Contexte/.test(t));
    const parishRaw = ctx.find((t) => /^paroisses? d/i.test(t) && !t.includes(":"));
    const parish = parishRaw ? parishRaw.replace(/^paroisses?\s+(de\s+|d[’'])?/i, "").replace(/\.$/, "") : null;
    // L'intitulé sans les années : « Baptêmes, mariages, sépultures (1778-1782) » → « Baptêmes, mariages, sépultures ».
    const rawType = title.replace(/\s*\([^)]*\d{4}[^)]*\)\.?\s*$/, "");
    const { kinds, isTable } = kindsOf(rawType);
    registers.push({
      id: cote ? `${cote}|${viewer}` : viewer,
      dept: "19",
      commune,
      parish,
      typeLabel: registerLabel(rawType, years),
      kinds,
      isTable,
      years: years || String(year),
      cote,
      pages,
      url: BASE + viewer,
    });
  }

  if (!registers.length) {
    return { ok: false, error: `Aucun registre numérisé de ${year} pour ${own[0]?.name ?? commune} aux Archives de la Corrèze.` };
  }
  return { ok: true, dept: "19", deptName: "Corrèze", commune: own[0]?.name ?? commune, year, registers };
}

export const ad19: DepartmentConnector = { code: "19", name: "Corrèze", platform: "Mnesys", search };
