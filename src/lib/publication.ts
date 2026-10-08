import type { Status } from "./types";

/**
 * Le cycle de vie d'une carte au-delà de la recherche :
 * une carte terminée (complète ou bloquée) doit être reportée sur Geneanet,
 * et une fois reportée elle est archivée — on n'y revient plus.
 */
export type Publication = "en cours" | "à mettre sur Geneanet" | "archivée";

export const PUBLICATIONS: Publication[] = ["en cours", "à mettre sur Geneanet", "archivée"];

export function publicationOf(person: {
  status: Status | string;
  geneanet_at: string | null;
}): Publication {
  if (person.geneanet_at) return "archivée";
  if (person.status === "Complet" || person.status === "Complet (lacunes)") {
    return "à mettre sur Geneanet";
  }
  return "en cours";
}

/** « 2026-09-16 08:45:43 » → « 16 septembre 2026 ». */
export function formatStamp(stamp?: string | null): string | null {
  if (!stamp) return null;
  const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return stamp;
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

export const GENEANET_URL = "https://www.geneanet.org/";
