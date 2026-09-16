import { notFound } from "next/navigation";

import { TopBar } from "@/components/TopBar";
import { getProfileBySlug, listProfiles, listTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  const profiles = listProfiles();
  const openTasks = listTasks(profile.id).filter(
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
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </>
  );
}
