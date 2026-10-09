import type { Person } from "./types";

export type AnomalySeverity = "error" | "warning";

export type Anomaly = {
  id: string;
  severity: AnomalySeverity;
  personId: number;
  personName: string;
  title: string;
  description: string;
  relatedPersonId?: number;
  relatedPersonName?: string;
};

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Analyse une personne donnée et détecte ses incohérences chronologiques et biologiques.
 */
export function detectPersonAnomalies(
  person: Person,
  byId: Map<number, Person>,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // 1. Décès avant naissance
  if (person.birth_year && person.death_year && person.death_year < person.birth_year) {
    anomalies.push({
      id: `${person.id}-death-before-birth`,
      severity: "error",
      personId: person.id,
      personName: person.displayName,
      title: "Décès antérieur à la naissance",
      description: `Décès indiqué en ${person.death_year} alors que la naissance est en ${person.birth_year}.`,
    });
  } else if (
    person.birth_date_iso &&
    person.death_date_iso &&
    person.death_date_iso < person.birth_date_iso
  ) {
    anomalies.push({
      id: `${person.id}-death-date-before-birth`,
      severity: "error",
      personId: person.id,
      personName: person.displayName,
      title: "Date de décès antérieure à la naissance",
      description: `Date de décès (${person.death_date_raw}) antérieure à la date de naissance (${person.birth_date_raw}).`,
    });
  }

  // 2. Longévité exceptionnelle (> 115 ans)
  if (
    person.birth_year &&
    person.death_year &&
    person.death_year - person.birth_year > 115
  ) {
    anomalies.push({
      id: `${person.id}-longevity-over-115`,
      severity: "warning",
      personId: person.id,
      personName: person.displayName,
      title: "Longévité inhabituelle",
      description: `Âge au décès de ${person.death_year - person.birth_year} ans (${person.birth_year} - ${person.death_year}). À vérifier dans les registres.`,
    });
  }

  // 3. Personne marquée vivante de plus de 110 ans
  if (person.is_living && person.birth_year && CURRENT_YEAR - person.birth_year > 110) {
    anomalies.push({
      id: `${person.id}-living-over-110`,
      severity: "error",
      personId: person.id,
      personName: person.displayName,
      title: "Statut « vivant » invraisemblable",
      description: `Marqué(e) comme vivant(e) avec une naissance en ${person.birth_year} (${CURRENT_YEAR - person.birth_year} ans). Le décès n'est probablement pas renseigné.`,
    });
  }

  // 4. Incohérences avec les parents
  for (const parentRef of person.parents) {
    const parent = byId.get(parentRef.id);
    if (!parent) continue;

    const isMother = parent.sex === "F";
    const isFather = parent.sex === "M";

    // Âge du parent à la naissance
    if (parent.birth_year && person.birth_year) {
      const ageAtBirth = person.birth_year - parent.birth_year;

      if (ageAtBirth < 13) {
        anomalies.push({
          id: `${person.id}-parent-too-young-${parent.id}`,
          severity: "error",
          personId: person.id,
          personName: person.displayName,
          relatedPersonId: parent.id,
          relatedPersonName: parent.displayName,
          title: isMother ? "Mère trop jeune" : isFather ? "Père trop jeune" : "Parent trop jeune",
          description: `${parent.displayName} n'avait que ${ageAtBirth} ans à la naissance de l'enfant (${parent.birth_year} → ${person.birth_year}).`,
        });
      } else if (isMother && ageAtBirth > 53) {
        anomalies.push({
          id: `${person.id}-mother-too-old-${parent.id}`,
          severity: "warning",
          personId: person.id,
          personName: person.displayName,
          relatedPersonId: parent.id,
          relatedPersonName: parent.displayName,
          title: "Mère d'âge très avancé",
          description: `${parent.displayName} avait ${ageAtBirth} ans à la naissance de l'enfant (${parent.birth_year} → ${person.birth_year}).`,
        });
      }
    }

    // Décès du parent avant naissance
    if (parent.death_year && person.birth_year) {
      if (isMother && person.birth_year > parent.death_year) {
        anomalies.push({
          id: `${person.id}-born-after-mother-death-${parent.id}`,
          severity: "error",
          personId: person.id,
          personName: person.displayName,
          relatedPersonId: parent.id,
          relatedPersonName: parent.displayName,
          title: "Naissance postérieure au décès de la mère",
          description: `Né(e) en ${person.birth_year}, alors que sa mère ${parent.displayName} est décédée en ${parent.death_year}.`,
        });
      } else if (isFather && person.birth_year - parent.death_year > 1) {
        anomalies.push({
          id: `${person.id}-born-after-father-death-${parent.id}`,
          severity: "error",
          personId: person.id,
          personName: person.displayName,
          relatedPersonId: parent.id,
          relatedPersonName: parent.displayName,
          title: "Naissance posthume tardive",
          description: `Né(e) en ${person.birth_year}, plus d'un an après le décès de son père ${parent.displayName} (${parent.death_year}).`,
        });
      }
    }
  }

  // 5. Incohérences des mariages
  for (const union of person.unions) {
    if (union.year) {
      if (person.birth_year && union.year - person.birth_year < 13) {
        anomalies.push({
          id: `${person.id}-marriage-too-young-${union.id}`,
          severity: "error",
          personId: person.id,
          personName: person.displayName,
          title: "Mariage très précoce",
          description: `Mariage en ${union.year} à l'âge de ${union.year - person.birth_year} ans (naissance en ${person.birth_year}).`,
        });
      }

      if (person.death_year && union.year > person.death_year) {
        anomalies.push({
          id: `${person.id}-marriage-after-death-${union.id}`,
          severity: "error",
          personId: person.id,
          personName: person.displayName,
          title: "Mariage postérieur au décès",
          description: `Mariage en ${union.year} alors que le décès est renseigné en ${person.death_year}.`,
        });
      }
    }

    if (union.spouse) {
      const spouse = byId.get(union.spouse.id);
      if (spouse && person.birth_year && spouse.birth_year) {
        const gap = Math.abs(person.birth_year - spouse.birth_year);
        if (gap > 50) {
          anomalies.push({
            id: `${person.id}-spouse-age-gap-${union.id}`,
            severity: "warning",
            personId: person.id,
            personName: person.displayName,
            relatedPersonId: spouse.id,
            relatedPersonName: spouse.displayName,
            title: "Écart d'âge très important entre époux",
            description: `${gap} ans d'écart entre ${person.displayName} (${person.birth_year}) et ${spouse.displayName} (${spouse.birth_year}).`,
          });
        }
      }
    }
  }

  return anomalies;
}

/**
 * Parcourt l'ensemble des personnes d'un profil et dresse l'audit complet des anomalies.
 */
export function detectAllAnomalies(persons: Person[]): Anomaly[] {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const list: Anomaly[] = [];
  for (const person of persons) {
    list.push(...detectPersonAnomalies(person, byId));
  }
  return list;
}

