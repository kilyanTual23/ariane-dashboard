import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AncestorsMap } from "@/components/AncestorsMap";
import { PageHeader } from "@/components/ui";
import { getGeocodedPlaces } from "@/lib/geo";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carte",
};

export default async function MapPage({ params }: PageProps<"/p/[slug]/carte">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  const clusters = await getGeocodedPlaces(persons);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Carte"
        description="Où sont nés, se sont mariés et sont morts les membres de la famille, commune par commune."
      />
      <AncestorsMap slug={slug} clusters={clusters} />
    </div>
  );
}
