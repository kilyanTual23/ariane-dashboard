"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { movePersonAction } from "@/app/actions";
import { SlotStrip } from "@/components/PersonCard";
import type { GridPerson } from "@/components/PersonExplorer";
import { errorMessage, useToast } from "@/components/Toast";
import { Avatar, StatusDot } from "@/components/ui";
import { lifeSpan, missingHint, shortPlace } from "@/lib/names";
import { STATUSES, type Status } from "@/lib/types";

/** Le cycle de vie d'une fiche, de gauche à droite. */
const COLUMNS = ["Pas commencé", "En recherche", "Bloqué", "Complet"] as const;
type Column = (typeof COLUMNS)[number];

const HINT: Record<Column, string> = {
  "Pas commencé": "Personne ne s’en est encore occupé",
  "En recherche": "En cours, ou des pistes ouvertes",
  Bloqué: "Plus rien à tirer pour l’instant",
  Complet: "Toutes les cases sont remplies ou dispensées",
};

function columnOf(person: GridPerson): Column {
  if (person.status === "Complet (lacunes)") return "Complet";
  if ((STATUSES as readonly string[]).includes(person.status)) return person.status as Column;
  return "Pas commencé";
}

function BoardCard({ slug, person, dragging }: { slug: string; person: GridPerson; dragging: boolean }) {
  const place = shortPlace(person.place);
  const hint = missingHint(person.missing);

  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      draggable={false}
      className={`block rounded-lg border bg-surface p-3 transition-[border-color,box-shadow,opacity] duration-150 ${
        dragging ? "opacity-40" : ""
      } border-border shadow-xs hover:border-border-strong hover:shadow-card`}
    >
      <div className="flex items-start gap-2.5">
        <Avatar seed={person.id} given={person.given} surname={person.surname} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1.5">
            <p className="truncate text-ui font-medium leading-tight" title={person.name}>
              {person.name}
            </p>
            {person.sosa != null && <span className="num shrink-0 text-2xs text-fg-subtle">#{person.sosa}</span>}
          </div>
          <p className="mt-0.5 truncate text-2xs text-fg-subtle">
            <span className="num">{lifeSpan(person)}</span>
            {place && <> · {place}</>}
          </p>
        </div>
      </div>
      <SlotStrip score={person.score} total={person.total} missing={person.missing} className="mt-2.5" />
      <div className="mt-2 flex items-center justify-between gap-2 text-2xs">
        <span className="truncate text-fg-subtle" title={person.missing.join(", ")}>
          {hint ? `Manque ${hint}` : "Fiche complète"}
        </span>
        <span className="num shrink-0 text-fg-subtle">
          {person.score}/{person.total}
        </span>
      </div>
    </Link>
  );
}

export function PersonBoard({ slug, people }: { slug: string; people: GridPerson[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [moved, setMoved] = useState<Record<number, Column>>({});

  const byColumn = useMemo(() => {
    const map = new Map<Column, GridPerson[]>(COLUMNS.map((c) => [c, []]));
    for (const person of people) {
      map.get(moved[person.id] ?? columnOf(person))!.push(person);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.score / b.total - a.score / a.total || a.name.localeCompare(b.name, "fr"));
    }
    return map;
  }, [people, moved]);

  const drop = (column: Column) => {
    const personId = dragging;
    setOver(null);
    setDragging(null);
    if (!personId) return;
    const person = people.find((p) => p.id === personId);
    if (!person || (moved[personId] ?? columnOf(person)) === column) return;

    setMoved((m) => ({ ...m, [personId]: column }));
    startTransition(async () => {
      try {
        await movePersonAction({ slug, personId, column });
        toast.success(`${person.name} → ${column}`);
        router.refresh();
      } catch (err) {
        toast.error("Déplacement impossible", errorMessage(err));
      } finally {
        setMoved((m) => {
          const next = { ...m };
          delete next[personId];
          return next;
        });
      }
    });
  };

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {COLUMNS.map((column) => {
        const list = byColumn.get(column)!;
        const isOver = over === column;
        return (
          <section
            key={column}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== column) setOver(column);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((c) => (c === column ? null : c));
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(column);
            }}
            className={`flex max-h-[calc(100dvh-13rem)] min-h-[28rem] w-[18.5rem] shrink-0 flex-col rounded-xl border transition-colors duration-150 ${
              isOver ? "border-fg/30 bg-surface-2" : "border-border bg-surface-2/50"
            }`}
          >
            <header className="flex items-center gap-2 px-3 pb-1 pt-3">
              <StatusDot status={column as Status} />
              <h2 className="text-ui font-semibold">{column}</h2>
              <span className="num ml-auto text-2xs text-fg-subtle">{list.length}</span>
            </header>
            <p className="px-3 pb-2 text-2xs text-fg-subtle">{HINT[column]}</p>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {list.map((person) => (
                <div
                  key={person.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(person.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <BoardCard slug={slug} person={person} dragging={dragging === person.id} />
                </div>
              ))}
              {list.length === 0 && (
                <div
                  className={`flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-2xs ${
                    isOver ? "border-fg/40 text-fg-muted" : "border-border text-fg-subtle"
                  }`}
                >
                  {isOver ? `Déposer dans « ${column} »` : "Aucune fiche"}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
