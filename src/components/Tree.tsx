import { EmptyChip, PersonChip, type CardPerson } from "@/components/PersonCard";
import { publicationOf } from "@/lib/publication";
import type { Person } from "@/lib/types";

export type TreeNode = {
  person: CardPerson | null;
  /** L'enfant d'où l'on vient : c'est sur sa carte qu'on rattache le parent. */
  childId: number | null;
  role: "Racine" | "Père" | "Mère" | "Parent";
};

export type Tree = { node: TreeNode; parents: Tree[] };

export function toCard(person: Person): CardPerson {
  return {
    id: person.id,
    name: person.displayName,
    given: person.given_names,
    surname: person.surname,
    sosa: person.sosa,
    status: person.status,
    kinship: person.kinship,
    occupation: person.occupation,
    birthYear: person.birth_year,
    birthYearEstimated: !!person.birth_year_estimated,
    deathYear: person.death_year,
    place: person.birth_place ?? person.death_place,
    score: person.completion.score,
    total: person.completion.total,
    percent: person.completion.percent,
    missing: person.completion.missing,
    publication: publicationOf(person),
  };
}

/**
 * Ascendance complète jusqu'à la profondeur demandée : les ancêtres absents
 * sont conservés comme cases vides, pour que l'arbre garde sa géométrie et
 * qu'on voie exactement où il manque quelqu'un.
 */
export function buildTree(
  byId: Map<number, Person>,
  personId: number | null,
  childId: number | null,
  role: TreeNode["role"],
  depth: number,
): Tree {
  const person = personId ? (byId.get(personId) ?? null) : null;
  const node: TreeNode = { person: person ? toCard(person) : null, childId, role };

  if (depth <= 0) return { node, parents: [] };

  const refs = person?.parents ?? [];
  const father = refs.find((r) => r.sex === "M") ?? refs.find((r) => r.sex !== "F") ?? null;
  const mother = refs.find((r) => r.sex === "F") ?? refs.find((r) => r.id !== father?.id) ?? null;

  return {
    node,
    parents: [
      buildTree(byId, father?.id ?? null, person?.id ?? null, "Père", depth - 1),
      buildTree(byId, mother?.id ?? null, person?.id ?? null, "Mère", depth - 1),
    ],
  };
}

export function Branch({
  slug,
  tree,
  depth,
  rootId,
  generations,
  sosaRootId,
}: {
  slug: string;
  tree: Tree;
  depth: number;
  rootId: number;
  generations: number;
  /** Le de cujus du profil : c'est lui qui porte la marque « G1 ». */
  sosaRootId?: number | null;
}) {
  const { node, parents } = tree;
  const treeHref = (id: number) => `/p/${slug}/arbre?de=${id}&gen=${generations}`;

  return (
    <div className="flex items-center">
      {node.person ? (
        <PersonChip
          person={node.person}
          href={treeHref(node.person.id)}
          cardHref={`/p/${slug}/personnes/${node.person.id}`}
          highlight={node.person.id === rootId}
          badge={node.person.id === sosaRootId ? "G1" : undefined}
        />
      ) : node.childId ? (
        <EmptyChip href={`/p/${slug}/personnes/${node.childId}`} label={node.role.toLowerCase()} />
      ) : (
        <span className="block w-40 rounded-xl border border-dashed border-border px-2.5 py-2 text-[13px] text-fg-subtle">
          inconnu
        </span>
      )}

      {depth > 0 && (
        <div className="relative ml-6 flex flex-col gap-3">
          {/* trait du nœud vers la fourche, puis fourche verticale */}
          <span className="absolute -left-6 top-1/2 w-6 border-t border-border" aria-hidden />
          <span className="absolute bottom-1/4 left-0 top-1/4 border-l border-border" aria-hidden />

          {parents.map((parent, i) => (
            <div key={i} className="relative pl-6">
              <span className="absolute left-0 top-1/2 w-6 border-t border-border" aria-hidden />
              <Branch
                slug={slug}
                tree={parent}
                depth={depth - 1}
                rootId={rootId}
                generations={generations}
                sosaRootId={sosaRootId}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Les enfants, à gauche de la racine : on descend l'arbre en cliquant sur l'un
 * d'eux, exactement comme on le remonte en cliquant sur un ancêtre.
 */
export function Descendants({
  slug,
  people,
  generations,
  sosaRootId,
}: {
  slug: string;
  people: CardPerson[];
  generations: number;
  sosaRootId?: number | null;
}) {
  if (people.length === 0) return null;

  return (
    <div className="relative mr-6 flex flex-col gap-3">
      <span className="absolute -right-6 top-1/2 w-6 border-t border-border" aria-hidden />
      {people.length > 1 && (
        <span className="absolute bottom-8 right-0 top-8 border-r border-border" aria-hidden />
      )}
      {people.map((child) => (
        <div key={child.id} className="relative pr-6">
          <span className="absolute right-0 top-1/2 w-6 border-t border-border" aria-hidden />
          <PersonChip
            person={child}
            href={`/p/${slug}/arbre?de=${child.id}&gen=${generations}`}
            cardHref={`/p/${slug}/personnes/${child.id}`}
            badge={child.id === sosaRootId ? "G1" : undefined}
          />
        </div>
      ))}
    </div>
  );
}
