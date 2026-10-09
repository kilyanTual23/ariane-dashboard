import type { Metadata } from "next";
import Link from "next/link";

import { createProfileAction } from "./actions";
import { logoutAction } from "./login/actions";
import { listPersons, listProfiles } from "@/lib/queries";
import { buttonClass, completionTone, STATUS_DOT } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/types";

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
          // La complétion d'un profil, c'est la part des cases remplies de ses cartes.
          percent: slots ? Math.round((filled / slots) * 100) : 0,
          counts,
        };
      }),
    )
  )
    // Les profils les plus avancés en premier : ce sont ceux qu'on peut boucler.
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, "fr"));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 text-[13px] font-medium tracking-tight">
            <span className="size-1.5 rounded-full bg-fg" />
            Ariane
          </span>
          <h1 className="mt-6 text-[40px] leading-[1.08] tracking-[-0.035em] sm:text-[52px]">
            Profils de recherche
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">
            Chaque profil est un arbre indépendant, classé ici du plus avancé au plus jeune.
          </p>
        </div>
        <form action={logoutAction} className="pt-1">
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-fg/20 hover:text-fg"
            title="Verrouiller la session"
          >
            Déconnexion
          </button>
        </form>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((profile) => (
          <Link
            key={profile.id}
            href={`/p/${profile.slug}`}
            className="group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-medium tracking-tight">{profile.name}</h2>
              <span className="num text-[22px] leading-none tracking-tight">
                {profile.percent} %
              </span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${completionTone(profile.percent, 100)}`}
                style={{ width: `${profile.percent}%` }}
              />
            </div>

            <p className="num mt-2.5 text-xs text-fg-subtle">
              {profile.complete}/{profile.personCount}
              <span className="font-sans"> cartes complètes</span>
              {profile.openTasks > 0 && (
                <span className="font-sans">
                  {" "}
                  · {profile.openTasks} recherche{profile.openTasks > 1 ? "s" : ""} en attente
                </span>
              )}
            </p>

            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-4 text-[11px] text-fg-muted">
              {profile.counts.map(({ status, count }) => (
                <span key={status} className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${STATUS_DOT[status as Status]}`} />
                  {status}
                  <span className="num text-fg-subtle">{count}</span>
                </span>
              ))}
            </div>
          </Link>
        ))}

        {profiles.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-fg-muted sm:col-span-2">
            Aucun profil pour l’instant. Crée le premier ci-dessous, ou importe une base Notion avec
            <code className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
              npm run import
            </code>
            .
          </p>
        )}
      </div>

      <form action={createProfileAction} className="mt-12 border-t border-border pt-8">
        <h2 className="text-[13px] font-medium">Nouveau profil</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input className="field" name="name" placeholder="Famille Tual" required />
          <input className="field" name="description" placeholder="Description (facultatif)" />
          <button type="submit" className={buttonClass("primary")}>
            Créer
          </button>
        </div>
      </form>
    </main>
  );
}
