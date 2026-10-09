import { cache } from "react";
import { queryAll, queryOne, execute, batch } from "./db";
import { computeCompletion } from "./completion";
import type {
  Person,
  PersonRef,
  PersonRow,
  Profile,
  ResourceRow,
  SourceRow,
  Status,
  TaskRow,
  UnionRow,
} from "./types";
import type { InStatement } from "@libsql/client";

export function displayName(p: { given_names: string; surname: string }) {
  return `${p.given_names ?? ""} ${p.surname ?? ""}`.trim() || "Sans nom";
}

function toRef(p: PersonRow): PersonRef {
  return {
    id: p.id,
    displayName: displayName(p),
    status: p.status,
    kinship: p.kinship,
    birth_year: p.birth_year,
    death_year: p.death_year,
    sex: p.sex,
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/* ------------------------------------------------------------------ profils */

export type ProfileSummary = Profile & { personCount: number; openTasks: number };

export const listProfiles = cache(async (): Promise<ProfileSummary[]> => {
  return queryAll<ProfileSummary>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM persons WHERE profile_id = p.id) AS personCount,
            (SELECT COUNT(*) FROM tasks   WHERE profile_id = p.id AND status IN ('À faire','En cours')) AS openTasks
     FROM profiles p ORDER BY p.name`,
  );
});

export const getProfileBySlug = cache(async (slug: string): Promise<Profile | null> => {
  return queryOne<Profile>(`SELECT * FROM profiles WHERE slug = ?`, [slug]);
});

export async function slugify(name: string): Promise<string> {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "profil";
  let slug = base;
  let i = 2;
  while (await queryOne(`SELECT 1 FROM profiles WHERE slug = ?`, [slug])) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

export async function createProfile(name: string, description?: string | null): Promise<Profile> {
  const slug = await slugify(name);
  const info = await execute(
    `INSERT INTO profiles (slug, name, description) VALUES (?, ?, ?)`,
    [slug, name.trim(), description?.trim() || null],
  );
  return (await queryOne<Profile>(`SELECT * FROM profiles WHERE id = ?`, [info.lastInsertRowid]))!;
}

export async function updateProfile(
  id: number,
  patch: { name?: string; description?: string | null; root_person_id?: number | null },
): Promise<void> {
  const current = await queryOne<Profile>(`SELECT * FROM profiles WHERE id = ?`, [id]);
  if (!current) return;
  await execute(
    `UPDATE profiles SET name = ?, description = ?, root_person_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      patch.name?.trim() || current.name,
      patch.description !== undefined ? patch.description?.trim() || null : current.description,
      patch.root_person_id !== undefined ? patch.root_person_id : current.root_person_id,
      id,
    ],
  );
  if (patch.root_person_id !== undefined) {
    await recomputeSosa(id);
  }
}

export async function deleteProfile(id: number): Promise<void> {
  await execute(`DELETE FROM profiles WHERE id = ?`, [id]);
}

/* ---------------------------------------------------------------- personnes */

export const listPersonRows = cache(async (profileId: number): Promise<PersonRow[]> => {
  return queryAll<PersonRow>(
    `SELECT * FROM persons WHERE profile_id = ? ORDER BY surname, given_names`,
    [profileId],
  );
});

/** Charge tout le profil d'un coup : relations résolues + complétion calculée. */
export const listPersons = cache(async (profileId: number): Promise<Person[]> => {
  const [rows, links, unions] = await Promise.all([
    listPersonRows(profileId),
    queryAll<{ parent_id: number; child_id: number }>(
      `SELECT pc.parent_id, pc.child_id FROM parent_child pc
       JOIN persons c ON c.id = pc.child_id WHERE c.profile_id = ?`,
      [profileId],
    ),
    queryAll<UnionRow>(
      `SELECT * FROM unions WHERE profile_id = ? ORDER BY COALESCE(year, 9999), id`,
      [profileId],
    ),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));

  const parentsOf = new Map<number, number[]>();
  const childrenOf = new Map<number, number[]>();
  for (const { parent_id, child_id } of links) {
    push(parentsOf, child_id, parent_id);
    push(childrenOf, parent_id, child_id);
  }

  const unionsOf = new Map<number, UnionRow[]>();
  for (const u of unions) {
    if (u.partner1_id != null) push(unionsOf, u.partner1_id, u);
    if (u.partner2_id != null) push(unionsOf, u.partner2_id, u);
  }

  const refs = (ids: Iterable<number>): PersonRef[] =>
    [...ids]
      .map((id) => byId.get(id))
      .filter((p): p is PersonRow => !!p)
      .map(toRef);

  return rows.map((row) => {
    const parentIds = parentsOf.get(row.id) ?? [];
    const childIds = childrenOf.get(row.id) ?? [];
    const personUnions = unionsOf.get(row.id) ?? [];

    const siblingIds = new Set<number>();
    for (const pid of parentIds) {
      for (const sib of childrenOf.get(pid) ?? []) if (sib !== row.id) siblingIds.add(sib);
    }

    return {
      ...row,
      displayName: displayName(row),
      parents: refs(parentIds),
      children: refs(childIds),
      siblings: refs(siblingIds),
      unions: personUnions.map((u) => {
        const spouseId = u.partner1_id === row.id ? u.partner2_id : u.partner1_id;
        const spouse = spouseId ? byId.get(spouseId) : null;
        return { ...u, spouse: spouse ? toRef(spouse) : null };
      }),
      completion: computeCompletion(row, personUnions[0] ?? null, parentIds.length),
    } satisfies Person;
  });
});

export async function getPerson(profileId: number, personId: number): Promise<Person | null> {
  const all = await listPersons(profileId);
  return all.find((p) => p.id === personId) ?? null;
}

export type PersonInput = Partial<
  Pick<
    PersonRow,
    | "given_names"
    | "surname"
    | "sex"
    | "kinship"
    | "status"
    | "occupation"
    | "birth_date_raw"
    | "birth_date_iso"
    | "birth_year"
    | "birth_year_estimated"
    | "birth_place"
    | "birth_source"
    | "birth_source_ignored"
    | "death_date_raw"
    | "death_date_iso"
    | "death_year"
    | "death_place"
    | "death_source"
    | "death_source_ignored"
    | "is_living"
    | "is_unmarried"
    | "proximity_year"
    | "geneanet_at"
    | "notes"
    | "sosa"
    | "notion_id"
  >
>;

const PERSON_FIELDS: (keyof PersonInput)[] = [
  "given_names",
  "surname",
  "sex",
  "kinship",
  "status",
  "occupation",
  "birth_date_raw",
  "birth_date_iso",
  "birth_year",
  "birth_year_estimated",
  "birth_place",
  "birth_source",
  "birth_source_ignored",
  "death_date_raw",
  "death_date_iso",
  "death_year",
  "death_place",
  "death_source",
  "death_source_ignored",
  "is_living",
  "is_unmarried",
  "proximity_year",
  "geneanet_at",
  "notes",
  "sosa",
  "notion_id",
];

export async function createPerson(profileId: number, input: PersonInput): Promise<number> {
  const cols = PERSON_FIELDS.filter((f) => input[f] !== undefined);
  const sql = `INSERT INTO persons (profile_id${cols.length ? ", " + cols.join(", ") : ""})
               VALUES (?${cols.map(() => ", ?").join("")})`;
  const info = await execute(sql, [profileId, ...cols.map((c) => input[c])]);
  return info.lastInsertRowid!;
}

export async function updatePerson(personId: number, input: PersonInput): Promise<void> {
  const cols = PERSON_FIELDS.filter((f) => input[f] !== undefined);
  if (!cols.length) return;
  await execute(
    `UPDATE persons SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    [...cols.map((c) => input[c]), personId],
  );
}

/** Les lieux déjà écrits dans le profil, les plus utilisés d'abord. */
export const listPlaces = cache(async (profileId: number): Promise<string[]> => {
  const rows = await queryAll<{ place: string }>(
    `SELECT place, COUNT(*) AS n FROM (
       SELECT birth_place AS place FROM persons WHERE profile_id = ? AND birth_place IS NOT NULL
       UNION ALL
       SELECT death_place FROM persons WHERE profile_id = ? AND death_place IS NOT NULL
       UNION ALL
       SELECT place FROM unions WHERE profile_id = ? AND place IS NOT NULL
     )
     WHERE TRIM(place) <> ''
     GROUP BY place ORDER BY n DESC, place`,
    [profileId, profileId, profileId],
  );
  return rows.map((r) => r.place);
});

export const getPersonRow = cache(async (personId: number): Promise<PersonRow | null> => {
  return queryOne<PersonRow>(`SELECT * FROM persons WHERE id = ?`, [personId]);
});

/**
 * Vérifie si tous les critères de la fiche sont satisfaits (complétion à 100%).
 * Si oui et que la personne n'est pas encore marquée "Complet", son statut est mis à jour automatiquement.
 */
export async function checkAndUpdatePersonCompletion(personId: number): Promise<boolean> {
  const person = await getPersonRow(personId);
  if (!person) return false;

  const [unions, parentRes] = await Promise.all([
    queryAll<UnionRow>(
      `SELECT * FROM unions WHERE partner1_id = ? OR partner2_id = ? ORDER BY COALESCE(year, 9999), id`,
      [personId, personId],
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM parent_child WHERE child_id = ?`,
      [personId],
    ),
  ]);

  const parentCount = parentRes?.c ?? 0;
  const completion = computeCompletion(person, unions[0] ?? null, parentCount);

  if (completion.score === completion.total && completion.total > 0) {
    const targetStatus: Status = completion.ignored.length > 0 ? "Complet (lacunes)" : "Complet";
    if (person.status !== targetStatus) {
      await updatePerson(personId, { status: targetStatus });
      return true;
    }
  } else if (person.status === "Complet" || person.status === "Complet (lacunes)") {
    await updatePerson(personId, { status: "En recherche" });
    return true;
  }
  return false;
}

export async function recomputeAllCompletions(profileId: number): Promise<number> {
  const persons = await listPersonRows(profileId);
  let updated = 0;
  for (const p of persons) {
    const changed = await checkAndUpdatePersonCompletion(p.id);
    if (changed) updated++;
  }
  return updated;
}

export async function profileIdOfPerson(personId: number): Promise<number | null> {
  const row = await queryOne<{ profile_id: number }>(`SELECT profile_id FROM persons WHERE id = ?`, [personId]);
  return row?.profile_id ?? null;
}

export async function deletePerson(personId: number): Promise<void> {
  await deletePersons([personId]);
}

export async function deletePersons(personIds: number[]): Promise<void> {
  if (personIds.length === 0) return;
  const placeholders = personIds.map(() => "?").join(",");

  // 1. Détacher les racines de profil si l'une des personnes était root
  await execute(`UPDATE profiles SET root_person_id = NULL WHERE root_person_id IN (${placeholders})`, personIds);
  // 2. Nettoyer les relations parent-enfant (pour parer aux cas où CASCADE n'est pas activé côté connexion)
  await execute(
    `DELETE FROM parent_child WHERE parent_id IN (${placeholders}) OR child_id IN (${placeholders})`,
    [...personIds, ...personIds],
  );
  // 3. Nettoyer les unions
  await execute(
    `DELETE FROM unions WHERE partner1_id IN (${placeholders}) OR partner2_id IN (${placeholders})`,
    [...personIds, ...personIds],
  );
  // 4. Nettoyer les sources attachées
  await execute(`DELETE FROM sources WHERE person_id IN (${placeholders})`, personIds);
  // 5. Détacher les tâches
  await execute(`UPDATE tasks SET person_id = NULL WHERE person_id IN (${placeholders})`, personIds);
  // 6. Supprimer définitivement les personnes
  await execute(`DELETE FROM persons WHERE id IN (${placeholders})`, personIds);
}

export async function bulkUpdateStatus(personIds: number[], status: Status): Promise<void> {
  if (personIds.length === 0) return;
  const placeholders = personIds.map(() => "?").join(",");
  await execute(
    `UPDATE persons SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`,
    [status, ...personIds],
  );
}

/* ---------------------------------------------------------------- relations */

export async function addParent(parentId: number, childId: number): Promise<void> {
  if (parentId === childId) return;
  await execute(`INSERT OR IGNORE INTO parent_child (parent_id, child_id) VALUES (?, ?)`, [
    parentId,
    childId,
  ]);
}

export async function removeParent(parentId: number, childId: number): Promise<void> {
  await execute(`DELETE FROM parent_child WHERE parent_id = ? AND child_id = ?`, [parentId, childId]);
}

export type UnionInput = Partial<
  Pick<
    UnionRow,
    | "partner1_id"
    | "partner2_id"
    | "date_raw"
    | "date_iso"
    | "year"
    | "place"
    | "source"
    | "source_ignored"
    | "notes"
  >
>;

export async function createUnion(profileId: number, input: UnionInput): Promise<number> {
  const info = await execute(
    `INSERT INTO unions (profile_id, partner1_id, partner2_id, date_raw, date_iso, year, place, source, source_ignored, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      input.partner1_id ?? null,
      input.partner2_id ?? null,
      input.date_raw ?? null,
      input.date_iso ?? null,
      input.year ?? null,
      input.place ?? null,
      input.source ?? null,
      input.source_ignored ?? 0,
      input.notes ?? null,
    ],
  );
  return info.lastInsertRowid!;
}

export async function updateUnion(unionId: number, input: UnionInput): Promise<void> {
  const cols = Object.keys(input) as (keyof UnionInput)[];
  if (!cols.length) return;
  await execute(
    `UPDATE unions SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    [...cols.map((c) => input[c]), unionId],
  );
}

export async function deleteUnion(unionId: number): Promise<void> {
  await execute(`DELETE FROM unions WHERE id = ?`, [unionId]);
}

export async function getUnionRow(unionId: number): Promise<UnionRow | null> {
  return queryOne<UnionRow>(`SELECT * FROM unions WHERE id = ?`, [unionId]);
}

/* --------------------------------------------------------------------- sosa */

/**
 * Numérotation Sosa-Stradonitz depuis la racine du profil.
 * Le père prend 2n, la mère 2n+1 ; à sexe inconnu on garde l'ordre de saisie.
 */
export async function recomputeSosa(profileId: number): Promise<void> {
  const profile = await queryOne<Profile>(`SELECT * FROM profiles WHERE id = ?`, [profileId]);
  await execute(`UPDATE persons SET sosa = NULL WHERE profile_id = ?`, [profileId]);
  if (!profile?.root_person_id) return;

  const rows = await queryAll<{ parent_id: number; child_id: number; sex: string | null }>(
    `SELECT pc.parent_id, pc.child_id, p.sex FROM parent_child pc
     JOIN persons p ON p.id = pc.parent_id WHERE p.profile_id = ?`,
    [profileId],
  );

  const parentsOf = new Map<number, number[]>();
  for (const r of rows) {
    const list = parentsOf.get(r.child_id);
    if (!list) parentsOf.set(r.child_id, [r.parent_id]);
    else if (r.sex === "M") list.unshift(r.parent_id);
    else list.push(r.parent_id);
  }

  const updates: InStatement[] = [];
  const seen = new Set<number>();
  const queue: [number, number][] = [[profile.root_person_id, 1]];

  while (queue.length) {
    const [personId, sosa] = queue.shift()!;
    if (seen.has(personId) || sosa > 2 ** 20) continue;
    seen.add(personId);
    updates.push({
      sql: `UPDATE persons SET sosa = ? WHERE id = ?`,
      args: [sosa, personId],
    });
    (parentsOf.get(personId) ?? []).slice(0, 2).forEach((pid, i) => queue.push([pid, sosa * 2 + i]));
  }

  if (updates.length > 0) {
    // Par lots de 100 pour Turso
    for (let i = 0; i < updates.length; i += 100) {
      await batch(updates.slice(i, i + 100));
    }
  }
}

/* ------------------------------------------------------------------- tâches */

export type TaskWithPerson = TaskRow & { personName: string | null };

export const listTasks = cache(async (profileId: number): Promise<TaskWithPerson[]> => {
  return queryAll<TaskWithPerson>(
    `SELECT t.*, CASE WHEN p.id IS NULL THEN NULL ELSE TRIM(p.given_names || ' ' || p.surname) END AS personName
     FROM tasks t LEFT JOIN persons p ON p.id = t.person_id
     WHERE t.profile_id = ?
     ORDER BY CASE t.status WHEN 'En cours' THEN 0 WHEN 'À faire' THEN 1 WHEN 'Fait' THEN 2 ELSE 3 END,
              CASE t.priority WHEN 'Haute' THEN 0 WHEN 'Normale' THEN 1 ELSE 2 END,
              t.created_at DESC`,
    [profileId],
  );
});

export type TaskInput = Partial<
  Pick<
    TaskRow,
    "person_id" | "title" | "details" | "kind" | "priority" | "status" | "archive" | "url"
  >
>;

export async function createTask(profileId: number, input: TaskInput): Promise<number> {
  const info = await execute(
    `INSERT INTO tasks (profile_id, person_id, title, details, kind, priority, status, archive, url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      input.person_id ?? null,
      (input.title ?? "Sans titre").trim(),
      input.details ?? null,
      input.kind ?? null,
      input.priority ?? "Normale",
      input.status ?? "À faire",
      input.archive ?? null,
      input.url ?? null,
    ],
  );
  return info.lastInsertRowid!;
}

export async function updateTask(taskId: number, input: TaskInput): Promise<void> {
  const cols = Object.keys(input) as (keyof TaskInput)[];
  if (!cols.length) return;
  await execute(
    `UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(", ")},
       done_at = CASE WHEN ? = 'Fait' THEN datetime('now') ELSE done_at END
     WHERE id = ?`,
    [...cols.map((c) => input[c]), input.status ?? "", taskId],
  );
}

export async function deleteTask(taskId: number): Promise<void> {
  await execute(`DELETE FROM tasks WHERE id = ?`, [taskId]);
}

/* ----------------------------------------------------- sources & ressources */

export const listSources = cache(async (personId: number): Promise<SourceRow[]> => {
  return queryAll<SourceRow>(`SELECT * FROM sources WHERE person_id = ? ORDER BY id`, [personId]);
});

export async function createSource(profileId: number, input: Partial<SourceRow>): Promise<number> {
  const info = await execute(
    `INSERT INTO sources (profile_id, person_id, kind, label, url, date_raw, place, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      input.person_id ?? null,
      input.kind ?? "Autre",
      input.label ?? null,
      input.url ?? null,
      input.date_raw ?? null,
      input.place ?? null,
      input.notes ?? null,
    ],
  );
  return info.lastInsertRowid!;
}

export async function deleteSource(sourceId: number): Promise<void> {
  await execute(`DELETE FROM sources WHERE id = ?`, [sourceId]);
}

export const listResources = cache(async (profileId: number): Promise<ResourceRow[]> => {
  return queryAll<ResourceRow>(`SELECT * FROM resources WHERE profile_id = ? ORDER BY category, label`, [
    profileId,
  ]);
});

export async function createResource(
  profileId: number,
  label: string,
  url: string,
  category?: string | null,
): Promise<void> {
  await execute(`INSERT INTO resources (profile_id, label, url, category) VALUES (?, ?, ?, ?)`, [
    profileId,
    label.trim(),
    url.trim(),
    category?.trim() || null,
  ]);
}

export async function deleteResource(id: number): Promise<void> {
  await execute(`DELETE FROM resources WHERE id = ?`, [id]);
}

export const listAllSourcesForProfile = cache(async (profileId: number): Promise<SourceRow[]> => {
  return queryAll<SourceRow>(`SELECT * FROM sources WHERE profile_id = ? ORDER BY id`, [profileId]);
});

