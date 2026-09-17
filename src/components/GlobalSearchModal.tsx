"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { quickCreatePersonAction } from "@/app/actions";
import { completionTone, STATUS_DOT } from "@/components/ui";
import type { Kinship, Status } from "@/lib/types";

export type GlobalSearchItem = {
  id: number;
  name: string;
  givenNames: string;
  surname: string;
  sosa: number | null;
  kinship: Kinship | null;
  status: Status;
  occupation: string | null;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  deathPlace: string | null;
  percent: number;
};

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function GlobalSearchModal({
  slug,
  profileId,
  items,
  open,
  onClose,
}: {
  slug: string;
  profileId: number;
  items: GlobalSearchItem[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterType, setFilterType] = useState<"all" | "sosa" | "place" | "job">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filteredResults = useMemo((): { item: GlobalSearchItem; score: number; reason: string }[] => {
    const q = norm(query.trim());
    if (!q) {
      // Si requête vide mais filtre actif, ou 6 personnes récentes / SOSA
      let base = items;
      if (filterType === "sosa") {
        base = items.filter((p) => p.sosa);
      } else if (filterType === "job") {
        base = items.filter((p) => p.occupation);
      } else if (filterType === "place") {
        base = items.filter((p) => p.birthPlace || p.deathPlace);
      }
      return base.slice(0, filterType === "all" ? 6 : 10).map((p) => ({ item: p, score: 0, reason: "" }));
    }

    // Détection si recherche de sosa pure (ex: "sosa 14" ou "#14")
    const sosaMatch = q.match(/^(?:sosa|#)\s*(\d+)$/);
    const targetSosa = sosaMatch ? Number(sosaMatch[1]) : null;

    return items
      .map((p) => {
        let matchScore = 0;
        let matchReason = "";

        // Match Sosa
        if (targetSosa !== null && p.sosa === targetSosa) {
          matchScore += 100;
          matchReason = `Sosa ${p.sosa}`;
        } else if (p.sosa && String(p.sosa) === q) {
          matchScore += 80;
          matchReason = `Sosa ${p.sosa}`;
        }

        // Match Nom / Prénoms
        const fullNameNorm = norm(`${p.givenNames} ${p.surname}`);
        if (fullNameNorm.startsWith(q)) {
          matchScore += 50;
        } else if (fullNameNorm.includes(q)) {
          matchScore += 30;
        }

        // Match Métier
        if (p.occupation && norm(p.occupation).includes(q)) {
          matchScore += 25;
          matchReason = matchReason || `Métier : ${p.occupation}`;
        }

        // Match Lieux (naissance ou décès)
        const bPlace = p.birthPlace ? norm(p.birthPlace) : "";
        const dPlace = p.deathPlace ? norm(p.deathPlace) : "";
        if (bPlace.includes(q) || dPlace.includes(q)) {
          matchScore += 20;
          const matchedPlace = bPlace.includes(q) ? p.birthPlace : p.deathPlace;
          matchReason = matchReason || `Lieu : ${matchedPlace?.split(",")[0]?.trim()}`;
        }

        // Match Statut
        if (norm(p.status).includes(q)) {
          matchScore += 15;
          matchReason = matchReason || `Statut : ${p.status}`;
        }

        // Filtre de catégorie
        if (filterType === "sosa" && !p.sosa) return null;
        if (filterType === "job" && (!p.occupation || !norm(p.occupation).includes(q))) return null;
        if (filterType === "place" && (!bPlace.includes(q) && !dPlace.includes(q))) return null;

        if (matchScore === 0) return null;
        return { item: p, score: matchScore, reason: matchReason };
      })
      .filter((r): r is { item: GlobalSearchItem; score: number; reason: string } => r !== null)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "fr"))
      .slice(0, 10);
  }, [items, query, filterType]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, filterType]);

  // Raccourcis clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }

    if (filteredResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
    } else if (e.key === "Enter") {
      if (filteredResults[selectedIndex]) {
        e.preventDefault();
        onClose();
        router.push(`/p/${slug}/personnes/${filteredResults[selectedIndex].item.id}`);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-bg/75 backdrop-blur-sm p-4 pt-16 sm:pt-24 animate-in fade-in duration-150">
      {/* Click outside to close */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />

      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-pop">
        {/* Champ de recherche */}
        <div className="flex items-center border-b border-border px-4 py-3.5 gap-3">
          <span className="text-fg-subtle text-lg">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[16px] text-fg placeholder:text-fg-subtle focus:outline-none"
            placeholder="Rechercher par nom, lieu, métier, sosa… (ex: Fougères, meunier, sosa 12)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-lg p-1 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              ✕
            </button>
          ) : (
            <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-subtle">
              ESC
            </kbd>
          )}
        </div>

        {/* Filtres d'exploration rapide */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-surface-2/40 px-4 py-2 text-xs">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              filterType === "all" ? "bg-surface font-medium text-fg shadow-soft" : "text-fg-muted hover:text-fg"
            }`}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => setFilterType("sosa")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              filterType === "sosa" ? "bg-surface font-medium text-fg shadow-soft" : "text-fg-muted hover:text-fg"
            }`}
          >
            ⭐ Sosa uniquement
          </button>
          <button
            type="button"
            onClick={() => setFilterType("place")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              filterType === "place" ? "bg-surface font-medium text-fg shadow-soft" : "text-fg-muted hover:text-fg"
            }`}
          >
            📍 Par commune
          </button>
          <button
            type="button"
            onClick={() => setFilterType("job")}
            className={`rounded-lg px-2.5 py-1 transition-colors ${
              filterType === "job" ? "bg-surface font-medium text-fg shadow-soft" : "text-fg-muted hover:text-fg"
            }`}
          >
            💼 Par métier
          </button>
        </div>

        {/* Résultats */}
        <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
          {filteredResults.map((res, idx) => {
            const p = res.item;
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/p/${slug}/personnes/${p.id}`);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                  isSelected ? "bg-surface-2" : "hover:bg-surface-2/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14.5px] font-medium tracking-tight text-fg">
                      {p.name}
                    </span>
                    <span className="num text-xs text-fg-subtle">
                      {p.birthYear ?? "?"}–{p.deathYear ?? "?"}
                    </span>
                    {p.sosa && (
                      <span className="rounded bg-fg/10 px-1.5 py-0.5 text-[10px] font-mono text-fg">
                        Sosa {p.sosa}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                    {p.occupation && <span>💼 {p.occupation}</span>}
                    {(p.birthPlace || p.deathPlace) && (
                      <span>📍 {(p.birthPlace || p.deathPlace)?.split(",")[0]?.trim()}</span>
                    )}
                    {res.reason && (
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
                        {res.reason}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`size-2 rounded-full ${STATUS_DOT[p.status] ?? "bg-neutral"}`} />
                  <span className="num text-xs font-medium text-fg-subtle">{p.percent}%</span>
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-3 hidden sm:block">
                    <div
                      className={`h-full rounded-full ${completionTone(p.percent, 100)}`}
                      style={{ width: `${p.percent}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}

          {filteredResults.length === 0 && (
            <div className="p-8 text-center text-sm text-fg-muted">
              Aucun résultat pour « {query.trim()} »
            </div>
          )}
        </div>

        {/* Footer avec action de création rapide */}
        <div className="flex flex-wrap items-center justify-between border-t border-border bg-surface-2/30 px-4 py-2.5 text-xs text-fg-subtle">
          {query.trim().length >= 2 ? (
            <form action={quickCreatePersonAction} className="flex items-center gap-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="fullName" value={query.trim()} />
              <button
                type="submit"
                className="font-medium text-fg underline underline-offset-4 hover:opacity-80"
              >
                + Créer la fiche « {query.trim()} »
              </button>
            </form>
          ) : (
            <span>Tapez au moins 2 caractères pour filtrer</span>
          )}
          <span className="hidden sm:inline">↑ ↓ pour naviguer · Entrée pour ouvrir</span>
        </div>
      </div>
    </div>
  );
}
