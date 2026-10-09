"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { movePersonAction } from "@/app/actions";
import { lifeSpan, monogram, SlotStrip } from "@/components/PersonCard";
import type { GridPerson } from "@/components/PersonGrid";
import { buttonClass, STATUS_DOT } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/types";

/**
 * Le cycle de vie d'une carte, de gauche à droite. « Classées » est la fin du
 * parcours : reportée sur Geneanet, on n'y revient plus.
 */
const COLUMNS = ["Pas commencé", "En recherche", "Bloqué", "Complet", "Classées"] as const;
type Column = (typeof COLUMNS)[number];

const HINT: Record<Column, string> = {
  "Pas commencé": "Personne ne s’en est encore occupé",
  "En recherche": "En cours, ou des pistes ouvertes",
  Bloqué: "Plus rien à tirer pour l’instant",
  Complet: "Terminée, à reporter sur Geneanet",
  Classées: "Reportées sur Geneanet",
};

function columnOf(person: GridPerson): Column {
  if (person.publication === "archivée") return "Classées";
  if (person.status === "Complet (lacunes)") return "Complet";
  if ((STATUSES as readonly string[]).includes(person.status)) return person.status as Column;
  if (person.status.startsWith("Bloqué")) return "Bloqué";
  return "Pas commencé";
}

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function KanbanCard({ slug, person }: { slug: string; person: GridPerson }) {
  const archived = person.publication === "archivée";
  const toPublish = person.publication === "à mettre sur Geneanet";

  return (
    <Link
      href={`/p/${slug}/personnes/${person.id}`}
      className={`group relative flex flex-col rounded-xl border p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card select-none ${
        archived
          ? "border-border/70 bg-surface-2/70 text-fg-muted"
          : toPublish
            ? "border-warn/45 bg-surface shadow-soft"
            : "border-border bg-surface shadow-soft hover:border-border-strong"
      }`}
    >
      {/* Jauge de complétion */}
      <SlotStrip score={person.score} total={person.total} missing={person.missing} className="mb-2.5" />

      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-semibold text-fg-muted">
          {monogram(person.given, person.surname)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1.5">
            <h3
              className={`truncate text-[13.5px] font-medium leading-tight ${
                archived ? "text-fg-muted" : "text-fg"
              }`}
              title={person.name}
            >
              {person.name}
            </h3>
            {person.sosa != null && (
              <span className="num shrink-0 rounded bg-fg/10 px-1 py-0.5 text-[9.5px] font-medium leading-none text-fg">
                #{person.sosa}
              </span>
            )}
          </div>

          <p className="num mt-1 truncate text-xs text-fg-subtle">
            {lifeSpan(person)}
            {person.place && (
              <span className="font-sans text-fg-subtle"> · {person.place.split(",")[0]?.trim()}</span>
            )}
          </p>
        </div>
      </div>

      {person.occupation && (
        <p className="mt-2 truncate text-[11.5px] text-fg-subtle">
          {person.occupation}
        </p>
      )}

      {/* Pied de carte avec statut / ce qui manque */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">
        {archived ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok">
            <span>✓</span> classée
          </span>
        ) : toPublish ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-[11px] font-medium text-ok">
              {person.status === "Complet (lacunes)" ? "Complète (lacunes)" : "Fiche complète"}
            </span>
            <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn">
              Geneanet ↗
            </span>
          </span>
        ) : person.missing.length > 0 ? (
          <span
            className="truncate text-[11px] text-fg-subtle max-w-[200px]"
            title={`Manque : ${person.missing.join(", ")}`}
          >
            Manque : {person.missing[0]?.toLowerCase()}
            {person.missing.length > 1 ? ` (+${person.missing.length - 1})` : ""}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-ok">
            {person.status === "Complet (lacunes)" ? "Complète (lacunes)" : "Fiche complète"}
          </span>
        )}

        <span className="num shrink-0 text-[11px] text-fg-subtle">
          {person.score}/{person.total}
        </span>
      </div>
    </Link>
  );
}

export function PersonKanban({ slug, people }: { slug: string; people: GridPerson[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const storageKey = `ariane_kanban_filters_${slug}`;

  const [query, setQuery] = useState("");
  const [sosaOnly, setSosaOnly] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [moved, setMoved] = useState<Record<number, Column>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  // Restaurer depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.query === "string") setQuery(saved.query);
        if (typeof saved.sosaOnly === "boolean") setSosaOnly(saved.sosaOnly);
      }
    } catch {}
    setIsHydrated(true);
  }, [storageKey]);

  // Sauvegarder automatiquement dans localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ query, sosaOnly }));
    } catch {}
  }, [isHydrated, query, sosaOnly, storageKey]);

  const sosaCount = useMemo(() => people.filter((p) => !!p.sosa).length, [people]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return people.filter((p) => {
      if (sosaOnly && !p.sosa) return false;
      if (!q) return true;
      return norm([p.name, p.place, p.occupation, p.spouse].filter(Boolean).join(" ")).includes(q);
    });
  }, [people, query, sosaOnly]);

  const byColumn = useMemo(() => {
    const map = new Map<Column, GridPerson[]>(COLUMNS.map((c) => [c, []]));
    for (const person of filtered) {
      const col = moved[person.id] ?? columnOf(person);
      const list = map.get(col) ?? map.get("Pas commencé")!;
      list.push(person);
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

  const hasActiveFilters = Boolean(query.trim() || sosaOnly);

  return (
    <div className="flex flex-col gap-5">
      {/* Barre d'outils et commutateur de vue */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <input
              className="field min-w-64 max-w-80 pr-7 text-sm"
              placeholder="Rechercher par nom, lieu, métier…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-fg-subtle hover:text-fg"
                title="Effacer la recherche"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSosaOnly((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              sosaOnly
                ? "border-fg bg-fg text-accent-fg"
                : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span>⭐ SOSA uniquement ({sosaCount})</span>
          </button>

          {hasActiveFilters && (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-md border border-ok/30 bg-ok-soft/60 px-2 py-1 text-[11px] font-medium text-ok"
                title="Vos filtres de tableau sont mémorisés pour votre prochaine visite"
              >
                <span>✓</span> Mémorisés
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSosaOnly(false);
                  try {
                    localStorage.removeItem(storageKey);
                  } catch {}
                }}
                className="text-xs text-fg-subtle underline underline-offset-2 hover:text-fg"
              >
                Effacer
              </button>
            </>
          )}

          <span className="num text-xs text-fg-subtle">
            {filtered.length} {filtered.length > 1 ? "cartes affichées" : "carte affichée"}
            {hasActiveFilters ? ` sur ${people.length}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-xl border border-border bg-surface-2 p-0.5 text-xs">
            <Link
              href={`/p/${slug}/personnes`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
            >
              <span>⊞</span> Grille
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 font-medium text-fg shadow-xs">
              <span>▥</span> Tableau
            </span>
          </div>

          <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary")}>
            + Nouvelle carte
          </Link>
        </div>
      </div>

      {/* Conteneur fluide des colonnes Kanban */}
      <div
        className={`-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 ${
          pending ? "opacity-90" : ""
        }`}
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
              className={`flex h-[calc(100vh-14rem)] min-h-[600px] w-[325px] min-w-[305px] max-w-[340px] shrink-0 flex-col rounded-2xl border transition-all duration-150 ${
                isOver
                  ? "border-fg/40 bg-surface-2 ring-2 ring-fg/10 shadow-md"
                  : "border-border/80 bg-surface-2/40"
              }`}
            >
              {/* En-tête de colonne avec compteur */}
              <header className="flex items-center justify-between border-b border-border/50 bg-surface/80 px-4 py-3 rounded-t-2xl">
                <div className="flex items-center gap-2">
                  {column === "Classées" ? (
                    <span className="text-ok font-semibold">✓</span>
                  ) : (
                    <span className={`size-2.5 rounded-full ${STATUS_DOT[column as Status]}`} />
                  )}
                  <h2 className="text-[13.5px] font-semibold tracking-tight">{column}</h2>
                </div>
                <span className="num rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-fg shadow-xs">
                  {list.length}
                </span>
              </header>

              <p className="border-b border-border/40 bg-surface/30 px-4 py-2 text-[11px] text-fg-subtle">
                {HINT[column]}
              </p>

              {/* Liste de cartes défilable */}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
                {isOver && (
                  <div className="animate-pulse rounded-xl border-2 border-dashed border-fg/30 bg-surface/70 py-3 text-center text-xs font-medium text-fg-muted">
                    Déposer dans « {column} »
                  </div>
                )}

                {list.map((person) => (
                  <div
                    key={person.id}
                    draggable
                    onDragStart={() => setDragging(person.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={`cursor-grab active:cursor-grabbing transition-opacity ${
                      dragging === person.id ? "opacity-30" : ""
                    }`}
                  >
                    <KanbanCard slug={slug} person={person} />
                  </div>
                ))}

                {list.length === 0 && !isOver && (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 py-10 text-center text-xs text-fg-subtle">
                    <span>Aucune carte</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
