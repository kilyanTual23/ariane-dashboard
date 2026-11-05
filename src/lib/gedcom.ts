import { parseDateInput } from "@/lib/dates";
import type { Person, UnionRow } from "@/lib/types";

/**
 * Mois abrégés en anglais standard GEDCOM.
 */
const GEDCOM_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/**
 * Formate une date quelconque vers la syntaxe standard reconnue par Geneanet (GEDCOM 5.5.1).
 *
 * Exemples :
 * - "19 novembre 1882" / "1882-11-19" -> "19 NOV 1882"
 * - "vers 1810" / "~1810" -> "ABT 1810"
 * - "avant 1900" -> "BEF 1900"
 * - "après 1850" -> "AFT 1850"
 * - "novembre 1882" -> "NOV 1882"
 * - "1882" -> "1882"
 */
export function formatDateToGedcom(raw?: string | null, iso?: string | null): string | null {
  const input = iso || raw;
  if (!input || !input.trim()) return null;

  const parsed = parseDateInput(input);
  if (!parsed.recognized || !parsed.year) {
    // Si l'analyseur standard n'a pas reconnu de date précise, vérifions si on a au moins une année à 4 chiffres
    const mYear = input.match(/\b(\d{4})\b/);
    if (mYear) {
      if (/vers|environ|ca|~/i.test(input)) return `ABT ${mYear[1]}`;
      if (/avant|<|bef/i.test(input)) return `BEF ${mYear[1]}`;
      if (/après|apres|>|aft/i.test(input)) return `AFT ${mYear[1]}`;
      return mYear[1];
    }
    return null;
  }

  let dateStr = "";
  if (parsed.iso) {
    const parts = parsed.iso.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      if (monthIdx >= 0 && monthIdx < 12) {
        dateStr = `${day} ${GEDCOM_MONTHS[monthIdx]} ${year}`;
      }
    }
  }

  if (!dateStr) {
    // Cas mois + année ou année seule
    const canon = parsed.canonical || "";
    // Recherche si un mois français est présent
    const frenchMonths = [
      "janvier", "février", "mars", "avril", "mai", "juin",
      "juillet", "août", "septembre", "octobre", "novembre", "décembre"
    ];
    let foundMonth = -1;
    for (let i = 0; i < frenchMonths.length; i++) {
      if (canon.toLowerCase().includes(frenchMonths[i])) {
        foundMonth = i;
        break;
      }
    }

    if (foundMonth !== -1) {
      const mDay = canon.match(/\b(\d{1,2})\b/);
      // si un jour a été trouvé avant le mois
      if (mDay && parsed.precision === "day") {
        dateStr = `${mDay[1]} ${GEDCOM_MONTHS[foundMonth]} ${parsed.year}`;
      } else {
        dateStr = `${GEDCOM_MONTHS[foundMonth]} ${parsed.year}`;
      }
    } else {
      dateStr = `${parsed.year}`;
    }
  }

  switch (parsed.qualifier) {
    case "about":
      return `ABT ${dateStr}`;
    case "before":
      return `BEF ${dateStr}`;
    case "after":
      return `AFT ${dateStr}`;
    case "exact":
    default:
      return dateStr;
  }
}

/**
 * Normalise un lieu pour l'index géographique de Geneanet.
 * Convention préconisée par Geneanet :
 * "Commune, Code Insee, Département, Région, Pays"
 *
 * Évite les doubles virgules sales et garantit un découpage propre.
 */
export function formatPlaceToGedcom(place?: string | null): string | null {
  if (!place || !place.trim()) return null;
  const parts = place
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  return parts.join(", ");
}

/**
 * Nettoie une chaîne de texte pour éviter les sauts de lignes illégaux dans les balises GEDCOM simples.
 */
function cleanText(str?: string | null): string {
  if (!str) return "";
  return str.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Écrit un bloc de texte multi-lignes GEDCOM (NOTE ou SOUR TEXT) avec CONT/CONC.
 */
function appendMultiline(lines: string[], level: number, tag: string, text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split("\n");
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (i === 0) {
      lines.push(`${level} ${tag} ${p}`);
    } else {
      lines.push(`${level + 1} CONT ${p}`);
    }
  }
}

export type GedcomExportOptions = {
  /** Exporter uniquement les ascendants directs avec numéro SOSA */
  sosaOnly?: boolean;
  /** Inclure les transcriptions et liens d'actes dans les balises SOUR */
  includeSources?: boolean;
  /** Inclure les notes individuelles */
  includeNotes?: boolean;
  /** Masquer les détails des personnes vivantes ou de moins de 100 ans */
  protectLiving?: boolean;
};

/**
 * Génère le fichier GEDCOM 5.5.1 complet conforme à Geneanet.
 */
export function generateGedcom(
  profileName: string,
  persons: Person[],
  unions: UnionRow[],
  parentChildLinks: { parent_id: number; child_id: number }[],
  options: GedcomExportOptions = {},
): string {
  const {
    sosaOnly = false,
    includeSources = true,
    includeNotes = true,
    protectLiving = false,
  } = options;

  const currentYear = new Date().getFullYear();

  // Filtrer les personnes si sosaOnly est activé
  const exportPersons = sosaOnly
    ? persons.filter((p) => p.sosa !== null && p.sosa !== undefined)
    : persons;

  const exportedIds = new Set(exportPersons.map((p) => p.id));

  const lines: string[] = [];

  // 1. En-tête GEDCOM 5.5.1
  lines.push("0 HEAD");
  lines.push("1 SOUR ARIANE_DASHBOARD");
  lines.push("2 NAME Ariane Dashboard Généalogique");
  lines.push("2 VERS 1.0");
  lines.push("1 DEST GENEANET");
  const now = new Date();
  const todayGedcom = `${now.getDate()} ${GEDCOM_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  lines.push(`1 DATE ${todayGedcom}`);
  lines.push(`2 TIME ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`);
  lines.push("1 GEDC");
  lines.push("2 VERS 5.5.1");
  lines.push("2 FORM LINEAGE-LINKED");
  lines.push("1 CHAR UTF-8");
  lines.push(`1 NOTE Export du profil : ${profileName}`);

  // Relations parents-enfants indexées par enfant et par couple
  const parentsOf = new Map<number, number[]>();
  for (const link of parentChildLinks) {
    if (exportedIds.has(link.child_id) && exportedIds.has(link.parent_id)) {
      const list = parentsOf.get(link.child_id) ?? [];
      list.push(link.parent_id);
      parentsOf.set(link.child_id, list);
    }
  }

  // Filtrer et indexer les unions
  // Une famille GEDCOM (FAM) existe :
  // - soit via un enregistrement UnionRow valide
  // - soit via un couple parental d'un enfant
  type FamilyRecord = {
    id: string;
    unionId?: number;
    husbandId?: number;
    wifeId?: number;
    childrenIds: Set<number>;
    dateRaw?: string | null;
    dateIso?: string | null;
    place?: string | null;
    source?: string | null;
    notes?: string | null;
  };

  const familiesMap = new Map<string, FamilyRecord>();
  let famCounter = 1;

  // Création des familles issues des unions
  for (const u of unions) {
    const p1 = u.partner1_id && exportedIds.has(u.partner1_id) ? u.partner1_id : null;
    const p2 = u.partner2_id && exportedIds.has(u.partner2_id) ? u.partner2_id : null;

    if (!p1 && !p2) continue; // Ni l'un ni l'autre n'est exporté

    const person1 = p1 ? exportPersons.find((p) => p.id === p1) : null;
    const person2 = p2 ? exportPersons.find((p) => p.id === p2) : null;

    let husbandId: number | undefined;
    let wifeId: number | undefined;

    if (person1?.sex === "M") husbandId = person1.id;
    else if (person1?.sex === "F") wifeId = person1.id;

    if (person2?.sex === "M") husbandId = person2.id;
    else if (person2?.sex === "F") wifeId = person2.id;

    // Si sexe non précisé pour un des conjoints
    if (!husbandId && person1 && person1.id !== wifeId) husbandId = person1.id;
    if (!wifeId && person2 && person2.id !== husbandId) wifeId = person2.id;
    if (!husbandId && person2 && person2.id !== wifeId) husbandId = person2.id;
    if (!wifeId && person1 && person1.id !== husbandId) wifeId = person1.id;

    const famKey = [p1, p2].filter(Boolean).sort().join("_");
    const famId = `F${famCounter++}`;

    familiesMap.set(famKey, {
      id: famId,
      unionId: u.id,
      husbandId,
      wifeId,
      childrenIds: new Set<number>(),
      dateRaw: u.date_raw,
      dateIso: u.date_iso,
      place: u.place,
      source: u.source,
      notes: u.notes,
    });
  }

  // Associer les enfants aux familles ou créer des familles monoparentales si besoin
  for (const [childId, parentIds] of parentsOf.entries()) {
    if (parentIds.length === 2) {
      const famKey = [parentIds[0], parentIds[1]].sort().join("_");
      let fam = familiesMap.get(famKey);
      if (!fam) {
        // Couple non déclaré dans unions, on crée une famille
        const p1 = exportPersons.find((p) => p.id === parentIds[0]);
        const p2 = exportPersons.find((p) => p.id === parentIds[1]);
        const husbandId = p1?.sex === "M" ? p1.id : p2?.sex === "M" ? p2.id : p1?.id;
        const wifeId = p1?.sex === "F" ? p1.id : p2?.sex === "F" ? p2.id : p2?.id;
        fam = {
          id: `F${famCounter++}`,
          husbandId,
          wifeId,
          childrenIds: new Set<number>(),
        };
        familiesMap.set(famKey, fam);
      }
      fam.childrenIds.add(childId);
    } else if (parentIds.length === 1) {
      // Monoparental
      const singleParentId = parentIds[0];
      const famKey = `SINGLE_${singleParentId}`;
      let fam = familiesMap.get(famKey);
      if (!fam) {
        const p = exportPersons.find((item) => item.id === singleParentId);
        fam = {
          id: `F${famCounter++}`,
          husbandId: p?.sex === "M" ? p.id : undefined,
          wifeId: p?.sex === "F" ? p.id : undefined,
          childrenIds: new Set<number>(),
        };
        if (!fam.husbandId && !fam.wifeId) {
          fam.husbandId = singleParentId;
        }
        familiesMap.set(famKey, fam);
      }
      fam.childrenIds.add(childId);
    }
  }

  // Associer à chaque individu les familles où il est époux (FAMS) et enfant (FAMC)
  const famsOfPerson = new Map<number, string[]>();
  const famcOfPerson = new Map<number, string>();

  for (const fam of familiesMap.values()) {
    if (fam.husbandId) {
      const list = famsOfPerson.get(fam.husbandId) ?? [];
      list.push(fam.id);
      famsOfPerson.set(fam.husbandId, list);
    }
    if (fam.wifeId && fam.wifeId !== fam.husbandId) {
      const list = famsOfPerson.get(fam.wifeId) ?? [];
      list.push(fam.id);
      famsOfPerson.set(fam.wifeId, list);
    }
    for (const childId of fam.childrenIds) {
      famcOfPerson.set(childId, fam.id);
    }
  }

  // 2. Export des Individus (INDI)
  for (const p of exportPersons) {
    const isLiving =
      p.is_living === 1 ||
      (!p.death_year && !p.death_date_raw && p.birth_year && currentYear - p.birth_year < 100);

    const isMasked = protectLiving && isLiving;

    lines.push(`0 @I${p.id}@ INDI`);

    // Nom et Prénom
    const given = isMasked ? "Ne pas divulguer" : cleanText(p.given_names);
    const surname = isMasked ? "" : cleanText(p.surname).toUpperCase();
    lines.push(`1 NAME ${given} /${surname}/`);
    if (given) lines.push(`2 GIVN ${given}`);
    if (surname) lines.push(`2 SURN ${surname}`);

    // Sexe
    if (p.sex === "M" || p.sex === "F") {
      lines.push(`1 SEX ${p.sex}`);
    } else {
      lines.push(`1 SEX U`);
    }

    // Numéro SOSA (Geneanet le lit nativement)
    if (p.sosa) {
      lines.push(`1 _SOSA ${p.sosa}`);
    }

    if (!isMasked) {
      // Profession
      if (p.occupation?.trim()) {
        lines.push(`1 OCCU ${cleanText(p.occupation)}`);
      }

      // Naissance
      const birthDateGed = formatDateToGedcom(p.birth_date_raw, p.birth_date_iso);
      const birthPlaceGed = formatPlaceToGedcom(p.birth_place);
      if (birthDateGed || birthPlaceGed || (includeSources && p.birth_source?.trim())) {
        lines.push("1 BIRT");
        if (birthDateGed) lines.push(`2 DATE ${birthDateGed}`);
        if (birthPlaceGed) lines.push(`2 PLAC ${birthPlaceGed}`);
        if (includeSources && p.birth_source?.trim()) {
          appendMultiline(lines, 2, "SOUR", p.birth_source.trim());
        }
      }

      // Décès
      if (p.is_living !== 1) {
        const deathDateGed = formatDateToGedcom(p.death_date_raw, p.death_date_iso);
        const deathPlaceGed = formatPlaceToGedcom(p.death_place);
        const hasDeathInfo = deathDateGed || deathPlaceGed || (includeSources && p.death_source?.trim());

        if (hasDeathInfo) {
          lines.push("1 DEAT");
          if (deathDateGed) lines.push(`2 DATE ${deathDateGed}`);
          if (deathPlaceGed) lines.push(`2 PLAC ${deathPlaceGed}`);
          if (includeSources && p.death_source?.trim()) {
            appendMultiline(lines, 2, "SOUR", p.death_source.trim());
          }
        } else if (p.death_year || (p.birth_year && currentYear - p.birth_year >= 110)) {
          // Personne clairement décédée sans détails
          lines.push("1 DEAT Y");
        }
      }

      // Notes
      if (includeNotes && p.notes?.trim()) {
        appendMultiline(lines, 1, "NOTE", p.notes.trim());
      }
    } else {
      // Confidentialité
      lines.push("1 RESN privacy");
    }

    // Liens de familles (FAMS & FAMC)
    const famc = famcOfPerson.get(p.id);
    if (famc) {
      lines.push(`1 FAMC @${famc}@`);
    }

    const famsList = famsOfPerson.get(p.id) ?? [];
    for (const famId of famsList) {
      lines.push(`1 FAMS @${famId}@`);
    }
  }

  // 3. Export des Familles (FAM)
  for (const fam of familiesMap.values()) {
    lines.push(`0 @${fam.id}@ FAM`);
    if (fam.husbandId) lines.push(`1 HUSB @I${fam.husbandId}@`);
    if (fam.wifeId) lines.push(`1 WIFE @I${fam.wifeId}@`);

    // Enfants
    for (const childId of fam.childrenIds) {
      lines.push(`1 CHIL @I${childId}@`);
    }

    // Mariage
    const marrDateGed = formatDateToGedcom(fam.dateRaw, fam.dateIso);
    const marrPlaceGed = formatPlaceToGedcom(fam.place);
    const hasMarrInfo = marrDateGed || marrPlaceGed || (includeSources && fam.source?.trim());

    if (hasMarrInfo) {
      lines.push("1 MARR");
      if (marrDateGed) lines.push(`2 DATE ${marrDateGed}`);
      if (marrPlaceGed) lines.push(`2 PLAC ${marrPlaceGed}`);
      if (includeSources && fam.source?.trim()) {
        appendMultiline(lines, 2, "SOUR", fam.source.trim());
      }
    }

    if (includeNotes && fam.notes?.trim()) {
      appendMultiline(lines, 1, "NOTE", fam.notes.trim());
    }
  }

  // Fin du fichier GEDCOM
  lines.push("0 TRLR");

  return lines.join("\n") + "\n";
}

