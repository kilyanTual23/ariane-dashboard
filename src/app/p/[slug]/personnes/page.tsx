import { notFound } from "next/navigation";

import { PersonGrid, type GridPerson } from "@/components/PersonGrid";
import { PersonKanban } from "@/components/PersonKanban";
import { publicationOf } from "@/lib/publication";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PersonsPage({
  params,
  searchParams,
}: PageProps<"/p/[slug]/personnes">) {
  const { slug } = await params;
  const { statut, publication, vue } = await searchParams;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  const people: GridPerson[] = listPersons(profile.id).map((p) => ({
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
    publication: publicationOf(p),
    spouse: p.unions[0]?.spouse?.displayName ?? null,
    marriageYear: p.unions[0]?.year ?? null,
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
          initialStatus={typeof statut === "string" ? statut : undefined}
          initialPublication={typeof publication === "string" ? publication : undefined}
        />
      )}
    </div>
  );
}
