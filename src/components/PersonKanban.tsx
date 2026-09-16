"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { movePersonAction } from "@/app/actions";
import { PersonCard } from "@/components/PersonCard";
import type { GridPerson } from "@/components/PersonGrid";
import { buttonClass, STATUS_DOT } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/types";

/**
 * Le cycle de vie d'une carte, de gauche à droite. « Classées » est la fin du
 * parcours : reportée sur Geneanet, on n'y revient plus.
 */
const COLUMNS = [...STATUSES, "Classées"] as const;
type Column = (typeof COLUMNS)[number];

const HINT: Record<Column, string> = {
  "Pas commencé": "personne ne s’en est encore occupé",
  "En recherche": "en cours, ou des pistes ouvertes",
  Bloqué: "plus rien à tirer pour l’instant",
  Complet: "terminée — à reporter sur Geneanet",
  Classées: "reportées sur Geneanet",
};

function columnOf(person: GridPerson): Column {
  return person.publication === "archivée" ? "Classées" : person.status;
}

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function PersonKanban({ slug, people }: { slug: string; people: GridPerson[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  // Le temps que le serveur réponde, la carte s'affiche déjà dans sa colonne.
  const [moved, setMoved] = useState<Record<number, Column>>({});

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return people;
    return people.filter((p) =>
      norm([p.name, p.place, p.occupation, p.spouse].filter(Boolean).join(" ")).includes(q),
    );
  }, [people, query]);

  const byColumn = useMemo(() => {
    const map = new Map<Column, GridPerson[]>(COLUMNS.map((c) => [c, []]));
    for (const person of filtered) {
      map.get(moved[person.id] ?? columnOf(person))!.push(person);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"));
    }
    return map;
  }, [filtered, moved]);

  const drop = (column: Column) => {
    const personId = dragging;
    setOver(null);
    setDragging(null);
    if (!personId) return;

    const person = people.find((p) => p.id === personId);
    if (!person || (moved[personId] ?? columnOf(person)) === column) return;

    setMoved((m) => ({ ...m, [personId]: column }));
    startTransition(async () => {
      await movePersonAction({ slug, personId, column });
      router.refresh();
      setMoved((m) => {
        const next = { ...m };
        delete next[personId];
        return next;
      });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field max-w-72 flex-1"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="num text-xs text-fg-subtle">
          {filtered.length} / {people.length}
        </span>
        <span className="text-xs text-fg-subtle">
          glisse une carte d’une colonne à l’autre pour changer son état
        </span>
        <Link href={`/p/${slug}/personnes`} className={buttonClass("ghost", "ml-auto")}>
          Vue grille
        </Link>
        <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary")}>
          Nouvelle carte
        </Link>
      </div>

      <div
        className={`-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-3 ${pending ? "opacity-90" : ""}`}
      >
        {COLUMNS.map((column) => {
          const list = byColumn.get(column)!;
          const isOver = over === column;
          return (
            <section
              key={column}
              data-column={column}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(column);
              }}
              onDragLeave={() => setOver((c) => (c === column ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                drop(column);
              }}
              className={`flex max-h-[calc(100vh-15rem)] min-w-52 flex-1 basis-52 flex-col rounded-2xl border transition-colors ${
                isOver ? "border-fg/30 bg-surface-2" : "border-border bg-surface-2/50"
              }`}
            >
              <header className="flex items-baseline gap-2 px-3.5 pb-2 pt-3">
                {column === "Classées" ? (
                  <span className="text-ok">✓</span>
                ) : (
                  <span className={`size-2 rounded-full ${STATUS_DOT[column as Status]}`} />
                )}
                <h2 className="text-[13px] font-medium">{column}</h2>
                <span className="num ml-auto text-xs text-fg-subtle">{list.length}</span>
              </header>
              <p className="px-3.5 pb-2 text-[11px] text-fg-subtle">{HINT[column]}</p>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {list.map((person) => (
                  <div
                    key={person.id}
                    draggable
                    onDragStart={() => setDragging(person.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={`cursor-grab active:cursor-grabbing ${
                      dragging === person.id ? "opacity-40" : ""
                    }`}
                  >
                    <PersonCard slug={slug} person={person} />
                  </div>
                ))}

                {list.length === 0 && (
                  <p className="px-1.5 py-6 text-center text-xs text-fg-subtle">
                    {isOver ? "déposer ici" : "aucune carte"}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
