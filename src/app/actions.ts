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
    case "birth_source":
    case "death_source":
    case "notes": {
      patch[field] = value || null;
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
  field: "date_raw" | "place" | "source";
  value: string;
}) {
  const value = input.value.trim();
  if (input.field === "date_raw") {
    const d = parseDateInput(value);
    q.updateUnion(input.unionId, { date_raw: d.canonical, date_iso: d.iso, year: d.year });
  } else if (input.field === "place") {
    q.updateUnion(input.unionId, { place: normalizePlace(value) });
  } else {
    q.updateUnion(input.unionId, { source: value || null });
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
