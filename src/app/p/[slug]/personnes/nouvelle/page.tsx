import Link from "next/link";
import { notFound } from "next/navigation";

import { quickCreatePersonAction } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import { getProfileBySlug } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewPersonPage({ params }: PageProps<"/p/[slug]/personnes/nouvelle">) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pt-6">
      <Link href={`/p/${slug}/personnes`} className="text-sm text-fg-muted hover:text-fg">
        ← Toutes les personnes
      </Link>

      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Nouvelle personne</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Le nom suffit pour démarrer : dates, lieux, actes et parents se remplissent ensuite
          directement sur la fiche.
        </p>
      </header>

      <form action={quickCreatePersonAction} className="flex flex-col gap-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="profileId" value={profile.id} />
        <label className="block">
          <span className="label">Prénoms puis NOM</span>
          <input
            className="field py-2.5 text-base"
            name="fullName"
            placeholder="Jean Marie TUAL"
            autoFocus
            required
          />
          <span className="mt-1 block text-[11px] text-fg-subtle">
            Le nom de famille est reconnu aux majuscules.
          </span>
        </label>
        <div>
          <button type="submit" className={buttonClass("primary")}>
            Créer et ouvrir la fiche
          </button>
        </div>
      </form>
    </div>
  );
}
