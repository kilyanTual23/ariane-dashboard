import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type CommuneSuggestion = {
  /** Ce qui sera écrit dans la fiche : « Billé, Bretagne, France ». */
  value: string;
  /** Ce qu'on lit dans la liste : le département lève l'ambiguïté des homonymes. */
  hint: string;
};

type GeoCommune = {
  nom: string;
  departement?: { nom?: string; code?: string };
  region?: { nom?: string };
};

// Les mêmes communes reviennent sans arrêt : un cache mémoire suffit.
const cache = new Map<string, { at: number; data: CommuneSuggestion[] }>();
const TTL = 1000 * 60 * 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return NextResponse.json([]);

  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  try {
    const url =
      `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}` +
      `&fields=nom,departement,region&boost=population&limit=8`;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return NextResponse.json([]);

    const communes = (await response.json()) as GeoCommune[];
    const data: CommuneSuggestion[] = communes.map((c) => ({
      value: [c.nom, c.region?.nom, "France"].filter(Boolean).join(", "),
      hint: c.departement?.nom ? `${c.departement.nom} (${c.departement.code})` : "",
    }));

    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    // Hors ligne ou API indisponible : les lieux déjà saisis suffisent.
    return NextResponse.json([]);
  }
}
