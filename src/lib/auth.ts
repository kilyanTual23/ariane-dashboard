import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";

import { batch, execute, queryAll, queryOne } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./session-cookie";

/**
 * Comptes et sessions.
 * Chaque compte possède ses propres profils (profiles.account_id) ; un compte ne voit
 * jamais les profils d'un autre. Les tables se créent d'elles-mêmes au premier usage.
 */

export type Account = {
  id: number;
  username: string;
  display_name: string | null;
  is_admin: number;
  created_at: string;
};

export type AccountSummary = Account & { profileCount: number };

/* ------------------------------------------------------------------ schéma */

let schemaReady: Promise<void> | null = null;

export function ensureAuthSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await execute(`CREATE TABLE IF NOT EXISTS accounts (
      id            INTEGER PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT,
      password_hash TEXT NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await execute(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL
    )`);
    const cols = await queryAll<{ name: string }>(`PRAGMA table_info(profiles)`);
    if (!cols.some((c) => c.name === "account_id")) {
      try {
        await execute(`ALTER TABLE profiles ADD COLUMN account_id INTEGER REFERENCES accounts(id)`);
      } catch (err) {
        // Un autre processus a pu ajouter la colonne entre-temps.
        if (!String(err).toLowerCase().includes("duplicate column")) throw err;
      }
    }
    await execute(`CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles(account_id)`);
    await execute(`CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id)`);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/* ----------------------------------------------------------- mots de passe */

const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const PASSWORD_MIN = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`;
  if (password.length > 200) return "Le mot de passe est trop long.";
  return null;
}

/* ------------------------------------------------------------ identifiants */

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function usernameProblem(username: string): string | null {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return "L’identifiant doit faire 3 à 32 caractères : lettres, chiffres, point, tiret ou tiret bas.";
  }
  return null;
}

/* ----------------------------------------------------------------- comptes */

export async function countAccounts(): Promise<number> {
  await ensureAuthSchema();
  const row = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM accounts`);
  return Number(row?.n ?? 0);
}

export async function findAccountForLogin(
  username: string,
): Promise<(Account & { password_hash: string }) | null> {
  await ensureAuthSchema();
  return queryOne(`SELECT * FROM accounts WHERE username = ?`, [normalizeUsername(username)]);
}

export async function getAccount(id: number): Promise<(Account & { password_hash: string }) | null> {
  await ensureAuthSchema();
  return queryOne(`SELECT * FROM accounts WHERE id = ?`, [id]);
}

export async function createAccount(input: {
  username: string;
  password: string;
  displayName?: string | null;
  isAdmin?: boolean;
}): Promise<number> {
  await ensureAuthSchema();
  const info = await execute(
    `INSERT INTO accounts (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)`,
    [
      normalizeUsername(input.username),
      input.displayName?.trim() || null,
      await hashPassword(input.password),
      input.isAdmin ? 1 : 0,
    ],
  );
  return info.lastInsertRowid!;
}

export async function usernameTaken(username: string): Promise<boolean> {
  await ensureAuthSchema();
  return !!(await queryOne(`SELECT 1 FROM accounts WHERE username = ?`, [normalizeUsername(username)]));
}

export async function updateDisplayName(accountId: number, displayName: string | null): Promise<void> {
  await execute(`UPDATE accounts SET display_name = ?, updated_at = datetime('now') WHERE id = ?`, [
    displayName?.trim() || null,
    accountId,
  ]);
}

/** Change le mot de passe et ferme les autres sessions du compte (sauf celle indiquée). */
export async function setPassword(accountId: number, password: string, keepTokenHash?: string): Promise<void> {
  await execute(`UPDATE accounts SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [
    await hashPassword(password),
    accountId,
  ]);
  if (keepTokenHash) {
    await execute(`DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?`, [accountId, keepTokenHash]);
  } else {
    await execute(`DELETE FROM sessions WHERE account_id = ?`, [accountId]);
  }
}

export async function listAccounts(): Promise<AccountSummary[]> {
  await ensureAuthSchema();
  const rows = await queryAll<AccountSummary>(
    `SELECT a.id, a.username, a.display_name, a.is_admin, a.created_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.account_id = a.id) AS profileCount
     FROM accounts a ORDER BY a.is_admin DESC, a.username`,
  );
  return rows.map((r) => ({ ...r, profileCount: Number(r.profileCount) }));
}

/** Rattache au compte les profils qui n'appartiennent encore à personne (version à mot de passe unique). */
export async function claimOrphanProfiles(accountId: number): Promise<number> {
  const res = await execute(`UPDATE profiles SET account_id = ? WHERE account_id IS NULL`, [accountId]);
  return res.rowsAffected;
}

/* ---------------------------------------------------------------- sessions */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Ouvre une session et pose le cookie. */
export async function startSession(accountId: number): Promise<void> {
  await ensureAuthSchema();
  const token = randomBytes(32).toString("base64url");
  await execute(
    `INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, datetime('now', ?))`,
    [hashToken(token), accountId, `+${SESSION_MAX_AGE} seconds`],
  );
  // Ménage des sessions expirées, au passage.
  await execute(`DELETE FROM sessions WHERE expires_at < datetime('now')`);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureAuthSchema();
    await execute(`DELETE FROM sessions WHERE token_hash = ?`, [hashToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Empreinte de la session en cours (pour la garder ouverte lors d'un changement de mot de passe). */
export async function currentTokenHash(): Promise<string | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : undefined;
}

/**
 * Compte connecté, vérifié en base (une seule requête par rendu grâce à `cache`).
 * Renvoie null si le cookie est absent, inconnu ou expiré.
 */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureAuthSchema();
  return queryOne<Account>(
    `SELECT a.id, a.username, a.display_name, a.is_admin, a.created_at
     FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    [hashToken(token)],
  );
});

/** Supprime un compte, ses sessions et tous ses profils (avec leurs données). */
export async function deleteAccountCascade(accountId: number, purgeProfile: (id: number) => Promise<void>) {
  const profiles = await queryAll<{ id: number }>(`SELECT id FROM profiles WHERE account_id = ?`, [accountId]);
  for (const p of profiles) await purgeProfile(p.id);
  await batch([
    { sql: `DELETE FROM sessions WHERE account_id = ?`, args: [accountId] },
    { sql: `DELETE FROM accounts WHERE id = ?`, args: [accountId] },
  ]);
}

export function accountLabel(a: Pick<Account, "display_name" | "username">): string {
  return a.display_name?.trim() || a.username;
}
