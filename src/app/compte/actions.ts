"use server";

import { revalidatePath } from "next/cache";

import { requireAccount, requireAdmin } from "@/lib/access";
import {
  createAccount,
  currentTokenHash,
  deleteAccountCascade,
  getAccount,
  normalizeUsername,
  passwordProblem,
  setPassword,
  updateDisplayName,
  usernameProblem,
  usernameTaken,
  verifyPassword,
} from "@/lib/auth";
import { deleteProfile } from "@/lib/queries";

export type FormState = { error?: string; success?: string } | null;

const text = (fd: FormData, key: string) => ((fd.get(key) as string | null) ?? "").trim();
const raw = (fd: FormData, key: string) => (fd.get(key) as string | null) ?? "";

export async function updateDisplayNameAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const account = await requireAccount();
  await updateDisplayName(account.id, text(fd, "display_name") || null);
  revalidatePath("/", "layout");
  return { success: "Nom enregistré." };
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const account = await requireAccount();
  const full = await getAccount(account.id);
  if (!full || !(await verifyPassword(raw(fd, "current"), full.password_hash))) {
    return { error: "Le mot de passe actuel est incorrect." };
  }
  const next = raw(fd, "password");
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== raw(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  // Les autres appareils sont déconnectés ; celui-ci reste connecté.
  await setPassword(account.id, next, await currentTokenHash());
  return { success: "Mot de passe changé. Vos autres appareils ont été déconnectés." };
}

/* ------------------------------------------------------ administration */

export async function createAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const username = normalizeUsername(text(fd, "username"));
  const password = raw(fd, "password");
  const problem = usernameProblem(username) ?? passwordProblem(password);
  if (problem) return { error: problem };
  if (await usernameTaken(username)) return { error: `L’identifiant « ${username} » est déjà pris.` };
  await createAccount({ username, password, displayName: text(fd, "display_name") || null });
  revalidatePath("/compte");
  return { success: `Compte « ${username} » créé. Transmettez-lui son identifiant et son mot de passe.` };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const accountId = Number(text(fd, "accountId"));
  const target = accountId ? await getAccount(accountId) : null;
  if (!target) return { error: "Compte introuvable." };
  if (target.id === admin.id) return { error: "Pour votre propre compte, utilisez « Mot de passe » plus haut." };
  const password = raw(fd, "password");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  await setPassword(target.id, password);
  return { success: `Nouveau mot de passe défini pour « ${target.username} ».` };
}

export async function deleteAccountAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const accountId = Number(text(fd, "accountId"));
  if (!accountId || accountId === admin.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
  const target = await getAccount(accountId);
  if (!target) throw new Error("Compte introuvable.");
  await deleteAccountCascade(accountId, deleteProfile);
  revalidatePath("/compte");
}
