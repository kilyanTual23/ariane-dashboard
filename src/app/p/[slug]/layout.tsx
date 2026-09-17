import { notFound } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { getProfileBySlug, listProfiles, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [profiles, allTasks] = await Promise.all([
    listProfiles(),
    listTasks(profile.id),
  ]);
  const openTasks = allTasks.filter(
    (t) => t.status === "À faire" || t.status === "En cours",
  );

  return (
    <>
      <TopBar
        profiles={profiles.map((p) => ({ slug: p.slug, name: p.name }))}
        current={profile.slug}
        tabs={[
          { href: `/p/${slug}`, label: "Accueil" },
          { href: `/p/${slug}/personnes`, label: "Cartes" },
          { href: `/p/${slug}/arbre`, label: "Arbre" },
          { href: `/p/${slug}/taches`, label: "Ma liste", badge: openTasks.length },
        ]}
        secondary={[
          { href: `/p/${slug}/statistiques`, label: "Chiffres" },
          { href: `/p/${slug}/reglages`, label: "Réglages" },
        ]}
      />
      <main className="mx-auto w-full max-w-[1750px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </>
  );
}
