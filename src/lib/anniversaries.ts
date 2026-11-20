import type { Person } from "./types";

/**
 * Anniversaires (naissance, mariage, décès) tombant hier, aujourd'hui ou demain.
 * Seules les dates exactes au jour près comptent (champ *_iso, « AAAA-MM-JJ »).
 */

export type AnniversaryDay = "hier" | "aujourdhui" | "demain";
export type AnniversaryKind = "naissance" | "mariage" | "deces";

export type Anniversary = {
  day: AnniversaryDay;
  kind: AnniversaryKind;
  /** Fiche vers laquelle pointer (pour un mariage : le premier conjoint). */
  personId: number;
  /** Nom court : « Jean TUAL » ou « Jean TUAL et Marie ROBERT ». */
  label: string;
  /** Nom complet, pour l'infobulle. */
  fullLabel: string;
  year: number;
  /** Années écoulées depuis l'événement. */
  years: number;
  /** Naissance d'une personne vivante : c'est son âge. */
  living: boolean;
};

const DAYS: AnniversaryDay[] = ["hier", "aujourdhui", "demain"];

/** Date du jour à Paris (le serveur peut tourner en UTC). */
function parisToday(now = new Date()): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return { y, m, d };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Clé « MM-JJ » d'un événement pour l'année donnée ; un 29 février se fête le 28 les années non bissextiles. */
function keyIn(month: number, day: number, year: number) {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return `${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

export function upcomingAnniversaries(persons: Person[], now = new Date()): Anniversary[] {
  const today = parisToday(now);
  // Hier, aujourd'hui, demain : clé « MM-JJ » → jour, avec l'année de chacun (utile au 1er janvier).
  const slots = new Map<string, { day: AnniversaryDay; year: number }>();
  DAYS.forEach((day, i) => {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d + i - 1));
    const y = date.getUTCFullYear();
    slots.set(keyIn(date.getUTCMonth() + 1, date.getUTCDate(), y), { day, year: y });
  });

  const byId = new Map(persons.map((p) => [p.id, p]));
  // Premier prénom + nom : la ligne reste courte.
  const short = (p: Person | undefined, fallback: string) =>
    p ? `${p.given_names.trim().split(/\s+/)[0] ?? ""} ${p.surname ?? ""}`.trim() || p.displayName : fallback;

  const out: Anniversary[] = [];
  const add = (
    iso: string | null | undefined,
    kind: AnniversaryKind,
    personId: number,
    label: string,
    fullLabel: string,
    living = false,
  ) => {
    const date = parseIso(iso);
    if (!date) return;
    for (const [key, slot] of slots) {
      if (key !== keyIn(date.m, date.d, slot.year)) continue;
      const years = slot.year - date.y;
      if (years >= 1) out.push({ day: slot.day, kind, personId, label, fullLabel, year: date.y, years, living });
    }
  };

  const seenUnions = new Set<number>();
  for (const p of persons) {
    const name = short(p, p.displayName);
    add(p.birth_date_iso, "naissance", p.id, name, p.displayName, !!p.is_living);
    if (!p.is_living) add(p.death_date_iso, "deces", p.id, name, p.displayName);
    for (const u of p.unions) {
      if (seenUnions.has(u.id)) continue;
      seenUnions.add(u.id);
      const spouse = u.spouse ? short(byId.get(u.spouse.id), u.spouse.displayName) : null;
      add(
        u.date_iso,
        "mariage",
        p.id,
        spouse ? `${name} et ${spouse}` : name,
        u.spouse ? `${p.displayName} et ${u.spouse.displayName}` : p.displayName,
      );
    }
  }

  // Aujourd'hui d'abord, puis demain, puis hier ; les plus anciens en premier à l'intérieur d'un jour.
  const order: Record<AnniversaryDay, number> = { aujourdhui: 0, demain: 1, hier: 2 };
  return out.sort((a, b) => order[a.day] - order[b.day] || a.year - b.year);
}
