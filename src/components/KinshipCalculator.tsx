"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PersonSelect, type PickerPerson } from "@/components/PersonSelect";
import { Card } from "@/components/ui";
import { computeKinship, type KinshipResult } from "@/lib/kinship";
import type { Person } from "@/lib/types";

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
      })),
    [persons],
  );

  const result: KinshipResult | null = useMemo(() => {
    if (!personAId || !personBId) return null;
    return computeKinship(personAId, personBId, persons);
  }, [personAId, personBId, persons]);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Sélectionnez deux personnes">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] items-center">
          <div>
            <label className="label mb-1.5 block">Première personne (Sujet A)</label>
            <PersonSelect
              name="personA"
              people={pickable}
              value={personAId}
              onChange={(val) => setPersonAId(val)}
              placeholder="Choisir une personne…"
            />
          </div>

          <div className="flex justify-center pt-5">
            <button
              type="button"
              onClick={() => {
                const temp = personAId;
                setPersonAId(personBId);
                setPersonBId(temp);
              }}
              title="Intervertir les deux personnes"
              className="rounded-full border border-border bg-surface p-2 text-xs text-fg-muted shadow-soft transition-colors hover:bg-surface-2 hover:text-fg"
            >
              ⇄
            </button>
          </div>

          <div>
            <label className="label mb-1.5 block">Deuxième personne (Sujet B)</label>
            <PersonSelect
              name="personB"
              people={pickable}
              value={personBId}
              onChange={(val) => setPersonBId(val)}
              placeholder="Choisir une personne…"
            />
          </div>
        </div>
      </Card>

      {result && (
        <div className="flex flex-col gap-6">
          <Card
            title={result.relationName}
            action={
              result.civilDegree ? (
                <span className="num text-xs text-fg-subtle">
                  {result.civilDegree}e degré civil {result.canonicalDegree ? `· ${result.canonicalDegree} canonique` : ""}
                </span>
              ) : undefined
            }
          >
            <p className="text-base text-fg leading-relaxed">{result.details}</p>

            {result.commonAncestors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <span className="text-xs text-fg-subtle block mb-2">
                  Plus proche(s) ancêtre(s) commun(s) (MRCA) :
                </span>
                <div className="flex flex-wrap gap-2">
                  {result.commonAncestors.map((c) => (
                    <Link
                      key={c.id}
                      href={`/p/${slug}/personnes/${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3 transition-colors"
                    >
                      <span>🌳</span>
                      <span>{c.displayName}</span>
                      {c.birth_year && <span className="num text-fg-subtle">({c.birth_year})</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {result.pathA.length > 1 && result.pathB.length > 1 && (
            <Card title="Chemin généalogique">
              <p className="text-xs text-fg-muted mb-4">
                Remontée générationnelle depuis les deux personnes jusqu’à leur ancêtre commun :
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Branche A */}
                <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
                  <span className="text-xs font-medium text-fg block mb-3">
                    Branche de {result.personA.displayName} :
                  </span>
                  <ol className="relative border-l border-border ml-3 flex flex-col gap-3">
                    {result.pathA.map((step, idx) => (
                      <li key={step.id} className="ml-4 text-xs">
                        <span className="absolute -left-1.5 mt-1 size-3 rounded-full border-2 border-surface bg-fg" />
                        <Link
                          href={`/p/${slug}/personnes/${step.id}`}
                          className={`font-medium hover:underline ${
                            idx === 0
                              ? "text-fg font-semibold"
                              : idx === result.pathA.length - 1
                                ? "text-ok font-semibold"
                                : "text-fg-muted"
                          }`}
                        >
                          {step.displayName}
                        </Link>
                        {idx === 0 && <span className="text-fg-subtle ml-1.5">(départ)</span>}
                        {idx === result.pathA.length - 1 && (
                          <span className="text-ok ml-1.5">(ancêtre commun)</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Branche B */}
                <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
                  <span className="text-xs font-medium text-fg block mb-3">
                    Branche de {result.personB.displayName} :
                  </span>
                  <ol className="relative border-l border-border ml-3 flex flex-col gap-3">
                    {result.pathB.map((step, idx) => (
                      <li key={step.id} className="ml-4 text-xs">
                        <span className="absolute -left-1.5 mt-1 size-3 rounded-full border-2 border-surface bg-fg" />
                        <Link
                          href={`/p/${slug}/personnes/${step.id}`}
                          className={`font-medium hover:underline ${
                            idx === 0
                              ? "text-fg font-semibold"
                              : idx === result.pathB.length - 1
                                ? "text-ok font-semibold"
                                : "text-fg-muted"
                          }`}
                        >
                          {step.displayName}
                        </Link>
                        {idx === 0 && <span className="text-fg-subtle ml-1.5">(départ)</span>}
                        {idx === result.pathB.length - 1 && (
                          <span className="text-ok ml-1.5">(ancêtre commun)</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
