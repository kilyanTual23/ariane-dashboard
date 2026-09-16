"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { quickCreatePersonAction } from "@/app/actions";
import { completionTone } from "@/components/ui";

export type SearchPerson = {
  id: number;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  place: string | null;
  percent: number;
};

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Recherche rapide universelle :
 * - Navigation complète au clavier (↑ / ↓, Entrée, Échap)
 * - Raccourci ⌘K ou / pour focaliser
 * - Affichage clair des lieux, années et complétion
 */
export function QuickSearch({
  slug,
  profileId,
  people,
  placeholder = "Chercher une personne, une commune… (ou ⌘K)",
  className = "",
}: {
  slug: string;
  profileId: number;
  people: SearchPerson[];
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    return people
      .filter((p) => norm(`${p.name} ${p.place ?? ""}`).includes(q))
      .slice(0, 8);
  }, [people, query]);

  // Réinitialise la sélection lors d'une nouvelle recherche
  useEffect(() => {
    setSelectedIndex(0);
    if (query.trim().length >= 2) setOpen(true);
    else setOpen(false);
  }, [query]);

  // Raccourci global clavier : ⌘K ou Ctrl+K ou "/"
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      } else if (e.key === "/" && !isInput) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fermer quand on clique dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && e.key === "ArrowDown") {
      setOpen(true);
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      if (results[selectedIndex]) {
        e.preventDefault();
        setOpen(false);
        router.push(`/p/${slug}/personnes/${results[selectedIndex].id}`);
      }
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        {/* Loupe */}
        <span className="pointer-events-none absolute left-4 text-fg-subtle">
          🔍
        </span>

        <input
          ref={inputRef}
          className="field w-full rounded-2xl py-3.5 pl-11 pr-24 text-[15px] shadow-soft transition-all focus:border-border-strong focus:shadow-card"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />

        {/* Bouton effacer ou raccourci clavier */}
        <div className="absolute right-3.5 flex items-center gap-1.5">
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="rounded-lg p-1 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg"
              title="Effacer"
            >
              ✕
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg-subtle sm:inline-block">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          {results.length > 0 && (
            <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
              {results.map((p, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/p/${slug}/personnes/${p.id}`);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-[14.5px] tracking-tight">
                          {p.name}
                        </span>
                        <span className="num text-xs text-fg-subtle">
                          {p.birthYear ?? "?"}–{p.deathYear ?? "?"}
                        </span>
                      </div>
                      {p.place && (
                        <p className="truncate text-xs text-fg-subtle mt-0.5">
                          {p.place.split(",")[0]?.trim()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="num text-xs text-fg-subtle font-medium">
                        {p.percent}%
                      </span>
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={`h-full rounded-full ${completionTone(p.percent, 100)}`}
                          style={{ width: `${p.percent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {results.length === 0 && (
            <div className="p-4 text-center text-xs text-fg-muted">
              Aucune personne ne correspond à « {query.trim()} »
            </div>
          )}

          <form
            action={quickCreatePersonAction}
            className="flex items-center justify-between border-t border-border bg-surface-2/40 px-4 py-2.5 text-xs"
          >
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="profileId" value={profileId} />
            <input type="hidden" name="fullName" value={query.trim()} />
            <button
              type="submit"
              className="font-medium text-fg underline underline-offset-4 hover:opacity-80"
            >
              + Créer la fiche « {query.trim()} »
            </button>
            <span className="text-fg-subtle">Entrée ouvre la sélection</span>
          </form>
        </div>
      )}
    </div>
  );
}
