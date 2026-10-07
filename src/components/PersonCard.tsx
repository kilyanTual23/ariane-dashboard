import Link from "next/link";

import { completionTone, STATUS_DOT } from "@/components/ui";
import type { Publication } from "@/lib/publication";
import type { Kinship, Status } from "@/lib/types";

export type CardPerson = {
  id: number;
  name: string;
  given: string;
  surname: string;
  sosa: number | null;
  status: Status;
  kinship: Kinship | null;
  occupation: string | null;
  birthYear: number | null;
  birthYearEstimated: boolean;
  deathYear: number | null;
  place: string | null;
  score: number;
  total: number;
  percent: number;
  missing: string[];
  publication: Publication;
  isLiving?: boolean;
  isUnmarried?: boolean;
};

export function monogram(given?: string | null, surname?: string | null) {
  const a = (given ?? "").trim()[0] ?? "";
  const b = (surname ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function lifeSpan(
  p: Pick<CardPerson, "birthYear" | "birthYearEstimated" | "deathYear"> & {
    isLiving?: boolean;
  },
) {
  const birth = p.birthYear ? `${p.birthYearEstimated ? "~" : ""}${p.birthYear}` : "?";
  if (p.isLiving) return `${birth} (vivant)`;
  const death = p.deathYear ? String(p.deathYear) : p.birthYear ? "?" : "?";
  return `${birth} – ${death}`;
}

/**
 * Les cases remplies de la fiche, en bandeau. C'est la jauge de la carte :
 * on voit d'un coup combien il reste à trouver, et le survol dit quoi.
 */
export function SlotStrip({
  score,
  total,
  missing,
  className = "",
}: {
  score: number;
  total: number;
  missing: string[];
  className?: string;
}) {
  const tone = completionTone(score, total);
  return (
    <span
      className={`flex gap-[3px] ${className}`}
      title={missing.length === 0 ? "Carte complète" : `Il manque : ${missing.join(", ")}`}
      aria-label={`${score} cases remplies sur ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] flex-1 rounded-full ${i < score ? tone : "bg-surface-3"}`}
        />
      ))}
    </span>
  );
}

export function PersonCard({
  slug,
  person,
  className = "",
}: {
  slug: string;
  person: CardPerson;
  className?: string;
}) {
  const archived = person.publication === "archivée";
  const toPublish = person.publication === "à mettre sur Geneanet";

  /* Trois allures distinctes : en cours (neutre), à reporter (liseré ambre,
     il reste un geste à faire), archivée (posée à plat, affaire classée). */
  const skin = archived
    ? "border-border bg-surface-2 shadow-none"
    : toPublish
      ? "border-warn/45 bg-surface shadow-soft"
      : "border-border bg-surface shadow-soft";

  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      className={`group flex h-full flex-col rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card ${skin} ${className}`}
    >
      <SlotStrip score={person.score} total={person.total} missing={person.missing} />

      <div className="mt-3.5 mb-3.5 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium tracking-wide text-fg-muted">
          {monogram(person.given, person.surname)}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`line-clamp-2 block text-[15px] font-medium leading-snug tracking-[-0.01em] ${
              archived ? "text-fg-muted" : ""
            }`}
          >
            {person.name}
          </span>
          <span className="num mt-0.5 block text-xs text-fg-subtle">
            {lifeSpan(person)}
            {person.place && (
              <span className="font-sans tracking-normal"> · {person.place.split(",")[0]}</span>
            )}
          </span>
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-2.5 text-xs">
        {archived ? (
          <span className="flex items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5 text-fg-subtle">
            <span className="text-ok">✓</span>
            classée
          </span>
        ) : toPublish ? (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">
            à reporter sur Geneanet
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <span className={`size-1.5 rounded-full ${STATUS_DOT[person.status] ?? "bg-neutral"}`} />
            {person.status}
          </span>
        )}
        <span className="num ml-auto text-fg-subtle">
          {person.score}/{person.total}
        </span>
      </div>
    </Link>
  );
}

/**
 * Version courte pour l'arbre. Le clic principal recentre l'arbre sur la
 * personne — c'est ce qui permet de naviguer de proche en proche ; la flèche
 * en coin ouvre sa carte.
 */
export function PersonChip({
  person,
  href,
  cardHref,
  highlight = false,
  badge,
}: {
  person: CardPerson;
  href: string;
  cardHref: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative w-40 rounded-xl border bg-surface shadow-soft transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card ${
        highlight ? "border-fg/40" : "border-border hover:border-border-strong"
      }`}
    >
      <Link href={href} className="block px-2.5 py-2" title={`Recentrer l’arbre sur ${person.name}`}>
        {badge && (
          <span className="num mb-1 inline-block rounded bg-fg px-1.5 py-px text-[10px] leading-4 text-accent-fg">
            {badge}
          </span>
        )}
        <span className="flex items-center gap-1.5 pr-4">
          <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[person.status] ?? "bg-neutral"}`} />
          <span className="truncate text-[13px] font-medium leading-tight" title={person.name}>
            {person.name}
          </span>
        </span>
        <span className="num mt-1 flex items-baseline justify-between text-[11px] text-fg-subtle">
          {lifeSpan(person)}
          <span>
            {person.score}/{person.total}
          </span>
        </span>
        <SlotStrip
          score={person.score}
          total={person.total}
          missing={person.missing}
          className="mt-1.5"
        />
      </Link>

      <Link
        href={cardHref}
        title="Ouvrir la carte"
        className="absolute right-1 top-1 rounded-md px-1 text-[11px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        ↗
      </Link>
    </div>
  );
}

/** Case vide de l'arbre : un ancêtre qui reste à trouver. */
export function EmptyChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block w-40 rounded-xl border border-dashed border-border px-2.5 py-2 text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:text-fg"
    >
      + {label}
      <span className="mt-1 block text-[11px] text-fg-subtle/70">case à remplir</span>
    </Link>
  );
}
