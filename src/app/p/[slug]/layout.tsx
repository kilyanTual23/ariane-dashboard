import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import type { GlobalSearchItem } from "@/components/CommandPalette";
import { getNotebook, getProfileBySlug, listPersons, listProfiles, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [profiles, allTasks, persons, cookieStore, notebook] = await Promise.all([
    listProfiles(),
    listTasks(profile.id),
    listPersons(profile.id),
    cookies(),
    getNotebook(profile.id),
  ]);
  const openTasks = allTasks.filter((t) => t.status === "À faire" || t.status === "En cours").length;

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
    <AppShell
      slug={slug}
      profileId={profile.id}
      profileName={profile.name}
      profiles={profiles.map((p) => ({ slug: p.slug, name: p.name }))}
      searchItems={searchItems}
      personCount={persons.length}
      openTasks={openTasks}
      initialCollapsed={cookieStore.get("ariane-sidebar")?.value === "collapsed"}
      notebook={notebook}
    >
      {children}
    </AppShell>
  );
}
