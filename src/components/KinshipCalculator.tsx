"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { IconArrowUpDown, IconMerge } from "@/components/icons";
import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { Badge, buttonClass, EmptyState, StatusDot } from "@/components/ui";
import { computeKinship, type KinshipResult } from "@/lib/kinship";
import type { Person, PersonRef } from "@/lib/types";

function PathNode({
  slug,
  person,
  emphasis = "none",
}: {
  slug: string;
  person: PersonRef;
  emphasis?: "none" | "subject" | "ancestor";
}) {
  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      className={`relative z-10 flex w-full max-w-64 items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong ${
        emphasis === "ancestor"
          ? "border-ok-dot/50 ring-2 ring-ok-soft"
          : emphasis === "subject"
            ? "border-fg/40"
            : "border-border"
      }`}
    >
      <StatusDot status={person.status} className="size-1.5" />
      <span className="min-w-0 flex-1 truncate text-ui font-medium">{person.displayName}</span>
      {person.birth_year && <span className="num shrink-0 text-2xs text-fg-subtle">{person.birth_year}</span>}
    </Link>
  );
}

/** Une branche, de l'ancêtre commun (exclu) jusqu'à la personne. */
function Branch({ slug, path, label }: { slug: string; path: PersonRef[]; label: string }) {
  const down = [...path].reverse().slice(1);
  if (down.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center pt-4">
        <span className="text-2xs text-fg-subtle">{label} est l’ancêtre commun</span>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center gap-0">
      {down.map((step, i) => (
        <div key={step.id} className="flex w-full flex-col items-center">
          <span className="h-4 w-px bg-border-strong" aria-hidden />
          <PathNode slug={slug} person={step} emphasis={i === down.length - 1 ? "subject" : "none"} />
        </div>
      ))}
      <span className="mt-2 text-2xs text-fg-subtle">
        {label} · <span className="num">{down.length}</span> génération{down.length > 1 ? "s" : ""}
      </span>
    </div>
  );
}

export function KinshipCalculator({
  slug,
  persons,
  initialPersonAId,
  initialPersonBId,
}: {
  slug: string;
  persons: Person[];
  initialPersonAId?: number | null;
  initialPersonBId?: number | null;
}) {
  const [personAId, setPersonAId] = useState<number | null>(initialPersonAId ?? null);
  const [personBId, setPersonBId] = useState<number | null>(initialPersonBId ?? null);

  const pickable: PickerPerson[] = useMemo(
    () =>
      persons.map((p) => ({
        id: p.id,
        name: p.displayName,
        birthYear: p.birth_year,
        deathYear: p.death_year,
        sosa: p.sosa,
      })),
    [persons],
  );

  const result: KinshipResult | null = useMemo(() => {
    if (!personAId || !personBId) return null;
    return computeKinship(personAId, personBId, persons);
  }, [personAId, personBId, persons]);

  // L'URL garde la paire choisie : on peut la partager ou y revenir.
  useEffect(() => {
    const params = new URLSearchParams();
    if (personAId) params.set("de", String(personAId));
    if (personBId) params.set("avec", String(personBId));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [personAId, personBId]);

  const ancestor = result?.commonAncestors[0] ?? null;
  const hasPaths = Boolean(result && ancestor && result.pathA.length > 0 && result.pathB.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="label">Première personne</span>
          <PersonSelect
            name="personA"
            people={pickable}
            value={personAId}
            onChange={(id) => setPersonAId(id)}
            placeholder="Rechercher…"
            allowCreate={false}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setPersonAId(personBId);
            setPersonBId(personAId);
          }}
          title="Intervertir"
          aria-label="Intervertir les deux personnes"
          className={buttonClass("secondary", "justify-self-center sm:rotate-90", "icon")}
        >
          <IconArrowUpDown size={15} />
        </button>
        <label className="block">
          <span className="label">Seconde personne</span>
          <PersonSelect
            name="personB"
            people={pickable}
            value={personBId}
            onChange={(id) => setPersonBId(id)}
            placeholder="Rechercher…"
            allowCreate={false}
          />
        </label>
      </div>

      {!result ? (
        <EmptyState icon={<IconMerge size={18} />} title="Choisissez deux personnes">
          Le calculateur cherche leur plus proche ancêtre commun et en déduit le lien de parenté, avec les degrés
          civil et canonique.
        </EmptyState>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            {result.type !== "none" && result.type !== "same" && (
              <p className="text-ui text-fg-muted">
                <strong className="font-medium text-fg">{result.personB.displayName}</strong> est, pour{" "}
                <strong className="font-medium text-fg">{result.personA.displayName}</strong> :
              </p>
            )}
            <h2 className="mt-1 text-2xl font-semibold tracking-tight first-letter:uppercase">{result.relationName}</h2>
            {(result.civilDegree || result.canonicalDegree) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.civilDegree ? <Badge>{result.civilDegree}e degré civil</Badge> : null}
                {result.canonicalDegree ? <Badge>{result.canonicalDegree} (canonique)</Badge> : null}
              </div>
            )}
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-muted">{result.details}</p>
          </section>

          {hasPaths && ancestor && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-xs">
              <h2 className="text-sm font-semibold">Chemin de parenté</h2>
              <p className="mt-0.5 text-ui text-fg-muted">
                De l’ancêtre commun{result.commonAncestors.length > 1 ? " (et de son conjoint)" : ""} jusqu’aux deux
                personnes.
              </p>
              <div className="mt-6 flex flex-col items-center">
                <div className="flex flex-wrap justify-center gap-2">
                  {result.commonAncestors.map((c) => (
                    <PathNode key={c.id} slug={slug} person={c} emphasis="ancestor" />
                  ))}
                </div>
                <span className="text-2xs font-medium text-ok">Ancêtre{result.commonAncestors.length > 1 ? "s" : ""} commun{result.commonAncestors.length > 1 ? "s" : ""}</span>
                <div className="relative mt-1 grid w-full max-w-2xl grid-cols-2 gap-6">
                  <span className="absolute left-1/4 right-1/4 top-0 h-px bg-border-strong" aria-hidden />
                  <Branch slug={slug} path={result.pathA} label={result.personA.displayName} />
                  <Branch slug={slug} path={result.pathB} label={result.personB.displayName} />
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
