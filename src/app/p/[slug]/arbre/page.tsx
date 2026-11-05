import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FamilyTree, type TreePerson } from "@/components/FamilyTree";
import { TREE_PANEL_COOKIE } from "@/lib/tree";
import { IconPlus, IconTree } from "@/components/icons";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arbre",
};

const GENERATIONS = [2, 3, 4, 5, 6];

export default async function TreePage({ params, searchParams }: PageProps<"/p/[slug]/arbre">) {
  const { slug } = await params;
  const query = await searchParams;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  if (persons.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader title="Arbre" />
        <EmptyState
          icon={<IconTree size={18} />}
          title="L’arbre est vide"
          action={
            <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary")}>
              <IconPlus size={15} />
              Créer une première fiche
            </Link>
          }
        >
          L’arbre se dessine à partir des fiches et de leurs liens de filiation.
        </EmptyState>
      </div>
    );
  }

  const known = new Set(persons.map((p) => p.id));
  const asked = Number(Array.isArray(query.de) ? query.de[0] : query.de);
  const fallback =
    (profile.root_person_id && known.has(profile.root_person_id) ? profile.root_person_id : null) ??
    [...persons].sort((a, b) => (a.sosa ?? 9e9) - (b.sosa ?? 9e9))[0].id;
  const focus = known.has(asked) ? asked : fallback;
  const askedGen = Number(Array.isArray(query.gen) ? query.gen[0] : query.gen);
  const gen = GENERATIONS.includes(askedGen) ? askedGen : 4;

  const people: TreePerson[] = persons.map((p) => ({
    id: p.id,
    given: p.given_names,
    surname: p.surname,
    sex: p.sex,
    birthYear: p.birth_year,
    birthYearEstimated: Boolean(p.birth_year_estimated),
    deathYear: p.death_year,
    isLiving: Boolean(p.is_living),
    sosa: p.sosa,
    status: p.status,
    score: p.completion.score,
    total: p.completion.total,
    parents: p.parents.map((r) => r.id),
    children: p.children.map((r) => r.id),
    spouses: p.unions.map((u) => u.spouse?.id).filter((id): id is number => typeof id === "number"),
  }));

  const panelOpen = (await cookies()).get(TREE_PANEL_COOKIE)?.value !== "closed";

  return (
    <FamilyTree
      slug={slug}
      people={people}
      initialFocus={focus}
      initialUp={gen}
      initialPanelOpen={panelOpen}
      rootId={profile.root_person_id && known.has(profile.root_person_id) ? profile.root_person_id : null}
    />
  );
}
