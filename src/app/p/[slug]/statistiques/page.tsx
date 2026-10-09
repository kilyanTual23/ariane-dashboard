import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BarList, GenerationBars } from "@/components/charts";
import { Card, CompletionBar, Stat, STATUS_DOT } from "@/components/ui";
import { getProfileBySlug, listPersons } from "@/lib/queries";
import { publicationOf } from "@/lib/publication";
import { computeComponents, computeStats } from "@/lib/stats";
import { detectAllAnomalies } from "@/lib/anomalies";

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
  const toPublish = persons.filter((p) => publicationOf(p) === "à mettre sur Geneanet").length;
  const archived = persons.filter((p) => publicationOf(p) === "archivée").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] tracking-[-0.03em]">Chiffres</h1>
        <p className="mt-1 text-sm text-fg-muted">L’état du profil, vu de haut.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Personnes" value={stats.total} hint={`${stats.sosaCount} ancêtres directs`} />
        <Stat
          label="Complétion moyenne"
          value={`${stats.avgCompletion} %`}
          hint={<CompletionBar percent={stats.avgCompletion} showValue={false} />}
        />
        <Stat
          label="Fiches complètes"
          value={stats.complete}
          tone="ok"
          hint={`${stats.total - stats.complete} à compléter`}
        />
        <Stat
          label="Report sur Geneanet"
          value={archived}
          hint={
            toPublish > 0 ? `${toPublish} carte(s) terminée(s) à reporter` : "rien en attente"
          }
        />
        <Stat
          label="Branche la plus ancienne"
          value={stats.oldestYear ?? "-"}
          hint={stats.blocked.length ? `${stats.blocked.length} fiches bloquées` : "aucun blocage"}
        />
      </div>

      <Card
        title={`Audit de cohérence : ${anomalies.length === 0 ? "0 anomalie" : `${anomalies.length} anomalie${anomalies.length > 1 ? "s" : ""}`}`}
        action={
          <span className="text-xs text-fg-subtle">
            {anomalies.length === 0 ? "fiches cohérentes" : "incohérences à vérifier"}
          </span>
        }
      >
        {anomalies.length === 0 ? (
          <div className="flex items-center gap-2.5 py-3 text-xs text-ok">
            <span className="text-base">✓</span>
            <span>
              Toutes les dates, âges au mariage et écarts générationnels sont biologiquement et chronologiquement cohérents.
            </span>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {anomalies.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                      a.severity === "error"
                        ? "bg-danger/10 text-danger border border-danger/20"
                        : "bg-warn/10 text-warn border border-warn/20"
                    }`}
                  >
                    {a.title}
                  </span>
                  <Link
                    href={`/p/${slug}/personnes/${a.personId}`}
                    className="text-sm font-medium text-fg underline-offset-4 hover:underline"
                  >
                    {a.personName}
                  </Link>
                  <span className="text-xs text-fg-muted">· {a.description}</span>
                </div>
                {a.relatedPersonId && (
                  <Link
                    href={`/p/${slug}/personnes/${a.relatedPersonId}`}
                    className="text-xs text-fg-subtle underline hover:text-fg"
                  >
                    voir {a.relatedPersonName} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {components.length > 1 && (
        <Card
          title={`Morceaux d’arbre : ${components.length}`}
          action={
            <span className="text-xs text-fg-subtle">
              rien ne relie encore ces ensembles entre eux
            </span>
          }
        >
          <ul className="flex flex-col divide-y divide-border">
            {components.map((group, i) => {
              const youngest = group.members[0];
              return (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                  <span className="num w-12 shrink-0 text-right text-fg-muted">{group.size}</span>
                  <Link
                    href={`/p/${slug}/arbre?de=${youngest.id}`}
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    {youngest.displayName}
                  </Link>
                  <span className="text-xs text-fg-subtle">
                    le plus récent du groupe
                    {youngest.birth_year ? ` · né vers ${youngest.birth_year}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs text-fg-muted">
            Deux personnes sont dans le même morceau si une filiation ou un mariage les relie, de
            proche en proche. Pour raccorder deux morceaux, il manque en général la génération qui
            les relie : rattache un enfant à la personne la plus récente de chacun.
          </p>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={stats.generations ? "Ascendance par génération" : "Naissances par siècle"}>
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
                Choisis une racine dans les{" "}
                <Link href={`/p/${slug}/reglages`} className="text-fg underline underline-offset-4">
                  réglages
                </Link>{" "}
                pour obtenir la numérotation Sosa et le suivi par génération.
              </p>
            </>
          )}
        </Card>

        <Card title="Répartition par statut">
          <BarList
            items={stats.byStatus.map((s) => ({
              label: s.status,
              value: s.count,
              tone: STATUS_DOT[s.status] ?? "bg-neutral",
              title: `${s.count} personne(s) : ${s.status}`,
            }))}
          />
        </Card>

        <Card title="Actes manquants">
          <BarList
            max={stats.total}
            items={stats.missingActs.map((a) => ({
              label: a.label,
              value: a.missing,
              display: `${a.missing}`,
              title: `${a.missing} personne(s) sans ${a.label.toLowerCase()} sur ${stats.total}`,
            }))}
          />
          <p className="mt-3 text-xs text-fg-subtle">Sur {stats.total} personnes recensées.</p>
        </Card>

        <Card title="Communes les plus fréquentes">
          {stats.topPlaces.length ? (
            <BarList
              items={stats.topPlaces.map((p) => ({
                label: p.place,
                value: p.count,
                title: `${p.count} événement(s) à ${p.place}`,
              }))}
            />
          ) : (
            <p className="text-sm text-fg-muted">Aucun lieu renseigné.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
