"use client";

import Link from "next/link";

import { IconCheck } from "@/components/icons";
import { Avatar, COMPLETION_FILL, StatusDot } from "@/components/ui";
import { lifeSpan, missingHint, monogram, shortPlace } from "@/lib/names";
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
  isLiving?: boolean;
  isUnmarried?: boolean;
};

export { lifeSpan, monogram };

/**
 * Les cases remplies de la fiche, en bandeau segmenté. C'est la jauge de la
 * fiche : on voit d'un coup combien il reste à trouver, et le survol dit quoi.
 */
export function SlotStrip({
  score,
  total,
  missing,
  ignored = [],
  className = "",
  size = "sm",
}: {
  score: number;
  total: number;
  missing: string[];
  ignored?: string[];
  className?: string;
  size?: "sm" | "md";
}) {
  const tone = COMPLETION_FILL;
  const title =
    missing.length === 0
      ? ignored.length > 0
        ? `Fiche complète avec lacunes (${ignored.join(", ")})`
        : "Fiche complète"
      : `Il manque : ${missing.join(", ")}${ignored.length > 0 ? ` (dispensé : ${ignored.join(", ")})` : ""}`;

  return (
    <span
      className={`flex ${size === "md" ? "gap-1" : "gap-[2px]"} ${className}`}
      title={title}
      role="img"
      aria-label={`${score} cases remplies sur ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`${size === "md" ? "h-1.5" : "h-1"} flex-1 rounded-full transition-colors ${i < score ? tone : "bg-surface-3"}`}
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
  const place = shortPlace(person.place);
  const hint = missingHint(person.missing);

  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      onClick={(e) => {
        if (selectable && onToggleSelect) {
          e.preventDefault();
          onToggleSelect(person.id);
        }
      }}
      aria-pressed={selectable ? selected : undefined}
      className={`group relative flex h-full flex-col rounded-xl border p-3.5 transition-[border-color,box-shadow,background-color] duration-150 ${
        selected
          ? "border-accent/60 bg-accent-soft ring-2 ring-ring"
          : "border-border bg-surface shadow-xs hover:border-border-strong hover:shadow-card"
      } ${className}`}
    >
      {onToggleSelect && (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect(person.id);
          }}
          className={`absolute right-2.5 top-2.5 z-10 flex size-[1.125rem] items-center justify-center rounded-[5px] border transition-all ${
            selected
              ? "border-accent bg-accent text-accent-fg"
              : selectable
                ? "border-border-strong bg-surface text-transparent"
                : "border-border-strong bg-surface text-transparent opacity-0 group-hover:opacity-100"
          }`}
        >
          <IconCheck size={12} strokeWidth={3} />
        </span>
      )}

      <div className="flex items-start gap-3">
        <Avatar seed={person.id} given={person.given} surname={person.surname} size="md" />
        <div className="min-w-0 flex-1 pr-5">
          <p
            className={`line-clamp-2 text-sm font-medium leading-snug tracking-[-0.005em] text-fg`}
          >
            {person.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-fg-subtle">
            <span className="num">{lifeSpan(person)}</span>
            {place && <> · {place}</>}
          </p>
        </div>
        {person.sosa != null && !onToggleSelect && (
          <span className="num absolute right-3 top-3.5 text-2xs font-medium text-fg-subtle" title={`Sosa ${person.sosa}`}>
            #{person.sosa}
          </span>
        )}
      </div>

      <div className="mt-auto pt-3">
        {hint ? (
          <p className="mb-2 truncate text-xs text-fg-muted" title={`Il manque : ${person.missing.join(", ")}`}>
            <span className="text-fg-subtle">Manque </span>
            {hint}
          </p>
        ) : (
          <p className="mb-2 text-xs text-fg-subtle">Fiche complète</p>
        )}
        <div className="flex items-center gap-2 border-t border-border pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <StatusDot status={person.status} className="size-1.5" />
            <span className="truncate">{person.status}</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <SlotStrip
              score={person.score}
              total={person.total}
              missing={person.missing}
              ignored={person.ignored}
              className="w-20"
            />
            <span className="num w-9 text-right text-2xs text-fg-subtle">
              {person.score}/{person.total}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
