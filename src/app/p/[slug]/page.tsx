import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonCard, type CardPerson } from "@/components/PersonCard";
import { QuickSearch, type SearchPerson } from "@/components/QuickSearch";
import { completionTone, STATUS_DOT } from "@/components/ui";
import { publicationOf } from "@/lib/publication";
import { getProfileBySlug, listPersons, listTasks } from "@/lib/queries";
import { computeLeads, computeStats } from "@/lib/stats";
import { STATUSES, type Person } from "@/lib/types";

export const dynamic = "force-dynamic";

function toCard(p: Person): CardPerson {
  return {
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
    score: p.completion.score,
    total: p.completion.total,
    percent: p.completion.percent,
    missing: p.completion.missing,
    publication: publicationOf(p),
    isLiving: Boolean(p.is_living),
    isUnmarried: Boolean(p.is_unmarried),
  };
}

function Tile({
  href,
  label,
  value,
  hint,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</span>
        {icon && (
          <span className="text-base transition-transform group-hover:scale-110">
            {icon}
          </span>
        )}
      </div>
      <span className="num mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</span>
      <span className="mt-2.5 text-xs text-fg-muted">{hint}</span>
    </Link>
  );
}

export default async function ProfileHomePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) notFound();

  const persons = listPersons(profile.id);
  const stats = computeStats(persons);
  const leads = computeLeads(persons, 4);
  const openTasks = listTasks(profile.id).filter(
    (t) => t.status === "À faire" || t.status === "En cours",
  );
  const last = stats.recent[0];
  const sosaCount = persons.filter((p) => p.sosa).length;
  const sosaRoot = persons.find((p) => p.id === profile.root_person_id) ?? null;

  // Ce qui se termine en une poignée de clics passe devant.
  const almost = persons
    .filter((p) => p.completion.score < p.completion.total)
    .sort(
      (a, b) =>
        a.completion.missing.length - b.completion.missing.length ||
        a.displayName.localeCompare(b.displayName, "fr"),
    )
    .slice(0, 6);
  const smallestGap = almost.length ? almost[0].completion.missing.length : 0;

  const searchable: SearchPerson[] = persons.map((p) => ({
    id: p.id,
    name: p.displayName,
    birthYear: p.birth_year,
    deathYear: p.death_year,
    place: p.birth_place ?? p.death_place,
    percent: p.completion.percent,
  }));

  const counts = STATUSES.map((status) => ({
    status,
    count: persons.filter((p) => p.status === status).length,
  }));
  const toPublish = persons.filter((p) => publicationOf(p) === "à mettre sur Geneanet");
  const archived = persons.filter((p) => publicationOf(p) === "archivée").length;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] tracking-[-0.03em]">{profile.name}</h1>
            <p className="mt-2 text-[13px] text-fg-subtle">
              <span className="num">{stats.complete}</span> cartes complètes sur{" "}
              <span className="num">{stats.total}</span>
            </p>
          </div>
          {last && (
            <Link
              href={`/p/${slug}/personnes/${last.id}`}
              className="text-[13px] text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
            >
              Reprendre {last.displayName} →
            </Link>
          )}
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${completionTone(
              stats.complete,
              Math.max(1, stats.total),
            )}`}
            style={{ width: `${Math.round((stats.complete / Math.max(1, stats.total)) * 100)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] shadow-soft">
          <span className="num rounded bg-fg px-1.5 py-px text-[10px] leading-4 text-accent-fg">
            G1
          </span>
          {sosaRoot ? (
            <>
              <span className="text-fg-subtle">racine de la numérotation Sosa :</span>
              <Link
                href={`/p/${slug}/personnes/${sosaRoot.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {sosaRoot.displayName}
              </Link>
              <Link
                href={`/p/${slug}/arbre?de=${sosaRoot.id}`}
                className="text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
              >
                voir son arbre →
              </Link>
            </>
          ) : (
            <span className="text-fg-muted">
              aucune racine définie — les générations et les numéros Sosa restent vides
            </span>
          )}
          <Link
            href={`/p/${slug}/reglages`}
            className="ml-auto text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            {sosaRoot ? "changer" : "en définir une"}
          </Link>
        </div>

        {toPublish.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
            <span className="size-2 shrink-0 rounded-full bg-warn" />
            <span>
              <span className="num">{toPublish.length}</span> carte
              {toPublish.length > 1 ? "s" : ""} terminée{toPublish.length > 1 ? "s" : ""} à reporter
              sur Geneanet
            </span>
            <Link
              href={`/p/${slug}/personnes?publication=${encodeURIComponent("à mettre sur Geneanet")}`}
              className="ml-auto text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
            >
              les voir →
            </Link>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {counts.map(({ status, count }) => (
            <Link
              key={status}
              href={`/p/${slug}/personnes?statut=${encodeURIComponent(status)}`}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong"
            >
              <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
              {status}
              <span className="num text-fg-subtle">{count}</span>
            </Link>
          ))}
          {archived > 0 && (
            <Link
              href={`/p/${slug}/personnes?publication=${encodeURIComponent("archivée")}`}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-muted shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong"
            >
              <span className="text-ok">✓</span>
              Archivées
              <span className="num text-fg-subtle">{archived}</span>
            </Link>
          )}
        </div>
      </header>

      <div>
        <QuickSearch slug={slug} profileId={profile.id} people={searchable} />
        <p className="mt-2.5 text-xs text-fg-subtle">
          Entrée ouvre le premier résultat ·{" "}
          <Link
            href={`/p/${slug}/personnes/nouvelle`}
            className="underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            ajouter une personne
          </Link>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href={`/p/${slug}/personnes`}
          label="Cartes"
          value={String(stats.total)}
          hint={`${stats.total - stats.complete} à compléter`}
          icon="👥"
        />
        <Tile
          href={`/p/${slug}/arbre`}
          label="Arbre"
          value={String(sosaCount)}
          hint="ancêtres numérotés · naviguer de proche en proche"
          icon="🌳"
        />
        <Tile
          href={`/p/${slug}/taches`}
          label="Ma liste"
          value={String(openTasks.length)}
          hint={openTasks.length ? "recherches en attente" : "rien en attente"}
          icon="📋"
        />
        <Tile
          href={`/p/${slug}/statistiques`}
          label="Chiffres"
          value={`${stats.avgCompletion} %`}
          hint="générations, actes manquants, communes"
          icon="📊"
        />
      </div>

      {almost.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="eyebrow">
              Presque terminées — {smallestGap === 1 ? "il ne manque qu’une case" : "les plus proches d’être bouclées"}
            </h2>
            <Link
              href={`/p/${slug}/personnes`}
              className="text-[13px] text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
            >
              toutes les cartes →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {almost.map((person) => (
              <PersonCard key={person.id} slug={slug} person={toCard(person)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="eyebrow">À chercher ensuite</h2>
          <Link
            href={`/p/${slug}/taches`}
            className="text-[13px] text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            {openTasks.length > 0 ? `ma liste (${openTasks.length})` : "ma liste"} →
          </Link>
        </div>
        <ul className="flex flex-col">
          {leads.map((lead) => (
            <li key={lead.person.id} className="border-t border-border">
              <Link
                href={`/p/${slug}/personnes/${lead.person.id}`}
                className="-mx-3 block rounded-xl px-3 py-3 transition-colors hover:bg-surface"
              >
                <span className="text-sm font-medium">{lead.person.displayName}</span>
                <span className="mt-0.5 block text-xs text-fg-subtle">
                  {lead.missing.slice(0, 2).join(", ").toLowerCase()} — {lead.why}
                </span>
              </Link>
            </li>
          ))}
          {leads.length === 0 && (
            <li className="text-sm text-fg-muted">Toutes les cartes sont complètes.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
