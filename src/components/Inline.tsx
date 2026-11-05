"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { setPersonField, setUnionField } from "@/app/actions";
import { IconArrowUpRight, IconPencil } from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { isUrl, normalizePlace, parseDateInput, sourceLabel } from "@/lib/dates";

export type InlineTarget =
  | { kind: "person"; personId: number; field: string }
  | { kind: "union"; unionId: number; field: "date_raw" | "place" | "source" };

type Suggestion = { value: string; hint?: string };

function useSave(slug: string, target: InlineTarget, onSaved?: (value: string) => void) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const write = async (value: string) => {
    if (target.kind === "person") {
      await setPersonField({ slug, personId: target.personId, field: target.field, value });
    } else {
      await setUnionField({ slug, unionId: target.unionId, field: target.field, value });
    }
  };

  /**
   * Enregistre, puis propose « Annuler » quelques secondes : une saisie malheureuse
   * se rattrape sans avoir à retaper l'ancienne valeur.
   */
  const save = (value: string, rollback: () => void, undo?: { previous: string; restore: () => void; label?: string }) =>
    startTransition(async () => {
      try {
        await write(value);
        onSaved?.(value);
        if (undo) {
          toast({
            title: "Modification enregistrée",
            description: undo.label,
            action: {
              label: "Annuler",
              onClick: () => {
                undo.restore();
                startTransition(async () => {
                  try {
                    await write(undo.previous);
                  } catch (err) {
                    toast.error("Annulation impossible", errorMessage(err));
                  }
                });
              },
            },
          });
        }
      } catch (err) {
        rollback();
        toast.error("Modification non enregistrée", errorMessage(err));
      }
    });

  return { save, pending };
}

/**
 * Valeur éditable sur place : un clic ouvre le champ, Entrée ou la perte de
 * focus enregistre, Échap annule.
 *
 * Les dates sont réécrites dans la nomenclature de la base (« 19 novembre 1882 »)
 * quelle que soit la façon dont on les tape ; les lieux sont proposés à partir de
 * ceux déjà utilisés dans le profil, puis des communes officielles.
 */
export function Inline({
  slug,
  target,
  value,
  placeholder = "à renseigner",
  variant = "text",
  places,
  fill = false,
  cell = false,
  quietEmpty = false,
  className = "",
  inputClassName = "",
  label,
  onSaved,
}: {
  slug: string;
  target: InlineTarget;
  value?: string | null;
  placeholder?: string;
  variant?: "text" | "source" | "long" | "date" | "place";
  /** Lieux déjà saisis dans le profil, les plus fréquents d'abord. */
  places?: string[];
  /** Occupe toute la largeur : toute la case devient cliquable. */
  fill?: boolean;
  /** Cellule de tableau sans cadre : toute la cellule est cliquable. */
  cell?: boolean;
  /** Vide « normal » (dispensé) : pas de soulignement d'appel à remplir. */
  quietEmpty?: boolean;
  className?: string;
  inputClassName?: string;
  /** Intitulé accessible du champ quand il n'est pas visible à l'écran. */
  label?: string;
  /** Appelé une fois la nouvelle valeur enregistrée. */
  onSaved?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [optimisticValue, setOptimisticValue] = useState<string | null | undefined>(value);
  const [lastValue, setLastValue] = useState(value);
  const [draft, setDraft] = useState(value ?? "");
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const { save, pending } = useSave(slug, target, onSaved);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // La valeur serveur fait foi dès qu'elle change.
  if (value !== lastValue) {
    setLastValue(value);
    setOptimisticValue(value);
  }

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      if (variant !== "long") ref.current?.select();
    }
  }, [editing, variant]);

  // Communes officielles, en complément des lieux déjà utilisés.
  const query = variant === "place" && editing ? (draft.split(",")[0]?.trim() ?? "") : "";
  useEffect(() => {
    if (query.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/communes?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setRemote(response.ok ? await response.json() : []);
      } catch {
        // Requête annulée ou hors ligne : les lieux connus suffisent.
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const parsed = variant === "date" ? parseDateInput(draft) : null;

  const localMatches: Suggestion[] =
    variant === "place"
      ? (places ?? [])
          .filter((p) => !draft.trim() || p.toLowerCase().includes(draft.trim().toLowerCase()))
          .slice(0, 5)
          .map((p) => ({ value: p, hint: "déjà utilisé" }))
      : [];

  const suggestions: Suggestion[] = [
    ...localMatches,
    ...(query.length >= 3 ? remote : []).filter((r) => !localMatches.some((l) => l.value === r.value)),
  ].slice(0, 8);

  // On repart toujours de la valeur affichée au moment où l'on ouvre le champ.
  const open = () => {
    setDraft(optimisticValue ?? "");
    setRemote([]);
    setHighlight(-1);
    setEditing(true);
  };

  const close = () => {
    setEditing(false);
    setRemote([]);
    setHighlight(-1);
  };

  const commit = (override?: string) => {
    const typed = override ?? draft;
    const normalized =
      variant === "date"
        ? (parseDateInput(typed).canonical ?? "")
        : variant === "place"
          ? (normalizePlace(typed) ?? "")
          : typed;

    close();
    if (normalized.trim() === (optimisticValue ?? "").trim()) return;
    const previous = optimisticValue;
    setOptimisticValue(normalized);
    save(normalized, () => setOptimisticValue(previous), {
      previous: previous ?? "",
      restore: () => setOptimisticValue(previous),
      label,
    });
  };

  if (editing) {
    const shared = {
      ref,
      value: draft,
      disabled: pending,
      placeholder,
      "aria-label": label ?? placeholder,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDraft(e.target.value);
        setHighlight(-1);
      },
      onBlur: () => commit(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
          return;
        }
        if (suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          setHighlight((h) => {
            const next = e.key === "ArrowDown" ? h + 1 : h - 1;
            return Math.max(-1, Math.min(suggestions.length - 1, next));
          });
          return;
        }
        if (e.key === "Enter" && (variant !== "long" || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit(highlight >= 0 ? suggestions[highlight].value : undefined);
        }
      },
    };

    if (variant === "long") {
      return (
        <div className={className}>
          <textarea {...shared} rows={6} className={`field min-h-32 text-sm ${inputClassName}`} />
          <p className="mt-1.5 text-2xs text-fg-subtle">Ctrl + Entrée pour enregistrer · Échap pour annuler</p>
        </div>
      );
    }

    return (
      <span
        className={`relative ${variant === "place" ? "z-30" : ""} block w-full align-top ${fill || cell ? "" : "max-w-md"} ${className}`}
      >
        <input {...shared} className={`field ${inputClassName}`} />

        {variant === "date" && draft.trim() && (
          <span className="mt-1 block text-2xs text-fg-subtle">
            {parsed?.recognized ? (
              <>
                Sera enregistré : <span className="font-medium text-fg-muted">{parsed.canonical}</span>
              </>
            ) : (
              "Format non reconnu : la saisie sera conservée telle quelle"
            )}
          </span>
        )}

        {variant === "place" && suggestions.length > 0 && (
          <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-72 animate-pop-in overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop">
            {suggestions.map((s, i) => (
              <li key={`${s.value}-${i}`}>
                <button
                  type="button"
                  // mousedown, sinon le blur enregistrerait avant le clic
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(s.value);
                  }}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-ui transition-colors ${
                    i === highlight ? "bg-surface-2" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="truncate">{s.value}</span>
                  {s.hint && <span className="shrink-0 text-2xs text-fg-subtle">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </span>
    );
  }

  const empty = !optimisticValue?.trim();
  const shown = empty ? placeholder : variant === "source" ? sourceLabel(optimisticValue) : optimisticValue;

  // Un acte déjà trouvé garde son lien cliquable ; le crayon ouvre l'édition.
  if (variant === "source" && !empty && isUrl(optimisticValue)) {
    return (
      <span className={`flex min-w-0 max-w-full items-center gap-1 ${fill ? "w-full" : ""} ${className}`}>
        <a
          href={optimisticValue!}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1 text-sm text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg"
        >
          <span className="truncate">{sourceLabel(optimisticValue)}</span>
          <IconArrowUpRight size={13} className="text-fg-subtle" />
        </a>
        <button
          type="button"
          onClick={open}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          title="Modifier le lien"
          aria-label="Modifier le lien"
        >
          <IconPencil size={12} />
        </button>
      </span>
    );
  }

  if (variant === "long") {
    return (
      <button
        type="button"
        onClick={open}
        className={`group -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1.5 text-left text-sm leading-relaxed transition-colors hover:bg-surface-2 ${
          empty ? "text-fg-subtle hover:text-fg-muted" : "text-fg"
        } ${className}`}
      >
        <span className="whitespace-pre-wrap break-words">{shown}</span>
      </button>
    );
  }

  if (cell) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={label ? `${label} : ${empty ? "à renseigner" : shown}` : undefined}
        className={`-mx-2 block min-h-8 w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left text-sm break-words transition-colors hover:bg-surface-2 ${
          pending ? "opacity-60" : ""
        } ${className}`}
      >
        {empty ? (
          <span
            className={`text-fg-subtle ${
              quietEmpty ? "" : "underline decoration-border-strong decoration-dashed underline-offset-[5px]"
            }`}
          >
            {shown}
          </span>
        ) : (
          shown
        )}
      </button>
    );
  }

  const trigger = (
    <button
      type="button"
      onClick={open}
      aria-label={label ? `${label} : ${empty ? "à renseigner" : shown}` : undefined}
      className={`${
        fill
          ? "slot-target"
          : "-mx-1.5 rounded-md px-1.5 text-left break-words transition-colors hover:bg-surface-2"
      } ${empty ? "text-fg-subtle" : ""} ${pending ? "opacity-60" : ""}`}
    >
      {shown}
    </button>
  );

  // En mode « case », le bouton est seul en piste : il occupe toute la place.
  if (fill) return trigger;

  return <span className={`flex min-w-0 max-w-full items-baseline gap-1.5 ${className}`}>{trigger}</span>;
}

/** Même logique pour les champs à choix fermé : enregistré au changement. */
export function InlineSelect({
  slug,
  target,
  value,
  options,
  emptyLabel = "–",
  className = "",
  labels,
}: {
  slug: string;
  target: InlineTarget;
  value?: string | null;
  options: readonly string[];
  emptyLabel?: string;
  className?: string;
  labels?: Record<string, string>;
}) {
  const [optimistic, setOptimistic] = useState(value ?? "");
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setOptimistic(value ?? "");
  }

  const { save, pending } = useSave(slug, target);
  return (
    <select
      className={`field ${pending ? "opacity-60" : ""} ${className}`}
      value={optimistic}
      onChange={(e) => {
        const previous = optimistic;
        const next = e.target.value;
        setOptimistic(next);
        save(next, () => setOptimistic(previous));
      }}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}
