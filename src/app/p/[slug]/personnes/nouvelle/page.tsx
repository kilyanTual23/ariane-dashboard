import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createPersonAction } from "@/app/actions";
import { IconArrowLeft } from "@/components/icons";
import { PlaceField } from "@/components/PlaceField";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { getProfileBySlug, listPlaces } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouvelle fiche",
};

const SEXES = [
  { value: "", label: "Selon le prénom" },
  { value: "F", label: "Femme" },
  { value: "M", label: "Homme" },
];

export default async function NewPersonPage({ params }: PageProps<"/p/[slug]/personnes/nouvelle">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const places = await listPlaces(profile.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link
        href={`/p/${slug}/personnes`}
        className="flex w-fit items-center gap-1.5 text-ui text-fg-muted transition-colors hover:text-fg"
      >
        <IconArrowLeft size={14} />
        Personnes
      </Link>

      <PageHeader
        title="Nouvelle fiche"
        description="L’identité suffit pour commencer. Le reste (mariage, décès, actes, famille) se complète ensuite sur la fiche."
      />

      <form action={createPersonAction} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-xs">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="profileId" value={profile.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Prénoms</span>
            <input className="field" name="given_names" placeholder="Jean-Marie" autoFocus autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">Nom de famille</span>
            <input className="field uppercase" name="surname" placeholder="DUPONT" autoComplete="off" />
          </label>
        </div>

        <fieldset>
          <legend className="label">Sexe</legend>
          <div className="flex flex-wrap gap-2">
            {SEXES.map((s) => (
              <label
                key={s.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-ui transition-colors hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input type="radio" name="sex" value={s.value} defaultChecked={s.value === ""} className="accent-[var(--accent)]" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="block">
            <span className="label">Naissance</span>
            <input className="field" name="birth_date" placeholder="3/3/1850, vers 1850…" autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">Lieu de naissance</span>
            <PlaceField name="birth_place" places={places} placeholder="Commune" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-ui">
          <input type="checkbox" name="is_living" value="1" className="size-4 accent-[var(--accent)]" />
          Personne vivante
          <span className="text-xs text-fg-subtle">· aucune information de décès ne sera demandée</span>
        </label>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-fg-subtle">Un prénom ou un nom suffit.</p>
          <SubmitButton>Créer la fiche</SubmitButton>
        </div>
      </form>
    </div>
  );
}
