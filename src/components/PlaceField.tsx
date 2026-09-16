"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  value: string;
  hint?: string;
};

/**
 * Champ de saisie de lieu avec autocomplétion intelligente :
 * - Propose instantanément les communes déjà utilisées dans le profil
 * - Interroge l'API officielle des communes françaises (geo.api.gouv.fr)
 * - Navigation au clavier (↑ / ↓, Entrée, Échap)
 */
export function PlaceField({
  name,
  places,
  placeholder = "Lieu…",
  defaultValue = "",
  className = "field",
  onChange,
}: {
  name: string;
  places: string[];
  placeholder?: string;
  defaultValue?: string | null;
  className?: string;
  onChange?: (val: string) => void;
}) {
  const [val, setVal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recherche sur l'API des communes françaises
  useEffect(() => {
    if (!open) return;
    const query = val.split(",")[0]?.trim() ?? "";
    if (query.length < 2) {
      setRemote([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/communes?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setRemote(data);
        }
      } catch {
        setRemote([]);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [val, open]);

  // Fermer quand on clique à l'extérieur
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const localMatches: Suggestion[] = (places ?? [])
    .filter((p) => !val.trim() || p.toLowerCase().includes(val.trim().toLowerCase()))
    .slice(0, 5)
    .map((p) => ({ value: p, hint: "déjà utilisé" }));

  const suggestions: Suggestion[] = [
    ...localMatches,
    ...remote.filter((r) => !localMatches.some((l) => l.value.toLowerCase() === r.value.toLowerCase())),
  ].slice(0, 8);

  const selectValue = (selected: string) => {
    setVal(selected);
    setOpen(false);
    onChange?.(selected);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        name={name}
        className={className}
        placeholder={placeholder}
        value={val}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setVal(e.target.value);
          setOpen(true);
          setHighlight(-1);
          onChange?.(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          } else if (suggestions.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setHighlight((h) => {
              const next = e.key === "ArrowDown" ? h + 1 : h - 1;
              return Math.max(-1, Math.min(suggestions.length - 1, next));
            });
          } else if (e.key === "Enter" && highlight >= 0 && suggestions[highlight]) {
            e.preventDefault();
            selectValue(suggestions[highlight].value);
          }
        }}
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-64 overflow-y-auto rounded-2xl border border-border bg-surface p-1 shadow-pop">
          {suggestions.map((s, idx) => (
            <li key={`${s.value}-${idx}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectValue(s.value);
                }}
                className={`flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-1.5 text-left text-xs transition-colors ${
                  idx === highlight ? "bg-surface-2 font-medium text-fg" : "hover:bg-surface-2 text-fg-muted hover:text-fg"
                }`}
              >
                <span className="truncate">{s.value}</span>
                {s.hint && <span className="shrink-0 text-[10px] text-fg-subtle">{s.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
