import type { ActKind } from "./types";

/** « Saint-Aubin-du-Cormier » → « SAINT AUBIN DU CORMIER » : sans accents, sans ponctuation. */
export function communeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`-]/g, " ")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\bSTE\b/gi, "SAINTE")
    .replace(/\bST\b/gi, "SAINT")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Types d'actes couverts par un registre, d'après son libellé. */
export function kindsOf(label: string): { kinds: ActKind[]; isTable: boolean } {
  const l = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const kinds = new Set<ActKind>();
  if (/bapt|naiss|nmd|bms/.test(l)) kinds.add("birth");
  if (/mari|bans|publication|nmd|bms/.test(l)) kinds.add("marriage");
  if (/deces|sepult|inhum|nmd|bms/.test(l)) kinds.add("death");
  return { kinds: [...kinds], isTable: /table/.test(l) };
}

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Site d’archives indisponible (${res.status})`);
  return res.text();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Exécute des tâches avec au plus `limit` en parallèle (on reste poli avec les sites d'archives). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Noms les plus proches (pour suggérer quand la commune n'est pas reconnue). */
export function closest(target: string, candidates: string[], n = 5): string[] {
  const t = communeKey(target);
  const score = (c: string) => {
    const k = communeKey(c);
    if (k.startsWith(t) || t.startsWith(k)) return 0;
    if (k.includes(t) || t.includes(k)) return 1;
    // distance de Levenshtein bornée
    const a = t, b = k;
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return 2 + dp[b.length];
  };
  return candidates
    .map((c) => [c, score(c)] as const)
    .sort((x, y) => x[1] - y[1])
    .slice(0, n)
    .filter(([, s]) => s < 6)
    .map(([c]) => c);
}
