import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/login/actions";
import { ConfirmButton } from "@/components/Dialog";
import { IconArrowLeft, IconLogOut, IconTrash, IconUserPlus } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge } from "@/components/ui";
import { requireAccount } from "@/lib/access";
import { accountLabel, listAccounts } from "@/lib/auth";
import { listProfiles } from "@/lib/queries";
import {
  changePasswordAction,
  createAccountAction,
  deleteAccountAction,
  resetPasswordAction,
  updateDisplayNameAction,
} from "./actions";
import { StateForm } from "./StateForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon compte",
};

function Section({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border py-8 first:border-t-0 first:pt-2 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-ui text-fg-muted">{description}</p>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-xs">{children}</div>
    </section>
  );
}

function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input {...input} className="field" />
    </label>
  );
}

const dateFr = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default async function AccountPage() {
  const account = await requireAccount();
  const [profiles, accounts] = await Promise.all([listProfiles(), account.is_admin ? listAccounts() : null]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-10 sm:py-14">
      <Link href="/" className="flex w-fit items-center gap-1.5 text-ui text-fg-muted hover:text-fg">
        <IconArrowLeft size={14} />
        Mes profils
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mon compte</h1>
          <p className="mt-1.5 text-ui text-fg-muted">
            Connecté en tant que <span className="font-medium text-fg">{account.username}</span>
            {account.is_admin ? " · administrateur" : ""} · {profiles.length} profil{profiles.length > 1 ? "s" : ""}
          </p>
        </div>
        <form action={logoutAction}>
          <SubmitButton variant="secondary">
            <IconLogOut size={14} />
            Se déconnecter
          </SubmitButton>
        </form>
      </header>

      <div className="mt-8">
        <Section title="Nom affiché" description="Affiché dans l’en-tête de vos profils.">
          <StateForm action={updateDisplayNameAction} className="flex flex-col gap-4">
            <Field label="Nom" name="display_name" defaultValue={account.display_name ?? ""} placeholder={account.username} />
            <div className="flex justify-end">
              <SubmitButton>Enregistrer</SubmitButton>
            </div>
          </StateForm>
        </Section>

        <Section title="Mot de passe" description="Changer de mot de passe déconnecte vos autres appareils.">
          <StateForm action={changePasswordAction} className="flex flex-col gap-4">
            <input type="text" name="username" value={account.username} autoComplete="username" readOnly hidden />
            <Field label="Mot de passe actuel" name="current" type="password" required autoComplete="current-password" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nouveau mot de passe" name="password" type="password" required minLength={8} autoComplete="new-password" />
              <Field label="Confirmer" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div className="flex justify-end">
              <SubmitButton>Changer le mot de passe</SubmitButton>
            </div>
          </StateForm>
        </Section>

        {accounts && (
          <>
            <Section
              title="Comptes"
              description="Chaque compte a ses propres profils : personne ne voit les profils d’un autre compte, pas même l’administrateur."
            >
              <ul className="-my-1 divide-y divide-border">
                {accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-ui font-medium">
                        {accountLabel(a)}
                        {a.is_admin ? <Badge tone="ink">Admin</Badge> : null}
                        {a.id === account.id ? <span className="text-2xs font-normal text-fg-subtle">(vous)</span> : null}
                      </p>
                      <p className="num text-xs text-fg-subtle">
                        {a.username} · {a.profileCount} profil{a.profileCount > 1 ? "s" : ""} · créé le {dateFr(a.created_at)}
                      </p>
                    </div>
                    {a.id !== account.id && (
                      <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto">
                        <details className="group">
                          <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium shadow-xs hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                            Nouveau mot de passe
                          </summary>
                          <StateForm
                            action={resetPasswordAction}
                            fields={{ accountId: a.id }}
                            className="mt-2 flex flex-col gap-2 sm:w-64"
                          >
                            <input
                              className="field"
                              name="password"
                              type="text"
                              required
                              minLength={8}
                              placeholder="8 caractères au moins"
                              aria-label={`Nouveau mot de passe pour ${a.username}`}
                              autoComplete="off"
                            />
                            <SubmitButton size="sm" variant="secondary">
                              Définir
                            </SubmitButton>
                          </StateForm>
                        </details>
                        <ConfirmButton
                          action={deleteAccountAction}
                          fields={{ accountId: a.id }}
                          title={`Supprimer le compte « ${a.username} » ?`}
                          description={`Ses ${a.profileCount} profil${a.profileCount > 1 ? "s" : ""} et toutes leurs fiches seront effacés. Cette action est irréversible.`}
                          confirmLabel="Supprimer le compte"
                          confirmText={a.username}
                          successMessage="Compte supprimé"
                          variant="danger-soft"
                          size="sm"
                        >
                          <IconTrash size={13} />
                          Supprimer
                        </ConfirmButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="Ajouter un compte"
              description="Pour un proche : il se connectera avec cet identifiant et pourra changer son mot de passe."
            >
              <StateForm action={createAccountAction} className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Identifiant"
                    name="username"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="ex. julien"
                  />
                  <Field label="Nom affiché" name="display_name" placeholder="Facultatif" autoComplete="off" />
                </div>
                <Field
                  label="Mot de passe provisoire"
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  autoComplete="off"
                  placeholder="8 caractères au moins"
                />
                <div className="flex justify-end">
                  <SubmitButton>
                    <IconUserPlus size={14} />
                    Créer le compte
                  </SubmitButton>
                </div>
              </StateForm>
            </Section>
          </>
        )}
      </div>
    </main>
  );
}
