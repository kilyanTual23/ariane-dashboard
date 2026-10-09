import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { quickCreatePersonAction } from "@/app/actions";
import { QuickAddParser } from "@/components/QuickAddParser";
import { buttonClass } from "@/components/ui";
import { getProfileBySlug, listPlaces } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouvelle personne",
};

export default async function NewPersonPage({ params }: PageProps<"/p/[slug]/personnes/nouvelle">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const places = await listPlaces(profile.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-4">
      <Link
        href={`/p/${slug}/personnes`}
        className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
      >
        <span aria-hidden>←</span> Toutes les personnes
      </Link>

      <header>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Ajout rapide</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Collez ou tapez une phrase en français : Ariane extrait automatiquement la personne, ses dates, communes, son métier, ainsi que son conjoint et ses parents.
        </p>
      </header>

      {/* Saisie intelligente */}
      <QuickAddParser slug={slug} profileId={profile.id} places={places} />

      {/* Mode classique repliable */}
      <div className="mt-6 border-t border-border pt-6">
        <details className="group">
          <summary className="cursor-pointer text-xs text-fg-subtle transition-colors hover:text-fg">
            <span>Ou création classique avec nom seul ▼</span>
          </summary>
          <form action={quickCreatePersonAction} className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="profileId" value={profile.id} />
            <label className="block">
              <span className="label">Prénoms puis NOM</span>
              <input
                className="field py-2 text-sm"
                name="fullName"
                placeholder="Jean Marie TUAL"
                required
              />
              <span className="mt-1 block text-[11px] text-fg-subtle">
                Le nom de famille est reconnu aux majuscules.
              </span>
            </label>
            <div>
              <button type="submit" className={buttonClass("ghost", "text-xs")}>
                Créer la fiche vide
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}
