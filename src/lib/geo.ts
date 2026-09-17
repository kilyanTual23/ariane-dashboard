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
 * Table des correspondances des régions françaises vers leur code INSEE
 */
const REGION_CODES: Record<string, string> = {
  "bretagne": "53",
  "normandie": "28",
  "pays de la loire": "52",
  "nouvelle-aquitaine": "75",
  "occitanie": "76",
  "auvergne-rhône-alpes": "84",
  "auvergne-rhone-alpes": "84",
  "île-de-france": "11",
  "ile-de-france": "11",
  "grand est": "44",
  "hauts-de-france": "32",
  "bourgogne-franche-comté": "27",
  "bourgogne-franche-comte": "27",
  "centre-val de loire": "24",
  "provence-alpes-côte d'azur": "93",
  "provence-alpes-cote d'azur": "93",
  "corse": "94",
};

function normStr(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Coordonnées par défaut ou connues pour les grandes villes / arrondissements
 */
const KNOWN_FALLBACKS: Record<string, { lat: number; lng: number }> = {
  "paris": { lat: 48.8566, lng: 2.3522 },
  "rennes": { lat: 48.1173, lng: -1.6778 },
  "fougères": { lat: 48.3541, lng: -1.2036 },
  "fougeres": { lat: 48.3541, lng: -1.2036 },
};

async function geocodeCommune(
  name: string,
  fullContext?: string,
): Promise<{ lat: number; lng: number } | null> {
  const clean = name.trim();
  const context = fullContext?.trim() ?? "";
  const key = `${normStr(clean)}::${normStr(context)}`;

  if (geoCoordsCache.has(key)) {
    return geoCoordsCache.get(key)!;
  }

  const normClean = normStr(clean);

  // Vérifier les fallbacks connus
  if (KNOWN_FALLBACKS[normClean]) {
    geoCoordsCache.set(key, KNOWN_FALLBACKS[normClean]);
    return KNOWN_FALLBACKS[normClean];
  }

  // Détection d'un éventuel code postal à 5 chiffres dans le contexte
  const cpMatch = context.match(/\b(\d{5})\b/);
  const postalCode = cpMatch ? cpMatch[1] : null;

  // Détection de la région attendue dans le contexte
  let expectedRegionCode: string | null = null;
  const normContext = normStr(context);
  for (const [regName, regCode] of Object.entries(REGION_CODES)) {
    if (normContext.includes(normStr(regName))) {
      expectedRegionCode = regCode;
      break;
    }
  }

  // 1. Si un code postal est présent, tenter la recherche ciblée par codePostal
  if (postalCode) {
    try {
      const urlCp = `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,codeDepartement,codeRegion,codesPostaux,centre`;
      const resCp = await fetch(urlCp, { signal: AbortSignal.timeout(3000) });
      if (resCp.ok) {
        const list = (await resCp.json()) as Array<{
          nom: string;
          centre?: { coordinates?: [number, number] };
        }>;
        const exact = list.find((c) => normStr(c.nom) === normClean);
        if (exact?.centre?.coordinates) {
          const [lng, lat] = exact.centre.coordinates;
          const coords = { lat, lng };
          geoCoordsCache.set(key, coords);
          return coords;
        }
        if (list[0]?.centre?.coordinates) {
          const [lng, lat] = list[0].centre.coordinates;
          const coords = { lat, lng };
          geoCoordsCache.set(key, coords);
          return coords;
        }
      }
    } catch {
      // Poursuivre vers la recherche par nom
    }
  }

  // 2. Recherche par nom de commune (SANS boost=population pour ne pas biaiser vers de grandes villes homonymes)
  try {
    const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(clean)}&fields=nom,codeDepartement,codeRegion,codesPostaux,centre&limit=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const candidates = (await res.json()) as Array<{
        nom: string;
        codeDepartement: string;
        codeRegion: string;
        codesPostaux?: string[];
        centre?: { coordinates?: [number, number] };
      }>;

      if (candidates && candidates.length > 0) {
        let best = candidates[0];
        let bestScore = -1;

        for (const cand of candidates) {
          let score = 0;
          const candNorm = normStr(cand.nom);

          // Correspondance exacte sur le nom de commune
          if (candNorm === normClean) {
            score += 100;
          } else if (candNorm.startsWith(normClean) || normClean.startsWith(candNorm)) {
            score += 30;
          }

          // Concordance régionale
          if (expectedRegionCode && cand.codeRegion === expectedRegionCode) {
            score += 60;
          }

          // Concordance de code postal
          if (postalCode && cand.codesPostaux?.includes(postalCode)) {
            score += 80;
          }

          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }

        if (best?.centre?.coordinates) {
          const [lng, lat] = best.centre.coordinates;
          const coords = { lat, lng };
          geoCoordsCache.set(key, coords);
          return coords;
        }
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
      const coords = await geocodeCommune(communeName, data.fullName);
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

