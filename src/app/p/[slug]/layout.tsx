import { notFound } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { type GlobalSearchItem } from "@/components/GlobalSearchModal";
import { getProfileBySlug, listPersons, listProfiles, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [profiles, allTasks, persons] = await Promise.all([
    listProfiles(),
    listTasks(profile.id),
    listPersons(profile.id),
  ]);
  const openTasks = allTasks.filter(
    (t) => t.status === "À faire" || t.status === "En cours",
  );

  const searchItems: GlobalSearchItem[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    givenNames: p.given_names,
    surname: p.surname,
    sosa: p.sosa,
    kinship: p.kinship,
    status: p.status,
    occupation: p.occupation,
    birthYear: p.birth_year,
    deathYear: p.death_year,
    birthPlace: p.birth_place,
    deathPlace: p.death_place,
    percent: p.completion.percent,
  }));

  return (
    <>
      <TopBar
        profiles={profiles.map((p) => ({ slug: p.slug, name: p.name }))}
        current={profile.slug}
        profileId={profile.id}
        searchItems={searchItems}
        tabs={[
          { href: `/p/${slug}`, label: "Accueil" },
          { href: `/p/${slug}/personnes`, label: "Cartes" },
          { href: `/p/${slug}/arbre`, label: "Arbre" },
          { href: `/p/${slug}/carte`, label: "Carte" },
          { href: `/p/${slug}/taches`, label: "Ma liste", badge: openTasks.length },
        ]}
        secondary={[
          { href: `/p/${slug}/parente`, label: "Parenté" },
          { href: `/p/${slug}/statistiques`, label: "Chiffres" },
          { href: `/p/${slug}/reglages`, label: "Réglages" },
        ]}
      />
      <main className="mx-auto w-full max-w-[1750px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </>
  );
}
