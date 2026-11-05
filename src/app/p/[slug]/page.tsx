import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IconAlert, IconArrowRight, IconChart, IconClock, IconPlus, IconTarget, IconTree } from "@/components/icons";
import { SlotStrip } from "@/components/PersonCard";
import { ReminderBoard } from "@/components/PersonReminders";
import { Avatar, Badge, buttonClass, Card, PageHeader, Stat, STATUS_DOT, StatusDot } from "@/components/ui";
import { detectAllAnomalies } from "@/lib/anomalies";
import { lifeSpan, missingHint } from "@/lib/names";
import { getProfileBySlug, listPersons, listTasks } from "@/lib/queries";
import { computeStats, generationOf } from "@/lib/stats";
import { STATUSES, type Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  return { title: profile?.name ?? "Profil introuvable" };
}

function lifeOf(p: Person) {
  return lifeSpan({
    birthYear: p.birth_year,
    birthYearEstimated: !!p.birth_year_estimated,
    deathYear: p.death_year,
    isLiving: !!p.is_living,
  });
}

/** Ligne de fiche compacte : avatar, nom, années, ce qui manque, jauge. */
function PersonRow({ slug, person, aside }: { slug: string; person: Person; aside?: React.ReactNode }) {
  const { score, total, missing, ignored } = person.completion;
  return (
    <li className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60">
      <Avatar seed={person.id} given={person.given_names} surname={person.surname} size="md" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/p/${slug}/personnes/${person.id}`}
          className="block truncate text-ui font-medium text-fg after:absolute after:inset-0"
        >
          {person.displayName}
        </Link>
        <p className="truncate text-xs text-fg-subtle">
          <span className="num">{lifeOf(person)}</span>
          {missing.length > 0 && (
            <>
              {" · "}
              <span className="text-fg-muted">Manque {missingHint(missing)}</span>
            </>
          )}
        </p>
      </div>
      {aside ?? (
        <span className="flex shrink-0 items-center gap-2">
          <SlotStrip score={score} total={total} missing={missing} ignored={ignored} className="hidden w-24 sm:flex" />
          <span className="num w-9 text-right text-2xs text-fg-subtle">
            {score}/{total}
          </span>
        </span>
      )}
    </li>
  );
}

/** « 2026-11-05 09:12:00 » (UTC, SQLite) → horodatage. */
function stampOf(value?: string | null) {
  if (!value) return 0;
  const t = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(t) ? 0 : t;
}

/** Fiches modifiées ces sept derniers jours : la progression, pas seulement l'état. */
function touchedSince(persons: Person[], days: number) {
  const since = Date.now() - days * 24 * 3600 * 1000;
  return persons.filter((p) => stampOf(p.updated_at) >= since);
}

export default async function ProfileHomePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const [persons, allTasks] = await Promise.all([listPersons(profile.id), listTasks(profile.id)]);
  const stats = computeStats(persons);
  const openTasks = allTasks.filter((t) => t.status === "À faire" || t.status === "En cours");
  // Ce qu'il reste à faire sur des fiches précises : en tête de l'accueil.
  const reminders = openTasks.filter((t) => t.person_id);
  const sosaRoot = persons.find((p) => p.id === profile.root_person_id) ?? null;
  const maxGen = stats.generations?.length ?? 0;
  const anomalies = detectAllAnomalies(persons);
  const completePercent = stats.total ? Math.round((stats.complete / stats.total) * 100) : 0;

  const touchedThisWeek = touchedSince(persons, 7);
  const completedThisWeek = touchedThisWeek.filter((p) => p.completion.percent === 100).length;

  // Une personne n'apparaît qu'une fois sur la page : rappels, puis presque finies, puis récentes.
  const shown = new Set(reminders.map((t) => t.person_id));
  const almost = persons
    .filter((p) => p.completion.score < p.completion.total && !shown.has(p.id))
    .sort(
      (a, b) =>
        a.completion.missing.length - b.completion.missing.length ||
        (a.sosa ?? 9e9) - (b.sosa ?? 9e9) ||
        a.displayName.localeCompare(b.displayName, "fr"),
    )
    .slice(0, 6);
  for (const p of almost) shown.add(p.id);
  const recent = stats.recent.filter((p) => !shown.has(p.id)).slice(0, 5);

  const counts = STATUSES.map((status) => ({
    status,
    count: persons.filter((p) => p.status === status).length,
  })).filter((c) => c.count > 0);

  const base = `/p/${slug}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={profile.name}
        description={
          persons.length
            ? profile.description || undefined
            : "Aucune fiche pour l’instant : commencez par vous-même ou par l’ancêtre le plus proche."
        }
        actions={
          <>
            <Link href={`${base}/arbre`} className={buttonClass("secondary")}>
              <IconTree size={14} />
              Arbre
            </Link>
            <Link href={`${base}/personnes/nouvelle`} className={buttonClass("primary")}>
              <IconPlus size={15} />
              Nouvelle fiche
            </Link>
          </>
        }
      />

      {/* --------------------------------------------------------- chiffres */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Stat
          href={`${base}/personnes?statut=Complet`}
          label="Fiches complètes"
          value={
            <>
              {stats.complete}
              <span className="text-base font-normal text-fg-subtle"> / {stats.total}</span>
            </>
          }
          hint={
            <span className="flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${completePercent}%` }} />
              </span>
              <span className="num">{completePercent} %</span>
            </span>
          }
        />
        <Stat
          href={`${base}/statistiques`}
          label="Cases remplies"
          value={`${stats.filledPercent} %`}
          icon={<IconChart size={15} />}
          hint={
            <>
              <span className="num">{stats.filled}</span> sur <span className="num">{stats.slots}</span> au total
            </>
          }
        />
        <Stat
          href={`${base}/arbre`}
          label="Ancêtres identifiés"
          value={stats.ancestors}
          icon={<IconTree size={15} />}
          hint={maxGen ? `Sur ${maxGen} générations` : "Définissez une racine Sosa"}
        />
        <Stat
          href={`${base}/personnes`}
          label="Cette semaine"
          value={touchedThisWeek.length}
          icon={<IconClock size={15} />}
          hint={
            touchedThisWeek.length
              ? `fiche${touchedThisWeek.length > 1 ? "s" : ""} modifiée${touchedThisWeek.length > 1 ? "s" : ""}${
                  completedThisWeek ? ` · ${completedThisWeek} complète${completedThisWeek > 1 ? "s" : ""}` : ""
                }`
              : "Aucune fiche modifiée depuis 7 jours"
          }
        />
      </div>

      {/* ------------------------------------------------------ à traiter */}
      {(anomalies.length > 0 || !sosaRoot) && (
        <div className="flex flex-col gap-2">
          {anomalies.length > 0 && (
            <Banner tone="danger" icon={<IconAlert size={15} />} href={`${base}/statistiques#coherence`} cta="Vérifier">
              <strong className="num font-semibold">{anomalies.length}</strong> incohérence
              {anomalies.length > 1 ? "s" : ""} de dates détectée{anomalies.length > 1 ? "s" : ""}
            </Banner>
          )}
          {!sosaRoot && persons.length > 0 && (
            <Banner tone="info" icon={<IconTarget size={15} />} href={`${base}/reglages#racine`} cta="Choisir">
              Aucune racine Sosa : choisissez le « de cujus » pour numéroter les ancêtres et suivre les générations
            </Banner>
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ------------------------------------------ rappels sur fiches */}
          <ReminderBoard slug={slug} tasks={reminders} />

          {/* --------------------------------------------- presque finies */}
          {almost.length > 0 && (
            <Card
              title="Presque terminées"
              description="Les fiches qu’il reste le moins de cases à remplir pour boucler."
              action={
                <Link href={`${base}/personnes?tri=filled&ordre=desc`} className={buttonClass("quiet", "", "sm")}>
                  Tout voir
                  <IconArrowRight size={13} />
                </Link>
              }
              bodyClassName="!px-0 !pb-2"
            >
              <ul className="divide-y divide-border border-t border-border">
                {almost.map((p) => (
                  <PersonRow key={p.id} slug={slug} person={p} />
                ))}
              </ul>
            </Card>
          )}

          {recent.length > 0 && (
            <Card title="Modifiées récemment" description="Pour reprendre là où vous vous êtes arrêté." bodyClassName="!px-0 !pb-2">
              <ul className="divide-y divide-border border-t border-border">
                {recent.map((p) => (
                  <PersonRow
                    key={p.id}
                    slug={slug}
                    person={p}
                    aside={
                      p.sosa ? (
                        <span className="num shrink-0 text-2xs text-fg-subtle">
                          #{p.sosa}
                          {generationOf(p.sosa) ? ` · G${generationOf(p.sosa)}` : ""}
                        </span>
                      ) : (
                        <span />
                      )
                    }
                  />
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ---------------------------------------------------- colonne */}
        <div className="flex flex-col gap-6">
          <Card title="Répartition">
            {persons.length === 0 ? (
              <p className="text-ui text-fg-muted">Aucune fiche.</p>
            ) : (
              <>
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Répartition des fiches par statut">
                  {counts.map(({ status, count }) => (
                    <span
                      key={status}
                      className={`${STATUS_DOT[status]} h-full border-r-2 border-surface last:border-0`}
                      style={{ width: `${(count / persons.length) * 100}%` }}
                      title={`${status} : ${count}`}
                    />
                  ))}
                </div>
                <ul className="mt-4 flex flex-col gap-0.5">
                  {counts.map(({ status, count }) => (
                    <li key={status}>
                      <Link
                        href={`${base}/personnes?statut=${encodeURIComponent(status === "Complet (lacunes)" ? "Complet" : status)}`}
                        className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1 text-ui text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        <StatusDot status={status} />
                        <span className="flex-1">{status}</span>
                        <span className="num text-fg">{count}</span>
                        <span className="num w-9 text-right text-2xs text-fg-subtle">
                          {Math.round((count / persons.length) * 100)}%
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Racine Sosa">
            {sosaRoot ? (
              <div className="flex flex-col gap-3">
                <Link
                  href={`${base}/personnes/${sosaRoot.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <Avatar seed={sosaRoot.id} given={sosaRoot.given_names} surname={sosaRoot.surname} size="lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-medium">{sosaRoot.displayName}</span>
                    <span className="num block text-xs text-fg-subtle">{lifeOf(sosaRoot)}</span>
                  </span>
                  <Badge tone="ink" className="ml-auto">
                    G1
                  </Badge>
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`${base}/arbre?de=${sosaRoot.id}`} className={buttonClass("secondary", "justify-center", "sm")}>
                    <IconTree size={13} />
                    Son arbre
                  </Link>
                  <Link href={`${base}/reglages#racine`} className={buttonClass("secondary", "justify-center", "sm")}>
                    <IconTarget size={13} />
                    Changer
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-ui text-fg-muted">
                  Le « de cujus » porte le numéro 1 : son père le 2, sa mère le 3… C’est ce qui structure l’arbre et
                  les générations.
                </p>
                <Link href={`${base}/reglages#racine`} className={buttonClass("secondary", "", "sm")}>
                  Choisir la racine
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon,
  href,
  cta,
  children,
}: {
  tone: "warn" | "danger" | "info";
  icon: React.ReactNode;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  const tones = {
    warn: "border-warn-dot/30 bg-warn-soft text-warn",
    danger: "border-danger-dot/25 bg-danger-soft text-danger",
    info: "border-info-dot/25 bg-info-soft text-info",
  };
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border px-4 py-2.5 text-ui transition-[filter] hover:brightness-[0.98] ${tones[tone]}`}
    >
      {icon}
      <span className="min-w-0 flex-1 text-fg">{children}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
        {cta}
        <IconArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
