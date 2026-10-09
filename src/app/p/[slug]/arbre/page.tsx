import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Branch, buildTree, Descendants, toCard, type Tree } from "@/components/Tree";
import { TreeNav } from "@/components/TreeNav";
import { buttonClass } from "@/components/ui";
import { getProfileBySlug, listPersons } from "@/lib/queries";
import type { Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/p/[slug]/arbre">): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const profile = await getProfileBySlug(slug);
  if (!profile) return { title: "Arbre" };
  const persons = await listPersons(profile.id);
  const asked = Number(Array.isArray(query.de) ? query.de[0] : query.de);
  const target = asked ? persons.find((p) => p.id === asked) : null;
  if (target) {
    return { title: `Arbre : ${target.displayName}` };
  }
  return { title: "Arbre généalogique" };
}

const GENERATIONS = [3, 4, 5, 6];

export default async function TreePage({ params, searchParams }: PageProps<"/p/[slug]/arbre">) {
  const { slug } = await params;
  const query = await searchParams;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  if (persons.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[26px] tracking-[-0.03em]">Arbre</h1>
        <p className="text-sm text-fg-muted">Ce profil n’a encore aucune carte.</p>
      </div>
    );
  }

  const byId = new Map<number, Person>(persons.map((p) => [p.id, p]));

  const asked = Number(Array.isArray(query.de) ? query.de[0] : query.de);
  const fallback =
    (profile.root_person_id && byId.has(profile.root_person_id) ? profile.root_person_id : null) ??
    [...persons].sort((a, b) => (a.sosa ?? 9e9) - (b.sosa ?? 9e9))[0].id;
  const rootId = byId.has(asked) ? asked : fallback;
  const root = byId.get(rootId)!;

  const askedGen = Number(Array.isArray(query.gen) ? query.gen[0] : query.gen);
  const generations = GENERATIONS.includes(askedGen) ? askedGen : 4;

  const sosaRoot =
    profile.root_person_id && byId.has(profile.root_person_id)
      ? byId.get(profile.root_person_id)!
      : null;

  const tree = buildTree(byId, rootId, null, "Racine", generations - 1);

  const children = root.children
    .map((c) => byId.get(c.id))
    .filter((p): p is Person => !!p)
    .map(toCard);

  const spouses = root.unions
    .map((u) => (u.spouse ? byId.get(u.spouse.id) : null))
    .filter((p): p is Person => !!p);

  // Ce que l'ascendance affichée contient déjà, et ce qu'elle pourrait contenir.
  let known = 0;
  const walk = (t: Tree) => {
    if (t.node.person) known++;
    t.parents.forEach(walk);
  };
  walk(tree);
  const possible = 2 ** generations - 1;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Arbre</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] text-fg-subtle">
          Autour de {root.displayName} : enfants à gauche, ascendance à droite sur {generations}{" "}
          générations, <span className="num">{known}</span>/<span className="num">{possible}</span>{" "}
          cases occupées. Un clic sur une carte recentre l’arbre sur cette personne ; la flèche en
          coin ouvre sa fiche. Les cases en pointillés ouvrent la carte de l’enfant, d’où l’on
          rattache le parent manquant.
        </p>
      </header>

      <TreeNav
        slug={slug}
        rootId={rootId}
        rootName={root.displayName}
        generations={generations}
        sosaRoot={sosaRoot ? { id: sosaRoot.id, name: sosaRoot.displayName } : null}
        spouses={spouses.map((s) => ({ id: s.id, name: s.displayName }))}
        people={persons.map((p) => ({ id: p.id, name: p.displayName, year: p.birth_year }))}
      />

      <div className="overflow-auto rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <div className="flex w-fit items-center">
          {children.length > 0 && (
            <>
              <Descendants
                slug={slug}
                people={children}
                generations={generations}
                sosaRootId={sosaRoot?.id}
              />
              <span className="sr-only">enfants de {root.displayName}</span>
            </>
          )}
          <Branch
            slug={slug}
            tree={tree}
            depth={generations - 1}
            rootId={rootId}
            generations={generations}
            sosaRootId={sosaRoot?.id}
          />
        </div>
      </div>

      {children.length === 0 && (
        <p className="text-[13px] text-fg-subtle">
          Aucun enfant rattaché à {root.displayName}.{" "}
          <Link
            href={`/p/${slug}/personnes/${rootId}`}
            className="underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            En rattacher un depuis sa carte
          </Link>
          .
        </p>
      )}
    </div>
  );
}
