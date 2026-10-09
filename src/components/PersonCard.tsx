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
  ignored?: string[];
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
  return `${birth} - ${death}`;
}

/**
 * Les cases remplies de la fiche, en bandeau. C'est la jauge de la carte :
 * on voit d'un coup combien il reste à trouver, et le survol dit quoi.
 */
export function SlotStrip({
  score,
  total,
  missing,
  ignored = [],
  className = "",
}: {
  score: number;
  total: number;
  missing: string[];
  ignored?: string[];
  className?: string;
}) {
  const tone = completionTone(score, total);
  const title =
    missing.length === 0
      ? ignored.length > 0
        ? `Carte complète avec lacunes (${ignored.join(", ")})`
        : "Carte complète"
      : `Il manque : ${missing.join(", ")}${ignored.length > 0 ? ` (dispensé : ${ignored.join(", ")})` : ""}`;

  return (
    <span
      className={`flex gap-[3px] ${className}`}
      title={title}
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
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  slug: string;
  person: CardPerson;
  className?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const archived = person.publication === "archivée";
  const toPublish = person.publication === "à mettre sur Geneanet";

  /* Trois allures distinctes : en cours (neutre), à reporter (liseré ambre,
     il reste un geste à faire), archivée (posée à plat, affaire classée). */
  const skin = selected
    ? "border-accent bg-accent/[0.04] ring-2 ring-accent/30 shadow-card"
    : archived
      ? "border-border bg-surface-2 shadow-none"
      : toPublish
        ? "border-warn/45 bg-surface shadow-soft"
        : "border-border bg-surface shadow-soft";

  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      onClick={(e) => {
        if (selectable && onToggleSelect) {
          e.preventDefault();
          onToggleSelect(person.id);
        }
      }}
      className={`group relative flex h-full flex-col rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card ${skin} ${className}`}
    >
      {onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect(person.id);
          }}
          className={`absolute top-2.5 right-2.5 z-10 flex size-5.5 items-center justify-center rounded-md border transition-all ${
            selected
              ? "border-accent bg-accent text-white shadow-xs scale-100 opacity-100"
              : selectable
                ? "border-border bg-surface/90 text-transparent opacity-90 hover:border-fg/60 hover:opacity-100"
                : "border-border bg-surface text-transparent opacity-0 group-hover:opacity-90 hover:!opacity-100"
          }`}
          title={selected ? "Désélectionner" : "Sélectionner cette carte"}
        >
          <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      <SlotStrip
        score={person.score}
        total={person.total}
        missing={person.missing}
        ignored={person.ignored}
        className={onToggleSelect ? "pr-6" : ""}
      />

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
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex items-center gap-1 truncate text-xs font-medium text-ok">
              <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[person.status] ?? "bg-ok"}`} />
              {person.status}
            </span>
            <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn">
              Geneanet ↗
            </span>
          </div>
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
