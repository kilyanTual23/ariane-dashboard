import type { Metadata } from "next";
import Link from "next/link";

import { createProfileAction } from "./actions";
import { logoutAction } from "./login/actions";
import { IconArrowRight, IconListChecks, IconLogOut, IconPlus, IconUsers, Logo } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { CompletionRing, Kbd, STATUS_DOT } from "@/components/ui";
import { listPersons, listProfiles } from "@/lib/queries";
import { STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profils de recherche",
};

export default async function HomePage() {
  const rawProfiles = await listProfiles();
  const profiles = (
    await Promise.all(
      rawProfiles.map(async (p) => {
        const persons = await listPersons(p.id);
        const complete = persons.filter((x) => x.completion.score === x.completion.total).length;
        const filled = persons.reduce((s, x) => s + x.completion.score, 0);
        const slots = persons.reduce((s, x) => s + x.completion.total, 0);
        const counts = STATUSES.map((status) => ({
          status,
          count: persons.filter((x) => x.status === status).length,
        })).filter((c) => c.count > 0);
        return {
          ...p,
          complete,
          // La complétion d'un profil, c'est la part des cases remplies de ses fiches.
          percent: slots ? Math.round((filled / slots) * 100) : 0,
          counts,
        };
      }),
    )
  )
    // Les profils les plus avancés en premier : ce sont ceux qu'on peut boucler.
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, "fr"));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2.5 text-sm font-semibold">
          <Logo size={24} className="text-accent" />
          Ariane
        </span>
        <form action={logoutAction}>
          <SubmitButton variant="quiet" size="sm">
            <IconLogOut size={13} />
            Se déconnecter
          </SubmitButton>
        </form>
      </header>

      <div className="mt-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Profils de recherche</h1>
        <p className="mt-2 max-w-lg text-sm text-fg-muted">
          Chaque profil est un arbre indépendant, avec ses fiches, ses tâches et sa racine Sosa.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {profiles.map((profile) => (
          <Link
            key={profile.id}
            href={`/p/${profile.slug}`}
            className="group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-xs transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-card"
          >
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold tracking-tight">{profile.name}</h2>
                {profile.description && <p className="mt-0.5 line-clamp-2 text-ui text-fg-muted">{profile.description}</p>}
              </div>
              <CompletionRing score={profile.percent} total={100} size={46} stroke={4}>
                <span className="num text-[0.625rem] font-semibold">{profile.percent}%</span>
              </CompletionRing>
            </div>

            {profile.personCount > 0 && (
              <div className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                {profile.counts.map(({ status, count }) => (
                  <span
                    key={status}
                    className={`${STATUS_DOT[status]} h-full`}
                    style={{ width: `${(count / profile.personCount) * 100}%` }}
                    title={`${status} : ${count}`}
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-4 text-xs text-fg-muted">
              <span className="flex items-center gap-1.5">
                <IconUsers size={13} className="text-fg-subtle" />
                <span className="num">{profile.personCount}</span> fiches ·{" "}
                <span className="num">{profile.complete}</span> complètes
              </span>
              {profile.openTasks > 0 && (
                <span className="flex items-center gap-1.5">
                  <IconListChecks size={13} className="text-fg-subtle" />
                  <span className="num">{profile.openTasks}</span> tâche{profile.openTasks > 1 ? "s" : ""}
                </span>
              )}
              <IconArrowRight size={14} className="ml-auto text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
            </div>
          </Link>
        ))}

        {/* Créer un profil reste possible, sans peser autant que les profils existants. */}
        <details
          open={profiles.length === 0}
          className="group rounded-xl border border-dashed border-border open:p-5 [&:not([open])]:flex"
        >
          <summary className="flex flex-1 cursor-pointer list-none items-center justify-center gap-2 rounded-xl p-5 text-ui text-fg-muted transition-colors hover:bg-surface-2/60 hover:text-fg group-open:p-0 group-open:font-semibold group-open:text-fg group-open:hover:bg-transparent [&::-webkit-details-marker]:hidden">
            <IconPlus size={14} className="text-fg-subtle" />
            Nouveau profil
          </summary>
          <form action={createProfileAction} className="mt-3 flex flex-col gap-3">
            <input className="field" name="name" placeholder="Famille Tual" required aria-label="Nom du profil" />
            <input className="field" name="description" placeholder="Description (facultatif)" aria-label="Description" />
            <SubmitButton className="self-start">Créer le profil</SubmitButton>
          </form>
        </details>
      </div>

      {profiles.length === 0 && (
        <p className="mt-6 text-ui text-fg-muted">
          Vous pouvez aussi importer une base Notion avec{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">npm run import</code>.
        </p>
      )}

      <p className="mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-16 text-center text-2xs text-fg-subtle">
        Astuce : <Kbd>Ctrl K</Kbd> pour chercher une personne depuis n’importe quelle page.
      </p>
    </main>
  );
}
