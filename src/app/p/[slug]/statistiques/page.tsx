import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BarList, GenerationBars } from "@/components/charts";
import { IconAlert, IconArrowRight, IconCircleCheck } from "@/components/icons";
import { Badge, Card, CompletionBar, PageHeader, Stat, STATUS_DOT } from "@/components/ui";
import { detectAllAnomalies } from "@/lib/anomalies";
import { getProfileBySlug, listPersons } from "@/lib/queries";
import { computeComponents, computeStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Statistiques",
};

export default async function StatsPage({ params }: PageProps<"/p/[slug]/statistiques">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = await listPersons(profile.id);
  const stats = computeStats(persons);
  const components = computeComponents(persons);
  const anomalies = detectAllAnomalies(persons);
  const base = `/p/${slug}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Statistiques" description="L’état du profil, vu de haut." />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Stat label="Personnes" value={stats.total} hint={`${stats.ancestors} ancêtres identifiés`} href={`${base}/personnes`} />
        <Stat
          label="Cases remplies"
          value={`${stats.filledPercent} %`}
          hint={<CompletionBar percent={stats.filledPercent} showValue={false} />}
        />
        <Stat
          label="Fiches complètes"
          value={stats.complete}
          tone="ok"
          hint={`${stats.total - stats.complete} à compléter`}
          href={`${base}/personnes?statut=Complet`}
        />
        <Stat
          label="Plus ancienne naissance"
          value={stats.oldestYear ?? "–"}
          hint={stats.blocked.length ? `${stats.blocked.length} fiches bloquées` : "Aucun blocage"}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          title={stats.generations ? "Ascendance par génération" : "Naissances par siècle"}
          description={stats.generations ? "Ancêtres identifiés sur le nombre théorique, génération par génération." : undefined}
        >
          {stats.generations ? (
            <GenerationBars rows={stats.generations} />
          ) : (
            <>
              <BarList
                items={stats.byCentury.map((c) => ({
                  label: `${c.century}s`,
                  value: c.count,
                  title: `${c.count} personne(s) née(s) au ${c.century}e siècle`,
                }))}
              />
              <p className="mt-4 border-t border-border pt-3 text-xs text-fg-muted">
                Choisissez une racine dans les{" "}
                <Link href={`${base}/reglages#racine`} className="text-fg underline underline-offset-4">
                  réglages
                </Link>{" "}
                pour la numérotation Sosa et le suivi par génération.
              </p>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Répartition par statut">
            <BarList
              max={stats.total}
              items={stats.byStatus.map((s) => ({
                label: (
                  <Link
                    href={`${base}/personnes?statut=${encodeURIComponent(s.status === "Complet (lacunes)" ? "Complet" : s.status)}`}
                    className="flex items-center gap-2 hover:text-fg"
                  >
                    <span className={`size-2 rounded-full ${STATUS_DOT[s.status]}`} />
                    {s.status}
                  </Link>
                ),
                value: s.count,
                tone: STATUS_DOT[s.status] ?? "bg-neutral",
                title: `${s.count} personne(s) : ${s.status}`,
              }))}
            />
          </Card>

          <Card title="Actes manquants" description={`Sur ${stats.total} fiches, hors dispenses.`}>
            <BarList
              max={stats.total}
              items={stats.missingActs.map((a) => ({
                label: a.label,
                value: a.missing,
                display: (
                  <>
                    {a.missing}
                    <span className="text-fg-subtle"> · {Math.round((a.missing / Math.max(1, stats.total)) * 100)}%</span>
                  </>
                ),
                tone: "bg-warn-dot/70",
                title: `${a.missing} fiche(s) sans ${a.label.toLowerCase()}`,
              }))}
            />
          </Card>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Communes les plus fréquentes" description="Naissances, mariages et décès confondus.">
          {stats.topPlaces.length ? (
            <BarList
              items={stats.topPlaces.map((p) => ({
                label: p.place,
                value: p.count,
                title: `${p.count} événement(s) à ${p.place}`,
              }))}
            />
          ) : (
            <p className="text-ui text-fg-muted">Aucun lieu renseigné.</p>
          )}
          <Link href={`${base}/carte`} className="mt-4 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
            Voir sur la carte
            <IconArrowRight size={12} />
          </Link>
        </Card>

        {components.length > 1 ? (
          <Card
            title={`Morceaux d’arbre : ${components.length}`}
            description="Des ensembles de fiches que rien ne relie encore entre eux, avec la personne la plus récente de chacun."
          >
            <ul className="-my-1 divide-y divide-border">
              {components.map((group, i) => {
                const youngest = group.members[0];
                return (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="num w-10 shrink-0 text-right text-sm font-semibold" title="Fiches dans ce morceau">
                      {group.size}
                    </span>
                    <Link href={`${base}/arbre?de=${youngest.id}`} className="min-w-0 truncate text-ui hover:underline">
                      {youngest.displayName}
                    </Link>
                    <span className="num ml-auto shrink-0 text-xs text-fg-subtle">
                      {youngest.birth_year ? `${youngest.sex === "F" ? "née" : youngest.sex === "M" ? "né" : "né(e)"} en ${youngest.birth_year}` : "année inconnue"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 border-t border-border pt-3 text-xs text-fg-muted">
              Deux fiches sont dans le même morceau si une filiation ou un mariage les relie. Pour raccorder deux
              morceaux, il manque souvent la génération qui les relie.
            </p>
          </Card>
        ) : (
          <Card title="Morceaux d’arbre">
            <p className="flex items-center gap-2 text-ui text-ok">
              <IconCircleCheck size={15} />
              Toutes les fiches sont reliées en un seul arbre.
            </p>
          </Card>
        )}
      </div>

      <section id="coherence" className="scroll-mt-6">
        <Card
          title="Cohérence des dates"
          description="Décès avant naissance, âges au mariage improbables, écarts de génération suspects…"
          action={
            anomalies.length > 0 ? (
              <Badge tone="danger">
                <IconAlert size={11} />
                {anomalies.length}
              </Badge>
            ) : (
              <Badge tone="ok">Aucune anomalie</Badge>
            )
          }
        >
          {anomalies.length === 0 ? (
            <p className="flex items-center gap-2 text-ui text-ok">
              <IconCircleCheck size={15} />
              Toutes les dates sont chronologiquement cohérentes.
            </p>
          ) : (
            <ul className="-my-1 divide-y divide-border">
              {anomalies.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Badge tone={a.severity === "error" ? "danger" : "warn"}>{a.title}</Badge>
                  <Link href={`${base}/personnes/${a.personId}`} className="text-ui font-medium hover:underline">
                    {a.personName}
                  </Link>
                  <span className="text-xs text-fg-muted">{a.description}</span>
                  {a.relatedPersonId && (
                    <Link
                      href={`${base}/personnes/${a.relatedPersonId}`}
                      className="ml-auto flex items-center gap-1 text-xs text-fg-subtle hover:text-fg"
                    >
                      {a.relatedPersonName}
                      <IconArrowRight size={12} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
