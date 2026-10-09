"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { quickCreatePersonAction } from "@/app/actions";
import { completionTone } from "@/components/ui";

export type SearchPerson = {
  id: number;
  name: string;
  givenNames?: string | null;
  surname?: string | null;
  sosa?: number | null;
  birthYear: number | null;
  deathYear: number | null;
  place: string | null;
  birthPlace?: string | null;
  deathPlace?: string | null;
  occupation?: string | null;
  percent: number;
};

function norm(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[()[\]{},;:'"«»_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recherche rapide universelle :
 * - Navigation complète au clavier (↑ / ↓, Entrée, Échap)
 * - Raccourci Alt+K ou / pour focaliser (évite les conflits Ctrl+K navigateur)
 * - Recherche multi-mots (nom, prénoms, commune, métier, années, Sosa)
 * - Entrée ouvre la sélection ou bascule sur la vue Cartes filtrée
 */
export function QuickSearch({
  slug,
  profileId,
  people,
  placeholder = "Chercher une personne, une commune, une année… (Alt+K ou /)",
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
    const qClean = norm(query);
    if (!qClean) return [];

    const tokens = qClean.split(" ").filter((t) => t.length > 0);
    if (tokens.length === 0) return [];

    const scored: { person: SearchPerson; score: number }[] = [];

    for (const p of people) {
      const nameNorm = norm(p.name);
      const givenNorm = norm(p.givenNames);
      const surnameNorm = norm(p.surname);
      const bPlaceNorm = norm(p.birthPlace ?? p.place);
      const dPlaceNorm = norm(p.deathPlace);
      const occNorm = norm(p.occupation);
      const sosaStr = p.sosa ? String(p.sosa) : "";
      const sosaFull = p.sosa ? `sosa ${p.sosa} #${p.sosa}` : "";
      const bYearStr = p.birthYear ? String(p.birthYear) : "";
      const dYearStr = p.deathYear ? String(p.deathYear) : "";
      const yearsStr = `${bYearStr} ${dYearStr}`.trim();

      const pool = `${nameNorm} ${givenNorm} ${surnameNorm} ${bPlaceNorm} ${dPlaceNorm} ${occNorm} ${sosaFull} ${yearsStr}`;

      let matchesAll = true;
      for (const token of tokens) {
        const cleanToken = token.replace(/^(#|sosa:?)/, "");
        const matched =
          pool.includes(token) ||
          (cleanToken && sosaStr === cleanToken) ||
          (cleanToken && (bYearStr === cleanToken || dYearStr === cleanToken));

        if (!matched) {
          matchesAll = false;
          break;
        }
      }

      if (!matchesAll) continue;

      let score = 0;
      if (surnameNorm === qClean || nameNorm === qClean) score += 100;
      else if (surnameNorm.startsWith(qClean) || nameNorm.startsWith(qClean)) score += 70;
      else if (surnameNorm.includes(qClean) || nameNorm.includes(qClean)) score += 40;

      if (sosaStr === qClean || sosaFull.includes(qClean)) score += 80;

      for (const token of tokens) {
        if (surnameNorm.startsWith(token) || givenNorm.startsWith(token)) score += 15;
        if (nameNorm.includes(token)) score += 10;
        if (bYearStr === token || dYearStr === token) score += 20;
        if (sosaStr === token) score += 25;
      }

      scored.push({ person: p, score });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name, "fr"))
      .slice(0, 8)
      .map((s) => s.person);
  }, [people, query]);

  // Réinitialise la sélection lors d'une nouvelle recherche
  useEffect(() => {
    setSelectedIndex(0);
    if (query.trim().length >= 1) setOpen(true);
    else setOpen(false);
  }, [query]);

  // Raccourcis clavier : Alt+K, / (hors saisie), Ctrl+Shift+K, Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      const key = e.key.toLowerCase();
      const isAltK = e.altKey && !e.ctrlKey && !e.metaKey && key === "k";
      const isShiftK = (e.ctrlKey || e.metaKey) && e.shiftKey && key === "k";
      const isSlash = e.key === "/" && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isCtrlK = (e.ctrlKey || e.metaKey) && !e.shiftKey && key === "k";

      if (isAltK || isShiftK || isSlash || isCtrlK) {
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

  const submitSearchToCards = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/p/${slug}/personnes?q=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        setOpen(false);
        router.push(`/p/${slug}/personnes/${results[selectedIndex].id}`);
      } else if (query.trim()) {
        submitSearchToCards();
      }
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        {/* Bouton Loupe cliquable pour lancer la recherche */}
        <button
          type="button"
          onClick={submitSearchToCards}
          className="absolute left-3.5 flex items-center justify-center text-fg-subtle hover:text-fg transition-colors"
          title="Lancer la recherche"
        >
          🔍
        </button>

        <input
          ref={inputRef}
          className="field w-full rounded-2xl py-3.5 pl-11 pr-24 text-[15px] shadow-soft transition-all focus:border-border-strong focus:shadow-card"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 1) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />

        {/* Bouton effacer ou badge raccourci clavier */}
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
            <kbd
              className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg-subtle sm:inline-block"
              title="Raccourci clavier : Alt+K ou /"
            >
              Alt+K
            </kbd>
          )}
        </div>
      </div>

      {open && query.trim().length >= 1 && (
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
                          {p.birthYear ?? "?"} - {p.deathYear ?? "?"}
                        </span>
                        {p.sosa && (
                          <span className="rounded bg-fg/10 px-1.5 py-0.5 text-[10px] font-mono text-fg">
                            Sosa {p.sosa}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 truncate text-xs text-fg-subtle mt-0.5">
                        {p.occupation && <span>💼 {p.occupation}</span>}
                        {p.place && <span>📍 {p.place.split(",")[0]?.trim()}</span>}
                      </div>
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

              {/* Lien direct pour voir toutes les fiches correspondantes */}
              <button
                type="button"
                onClick={submitSearchToCards}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-fg-muted bg-surface-2/30 hover:bg-surface-2 hover:text-fg transition-colors"
              >
                <span>🔍 Voir tous les résultats dans les Cartes</span>
                <span className="text-[11px] text-fg-subtle">Touche Entrée ↵</span>
              </button>
            </div>
          )}

          {results.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-xs text-fg-muted">
                Aucun résultat immédiat pour « {query.trim()} »
              </p>
              <button
                type="button"
                onClick={submitSearchToCards}
                className="mt-2 text-xs font-medium text-fg underline underline-offset-4 hover:opacity-80"
              >
                Chercher dans toutes les Cartes →
              </button>
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
            <span className="text-fg-subtle">↑ ↓ pour naviguer</span>
          </form>
        </div>
      )}
    </div>
  );
}
