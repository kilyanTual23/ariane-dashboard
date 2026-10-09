import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PersonGrid, type GridPerson } from "@/components/PersonGrid";
import { PersonKanban } from "@/components/PersonKanban";
import { publicationOf } from "@/lib/publication";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  searchParams,
}: PageProps<"/p/[slug]/personnes">): Promise<Metadata> {
  const sp = await searchParams;
  if (sp.vue === "kanban") {
    return { title: "Kanban des fiches" };
  }
  return { title: "Fiches & Personnes" };
}

export default async function PersonsPage({
  params,
  searchParams,
}: PageProps<"/p/[slug]/personnes">) {
  const { slug } = await params;
  const sp = await searchParams;
  const statut = typeof sp.statut === "string" ? sp.statut : undefined;
  const publication = typeof sp.publication === "string" ? sp.publication : undefined;
  const vue = typeof sp.vue === "string" ? sp.vue : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const sosa = sp.sosa === "1" || sp.sosa === "true";
  const lien = typeof sp.lien === "string" ? sp.lien : undefined;
  const manquant = typeof sp.manquant === "string" ? sp.manquant : undefined;
  const tri = typeof sp.tri === "string" ? sp.tri : undefined;
  const ordre = typeof sp.ordre === "string" ? sp.ordre : undefined;

  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const rawPersons = await listPersons(profile.id);
  const people: GridPerson[] = rawPersons.map((p) => ({
    id: p.id,
    name: p.displayName,
    given: p.given_names,
    surname: p.surname,
    sosa: p.sosa,
    status: p.status,
    kinship: p.kinship,
    occupation: p.occupation,
    birthYear: p.birth_year,
    birthYearEstimated: !!p.birth_year_estimated,
    deathYear: p.death_year,
    place: p.birth_place ?? p.death_place,
    deathPlace: p.death_place,
    score: p.completion.score,
    total: p.completion.total,
    percent: p.completion.percent,
    missing: p.completion.missing,
    ignored: p.completion.ignored,
    publication: publicationOf(p),
    spouse: p.unions[0]?.spouse?.displayName ?? null,
    marriageYear: p.unions[0]?.year ?? null,
    isLiving: Boolean(p.is_living),
    isUnmarried: Boolean(p.is_unmarried),
  }));

  const complete = people.filter((p) => p.score === p.total).length;
  const kanban = vue === "kanban";

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Cartes</h1>
        <p className="mt-1.5 text-[13px] text-fg-subtle">
          {people.length} personnes · {complete} cartes complètes.{" "}
          {kanban
            ? "Chaque colonne est une étape : la dernière range les cartes reportées sur Geneanet."
            : "Le bandeau en haut de chaque carte montre les cases déjà remplies."}
        </p>
      </header>

      {kanban ? (
        <PersonKanban slug={slug} people={people} />
      ) : (
        <PersonGrid
          slug={slug}
          people={people}
          initialQuery={q}
          initialStatus={statut}
          initialSosaOnly={sosa}
          initialKinship={lien}
          initialMissing={manquant}
          initialPublication={publication}
          initialSort={tri as any}
          initialDesc={ordre === "desc"}
        />
      )}
    </div>
  );
}
