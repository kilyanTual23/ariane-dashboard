"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { IconPlus, IconSearch, IconX } from "@/components/icons";
import { normalize, searchList } from "@/lib/search";

export type PickerPerson = {
  id: number;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  sosa?: number | null;
};

export function personYears(p: { birthYear: number | null; deathYear: number | null }) {
  if (!p.birthYear && !p.deathYear) return "";
  return `${p.birthYear ?? "?"} – ${p.deathYear ?? "?"}`;
}

export function personLabel(p: PickerPerson) {
  const years = personYears(p);
  return years ? `${p.name} (${years})` : p.name;
}

/**
 * Sélecteur de personne avec recherche : on tape un nom, une année ou un Sosa,
 * on choisit au clavier ou à la souris.
 *
 * Dans un formulaire, il transmet l'identifiant (`name`) et le texte tapé
 * (`textName`, par défaut « <name>Name »). Si aucun nom ne correspond et que
 * la création est permise, le texte seul part au serveur, qui crée la fiche
 * et la rattache dans la foulée.
 */
export function PersonSelect({
  name,
  textName,
  people,
  placeholder = "Chercher ou créer une personne…",
  required = false,
  value: controlledId,
  onChange,
  allowCreate = true,
  autoFocus = false,
  className = "",
  size = "md",
  suggestions,
  inlineList = false,
}: {
  name: string;
  textName?: string;
  people: PickerPerson[];
  placeholder?: string;
  required?: boolean;
  value?: number | null;
  onChange?: (id: number | null, person?: PickerPerson) => void;
  allowCreate?: boolean;
  autoFocus?: boolean;
  className?: string;
  size?: "md" | "lg";
  /** Fiches plausibles proposées avant toute saisie, avec la raison. */
  suggestions?: { id: number; reason: string }[];
  /** Liste dans le flux (dans un dialogue) plutôt que superposée : rien ne déborde. */
  inlineList?: boolean;
}) {
  const listId = useId();
  const [selectedId, setSelectedId] = useState<number | null>(controlledId ?? null);
  const [text, setText] = useState(() => people.find((p) => p.id === controlledId)?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Valeur pilotée de l'extérieur (calculateur de parenté, interversion…).
  const [lastControlled, setLastControlled] = useState(controlledId);
  if (controlledId !== lastControlled) {
    setLastControlled(controlledId);
    setSelectedId(controlledId ?? null);
    setText(people.find((p) => p.id === controlledId)?.name ?? "");
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const selected = people.find((p) => p.id === selectedId) ?? null;
  const showingSelection = selected && text === selected.name;

  const query = showingSelection ? "" : text;
  const reasons = useMemo(() => new Map((suggestions ?? []).map((s) => [s.id, s.reason])), [suggestions]);
  // Rien de tapé : les suggestions plausibles, sinon (dans un dialogue) rien du tout plutôt qu'une liste arbitraire.
  const suggesting = !query.trim() && reasons.size > 0;
  const results = useMemo(() => {
    if (!query.trim()) {
      if (reasons.size) return people.filter((p) => reasons.has(p.id)).sort(
        (a, b) => [...reasons.keys()].indexOf(a.id) - [...reasons.keys()].indexOf(b.id),
      );
      if (inlineList) return [];
    }
    return searchList(
      people,
      query,
      (p) => ({ name: p.name, sosa: p.sosa, birthYear: p.birthYear, deathYear: p.deathYear }),
      8,
    );
  }, [people, query, reasons, inlineList]);

  const trimmed = text.trim();
  const exact = people.some((p) => normalize(p.name) === normalize(trimmed));
  const canCreate = allowCreate && trimmed.length > 1 && !exact && !selected;
  const optionCount = results.length + (canCreate ? 1 : 0);

  const choose = (p: PickerPerson) => {
    setSelectedId(p.id);
    setText(p.name);
    setOpen(false);
    onChange?.(p.id, p);
  };

  const clear = () => {
    setSelectedId(null);
    setText("");
    onChange?.(null);
    input.current?.focus();
  };

  return (
    <div ref={root} className={`relative min-w-0 flex-1 ${className}`}>
      <div className="relative">
        <IconSearch
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
        />
        <input
          ref={input}
          className={`field pl-8 ${selected || text ? "pr-8" : ""} ${size === "lg" ? "h-10 text-sm" : ""}`}
          name={textName ?? `${name}Name`}
          value={text}
          placeholder={placeholder}
          required={required && !selectedId}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
            if (selectedId !== null) {
              setSelectedId(null);
              onChange?.(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(optionCount - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter" && open && optionCount > 0) {
              if (highlight < results.length) {
                e.preventDefault();
                choose(results[highlight]);
              } else {
                // « Créer… » : on laisse le formulaire partir avec le texte tapé.
                setOpen(false);
              }
            } else if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {(selected || text) && (
          <button
            type="button"
            onClick={clear}
            aria-label="Effacer"
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <IconX size={13} />
          </button>
        )}
      </div>
      <input type="hidden" name={name} value={selectedId ?? ""} />

      {open && optionCount > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={`${
            inlineList ? "relative max-h-64 shadow-xs" : "absolute left-0 right-0 top-full z-50 max-h-72 min-w-64 shadow-pop"
          } mt-1.5 animate-pop-in overflow-y-auto rounded-xl border border-border bg-surface p-1`}
        >
          {suggesting && (
            <li role="presentation" className="px-2.5 pb-1 pt-1.5 text-2xs font-medium text-fg-subtle">
              Suggestions
            </li>
          )}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={p.id === selectedId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(p)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui transition-colors ${
                  i === highlight ? "bg-surface-2" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  {reasons.has(p.id) && (
                    <span className="block truncate text-2xs text-fg-subtle">{reasons.get(p.id)}</span>
                  )}
                </span>
                {p.sosa ? <span className="num shrink-0 text-2xs text-fg-subtle">#{p.sosa}</span> : null}
                {!reasons.has(p.id) && <span className="num shrink-0 text-2xs text-fg-subtle">{personYears(p)}</span>}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(results.length)}
                onClick={() => setOpen(false)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui transition-colors ${
                  highlight === results.length ? "bg-surface-2" : ""
                } ${results.length ? "mt-1 border-t border-border pt-2" : ""}`}
              >
                <IconPlus size={14} className="text-fg-subtle" />
                <span className="min-w-0 flex-1 truncate">
                  Nouvelle fiche « <strong className="font-medium">{trimmed}</strong> »
                </span>
                <span className="shrink-0 text-2xs text-fg-subtle">Prénoms NOM</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export { PersonSelect as PersonCombobox };
