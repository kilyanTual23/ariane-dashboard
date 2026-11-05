import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PersonExplorer, type GridPerson } from "@/components/PersonExplorer";
import { PageHeader } from "@/components/ui";
import {
  filtersCookie,
  filtersFromParams,
  hasFilterParams,
  parseStored,
  parseView,
  sanitize,
} from "@/lib/person-filters";
import { getProfileBySlug, listPersons } from "@/lib/queries";
import { commune, generationOf } from "@/lib/stats";

/** Sosa n ≥ 2 : branche paternelle si le n° tombe dans la première moitié de sa génération. */
function branchOf(sosa: number | null): "paternelle" | "maternelle" | null {
  if (!sosa || sosa < 2) return null;
  const start = 2 ** Math.floor(Math.log2(sosa));
  return sosa < start + start / 2 ? "paternelle" : "maternelle";
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Personnes",
};

export default async function PersonsPage({ params, searchParams }: PageProps<"/p/[slug]/personnes">) {
  const { slug } = await params;
  const sp = await searchParams;

  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  // Les filtres viennent de l'URL ; sans paramètre, on reprend là où on s'était arrêté.
  const stored = parseStored((await cookies()).get(filtersCookie(slug))?.value);
  const initialFilters = hasFilterParams(sp) ? filtersFromParams(sp) : sanitize(stored.f);
  const initialView = parseView(sp.vue) ?? (hasFilterParams(sp) ? null : stored.v) ?? "grille";

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
    spouse: p.unions[0]?.spouse?.displayName ?? null,
    marriageYear: p.unions[0]?.year ?? null,
    isLiving: Boolean(p.is_living),
    isUnmarried: Boolean(p.is_unmarried),
    communes: [
      ...new Set(
        [p.birth_place, p.death_place, ...p.unions.map((u) => u.place)]
          .map((place) => commune(place))
          .filter((c): c is string => Boolean(c)),
      ),
    ],
    generation: generationOf(p.sosa),
    branch: branchOf(p.sosa),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Personnes"
        description="Chaque fiche suit ses cases : naissance, mariage, décès, leurs actes et les parents."
      />
      <PersonExplorer
        slug={slug}
        profileId={profile.id}
        people={people}
        initialFilters={initialFilters}
        initialView={initialView}
      />
    </div>
  );
}
