import { db } from "./db";
import { computeCompletion } from "./completion";
import type {
  Person,
  PersonRef,
  PersonRow,
  Profile,
  ResourceRow,
  SourceRow,
  TaskRow,
  UnionRow,
} from "./types";

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

export function listProfiles(): ProfileSummary[] {
  return db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM persons WHERE profile_id = p.id) AS personCount,
              (SELECT COUNT(*) FROM tasks   WHERE profile_id = p.id AND status IN ('À faire','En cours')) AS openTasks
       FROM profiles p ORDER BY p.name`,
    )
    .all() as ProfileSummary[];
}

export function getProfileBySlug(slug: string): Profile | null {
  return (db.prepare(`SELECT * FROM profiles WHERE slug = ?`).get(slug) as Profile) ?? null;
}

export function slugify(name: string) {
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
  while (db.prepare(`SELECT 1 FROM profiles WHERE slug = ?`).get(slug)) slug = `${base}-${i++}`;
  return slug;
}

export function createProfile(name: string, description?: string | null): Profile {
  const slug = slugify(name);
  const info = db
    .prepare(`INSERT INTO profiles (slug, name, description) VALUES (?, ?, ?)`)
    .run(slug, name.trim(), description?.trim() || null);
  return db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(info.lastInsertRowid) as Profile;
}

export function updateProfile(
  id: number,
  patch: { name?: string; description?: string | null; root_person_id?: number | null },
) {
  const current = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id) as Profile | undefined;
  if (!current) return;
  db.prepare(
    `UPDATE profiles SET name = ?, description = ?, root_person_id = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(
    patch.name?.trim() || current.name,
    patch.description !== undefined ? patch.description?.trim() || null : current.description,
    patch.root_person_id !== undefined ? patch.root_person_id : current.root_person_id,
    id,
  );
  if (patch.root_person_id !== undefined) recomputeSosa(id);
}

export function deleteProfile(id: number) {
  db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id);
}

/* ---------------------------------------------------------------- personnes */

export function listPersonRows(profileId: number): PersonRow[] {
  return db
    .prepare(`SELECT * FROM persons WHERE profile_id = ? ORDER BY surname, given_names`)
    .all(profileId) as PersonRow[];
}

/** Charge tout le profil d'un coup : relations résolues + complétion calculée. */
export function listPersons(profileId: number): Person[] {
  const rows = listPersonRows(profileId);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const links = db
    .prepare(
      `SELECT pc.parent_id, pc.child_id FROM parent_child pc
       JOIN persons c ON c.id = pc.child_id WHERE c.profile_id = ?`,
    )
    .all(profileId) as { parent_id: number; child_id: number }[];

  const unions = db
    .prepare(`SELECT * FROM unions WHERE profile_id = ? ORDER BY COALESCE(year, 9999), id`)
    .all(profileId) as UnionRow[];

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
}

export function getPerson(profileId: number, personId: number): Person | null {
  return listPersons(profileId).find((p) => p.id === personId) ?? null;
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

export function createPerson(profileId: number, input: PersonInput): number {
  const cols = PERSON_FIELDS.filter((f) => input[f] !== undefined);
  const sql = `INSERT INTO persons (profile_id${cols.length ? ", " + cols.join(", ") : ""})
               VALUES (?${cols.map(() => ", ?").join("")})`;
  const info = db.prepare(sql).run(profileId, ...cols.map((c) => input[c] as never));
  return Number(info.lastInsertRowid);
}

export function updatePerson(personId: number, input: PersonInput) {
  const cols = PERSON_FIELDS.filter((f) => input[f] !== undefined);
  if (!cols.length) return;
  db.prepare(
    `UPDATE persons SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
  ).run(...cols.map((c) => input[c] as never), personId);
}

/** Les lieux déjà écrits dans le profil, les plus utilisés d'abord. */
export function listPlaces(profileId: number): string[] {
  const rows = db
    .prepare(
      `SELECT place, COUNT(*) AS n FROM (
         SELECT birth_place AS place FROM persons WHERE profile_id = ? AND birth_place IS NOT NULL
         UNION ALL
         SELECT death_place FROM persons WHERE profile_id = ? AND death_place IS NOT NULL
         UNION ALL
         SELECT place FROM unions WHERE profile_id = ? AND place IS NOT NULL
       )
       WHERE TRIM(place) <> ''
       GROUP BY place ORDER BY n DESC, place`,
    )
    .all(profileId, profileId, profileId) as { place: string; n: number }[];
  return rows.map((r) => r.place);
}

export function getPersonRow(personId: number): PersonRow | null {
  return (db.prepare(`SELECT * FROM persons WHERE id = ?`).get(personId) as PersonRow) ?? null;
}

export function profileIdOfPerson(personId: number): number | null {
  const row = db.prepare(`SELECT profile_id FROM persons WHERE id = ?`).get(personId) as
    | { profile_id: number }
    | undefined;
  return row?.profile_id ?? null;
}

export function deletePerson(personId: number) {
  db.prepare(`DELETE FROM persons WHERE id = ?`).run(personId);
}

/* ---------------------------------------------------------------- relations */

export function addParent(parentId: number, childId: number) {
  if (parentId === childId) return;
  db.prepare(`INSERT OR IGNORE INTO parent_child (parent_id, child_id) VALUES (?, ?)`).run(
    parentId,
    childId,
  );
}

export function removeParent(parentId: number, childId: number) {
  db.prepare(`DELETE FROM parent_child WHERE parent_id = ? AND child_id = ?`).run(parentId, childId);
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

export function createUnion(profileId: number, input: UnionInput): number {
  const info = db
    .prepare(
      `INSERT INTO unions (profile_id, partner1_id, partner2_id, date_raw, date_iso, year, place, source, source_ignored, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
    );
  return Number(info.lastInsertRowid);
}

export function updateUnion(unionId: number, input: UnionInput) {
  const cols = Object.keys(input) as (keyof UnionInput)[];
  if (!cols.length) return;
  db.prepare(`UPDATE unions SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...cols.map((c) => input[c] as never),
    unionId,
  );
}

export function deleteUnion(unionId: number) {
  db.prepare(`DELETE FROM unions WHERE id = ?`).run(unionId);
}

/* --------------------------------------------------------------------- sosa */

/**
 * Numérotation Sosa-Stradonitz depuis la racine du profil.
 * Le père prend 2n, la mère 2n+1 ; à sexe inconnu on garde l'ordre de saisie.
 */
export function recomputeSosa(profileId: number) {
  const profile = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(profileId) as
    | Profile
    | undefined;
  db.prepare(`UPDATE persons SET sosa = NULL WHERE profile_id = ?`).run(profileId);
  if (!profile?.root_person_id) return;

  const rows = db
    .prepare(
      `SELECT pc.parent_id, pc.child_id, p.sex FROM parent_child pc
       JOIN persons p ON p.id = pc.parent_id WHERE p.profile_id = ?`,
    )
    .all(profileId) as { parent_id: number; child_id: number; sex: string | null }[];

  const parentsOf = new Map<number, number[]>();
  for (const r of rows) {
    const list = parentsOf.get(r.child_id);
    if (!list) parentsOf.set(r.child_id, [r.parent_id]);
    else if (r.sex === "M") list.unshift(r.parent_id);
    else list.push(r.parent_id);
  }

  const assign = db.prepare(`UPDATE persons SET sosa = ? WHERE id = ?`);
  const seen = new Set<number>();
  const queue: [number, number][] = [[profile.root_person_id, 1]];
  const apply = db.transaction(() => {
    while (queue.length) {
      const [personId, sosa] = queue.shift()!;
      if (seen.has(personId) || sosa > 2 ** 20) continue;
      seen.add(personId);
      assign.run(sosa, personId);
      (parentsOf.get(personId) ?? []).slice(0, 2).forEach((pid, i) => queue.push([pid, sosa * 2 + i]));
    }
  });
  apply();
}

/* ------------------------------------------------------------------- tâches */

export type TaskWithPerson = TaskRow & { personName: string | null };

export function listTasks(profileId: number): TaskWithPerson[] {
  return db
    .prepare(
      `SELECT t.*, CASE WHEN p.id IS NULL THEN NULL ELSE TRIM(p.given_names || ' ' || p.surname) END AS personName
       FROM tasks t LEFT JOIN persons p ON p.id = t.person_id
       WHERE t.profile_id = ?
       ORDER BY CASE t.status WHEN 'En cours' THEN 0 WHEN 'À faire' THEN 1 WHEN 'Fait' THEN 2 ELSE 3 END,
                CASE t.priority WHEN 'Haute' THEN 0 WHEN 'Normale' THEN 1 ELSE 2 END,
                t.created_at DESC`,
    )
    .all(profileId) as TaskWithPerson[];
}

export type TaskInput = Partial<
  Pick<
    TaskRow,
    "person_id" | "title" | "details" | "kind" | "priority" | "status" | "archive" | "url"
  >
>;

export function createTask(profileId: number, input: TaskInput): number {
  const info = db
    .prepare(
      `INSERT INTO tasks (profile_id, person_id, title, details, kind, priority, status, archive, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      profileId,
      input.person_id ?? null,
      (input.title ?? "Sans titre").trim(),
      input.details ?? null,
      input.kind ?? null,
      input.priority ?? "Normale",
      input.status ?? "À faire",
      input.archive ?? null,
      input.url ?? null,
    );
  return Number(info.lastInsertRowid);
}

export function updateTask(taskId: number, input: TaskInput) {
  const cols = Object.keys(input) as (keyof TaskInput)[];
  if (!cols.length) return;
  db.prepare(
    `UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(", ")},
       done_at = CASE WHEN ? = 'Fait' THEN datetime('now') ELSE done_at END
     WHERE id = ?`,
  ).run(...cols.map((c) => input[c] as never), input.status ?? "", taskId);
}

export function deleteTask(taskId: number) {
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId);
}

/* ----------------------------------------------------- sources & ressources */

export function listSources(personId: number): SourceRow[] {
  return db.prepare(`SELECT * FROM sources WHERE person_id = ? ORDER BY id`).all(personId) as SourceRow[];
}

export function createSource(profileId: number, input: Partial<SourceRow>): number {
  const info = db
    .prepare(
      `INSERT INTO sources (profile_id, person_id, kind, label, url, date_raw, place, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      profileId,
      input.person_id ?? null,
      input.kind ?? "Autre",
      input.label ?? null,
      input.url ?? null,
      input.date_raw ?? null,
      input.place ?? null,
      input.notes ?? null,
    );
  return Number(info.lastInsertRowid);
}

export function deleteSource(sourceId: number) {
  db.prepare(`DELETE FROM sources WHERE id = ?`).run(sourceId);
}

export function listResources(profileId: number): ResourceRow[] {
  return db
    .prepare(`SELECT * FROM resources WHERE profile_id = ? ORDER BY category, label`)
    .all(profileId) as ResourceRow[];
}

export function createResource(
  profileId: number,
  label: string,
  url: string,
  category?: string | null,
) {
  db.prepare(`INSERT INTO resources (profile_id, label, url, category) VALUES (?, ?, ?, ?)`).run(
    profileId,
    label.trim(),
    url.trim(),
    category?.trim() || null,
  );
}

export function deleteResource(id: number) {
  db.prepare(`DELETE FROM resources WHERE id = ?`).run(id);
}
