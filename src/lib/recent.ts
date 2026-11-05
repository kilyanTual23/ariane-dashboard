/**
 * Fiches récemment ouvertes, par profil, gardées dans le navigateur :
 * elles alimentent la palette de commandes quand la recherche est vide.
 */
const key = (slug: string) => `ariane-recent-${slug}`;
const MAX = 12;

export function readRecent(slug: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(key(slug)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function pushRecent(slug: string, id: number) {
  try {
    const next = [id, ...readRecent(slug).filter((n) => n !== id)].slice(0, MAX);
    localStorage.setItem(key(slug), JSON.stringify(next));
  } catch {}
}
