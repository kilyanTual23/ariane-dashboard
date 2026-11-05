import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KinshipCalculator } from "@/components/KinshipCalculator";
import { PageHeader } from "@/components/ui";
import { getProfileBySlug, listPersons } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Parenté",
};

function idParam(v: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function KinshipPage({ params, searchParams }: PageProps<"/p/[slug]/parente">) {
  const { slug } = await params;
  const search = await searchParams;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  const known = new Set(persons.map((p) => p.id));
  const a = idParam(search.de) ?? profile.root_person_id;
  const b = idParam(search.avec);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Parenté"
        description="Le plus proche ancêtre commun de deux personnes, le lien qui les unit et son degré."
      />
      <KinshipCalculator
        slug={slug}
        persons={persons}
        initialPersonAId={a && known.has(a) ? a : null}
        initialPersonBId={b && known.has(b) ? b : null}
      />
    </div>
  );
}
