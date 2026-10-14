"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkpointDb } from "@/lib/db";
import { normalizePlace, parseDateInput } from "@/lib/dates";
import { inferSex } from "@/lib/names";
import * as q from "@/lib/queries";
import { downloadAct } from "@/lib/act-downloader";
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

async function refreshProfile(slug: string, personId?: number) {
  await checkpointDb();
  revalidatePath(`/p/${slug}`, "layout");
  revalidatePath(`/p/${slug}/personnes`, "page");
  if (personId) {
    revalidatePath(`/p/${slug}/personnes/${personId}`, "page");
  }
}

/* ----------------------------------------------------------------- profils */

export async function createProfileAction(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const profile = await q.createProfile(name, str(fd, "description"));
  revalidatePath("/");
  redirect(`/p/${profile.slug}`);
}

export async function updateProfileAction(fd: FormData) {
  const id = num(fd, "profileId");
  const slug = str(fd, "slug");
  if (!id || !slug) return;
  await q.updateProfile(id, {
    name: str(fd, "name") ?? undefined,
    description: str(fd, "description"),
  });
  revalidatePath("/");
  await refreshProfile(slug);
}

export async function setRootPersonAction(fd: FormData) {
  const id = num(fd, "profileId");
  const slug = str(fd, "slug");
  if (!id || !slug) return;
  await q.updateProfile(id, { root_person_id: num(fd, "rootPersonId") });
  await refreshProfile(slug);
}

export async function deleteProfileAction(fd: FormData) {
  const id = num(fd, "profileId");
  if (!id) return;
  await q.deleteProfile(id);
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
        void downloadAct(value, { kind: "person", personId, actKind: "birth" }).then((r) => {
          if (r.ok) refreshProfile(slug);
        });
      }
      break;
    }
    case "death_source": {
      patch.death_source = value || null;
      if (value && (value.startsWith("http") || value.startsWith("www"))) {
        patch.death_source_ignored = 0;
        void downloadAct(value, { kind: "person", personId, actKind: "death" }).then((r) => {
          if (r.ok) refreshProfile(slug);
        });
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

  await q.updatePerson(personId, patch);
  if (field !== "status") {
    await q.checkAndUpdatePersonCompletion(personId);
  }
  // Le sexe départage père (2n) et mère (2n+1) : la numérotation doit suivre.
  if (field === "sex") {
    const profileId = await q.profileIdOfPerson(personId);
    if (profileId) await q.recomputeSosa(profileId);
  }
  await refreshProfile(slug, personId);
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
    await q.updateUnion(input.unionId, { date_raw: d.canonical, date_iso: d.iso, year: d.year });
  } else if (input.field === "place") {
    await q.updateUnion(input.unionId, { place: normalizePlace(value) });
  } else if (input.field === "source_ignored") {
    await q.updateUnion(input.unionId, { source_ignored: value === "1" || value === "true" ? 1 : 0 });
  } else {
    const patch: q.UnionInput = { source: value || null };
    if (value && (value.startsWith("http") || value.startsWith("www"))) {
      patch.source_ignored = 0;
      void downloadAct(value, { kind: "union", unionId: input.unionId }).then((r) => {
        if (r.ok) refreshProfile(input.slug);
      });
    }
    await q.updateUnion(input.unionId, patch);
  }
  const union = await q.getUnionRow(input.unionId);
  if (union) {
    if (union.partner1_id) await q.checkAndUpdatePersonCompletion(union.partner1_id);
    if (union.partner2_id) await q.checkAndUpdatePersonCompletion(union.partner2_id);
  }
  await refreshProfile(input.slug);
}

export async function downloadActAction(fd: FormData) {
  const url = str(fd, "url");
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const unionId = num(fd, "unionId");
  const actKind = str(fd, "actKind") as "birth" | "death" | "marriage";

  if (!url) return;

  if (personId && (actKind === "birth" || actKind === "death")) {
    await downloadAct(url, { kind: "person", personId, actKind });
  } else if (unionId) {
    await downloadAct(url, { kind: "union", unionId });
  }

  if (slug) {
    await refreshProfile(slug, personId ?? undefined);
  }
}

/** Création express : un nom suffit, le reste se remplit dans la fiche. */
export async function quickCreatePersonAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const fullName = str(fd, "fullName");
  if (!slug || !profileId || !fullName) return;

  const { splitName } = await import("@/lib/names");
  const { given_names, surname } = splitName(fullName);
  const id = await q.createPerson(profileId, {
    given_names,
    surname,
    sex: inferSex(given_names),
    status: "En recherche",
  });
  await refreshProfile(slug, id);
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

  const primaryId = await q.createPerson(profileId, {
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

    const spouseId = await q.createPerson(profileId, {
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

    await q.createUnion(profileId, {
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
    const fatherId = await q.createPerson(profileId, {
      given_names: parsed.parents.father.givenNames || parsed.parents.father.fullName,
      surname: parsed.parents.father.surname || "",
      sex: "M",
      status: "En recherche",
    });
    await q.addParent(fatherId, primaryId);
  }

  if (parsed.parents?.mother && (parsed.parents.mother.givenNames || parsed.parents.mother.surname)) {
    const motherId = await q.createPerson(profileId, {
      given_names: parsed.parents.mother.givenNames || parsed.parents.mother.fullName,
      surname: parsed.parents.mother.surname || "",
      sex: "F",
      status: "En recherche",
    });
    await q.addParent(motherId, primaryId);
  }

  await q.recomputeSosa(profileId);
  await q.checkAndUpdatePersonCompletion(primaryId);
  await refreshProfile(slug, primaryId);
  redirect(`/p/${slug}/personnes/${primaryId}`);
}

export async function toggleLivingAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const isLiving = num(fd, "isLiving") ?? 0;
  if (!slug || !personId) return;
  await q.updatePerson(personId, { is_living: isLiving });
  await q.checkAndUpdatePersonCompletion(personId);
  await refreshProfile(slug, personId);
}

export async function toggleUnmarriedAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const isUnmarried = num(fd, "isUnmarried") ?? 0;
  if (!slug || !personId) return;
  await q.updatePerson(personId, { is_unmarried: isUnmarried });
  await q.checkAndUpdatePersonCompletion(personId);
  await refreshProfile(slug, personId);
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
    await q.updatePerson(personId, patch);
    await q.checkAndUpdatePersonCompletion(personId);
  } else if (actKind === "death" && personId) {
    const patch: q.PersonInput = { death_source_ignored: ignored };
    if (ignored && reason) {
      patch.death_source = reason;
    } else if (!ignored && (reason === "clear" || !reason)) {
      patch.death_source = null;
    }
    await q.updatePerson(personId, patch);
    await q.checkAndUpdatePersonCompletion(personId);
  } else if (actKind === "marriage" && unionId) {
    const patch: q.UnionInput = { source_ignored: ignored };
    if (ignored && reason) {
      patch.source = reason;
    } else if (!ignored && (reason === "clear" || !reason)) {
      patch.source = null;
    }
    await q.updateUnion(unionId, patch);
    const u = await q.getUnionRow(unionId);
    if (u?.partner1_id) await q.checkAndUpdatePersonCompletion(u.partner1_id);
    if (u?.partner2_id) await q.checkAndUpdatePersonCompletion(u.partner2_id);
  }

  await refreshProfile(slug, personId ?? undefined);
}

export async function deletePersonAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const profileId = num(fd, "profileId");
  if (!slug || !personId || !profileId) return;
  await q.deletePerson(personId);
  await q.recomputeSosa(profileId);
  await checkpointDb();
  revalidatePath(`/p/${slug}/personnes`, "page");
  revalidatePath(`/p/${slug}`, "page");
  redirect(`/p/${slug}/personnes`);
}

export async function bulkDeletePersonsAction(input: {
  slug: string;
  profileId: number;
  personIds: number[];
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const { slug, profileId, personIds } = input;
    if (!slug || !profileId || !personIds || personIds.length === 0) {
      return { ok: false, error: "Paramètres manquants" };
    }
    await q.deletePersons(personIds);
    await q.recomputeSosa(profileId);
    await refreshProfile(slug);
    return { ok: true, count: personIds.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function bulkSetStatusAction(input: {
  slug: string;
  profileId: number;
  personIds: number[];
  status: Status;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const { slug, profileId, personIds, status } = input;
    if (!slug || !profileId || !personIds || personIds.length === 0 || !status) {
      return { ok: false, error: "Paramètres manquants" };
    }
    await q.bulkUpdateStatus(personIds, status);
    for (const id of personIds) {
      await q.checkAndUpdatePersonCompletion(id);
    }
    await refreshProfile(slug);
    return { ok: true, count: personIds.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
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
  await q.updatePerson(personId, {
    geneanet_at: done ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
  });
  await refreshProfile(slug, personId);
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
    const current = await q.getPersonRow(personId);
    await q.updatePerson(personId, {
      geneanet_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      status:
        current && (current.status === "Complet" || current.status === "Complet (lacunes)" || current.status === "Bloqué")
          ? current.status
          : "Complet",
    });
  } else if ((STATUSES as readonly string[]).includes(column)) {
    await q.updatePerson(personId, { status: column as Status, geneanet_at: null });
  } else {
    return;
  }

  await refreshProfile(slug);
}

export async function quickStatusAction(fd: FormData) {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const status = str(fd, "status") as Status | null;
  if (!slug || !personId || !status) return;
  await q.updatePerson(personId, { status });
  await refreshProfile(slug, personId);
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
  fallbackSex?: "M" | "F" | null,
): Promise<number | null> {
  if (id) return id;
  if (!name) return null;
  const { splitName, inferSex } = await import("@/lib/names");
  const { given_names, surname } = splitName(name);
  if (!given_names && !surname) return null;
  return await q.createPerson(profileId, {
    given_names,
    surname,
    sex: inferSex(given_names) ?? fallbackSex ?? null,
    status: "Pas commencé",
  });
}

export async function addParentAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const childId = num(fd, "childId");
  if (!slug || !profileId || !childId) return;

  const child = await q.getPerson(profileId, childId);
  const existingFather = child?.parents.find((p) => p.sex === "M");
  const existingMother = child?.parents.find((p) => p.sex === "F");
  const fallbackSex =
    existingFather && !existingMother ? "F" : existingMother && !existingFather ? "M" : null;

  const parentId = await resolveOrCreatePerson(
    profileId,
    num(fd, "parentId"),
    str(fd, "parentIdName"),
    fallbackSex,
  );
  if (!parentId) return;
  await q.addParent(parentId, childId);
  await q.checkAndUpdatePersonCompletion(childId);
  await q.recomputeSosa(profileId);
  await refreshProfile(slug, childId);
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
  await q.addParent(parentId, childId);
  await q.checkAndUpdatePersonCompletion(childId);
  await q.recomputeSosa(profileId);
  await refreshProfile(slug, parentId);
}

export async function removeParentAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const childId = num(fd, "childId");
  const parentId = num(fd, "parentId");
  if (!slug || !profileId || !childId || !parentId) return;
  await q.removeParent(parentId, childId);
  await q.recomputeSosa(profileId);
  await refreshProfile(slug, childId);
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
    await q.updateUnion(unionId, input);
    const u = await q.getUnionRow(unionId);
    if (u?.partner1_id) await q.checkAndUpdatePersonCompletion(u.partner1_id);
    if (u?.partner2_id) await q.checkAndUpdatePersonCompletion(u.partner2_id);
  } else {
    const personId = num(fd, "personId");
    if (!personId) return;
    const spouseId = await resolveOrCreatePerson(
      profileId,
      num(fd, "spouseId"),
      str(fd, "spouseIdName"),
    );
    await q.createUnion(profileId, { ...input, partner1_id: personId, partner2_id: spouseId });
    await q.checkAndUpdatePersonCompletion(personId);
    if (spouseId) await q.checkAndUpdatePersonCompletion(spouseId);
  }
  await refreshProfile(slug);
}

export async function deleteUnionAction(fd: FormData) {
  const slug = str(fd, "slug");
  const unionId = num(fd, "unionId");
  if (!slug || !unionId) return;
  await q.deleteUnion(unionId);
  await refreshProfile(slug);
}

/* ------------------------------------------------------------------ tâches */

export async function createTaskAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const title = str(fd, "title");
  if (!slug || !profileId || !title) return;
  await q.createTask(profileId, {
    title,
    person_id: num(fd, "person_id"),
    details: str(fd, "details"),
    kind: str(fd, "kind"),
    archive: str(fd, "archive"),
    url: str(fd, "url"),
    priority: (str(fd, "priority") as Priority) ?? "Normale",
    status: (str(fd, "status") as TaskStatus) ?? "À faire",
  });
  await refreshProfile(slug);
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
  await q.updateTask(taskId, patch);
  await refreshProfile(slug);
}

export async function deleteTaskAction(fd: FormData) {
  const slug = str(fd, "slug");
  const taskId = num(fd, "taskId");
  if (!slug || !taskId) return;
  await q.deleteTask(taskId);
  await refreshProfile(slug);
}

/* -------------------------------------------------------------- ressources */

export async function createResourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const label = str(fd, "label");
  const url = str(fd, "url");
  if (!slug || !profileId || !label || !url) return;
  await q.createResource(profileId, label, url, str(fd, "category"));
  await refreshProfile(slug);
}

export async function deleteResourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const id = num(fd, "resourceId");
  if (!slug || !id) return;
  await q.deleteResource(id);
  await refreshProfile(slug);
}

/* ---------------------------------------------------------------- sources */

export async function createSourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const profileId = num(fd, "profileId");
  const personId = num(fd, "personId");
  if (!slug || !profileId || !personId) return;
  await q.createSource(profileId, {
    person_id: personId,
    kind: str(fd, "kind") ?? "Autre",
    label: str(fd, "label"),
    url: str(fd, "url"),
    date_raw: str(fd, "date_raw"),
    place: str(fd, "place"),
    notes: str(fd, "notes"),
  });
  await refreshProfile(slug, personId);
}

export async function deleteSourceAction(fd: FormData) {
  const slug = str(fd, "slug");
  const id = num(fd, "sourceId");
  if (!slug || !id) return;
  await q.deleteSource(id);
  await refreshProfile(slug);
}

/* ---------------------------------------------------------------- OCR / Transcriptions */

export async function appendTranscriptionToNotesAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const unionId = num(fd, "unionId");
  const text = str(fd, "text");
  if (!slug || !text) return { ok: false, error: "Données manquantes" };

  try {
    if (personId) {
      const profileId = await q.profileIdOfPerson(personId);
      if (!profileId) return { ok: false, error: "Profil introuvable" };
      const person = await q.getPerson(profileId, personId);
      if (!person) return { ok: false, error: "Personne introuvable" };

      const currentNotes = person.notes?.trim() || "";
      const updatedNotes = currentNotes
        ? `${currentNotes}\n\n--- Transcription d'acte ---\n${text}`
        : `--- Transcription d'acte ---\n${text}`;

      await q.updatePerson(personId, { notes: updatedNotes });
      await refreshProfile(slug, personId);
      return { ok: true };
    } else if (unionId) {
      const union = await q.getUnionRow(unionId);
      if (!union) return { ok: false, error: "Union introuvable" };

      const currentNotes = union.notes?.trim() || "";
      const updatedNotes = currentNotes
        ? `${currentNotes}\n\n--- Transcription d'acte ---\n${text}`
        : `--- Transcription d'acte ---\n${text}`;

      await q.updateUnion(unionId, { notes: updatedNotes });
      await refreshProfile(slug);
      return { ok: true };
    }
    return { ok: false, error: "Cible introuvable" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export interface ActViewerContextData {
  person?: {
    id: number;
    displayName: string;
    given_names: string;
    surname: string;
    sex: "M" | "F" | null;
    occupation: string | null;
    birth_date_raw: string | null;
    birth_place: string | null;
    death_date_raw: string | null;
    death_place: string | null;
    father?: { id: number; displayName: string; is_living: number; birth_date_raw?: string | null; birth_place?: string | null } | null;
    mother?: { id: number; displayName: string; is_living: number; birth_date_raw?: string | null; birth_place?: string | null } | null;
  } | null;
  union?: {
    id: number;
    date_raw: string | null;
    place: string | null;
    partner1?: { id: number; displayName: string; occupation: string | null; birth_date_raw: string | null; birth_place: string | null } | null;
    partner2?: { id: number; displayName: string; occupation: string | null; birth_date_raw: string | null; birth_place: string | null } | null;
    partner1Father?: { id: number; displayName: string; is_living: number; birth_date_raw?: string | null; birth_place?: string | null } | null;
    partner1Mother?: { id: number; displayName: string; is_living: number; birth_date_raw?: string | null; birth_place?: string | null } | null;
    partner2Father?: { id: number; displayName: string; is_living: number; birth_date_raw?: string | null; birth_place?: string | null } | null;
    partner2Mother?: { id: number; displayName: string; is_living: number; birth_date_raw?: string | null; birth_place?: string | null } | null;
  } | null;
}

export async function getActViewerContextAction(
  slug: string,
  personId?: number,
  unionId?: number,
): Promise<ActViewerContextData> {
  const result: ActViewerContextData = {};
  if (!slug) return result;

  if (personId) {
    const profileId = await q.profileIdOfPerson(personId);
    if (profileId) {
      const p = await q.getPerson(profileId, personId);
      if (p) {
        const fatherRef = p.parents.find((parent) => parent.sex === "M");
        const motherRef = p.parents.find((parent) => parent.sex === "F");
        const father = fatherRef ? await q.getPerson(profileId, fatherRef.id) : null;
        const mother = motherRef ? await q.getPerson(profileId, motherRef.id) : null;
        result.person = {
          id: p.id,
          displayName: p.displayName,
          given_names: p.given_names,
          surname: p.surname,
          sex: p.sex,
          occupation: p.occupation,
          birth_date_raw: p.birth_date_raw,
          birth_place: p.birth_place,
          death_date_raw: p.death_date_raw,
          death_place: p.death_place,
          father: father ? { id: father.id, displayName: father.displayName, is_living: father.is_living, birth_date_raw: father.birth_date_raw, birth_place: father.birth_place } : null,
          mother: mother ? { id: mother.id, displayName: mother.displayName, is_living: mother.is_living, birth_date_raw: mother.birth_date_raw, birth_place: mother.birth_place } : null,
        };
      }
    }
  }

  const targetUnionId =
    unionId ?? (personId && result.person ? (await q.getPerson(await q.profileIdOfPerson(personId) || 0, personId))?.unions?.[0]?.id : undefined);

  if (targetUnionId) {
    const u = await q.getUnionRow(targetUnionId);
    if (u) {
      const profileId = u.profile_id;
      let p1 = u.partner1_id ? await q.getPerson(profileId, u.partner1_id) : null;
      let p2 = u.partner2_id ? await q.getPerson(profileId, u.partner2_id) : null;
      const p1FatherRef = p1?.parents.find((parent) => parent.sex === "M");
      const p1MotherRef = p1?.parents.find((parent) => parent.sex === "F");
      const p2FatherRef = p2?.parents.find((parent) => parent.sex === "M");
      const p2MotherRef = p2?.parents.find((parent) => parent.sex === "F");

      const p1Father = p1FatherRef ? await q.getPerson(profileId, p1FatherRef.id) : null;
      const p1Mother = p1MotherRef ? await q.getPerson(profileId, p1MotherRef.id) : null;
      const p2Father = p2FatherRef ? await q.getPerson(profileId, p2FatherRef.id) : null;
      const p2Mother = p2MotherRef ? await q.getPerson(profileId, p2MotherRef.id) : null;

      result.union = {
        id: u.id,
        date_raw: u.date_raw,
        place: u.place,
        partner1: p1 ? { id: p1.id, displayName: p1.displayName, occupation: p1.occupation, birth_date_raw: p1.birth_date_raw, birth_place: p1.birth_place } : null,
        partner2: p2 ? { id: p2.id, displayName: p2.displayName, occupation: p2.occupation, birth_date_raw: p2.birth_date_raw, birth_place: p2.birth_place } : null,
        partner1Father: p1Father ? { id: p1Father.id, displayName: p1Father.displayName, is_living: p1Father.is_living, birth_date_raw: p1Father.birth_date_raw, birth_place: p1Father.birth_place } : null,
        partner1Mother: p1Mother ? { id: p1Mother.id, displayName: p1Mother.displayName, is_living: p1Mother.is_living, birth_date_raw: p1Mother.birth_date_raw, birth_place: p1Mother.birth_place } : null,
        partner2Father: p2Father ? { id: p2Father.id, displayName: p2Father.displayName, is_living: p2Father.is_living, birth_date_raw: p2Father.birth_date_raw, birth_place: p2Father.birth_place } : null,
        partner2Mother: p2Mother ? { id: p2Mother.id, displayName: p2Mother.displayName, is_living: p2Mother.is_living, birth_date_raw: p2Mother.birth_date_raw, birth_place: p2Mother.birth_place } : null,
      };
    }
  }

  return result;
}

/**
 * Enregistre les données extraites d'un acte directement dans les bons champs
 * de la fiche (date, lieu, prénoms, nom, parents, conjoint, notes).
 */
export async function saveTranscriptionToRecordAction(fd: FormData): Promise<{
  ok: boolean;
  error?: string;
  updatedFields?: string[];
}> {
  const slug = str(fd, "slug");
  const personId = num(fd, "personId");
  const unionId = num(fd, "unionId");
  const actKind = str(fd, "actKind") as "birth" | "death" | "marriage" | null;

  const dateRaw = str(fd, "date_raw");
  const place = str(fd, "place");

  // Dates et lieux spécifiques
  const birthDateRaw = str(fd, "birth_date_raw") || (actKind === "birth" ? dateRaw : null);
  const birthPlace = str(fd, "birth_place") || (actKind === "birth" ? place : null);
  const deathDateRaw = str(fd, "death_date_raw") || (actKind === "death" ? dateRaw : null);
  const deathPlace = str(fd, "death_place") || (actKind === "death" ? place : null);

  const givenNames = str(fd, "given_names");
  const surname = str(fd, "surname")?.toLocaleUpperCase("fr") || null;
  const occupation = str(fd, "occupation");

  // Père
  const fatherGivenNames = str(fd, "father_given_names");
  const fatherSurname = str(fd, "father_surname")?.toLocaleUpperCase("fr") || null;
  const fatherOccupation = str(fd, "father_occupation");
  const fatherIsDeceased = str(fd, "father_is_deceased") === "1" || str(fd, "father_is_deceased") === "true";
  const fatherDeathDateRaw = str(fd, "father_death_date_raw");
  const fatherDeathPlace = str(fd, "father_death_place");
  const fatherBirthDateRaw = str(fd, "father_birth_date_raw");
  const fatherBirthPlace = str(fd, "father_birth_place");
  const createFather = str(fd, "create_father") === "1" || str(fd, "create_father") === "true";

  // Mère
  const motherGivenNames = str(fd, "mother_given_names");
  const motherSurname = str(fd, "mother_surname")?.toLocaleUpperCase("fr") || null;
  const motherOccupation = str(fd, "mother_occupation");
  const motherIsDeceased = str(fd, "mother_is_deceased") === "1" || str(fd, "mother_is_deceased") === "true";
  const motherDeathDateRaw = str(fd, "mother_death_date_raw");
  const motherDeathPlace = str(fd, "mother_death_place");
  const motherBirthDateRaw = str(fd, "mother_birth_date_raw");
  const motherBirthPlace = str(fd, "mother_birth_place");
  const createMother = str(fd, "create_mother") === "1" || str(fd, "create_mother") === "true";

  // Conjoint & Mariage
  const marriageDateRaw = str(fd, "marriage_date_raw") || (actKind === "marriage" ? dateRaw : null);
  const marriagePlace = str(fd, "marriage_place") || (actKind === "marriage" ? place : null);
  const spouseGivenNames = str(fd, "spouse_given_names");
  const spouseSurname = str(fd, "spouse_surname")?.toLocaleUpperCase("fr") || null;
  const createUnion = str(fd, "create_union") === "1" || str(fd, "create_union") === "true";

  const appendToNotes = str(fd, "append_to_notes") === "1" || str(fd, "append_to_notes") === "true";
  const transcriptionText = str(fd, "transcription_text");

  if (!slug) return { ok: false, error: "Profil non spécifié" };

  try {
    const updatedFields: string[] = [];

    if (personId) {
      const profileId = await q.profileIdOfPerson(personId);
      if (!profileId) return { ok: false, error: "Profil introuvable" };
      const person = await q.getPerson(profileId, personId);
      if (!person) return { ok: false, error: "Personne introuvable" };

      const patch: q.PersonInput = {};

      // 1. Naissance du sujet
      if (birthDateRaw) {
        const d = parseDateInput(birthDateRaw);
        patch.birth_date_raw = d.canonical;
        patch.birth_date_iso = d.iso;
        if (d.year) {
          patch.birth_year = d.year;
          patch.birth_year_estimated = d.qualifier === "exact" ? 0 : 1;
        }
        updatedFields.push("Date de naissance");
      }
      if (birthPlace) {
        patch.birth_place = normalizePlace(birthPlace);
        updatedFields.push("Lieu de naissance");
      }

      // 2. Décès du sujet
      if (deathDateRaw) {
        const d = parseDateInput(deathDateRaw);
        patch.death_date_raw = d.canonical;
        patch.death_date_iso = d.iso;
        if (d.year) patch.death_year = d.year;
        patch.is_living = 0;
        updatedFields.push("Date de décès");
      }
      if (deathPlace) {
        patch.death_place = normalizePlace(deathPlace);
        patch.is_living = 0;
        updatedFields.push("Lieu de décès");
      }

      // 3. Identité & Métier si non renseignés
      if (givenNames && (!person.given_names || person.given_names === "Sans nom")) {
        patch.given_names = givenNames;
        updatedFields.push("Prénoms");
      }
      if (surname && (!person.surname || person.surname === "Sans nom")) {
        patch.surname = surname;
        updatedFields.push("Nom");
      }
      if (occupation && !person.occupation) {
        patch.occupation = occupation;
        updatedFields.push("Métier");
      }

      // 4. Notes
      if (appendToNotes && transcriptionText) {
        const currentNotes = person.notes?.trim() || "";
        patch.notes = currentNotes
          ? `${currentNotes}\n\n--- Transcription d'acte ---\n${transcriptionText}`
          : `--- Transcription d'acte ---\n${transcriptionText}`;
        updatedFields.push("Notes");
      }

      if (Object.keys(patch).length > 0) {
        await q.updatePerson(personId, patch);
      }

      // 5. Père (création ou mise à jour de ses dates/lieux/statut)
      if (createFather && (fatherGivenNames || fatherSurname)) {
        const existingFather = person.parents.find((p) => p.sex === "M");
        if (!existingFather) {
          const fPatch: q.PersonInput = {
            given_names: fatherGivenNames || "",
            surname: fatherSurname || person.surname || "",
            sex: "M",
            status: "En recherche",
          };
          if (fatherOccupation) fPatch.occupation = fatherOccupation;
          if (fatherIsDeceased) fPatch.is_living = 0;
          if (fatherDeathDateRaw) {
            const d = parseDateInput(fatherDeathDateRaw);
            fPatch.death_date_raw = d.canonical;
            fPatch.death_date_iso = d.iso;
            if (d.year) fPatch.death_year = d.year;
          }
          if (fatherDeathPlace) fPatch.death_place = normalizePlace(fatherDeathPlace);
          if (fatherBirthDateRaw) {
            const d = parseDateInput(fatherBirthDateRaw);
            fPatch.birth_date_raw = d.canonical;
            fPatch.birth_date_iso = d.iso;
            if (d.year) fPatch.birth_year = d.year;
          }
          if (fatherBirthPlace) fPatch.birth_place = normalizePlace(fatherBirthPlace);
          const fatherId = await q.createPerson(profileId, fPatch);
          await q.addParent(fatherId, personId);
          updatedFields.push("Père créé et lié");
        } else {
          // Enrichir la fiche existante du père avec les nouvelles données
          const fUpdate: q.PersonInput = {};
          if (fatherOccupation && !existingFather.displayName) fUpdate.occupation = fatherOccupation;
          if (fatherIsDeceased) fUpdate.is_living = 0;
          if (fatherDeathDateRaw && !existingFather.death_year) {
            const d = parseDateInput(fatherDeathDateRaw);
            fUpdate.death_date_raw = d.canonical;
            fUpdate.death_date_iso = d.iso;
            if (d.year) fUpdate.death_year = d.year;
          }
          if (fatherBirthDateRaw && !existingFather.birth_year) {
            const d = parseDateInput(fatherBirthDateRaw);
            fUpdate.birth_date_raw = d.canonical;
            fUpdate.birth_date_iso = d.iso;
            if (d.year) fUpdate.birth_year = d.year;
          }
          if (fatherDeathPlace) fUpdate.death_place = normalizePlace(fatherDeathPlace);
          if (fatherBirthPlace) fUpdate.birth_place = normalizePlace(fatherBirthPlace);
          if (Object.keys(fUpdate).length > 0) {
            await q.updatePerson(existingFather.id, fUpdate);
            updatedFields.push("Fiche du père mise à jour");
          }
        }
      }

      // 6. Mère (création ou mise à jour de ses dates/lieux/statut)
      if (createMother && (motherGivenNames || motherSurname)) {
        const existingMother = person.parents.find((p) => p.sex === "F");
        if (!existingMother) {
          const mPatch: q.PersonInput = {
            given_names: motherGivenNames || "",
            surname: motherSurname || "",
            sex: "F",
            status: "En recherche",
          };
          if (motherOccupation) mPatch.occupation = motherOccupation;
          if (motherIsDeceased) mPatch.is_living = 0;
          if (motherDeathDateRaw) {
            const d = parseDateInput(motherDeathDateRaw);
            mPatch.death_date_raw = d.canonical;
            mPatch.death_date_iso = d.iso;
            if (d.year) mPatch.death_year = d.year;
          }
          if (motherDeathPlace) mPatch.death_place = normalizePlace(motherDeathPlace);
          if (motherBirthDateRaw) {
            const d = parseDateInput(motherBirthDateRaw);
            mPatch.birth_date_raw = d.canonical;
            mPatch.birth_date_iso = d.iso;
            if (d.year) mPatch.birth_year = d.year;
          }
          if (motherBirthPlace) mPatch.birth_place = normalizePlace(motherBirthPlace);
          const motherId = await q.createPerson(profileId, mPatch);
          await q.addParent(motherId, personId);
          updatedFields.push("Mère créée et liée");
        } else {
          // Enrichir la fiche existante de la mère
          const mUpdate: q.PersonInput = {};
          if (motherOccupation) mUpdate.occupation = motherOccupation;
          if (motherIsDeceased) mUpdate.is_living = 0;
          if (motherDeathDateRaw && !existingMother.death_year) {
            const d = parseDateInput(motherDeathDateRaw);
            mUpdate.death_date_raw = d.canonical;
            mUpdate.death_date_iso = d.iso;
            if (d.year) mUpdate.death_year = d.year;
          }
          if (motherBirthDateRaw && !existingMother.birth_year) {
            const d = parseDateInput(motherBirthDateRaw);
            mUpdate.birth_date_raw = d.canonical;
            mUpdate.birth_date_iso = d.iso;
            if (d.year) mUpdate.birth_year = d.year;
          }
          if (motherDeathPlace) mUpdate.death_place = normalizePlace(motherDeathPlace);
          if (motherBirthPlace) mUpdate.birth_place = normalizePlace(motherBirthPlace);
          if (Object.keys(mUpdate).length > 0) {
            await q.updatePerson(existingMother.id, mUpdate);
            updatedFields.push("Fiche de la mère mise à jour");
          }
        }
      }

      // 7. Mariage / Conjoint (si mention marginale ou acte de mariage)
      if (createUnion && (marriageDateRaw || marriagePlace || spouseSurname || spouseGivenNames)) {
        const uPatch: q.UnionInput = {};
        if (marriageDateRaw) {
          const d = parseDateInput(marriageDateRaw);
          uPatch.date_raw = d.canonical;
          uPatch.date_iso = d.iso;
          if (d.year) uPatch.year = d.year;
        }
        if (marriagePlace) uPatch.place = normalizePlace(marriagePlace);

        if (person.unions.length > 0) {
          await q.updateUnion(person.unions[0].id, uPatch);
          updatedFields.push("Mariage mis à jour");
        } else if (spouseGivenNames || spouseSurname) {
          const spouseSex = person.sex === "M" ? "F" : person.sex === "F" ? "M" : null;
          const spouseId = await q.createPerson(profileId, {
            given_names: spouseGivenNames || "",
            surname: spouseSurname || "",
            sex: spouseSex,
            status: "En recherche",
          });
          await q.createUnion(profileId, {
            partner1_id: personId,
            partner2_id: spouseId,
            date_raw: uPatch.date_raw,
            date_iso: uPatch.date_iso,
            year: uPatch.year,
            place: uPatch.place,
          });
          updatedFields.push("Union et conjoint créés");
        }
      }

      await q.recomputeSosa(profileId);
      await q.checkAndUpdatePersonCompletion(personId);
      await refreshProfile(slug, personId);
      return { ok: true, updatedFields };
    } else if (unionId) {
      const union = await q.getUnionRow(unionId);
      if (!union) return { ok: false, error: "Union introuvable" };
      const profileId = union.profile_id;

      // 1. Mise à jour de l'union (date, lieu, notes)
      const patch: q.UnionInput = {};
      const mDate = marriageDateRaw || dateRaw;
      const mPlace = marriagePlace || place;

      if (mDate) {
        const d = parseDateInput(mDate);
        patch.date_raw = d.canonical;
        patch.date_iso = d.iso;
        if (d.year) patch.year = d.year;
        updatedFields.push("Date de mariage");
      }
      if (mPlace) {
        patch.place = normalizePlace(mPlace);
        updatedFields.push("Lieu de mariage");
      }
      if (appendToNotes && transcriptionText) {
        const currentNotes = union.notes?.trim() || "";
        patch.notes = currentNotes
          ? `${currentNotes}\n\n--- Transcription d'acte ---\n${transcriptionText}`
          : `--- Transcription d'acte ---\n${transcriptionText}`;
        updatedFields.push("Notes de mariage");
      }

      if (Object.keys(patch).length > 0) {
        await q.updateUnion(unionId, patch);
      }

      // 2. Mise à jour de l'époux (partner1)
      if (union.partner1_id) {
        const p1 = await q.getPerson(profileId, union.partner1_id);
        if (p1) {
          const p1Patch: q.PersonInput = {};
          if (occupation && !p1.occupation) {
            p1Patch.occupation = occupation;
            updatedFields.push(`Métier de ${p1.displayName}`);
          }
          if (birthDateRaw && !p1.birth_year) {
            const d = parseDateInput(birthDateRaw);
            p1Patch.birth_date_raw = d.canonical;
            p1Patch.birth_date_iso = d.iso;
            if (d.year) p1Patch.birth_year = d.year;
            updatedFields.push(`Date naiss. de ${p1.displayName}`);
          }
          if (birthPlace && !p1.birth_place) {
            p1Patch.birth_place = normalizePlace(birthPlace);
            updatedFields.push(`Lieu naiss. de ${p1.displayName}`);
          }
          if (Object.keys(p1Patch).length > 0) {
            await q.updatePerson(p1.id, p1Patch);
          }

          // Parents de partner1 (Père)
          if (createFather && (fatherGivenNames || fatherSurname)) {
            const exFather = p1.parents.find((p) => p.sex === "M");
            if (!exFather) {
              const fId = await q.createPerson(profileId, {
                given_names: fatherGivenNames || "",
                surname: fatherSurname || p1.surname || "",
                sex: "M",
                status: "En recherche",
                is_living: fatherIsDeceased ? 0 : 1,
              });
              await q.addParent(fId, p1.id);
              updatedFields.push(`Père de ${p1.displayName} créé et lié`);
            } else if (fatherIsDeceased) {
              await q.updatePerson(exFather.id, { is_living: 0 });
            }
          }

          // Parents de partner1 (Mère)
          if (createMother && (motherGivenNames || motherSurname)) {
            const exMother = p1.parents.find((p) => p.sex === "F");
            if (!exMother) {
              const mId = await q.createPerson(profileId, {
                given_names: motherGivenNames || "",
                surname: motherSurname || "",
                sex: "F",
                status: "En recherche",
                is_living: motherIsDeceased ? 0 : 1,
              });
              await q.addParent(mId, p1.id);
              updatedFields.push(`Mère de ${p1.displayName} créée et liée`);
            } else if (motherIsDeceased) {
              await q.updatePerson(exMother.id, { is_living: 0 });
            }
          }

          await q.checkAndUpdatePersonCompletion(p1.id);
        }
      }

      // 3. Mise à jour ou création de l'épouse (partner2)
      const spouseFatherGivenNames = str(fd, "spouse_father_given_names");
      const spouseFatherSurname = str(fd, "spouse_father_surname")?.toLocaleUpperCase("fr") || null;
      const spouseFatherIsDeceased = str(fd, "spouse_father_is_deceased") === "1" || str(fd, "spouse_father_is_deceased") === "true";
      const spouseMotherGivenNames = str(fd, "spouse_mother_given_names");
      const spouseMotherSurname = str(fd, "spouse_mother_surname")?.toLocaleUpperCase("fr") || null;
      const spouseMotherIsDeceased = str(fd, "spouse_mother_is_deceased") === "1" || str(fd, "spouse_mother_is_deceased") === "true";
      const spouseOccupation = str(fd, "spouse_occupation");
      const spouseBirthDateRaw = str(fd, "spouse_birth_date_raw");
      const spouseBirthPlace = str(fd, "spouse_birth_place");

      let p2Id = union.partner2_id;
      if (!p2Id && (spouseGivenNames || spouseSurname)) {
        // Créer l'épouse si manquante
        p2Id = await q.createPerson(profileId, {
          given_names: spouseGivenNames || "",
          surname: spouseSurname || "",
          sex: "F",
          status: "En recherche",
          occupation: spouseOccupation || null,
        });
        await q.updateUnion(unionId, { partner2_id: p2Id });
        updatedFields.push("Épouse créée et liée");
      }

      if (p2Id) {
        const p2 = await q.getPerson(profileId, p2Id);
        if (p2) {
          const p2Patch: q.PersonInput = {};
          if (spouseOccupation && !p2.occupation) {
            p2Patch.occupation = spouseOccupation;
            updatedFields.push(`Métier de ${p2.displayName}`);
          }
          if (spouseBirthDateRaw && !p2.birth_year) {
            const d = parseDateInput(spouseBirthDateRaw);
            p2Patch.birth_date_raw = d.canonical;
            p2Patch.birth_date_iso = d.iso;
            if (d.year) p2Patch.birth_year = d.year;
            updatedFields.push(`Date naiss. de ${p2.displayName}`);
          }
          if (spouseBirthPlace && !p2.birth_place) {
            p2Patch.birth_place = normalizePlace(spouseBirthPlace);
            updatedFields.push(`Lieu naiss. de ${p2.displayName}`);
          }
          if (Object.keys(p2Patch).length > 0) {
            await q.updatePerson(p2.id, p2Patch);
          }

          // Parents de partner2 (Père)
          if (spouseFatherGivenNames || spouseFatherSurname) {
            const exFather = p2.parents.find((p) => p.sex === "M");
            if (!exFather) {
              const fId = await q.createPerson(profileId, {
                given_names: spouseFatherGivenNames || "",
                surname: spouseFatherSurname || p2.surname || "",
                sex: "M",
                status: "En recherche",
                is_living: spouseFatherIsDeceased ? 0 : 1,
              });
              await q.addParent(fId, p2.id);
              updatedFields.push(`Père de ${p2.displayName} créé et lié`);
            } else if (spouseFatherIsDeceased) {
              await q.updatePerson(exFather.id, { is_living: 0 });
            }
          }

          // Parents de partner2 (Mère)
          if (spouseMotherGivenNames || spouseMotherSurname) {
            const exMother = p2.parents.find((p) => p.sex === "F");
            if (!exMother) {
              const mId = await q.createPerson(profileId, {
                given_names: spouseMotherGivenNames || "",
                surname: spouseMotherSurname || "",
                sex: "F",
                status: "En recherche",
                is_living: spouseMotherIsDeceased ? 0 : 1,
              });
              await q.addParent(mId, p2.id);
              updatedFields.push(`Mère de ${p2.displayName} créée et liée`);
            } else if (spouseMotherIsDeceased) {
              await q.updatePerson(exMother.id, { is_living: 0 });
            }
          }

          await q.checkAndUpdatePersonCompletion(p2.id);
        }
      }

      await q.recomputeSosa(profileId);
      await refreshProfile(slug);
      return { ok: true, updatedFields };
    }

    return { ok: false, error: "Aucune cible (personne ou union) spécifiée" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

