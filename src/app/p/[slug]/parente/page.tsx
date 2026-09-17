import { notFound } from "next/navigation";

import { KinshipCalculator } from "@/components/KinshipCalculator";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function KinshipPage({
  params,
  searchParams,
}: PageProps<"/p/[slug]/parente">) {
  const { slug } = await params;
  const search = await searchParams;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);

  const initialPersonAId = search.de ? Number(Array.isArray(search.de) ? search.de[0] : search.de) : profile.root_person_id;
  const initialPersonBId = search.avec ? Number(Array.isArray(search.avec) ? search.avec[0] : search.avec) : null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Calculateur de parenté</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Trouvez le plus proche ancêtre commun (MRCA), le degré civil et canonique entre deux personnes de l’arbre.
        </p>
      </header>

      <KinshipCalculator
        slug={slug}
        persons={persons}
        initialPersonAId={initialPersonAId}
        initialPersonBId={initialPersonBId}
      />
    </div>
  );
}
