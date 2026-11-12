"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  claimOrphanProfiles,
  countAccounts,
  createAccount,
  endSession,
  findAccountForLogin,
  normalizeUsername,
  passwordProblem,
  startSession,
  usernameProblem,
  verifyPassword,
} from "@/lib/auth";
import { LEGACY_COOKIE } from "@/lib/session-cookie";

export type LoginState = { error?: string; username?: string } | null;

function safeFrom(formData: FormData): string {
  const raw = (formData.get("from") as string | null) ?? "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = normalizeUsername((formData.get("username") as string | null) ?? "");
  const password = (formData.get("password") as string | null) ?? "";
  if (!username || !password) return { error: "Identifiant et mot de passe requis.", username };

  const account = await findAccountForLogin(username);
  const ok = account ? await verifyPassword(password, account.password_hash) : false;
  if (!account || !ok) {
    // Un léger délai freine les essais en rafale.
    await wait(600);
    return { error: "Identifiant ou mot de passe incorrect.", username };
  }

  await startSession(account.id);
  (await cookies()).delete(LEGACY_COOKIE);
  redirect(safeFrom(formData));
}

/**
 * Premier lancement : aucun compte n'existe encore. Le compte créé devient administrateur
 * et récupère tous les profils existants. Le mot de passe actuel du site (ARIANE_PASSWORD)
 * prouve qu'on est bien le propriétaire.
 */
export async function bootstrapAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = normalizeUsername((formData.get("username") as string | null) ?? "");
  const displayName = ((formData.get("display_name") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  const confirm = (formData.get("confirm") as string | null) ?? "";
  const sitePassword = ((formData.get("site_password") as string | null) ?? "").trim();

  if ((await countAccounts()) > 0) return { error: "Un compte existe déjà : connectez-vous.", username };

  const expected = process.env.ARIANE_PASSWORD;
  if (!expected) {
    return { error: "ARIANE_PASSWORD n’est pas défini dans le fichier .env.local du serveur.", username };
  }
  if (sitePassword !== expected) {
    await wait(600);
    return { error: "Le mot de passe actuel du site est incorrect.", username };
  }

  const problem = usernameProblem(username) ?? passwordProblem(password);
  if (problem) return { error: problem, username };
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas.", username };

  const id = await createAccount({ username, password, displayName, isAdmin: true });
  await claimOrphanProfiles(id);
  await startSession(id);
  (await cookies()).delete(LEGACY_COOKIE);
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
