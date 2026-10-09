"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { quickCreatePersonAction } from "@/app/actions";
import { completionTone, STATUS_DOT } from "@/components/ui";
import type { Kinship, Status } from "@/lib/types";

export type GlobalSearchItem = {
  id: number;
  name: string;
  givenNames?: string | null;
  surname?: string | null;
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
    const qClean = norm(query);

    if (!qClean) {
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

    const tokens = qClean.split(" ").filter((t) => t.length > 0);
    if (tokens.length === 0) return [];

    const scored: { item: GlobalSearchItem; score: number; reason: string }[] = [];

    for (const p of items) {
      // Filtres de catégorie
      if (filterType === "sosa" && !p.sosa) continue;
      if (filterType === "job" && (!p.occupation || !norm(p.occupation).includes(qClean))) continue;
      if (filterType === "place" && (!p.birthPlace || !norm(p.birthPlace).includes(qClean)) && (!p.deathPlace || !norm(p.deathPlace).includes(qClean))) continue;

      const nameNorm = norm(p.name);
      const givenNorm = norm(p.givenNames);
      const surnameNorm = norm(p.surname);
      const bPlaceNorm = norm(p.birthPlace);
      const dPlaceNorm = norm(p.deathPlace);
      const occNorm = norm(p.occupation);
      const sosaStr = p.sosa ? String(p.sosa) : "";
      const sosaFull = p.sosa ? `sosa ${p.sosa} #${p.sosa}` : "";
      const bYearStr = p.birthYear ? String(p.birthYear) : "";
      const dYearStr = p.deathYear ? String(p.deathYear) : "";
      const yearsStr = `${bYearStr} ${dYearStr}`.trim();
      const statusNorm = norm(p.status);

      const pool = `${nameNorm} ${givenNorm} ${surnameNorm} ${bPlaceNorm} ${dPlaceNorm} ${occNorm} ${sosaFull} ${yearsStr} ${statusNorm}`;

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
      let reason = "";

      if (sosaStr === qClean || sosaFull.includes(qClean)) {
        score += 100;
        reason = `Sosa ${p.sosa}`;
      } else if (surnameNorm === qClean || nameNorm === qClean) {
        score += 90;
      } else if (surnameNorm.startsWith(qClean) || nameNorm.startsWith(qClean)) {
        score += 70;
      } else if (surnameNorm.includes(qClean) || nameNorm.includes(qClean)) {
        score += 45;
      } else if (bPlaceNorm.includes(qClean) || dPlaceNorm.includes(qClean)) {
        score += 35;
        const matchedPlace = bPlaceNorm.includes(qClean) ? p.birthPlace : p.deathPlace;
        reason = `Lieu : ${matchedPlace?.split(",")[0]?.trim()}`;
      } else if (occNorm.includes(qClean)) {
        score += 30;
        reason = `Métier : ${p.occupation}`;
      } else if (yearsStr.includes(qClean)) {
        score += 25;
        reason = `Année : ${bYearStr || dYearStr}`;
      }

      for (const token of tokens) {
        if (surnameNorm.startsWith(token) || givenNorm.startsWith(token)) score += 15;
        if (nameNorm.includes(token)) score += 10;
        if (bYearStr === token || dYearStr === token) score += 15;
        if (sosaStr === token) score += 20;
      }

      scored.push({ item: p, score, reason });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "fr"))
      .slice(0, 10);
  }, [items, query, filterType]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, filterType]);

  const submitSearchToCards = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onClose();
    router.push(`/p/${slug}/personnes?q=${encodeURIComponent(trimmed)}`);
  };

  // Raccourcis clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }

    if (e.key === "ArrowDown" && filteredResults.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredResults.length);
      return;
    }

    if (e.key === "ArrowUp" && filteredResults.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredResults.length > 0 && filteredResults[selectedIndex]) {
        onClose();
        router.push(`/p/${slug}/personnes/${filteredResults[selectedIndex].item.id}`);
      } else if (query.trim()) {
        submitSearchToCards();
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
            placeholder="Rechercher par nom, lieu, métier, sosa, année… (Alt+K ou /)"
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
                      {p.birthYear ?? "?"} - {p.deathYear ?? "?"}
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
            <div className="p-8 text-center">
              <p className="text-sm text-fg-muted">
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
        </div>

        {/* Footer avec action de création rapide et voir dans les cartes */}
        <div className="flex flex-wrap items-center justify-between border-t border-border bg-surface-2/30 px-4 py-2.5 text-xs text-fg-subtle">
          {query.trim() ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submitSearchToCards}
                className="font-medium text-fg underline underline-offset-4 hover:opacity-80"
              >
                Voir dans les Cartes →
              </button>

              <form action={quickCreatePersonAction} className="flex items-center gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="profileId" value={profileId} />
                <input type="hidden" name="fullName" value={query.trim()} />
                <button
                  type="submit"
                  className="text-fg-muted hover:text-fg underline underline-offset-4"
                >
                  + Créer fiche
                </button>
              </form>
            </div>
          ) : (
            <span>Tapez un mot-clé ou filtrez par catégorie</span>
          )}
          <span className="hidden sm:inline">↑ ↓ naviguer · Entrée ouvrir · ESC fermer</span>
        </div>
      </div>
    </div>
  );
}
