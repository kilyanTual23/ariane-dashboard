import type { Person } from "./types";
import { commune } from "./stats";

export type PlaceEventType = "birth" | "marriage" | "death";

export type PlaceEvent = {
  personId: number;
  personName: string;
  sosa: number | null;
  type: PlaceEventType;
  year: number | null;
  dateRaw: string | null;
};

export type PlaceCluster = {
  commune: string;
  fullName: string;
  lat: number;
  lng: number;
  events: PlaceEvent[];
};

// Cache persistant en mémoire pour éviter de réinterroger geo.api.gouv.fr à chaque vue
const geoCoordsCache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Coordonnées par défaut ou connues pour les grandes villes / arrondissements
 */
const KNOWN_FALLBACKS: Record<string, { lat: number; lng: number }> = {
  "paris": { lat: 48.8566, lng: 2.3522 },
  "rennes": { lat: 48.1173, lng: -1.6778 },
  "fougères": { lat: 48.3541, lng: -1.2036 },
  "fougeres": { lat: 48.3541, lng: -1.2036 },
};

async function geocodeCommune(name: string): Promise<{ lat: number; lng: number } | null> {
  const clean = name.trim();
  const key = clean.toLowerCase();

  if (geoCoordsCache.has(key)) {
    return geoCoordsCache.get(key)!;
  }

  // Vérifier les fallbacks connus
  if (KNOWN_FALLBACKS[key]) {
    geoCoordsCache.set(key, KNOWN_FALLBACKS[key]);
    return KNOWN_FALLBACKS[key];
  }

  // Nettoyage si arrondissement ou adresse (ex: "6e Arrondissement" -> "Paris")
  let searchName = clean;
  if (/arrondissement/i.test(clean)) {
    searchName = "Paris";
  } else if (/rue|boulevard|avenue/i.test(clean)) {
    // Si c'est une adresse de rue, essayer de chercher Fougères ou la commune parente
    searchName = "Fougères";
  }

  try {
    const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(searchName)}&fields=nom,centre&boost=population&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as Array<{ centre?: { coordinates?: [number, number] } }>;
      if (data && data[0]?.centre?.coordinates) {
        const [lng, lat] = data[0].centre.coordinates;
        const coords = { lat, lng };
        geoCoordsCache.set(key, coords);
        return coords;
      }
    }
  } catch {
    // Hors ligne ou timeout
  }

  geoCoordsCache.set(key, null);
  return null;
}

/**
 * Extrait et regroupe tous les événements géolocalisés des ancêtres.
 */
export async function getGeocodedPlaces(persons: Person[]): Promise<PlaceCluster[]> {
  const map = new Map<string, { fullName: string; events: PlaceEvent[] }>();

  for (const p of persons) {
    // 1. Naissance
    if (p.birth_place) {
      const c = commune(p.birth_place);
      if (c) {
        if (!map.has(c)) map.set(c, { fullName: p.birth_place, events: [] });
        map.get(c)!.events.push({
          personId: p.id,
          personName: p.displayName,
          sosa: p.sosa,
          type: "birth",
          year: p.birth_year,
          dateRaw: p.birth_date_raw,
        });
      }
    }

    // 2. Décès
    if (p.death_place) {
      const c = commune(p.death_place);
      if (c) {
        if (!map.has(c)) map.set(c, { fullName: p.death_place, events: [] });
        map.get(c)!.events.push({
          personId: p.id,
          personName: p.displayName,
          sosa: p.sosa,
          type: "death",
          year: p.death_year,
          dateRaw: p.death_date_raw,
        });
      }
    }

    // 3. Mariages
    for (const u of p.unions) {
      if (u.place) {
        const c = commune(u.place);
        if (c) {
          if (!map.has(c)) map.set(c, { fullName: u.place, events: [] });
          // Éviter de dupliquer pour les deux conjoints
          const existing = map.get(c)!.events.some(
            (e) => e.personId === p.id && e.type === "marriage" && e.year === u.year,
          );
          if (!existing) {
            map.get(c)!.events.push({
              personId: p.id,
              personName: `${p.displayName} ${u.spouse ? `& ${u.spouse.displayName}` : ""}`.trim(),
              sosa: p.sosa,
              type: "marriage",
              year: u.year,
              dateRaw: u.date_raw,
            });
          }
        }
      }
    }
  }

  // Résoudre les coordonnées en parallèle
  const clusters: PlaceCluster[] = [];
  const entries = [...map.entries()];

  await Promise.all(
    entries.map(async ([communeName, data]) => {
      const coords = await geocodeCommune(communeName);
      if (coords) {
        clusters.push({
          commune: communeName,
          fullName: data.fullName,
          lat: coords.lat,
          lng: coords.lng,
          events: data.events.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999)),
        });
      }
    }),
  );

  // Trier par nombre d'événements décroissant
  return clusters.sort((a, b) => b.events.length - a.events.length);
}
