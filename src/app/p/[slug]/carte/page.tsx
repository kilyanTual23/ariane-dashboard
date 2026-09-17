import { notFound } from "next/navigation";

import { AncestorsMap } from "@/components/AncestorsMap";
import { getGeocodedPlaces } from "@/lib/geo";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: PageProps<"/p/[slug]/carte">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  const clusters = await getGeocodedPlaces(persons);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Cartographie des ancêtres</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Répartition géographique des naissances, mariages et sépultures à travers les communes françaises.
        </p>
      </header>

      <AncestorsMap slug={slug} clusters={clusters} />
    </div>
  );
}
