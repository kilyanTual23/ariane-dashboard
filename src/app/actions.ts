"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizePlace, parseDateInput } from "@/lib/dates";
import { inferSex } from "@/lib/names";
import * as q from "@/lib/queries";
import { STATUSES, type Priority, type Status, type TaskStatus } from "@/lib/types";

/* ------------------------------------------------------------------ helpers */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function refreshProfile(slug: string) {
  revalidatePath(`/p/${slug}`, "layout");
}

/* ----------------------------------------------------------------- profils */

export async function createProfileAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const profile = q.createProfile(name, str(fd, "description"));
  revalidatePath("/");
  redirect(`/p/${profile.slug}`);
}

export async function updateProfileAction(fd: FormData) {
  const id = num(fd, "profileId");
  const slug = str(fd, "slug");
  if (!id || !slug) return;
  q.updateProfile(id, {
    name: str(fd, "name") ?? undefined,
    description: str(fd, "description"),
  });
  revalidatePath("/");
  refreshProfile(slug);
}

export async function setRootPersonAction(fd: FormData) {
  const id = num(fd, "profileId");
  const slug = str(fd, "slug");
  if (!id || !slug) return;
  q.updateProfile(id, { root_person_id: num(fd, "rootPersonId") });
  refreshProfile(slug);
}

export async function deleteProfileAction(fd: FormData) {
  const id = num(fd, "profileId");
  if (!id) return;
  q.deleteProfile(id);
  revalidatePath("/");
  redirect("/");
}

/* --------------------------------------------------------------- personnes */

/**
 * Saisie au fil de l'eau : un champ, une valeur, enregistré immédiatement
 * depuis la fiche. Les dates sont interprétées au passage.
 */
export async function setPersonField(input: {
  slug: string;
  personId: number;
  field: string;
  value: string;
}) {
  const { slug, personId, field } = input;
  const value = input.value.trim();
  const patch: q.PersonInput = {};

  switch (field) {
    case "birth_date_raw": {
      const d = parseDateInput(value);
      patch.birth_date_raw = d.canonical;
      patch.birth_date_iso = d.iso;
      if (d.year) {
        patch.birth_year = d.year;
        patch.birth_year_estimated = 0;
      } else if (!value) {
        patch.birth_year = null;
      }
      break;
    }
    case "death_date_raw": {
      const d = parseDateInput(value);
      patch.death_date_raw = d.canonical;
      patch.death_date_iso = d.iso;
      patch.death_year = d.year;
      break;
    }
    case "birth_year": {
      const year = Number(value.replace(/[^\d]/g, ""));
      patch.birth_year = Number.isFinite(year) && year ? year : null;
      patch.birth_year_estimated = 1;
      break;
    }
    case "given_names":
    case "surname": {
      patch[field] = value;
      break;
    }
    case "sex": {
      patch.sex = value === "M" || value === "F" ? value : null;
      break;
    }
    case "status": {
      patch.status = (value || "Pas commencé") as Status;
      break;
    }
    case "kinship": {
      patch.kinship = (value || null) as q.PersonInput["kinship"];
      break;
    }
    case "birth_place":
    case "death_place": {
      patch[field] = normalizePlace(value);
      break;
    }
    case "occupation":
    case "notes": {
      patch[field] = value || null;
      break;
    }
    case "birth_source": {
      patch.birth_source = value || null;
      if (value && (value.startsWith("http") || value.startsWith("www"))) {
        patch.birth_source_ignored = 0;
      }
      break;
    }
    case "death_source": {
      patch.death_source = value || null;
      if (value && (value.startsWith("http") || value.startsWith("www"))) {
        patch.death_source_ignored = 0;
      }
      break;
    }
    case "birth_source_ignored": {
      patch.birth_source_ignored = value === "1" || value === "true" ? 1 : 0;
      break;
    }
    case "death_source_ignored": {
      patch.death_source_ignored = value === "1" || value === "true" ? 1 : 0;
      break;
    }
    case "is_living": {
      patch.is_living = value === "1" || value === "true" ? 1 : 0;
      break;
    }
    case "is_unmarried": {
      patch.is_unmarried = value === "1" || value === "true" ? 1 : 0;
      break;
    }
    case "proximity_year": {
      const year = Number(value.replace(/[^\d]/g, ""));
      patch.proximity_year = Number.isFinite(year) && year ? year : null;
      break;
    }
    default:
      return;
  }

  q.updatePerson(personId, patch);
  // Le sexe départage père (2n) et mère (2n+1) : la numérotation doit suivre.
  if (field === "sex") {
    const profileId = q.profileIdOfPerson(personId);
    if (profileId) q.recomputeSosa(profileId);
  }
  refreshProfile(slug);
}

/** Même principe pour les trois champs d'une union. */
export async function setUnionField(input: {
  slug: string;
  unionId: number;
  field: "date_raw" | "place" | "source" | "source_ignored";
  value: string;
}) {
  const value = input.value.trim();
  if (input.field === "date_raw") {
    const d = parseDateInput(value);
    q.updateUnion(input.unionId, { date_raw: d.canonical, date_iso: d.iso, year: d.year });
  } else if (input.field === "place") {
    q.updateUnion(input.unionId, { place: normalizePlace(value) });
  } else if (input.field === "source_ignored") {
    q.updateUnion(input.unionId, { source_ignored: value === "1" || value === "true" ? 1 : 0 });
  } else {
    const patch: q.UnionInput = { source: value || null };
    if (value && (value.startsWith("http") || value.startsWith("www"))) {
      patch.source_ignored = 0;
    }
    q.updateUnion(input.unionId, patch);
  }
  refreshProfile(input.slug);
}

/** Création express : un nom suffit, le reste se remplit dans la fiche. */
export async function quickCreatePersonAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const fullName = str(fd, "fullName");
  if (!slug || !profileId || !fullName) return;

  const { splitName } = await import("@/lib/names");
  const { given_names, surname } = splitName(fullName);
  const id = q.createPerson(profileId, {
    given_names,
    surname,
    sex: inferSex(given_names),
    status: "En recherche",
  });
  refreshProfile(slug);
  redirect(`/p/${slug}/personnes/${id}`);
}

/**
 * Création intelligente depuis une phrase en langage naturel :
 * Extrait la personne principale, ses dates, lieux, son métier, ainsi que
 * son conjoint, son mariage et ses parents s'ils sont mentionnés.
 */
export async function smartCreatePersonAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const text = str(fd, "text");
  if (!slug || !profileId || !text) return;

  const { parseGenealogyText } = await import("@/lib/nlp-genealogy");
  const parsed = parseGenealogyText(text);

  const bDate = parseDateInput(parsed.primary.birthDateRaw);
  const dDate = parseDateInput(parsed.primary.deathDateRaw);

  const primaryBirthPlace = normalizePlace(str(fd, "primary_birth_place") ?? parsed.primary.birthPlace);
  const primaryDeathPlace = normalizePlace(str(fd, "primary_death_place") ?? parsed.primary.deathPlace);

  const isLivingInput = num(fd, "primary_is_living");
  const isLiving = isLivingInput !== null
    ? isLivingInput
    : (parsed.primary.deathDateRaw || parsed.primary.deathPlace ? 0 : (bDate.year && bDate.year >= 1925 ? 1 : 0));

  const isUnmarriedInput = num(fd, "primary_is_unmarried");
  const isUnmarried = isUnmarriedInput !== null
    ? isUnmarriedInput
    : (parsed.spouse || parsed.marriage ? 0 : 0);

  const primaryId = q.createPerson(profileId, {
    given_names: parsed.primary.givenNames || parsed.primary.fullName,
    surname: parsed.primary.surname || "",
    sex: parsed.primary.sex,
    status: "En recherche",
    occupation: parsed.primary.occupation,
    is_living: isLiving,
    is_unmarried: isUnmarried,
    birth_date_raw: bDate.canonical ?? parsed.primary.birthDateRaw,
    birth_date_iso: bDate.iso,
    birth_year: bDate.year ?? parsed.primary.birthYear,
    birth_place: primaryBirthPlace,
    death_date_raw: dDate.canonical ?? parsed.primary.deathDateRaw,
    death_date_iso: dDate.iso,
    death_year: dDate.year ?? parsed.primary.deathYear,
    death_place: primaryDeathPlace,
  });

  // 2. Conjoint et Union si présents
  if (parsed.spouse && (parsed.spouse.givenNames || parsed.spouse.surname)) {
    const sBDate = parseDateInput(parsed.spouse.birthDateRaw);
    const spouseBirthPlace = normalizePlace(str(fd, "spouse_birth_place") ?? parsed.spouse.birthPlace);
    const sIsLivingInput = num(fd, "spouse_is_living");
    const sIsLiving = sIsLivingInput !== null
      ? sIsLivingInput
      : (sBDate.year && sBDate.year >= 1925 ? 1 : 0);

    const spouseId = q.createPerson(profileId, {
      given_names: parsed.spouse.givenNames || parsed.spouse.fullName,
      surname: parsed.spouse.surname || "",
      sex: parsed.spouse.sex,
      status: "En recherche",
      is_living: sIsLiving,
      is_unmarried: 0,
      birth_date_raw: sBDate.canonical ?? parsed.spouse.birthDateRaw,
      birth_date_iso: sBDate.iso,
      birth_year: sBDate.year ?? parsed.spouse.birthYear,
      birth_place: spouseBirthPlace,
    });

    const mDate = parseDateInput(parsed.marriage?.dateRaw);
    const marriagePlace = normalizePlace(str(fd, "marriage_place") ?? parsed.marriage?.place);

    q.createUnion(profileId, {
      partner1_id: primaryId,
      partner2_id: spouseId,
      date_raw: mDate.canonical ?? parsed.marriage?.dateRaw ?? null,
      date_iso: mDate.iso,
      year: mDate.year ?? parsed.marriage?.year ?? null,
      place: marriagePlace,
    });
  }

  // 3. Parents si mentionnés
  if (parsed.parents?.father && (parsed.parents.father.givenNames || parsed.parents.father.surname)) {
    const fatherId = q.createPerson(profileId, {
      given_names: parsed.parents.father.givenNames || parsed.parents.father.fullName,
      surname: parsed.parents.father.surname || "",
      sex: "M",
      status: "En recherche",
    });
    q.addParent(fatherId, primaryId);
  }

  if (parsed.parents?.mother && (parsed.parents.mother.givenNames || parsed.parents.mother.surname)) {
    const motherId = q.createPerson(profileId, {
      given_names: parsed.parents.mother.givenNames || parsed.parents.mother.fullName,
      surname: parsed.parents.mother.surname || "",
      sex: "F",
      status: "En recherche",
    });
    q.addParent(motherId, primaryId);
  }

  q.recomputeSosa(profileId);
  refreshProfile(slug);
  redirect(`/p/${slug}/personnes/${primaryId}`);
}

export async function toggleLivingAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const isLiving = num(fd, "isLiving") ?? 0;
  if (!slug || !personId) return;
  q.updatePerson(personId, { is_living: isLiving });
  refreshProfile(slug);
}

export async function toggleUnmarriedAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const isUnmarried = num(fd, "isUnmarried") ?? 0;
  if (!slug || !personId) return;
  q.updatePerson(personId, { is_unmarried: isUnmarried });
  refreshProfile(slug);
}

/**
 * Ignorer ou rétablir l'exigence d'un acte (naissance, mariage, décès).
 * Permet de marquer un acte comme introuvable, inaccessible ou lacunaire
 * sans bloquer la complétion à 100% de la fiche.
 */
export async function toggleActIgnoredAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const unionId = num(fd, "unionId");
  const actKind = str(fd, "actKind"); // "birth" | "death" | "marriage"
  const ignored = num(fd, "ignored") ?? 1;
  const reason = str(fd, "reason");

  if (!slug) return;

  if (actKind === "birth" && personId) {
    const patch: q.PersonInput = { birth_source_ignored: ignored };
    if (ignored && reason) {
      patch.birth_source = reason;
    } else if (!ignored && (reason === "clear" || !reason)) {
      patch.birth_source = null;
    }
    q.updatePerson(personId, patch);
  } else if (actKind === "death" && personId) {
    const patch: q.PersonInput = { death_source_ignored: ignored };
    if (ignored && reason) {
      patch.death_source = reason;
    } else if (!ignored && (reason === "clear" || !reason)) {
      patch.death_source = null;
    }
    q.updatePerson(personId, patch);
  } else if (actKind === "marriage" && unionId) {
    const patch: q.UnionInput = { source_ignored: ignored };
    if (ignored && reason) {
      patch.source = reason;
    } else if (!ignored && (reason === "clear" || !reason)) {
      patch.source = null;
    }
    q.updateUnion(unionId, patch);
  }

  refreshProfile(slug);
}

export async function deletePersonAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const profileId = num(fd, "profileId");
  if (!slug || !personId || !profileId) return;
  q.deletePerson(personId);
  q.recomputeSosa(profileId);
  refreshProfile(slug);
  redirect(`/p/${slug}/personnes`);
}

/**
 * Report sur Geneanet : on coche quand c'est fait, la carte est archivée.
 * Le bouton inverse rouvre la carte si on s'est trompé.
 */
export async function markGeneanetAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  if (!slug || !personId) return;
  const done = str(fd, "done") === "1";
  q.updatePerson(personId, {
    geneanet_at: done ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
  });
  refreshProfile(slug);
}

/**
 * Déplacement d'une carte sur le tableau : la colonne dit tout.
 * Sortir de « Classées » rouvre la carte ; y entrer la considère terminée.
 */
export async function movePersonAction(input: {
  slug: string;
  personId: number;
  column: string;
}) {
  const { slug, personId, column } = input;

  if (column === "Classées") {
    const current = q.getPersonRow(personId);
    q.updatePerson(personId, {
      geneanet_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      status:
        current && (current.status === "Complet" || current.status === "Bloqué")
          ? current.status
          : "Complet",
    });
  } else if ((STATUSES as readonly string[]).includes(column)) {
    q.updatePerson(personId, { status: column as Status, geneanet_at: null });
  } else {
    return;
  }

  refreshProfile(slug);
}

export async function quickStatusAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const status = str(fd, "status") as Status | null;
  if (!slug || !personId || !status) return;
  q.updatePerson(personId, { status });
  refreshProfile(slug);
}

/* --------------------------------------------------------------- relations */

/**
 * Une relation se rattache soit à une carte existante (identifiant), soit à un
 * nom tapé à la volée — auquel cas la carte est créée sur-le-champ, vide, prête
 * à être remplie plus tard.
 */
async function resolveOrCreatePerson(
  profileId: number,
  id: number | null,
  name: string | null,
): Promise<number | null> {
  if (id) return id;
  if (!name) return null;
  const { splitName } = await import("@/lib/names");
  const { given_names, surname } = splitName(name);
  if (!given_names && !surname) return null;
  return q.createPerson(profileId, {
    given_names,
    surname,
    sex: inferSex(given_names),
    status: "Pas commencé",
  });
}

export async function addParentAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const childId = num(fd, "childId");
  if (!slug || !profileId || !childId) return;
  const parentId = await resolveOrCreatePerson(
    profileId,
    num(fd, "parentId"),
    str(fd, "parentIdName"),
  );
  if (!parentId) return;
  q.addParent(parentId, childId);
  q.recomputeSosa(profileId);
  refreshProfile(slug);
}

export async function addChildAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const parentId = num(fd, "parentId");
  if (!slug || !profileId || !parentId) return;
  const childId = await resolveOrCreatePerson(
    profileId,
    num(fd, "childId"),
    str(fd, "childIdName"),
  );
  if (!childId) return;
  q.addParent(parentId, childId);
  q.recomputeSosa(profileId);
  refreshProfile(slug);
}

export async function removeParentAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const childId = num(fd, "childId");
  const parentId = num(fd, "parentId");
  if (!slug || !profileId || !childId || !parentId) return;
  q.removeParent(parentId, childId);
  q.recomputeSosa(profileId);
  refreshProfile(slug);
}

export async function saveUnionAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  if (!slug || !profileId) return;

  const date = parseDateInput(str(fd, "date_raw"));
  const input: q.UnionInput = {
    date_raw: date.canonical,
    date_iso: date.iso,
    year: date.year,
    place: normalizePlace(str(fd, "place")),
    source: str(fd, "source"),
    notes: str(fd, "notes"),
  };

  const unionId = num(fd, "unionId");
  if (unionId) {
    q.updateUnion(unionId, input);
  } else {
    const personId = num(fd, "personId");
    if (!personId) return;
    const spouseId = await resolveOrCreatePerson(
      profileId,
      num(fd, "spouseId"),
      str(fd, "spouseIdName"),
    );
    q.createUnion(profileId, { ...input, partner1_id: personId, partner2_id: spouseId });
  }
  refreshProfile(slug);
}

export async function deleteUnionAction(fd: FormData) {
  const slug = str(fd, "slug");
  const unionId = num(fd, "unionId");
  if (!slug || !unionId) return;
  q.deleteUnion(unionId);
  refreshProfile(slug);
}

/* ------------------------------------------------------------------ tâches */

export async function createTaskAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const title = str(fd, "title");
  if (!slug || !profileId || !title) return;
  q.createTask(profileId, {
    title,
    person_id: num(fd, "person_id"),
    details: str(fd, "details"),
    kind: str(fd, "kind"),
    archive: str(fd, "archive"),
    url: str(fd, "url"),
    priority: (str(fd, "priority") as Priority) ?? "Normale",
    status: (str(fd, "status") as TaskStatus) ?? "À faire",
  });
  refreshProfile(slug);
}

export async function updateTaskAction(fd: FormData) {
  const slug = str(fd, "slug");
  const taskId = num(fd, "taskId");
  if (!slug || !taskId) return;
  const patch: q.TaskInput = {};
  const status = str(fd, "status") as TaskStatus | null;
  const priority = str(fd, "priority") as Priority | null;
  if (status) patch.status = status;
  if (priority) patch.priority = priority;
  if (fd.has("title")) patch.title = str(fd, "title") ?? "Sans titre";
  if (fd.has("details")) patch.details = str(fd, "details");
  q.updateTask(taskId, patch);
  refreshProfile(slug);
}

export async function deleteTaskAction(fd: FormData) {
  const slug = str(fd, "slug");
  const taskId = num(fd, "taskId");
  if (!slug || !taskId) return;
  q.deleteTask(taskId);
  refreshProfile(slug);
}

/* -------------------------------------------------------------- ressources */

export async function createResourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const label = str(fd, "label");
  const url = str(fd, "url");
  if (!slug || !profileId || !label || !url) return;
  q.createResource(profileId, label, url, str(fd, "category"));
  refreshProfile(slug);
}

export async function deleteResourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const id = num(fd, "resourceId");
  if (!slug || !id) return;
  q.deleteResource(id);
  refreshProfile(slug);
}

/* ---------------------------------------------------------------- sources */

export async function createSourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const personId = num(fd, "personId");
  if (!slug || !profileId || !personId) return;
  q.createSource(profileId, {
    person_id: personId,
    kind: str(fd, "kind") ?? "Autre",
    label: str(fd, "label"),
    url: str(fd, "url"),
    date_raw: str(fd, "date_raw"),
    place: str(fd, "place"),
    notes: str(fd, "notes"),
  });
  refreshProfile(slug);
}

export async function deleteSourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const id = num(fd, "sourceId");
  if (!slug || !id) return;
  q.deleteSource(id);
  refreshProfile(slug);
}
