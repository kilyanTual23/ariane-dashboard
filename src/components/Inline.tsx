"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { setPersonField, setUnionField } from "@/app/actions";
import { isUrl, normalizePlace, parseDateInput, sourceLabel } from "@/lib/dates";

export type InlineTarget =
  | { kind: "person"; personId: number; field: string }
  | { kind: "union"; unionId: number; field: "date_raw" | "place" | "source" };

type Suggestion = { value: string; hint?: string };

function useSave(slug: string, target: InlineTarget) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const save = (value: string, done?: () => void) =>
    startTransition(async () => {
      if (target.kind === "person") {
        await setPersonField({ slug, personId: target.personId, field: target.field, value });
      } else {
        await setUnionField({ slug, unionId: target.unionId, field: target.field, value });
      }
      router.refresh();
      done?.();
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
  className = "",
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
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [optimisticValue, setOptimisticValue] = useState<string | null | undefined>(value);
  const [draft, setDraft] = useState(value ?? "");
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const { save, pending } = useSave(slug, target);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    setOptimisticValue(value);
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // Communes officielles, en complément des lieux déjà utilisés.
  useEffect(() => {
    if (!editing || variant !== "place") return;
    const query = draft.split(",")[0]?.trim() ?? "";
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (query.length < 3) {
        setRemote([]);
        return;
      }
      try {
        const response = await fetch(`/api/communes?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setRemote(response.ok ? await response.json() : []);
      } catch {
        setRemote([]);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, editing, variant]);

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
    ...remote.filter((r) => !localMatches.some((l) => l.value === r.value)),
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

    if (normalized.trim() === (optimisticValue ?? "").trim()) {
      return;
    }
    setOptimisticValue(normalized);
    save(normalized);
  };

  if (editing) {
    const shared = {
      ref,
      value: draft,
      disabled: pending,
      placeholder,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDraft(e.target.value);
        setHighlight(-1);
      },
      onBlur: () => commit(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setDraft(value ?? "");
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
      return <textarea {...shared} className={`field min-h-28 ${className}`} />;
    }

    return (
      <span
        className={`relative ${variant === "place" ? "z-30" : ""} block w-full align-top ${fill ? "" : "max-w-md"} ${className}`}
      >
        <input {...shared} className="field" />

        {variant === "date" && draft.trim() && (
          <span className="mt-1 block text-[11px] text-fg-subtle">
            {parsed?.recognized ? (
              <>
                sera enregistré : <span className="text-fg-muted">{parsed.canonical}</span>
              </>
            ) : (
              "format non reconnu, la saisie sera conservée telle quelle"
            )}
          </span>
        )}

        {variant === "place" && suggestions.length > 0 && (
          <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-72 overflow-y-auto rounded-2xl border border-border bg-surface p-1 shadow-pop">
            {suggestions.map((s, i) => (
              <li key={`${s.value}-${i}`}>
                <button
                  type="button"
                  // mousedown, sinon le blur enregistrerait avant le clic
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(s.value);
                  }}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-1.5 text-left text-sm transition-colors ${
                    i === highlight ? "bg-surface-2" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="truncate">{s.value}</span>
                  {s.hint && <span className="shrink-0 text-[11px] text-fg-subtle">{s.hint}</span>}
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

  const trigger = (
    <button
      type="button"
      onClick={open}
      className={`${
        fill
          ? "slot-target"
          : "-mx-1.5 rounded-md px-1.5 text-left break-words transition-colors hover:bg-surface-2"
      } ${empty ? "italic text-fg-subtle" : ""}`}
    >
      {shown}
    </button>
  );

  // Un acte déjà trouvé garde son lien cliquable ; le crayon ouvre l'édition.
  if (variant === "source" && !empty && isUrl(optimisticValue)) {
    return (
      <span className={`flex min-w-0 max-w-full items-baseline gap-1.5 ${fill ? "w-full" : ""} ${className}`}>
        <a
          href={optimisticValue!}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-fg underline underline-offset-4 hover:opacity-80"
        >
          {sourceLabel(optimisticValue)} ↗
        </a>
        <button
          type="button"
          onClick={open}
          className="-my-1 shrink-0 rounded-md px-1.5 py-1 text-xs text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          title="Modifier le lien"
        >
          ✎
        </button>
      </span>
    );
  }

  // En mode « case », le bouton est seul en piste : il occupe toute la place.
  if (fill) return trigger;

  return (
    <span className={`flex min-w-0 max-w-full items-baseline gap-1.5 ${className}`}>{trigger}</span>
  );
}

/** Même logique pour les champs à choix fermé : enregistré au changement. */
export function InlineSelect({
  slug,
  target,
  value,
  options,
  emptyLabel = "—",
  className = "",
}: {
  slug: string;
  target: InlineTarget;
  value?: string | null;
  options: readonly string[];
  emptyLabel?: string;
  className?: string;
}) {
  const [optimistic, setOptimistic] = useState(value ?? "");
  useEffect(() => {
    setOptimistic(value ?? "");
  }, [value]);

  const { save, pending } = useSave(slug, target);
  return (
    <select
      className={`w-auto cursor-pointer rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] text-fg-muted transition-colors hover:border-border hover:bg-surface-2 ${className}`}
      value={optimistic}
      onChange={(e) => {
        const next = e.target.value;
        setOptimistic(next);
        save(next);
      }}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
