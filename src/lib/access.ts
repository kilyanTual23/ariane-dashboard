import { redirect } from "next/navigation";

import { getCurrentAccount, type Account } from "./auth";
import { queryOne } from "./db";
import type { Profile } from "./types";

/**
 * Contrôle d'accès, au plus près des données.
 * Chaque server action et chaque route passe par ces fonctions : un identifiant
 * (fiche, union, tâche…) qui n'appartient pas à un profil du compte connecté est refusé,
 * même s'il est envoyé à la main.
 */

export class AccessDenied extends Error {
  constructor() {
    super("Accès refusé : cet élément n’appartient pas à votre compte.");
    this.name = "AccessDenied";
  }
}

/** Compte connecté, ou renvoi vers la connexion. */
export async function requireAccount(): Promise<Account> {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  return account;
}

export async function requireAdmin(): Promise<Account> {
  const account = await requireAccount();
  if (!account.is_admin) throw new AccessDenied();
  return account;
}

/** Le profil, s'il appartient au compte connecté. */
export async function ownedProfile(profileId: number | null | undefined): Promise<Profile> {
  const account = await requireAccount();
  if (!profileId) throw new AccessDenied();
  const profile = await queryOne<Profile>(`SELECT * FROM profiles WHERE id = ? AND account_id = ?`, [
    profileId,
    account.id,
  ]);
  if (!profile) throw new AccessDenied();
  return profile;
}

type OwnedTable = "persons" | "unions" | "tasks" | "sources" | "resources";

async function ownedRow(table: OwnedTable, id: number | null | undefined): Promise<number> {
  const account = await requireAccount();
  if (!id) throw new AccessDenied();
  const row = await queryOne<{ profile_id: number }>(
    `SELECT t.profile_id FROM ${table} t JOIN profiles p ON p.id = t.profile_id
     WHERE t.id = ? AND p.account_id = ?`,
    [id, account.id],
  );
  if (!row) throw new AccessDenied();
  return Number(row.profile_id);
}

/** Identifiant du profil de la fiche, si elle appartient au compte connecté. */
export const ownedPerson = (personId: number | null | undefined) => ownedRow("persons", personId);
export const ownedUnion = (unionId: number | null | undefined) => ownedRow("unions", unionId);
export const ownedTask = (taskId: number | null | undefined) => ownedRow("tasks", taskId);
export const ownedSource = (sourceId: number | null | undefined) => ownedRow("sources", sourceId);
export const ownedResource = (resourceId: number | null | undefined) => ownedRow("resources", resourceId);

/**
 * Vérifie que le profil appartient au compte et que toutes les fiches citées en font partie
 * (empêche aussi de relier deux profils différents).
 */
export async function ownedPersons(
  profileId: number | null | undefined,
  personIds: (number | null | undefined)[],
): Promise<Profile> {
  const profile = await ownedProfile(profileId);
  const ids = [...new Set(personIds.filter((id): id is number => typeof id === "number" && id > 0))];
  if (ids.length === 0) return profile;
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM persons WHERE profile_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
    [profile.id, ...ids],
  );
  if (Number(row?.n ?? 0) !== ids.length) throw new AccessDenied();
  return profile;
}

/**
 * Image d'acte en cache (person_12_birth.jpg, union_4_marriage.jpg) :
 * vrai si la fiche ou l'union appartient au compte connecté.
 */
export async function canReadActFile(filename: string): Promise<boolean> {
  const m = /^(person|union)_(\d+)_/.exec(filename);
  if (!m) return false;
  try {
    if (m[1] === "person") await ownedPerson(Number(m[2]));
    else await ownedUnion(Number(m[2]));
    return true;
  } catch {
    return false;
  }
}
