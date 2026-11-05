"use client";

import { useState, useTransition, type ReactNode } from "react";

import { isNextControlFlow, toFormData } from "@/components/Dialog";
import { Spinner } from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";

type ServerAction = (fd: FormData) => unknown | Promise<unknown>;

/**
 * Choix exclusif enregistré immédiatement (« Décédé(e) / Vivant(e) ») :
 * le segment bascule tout de suite, le serveur suit.
 */
export function SegmentedAction({
  action,
  fields,
  name,
  value,
  options,
  label,
  size = "md",
}: {
  action: ServerAction;
  fields: Record<string, string | number | null | undefined>;
  /** Nom du champ qui porte la valeur choisie. */
  name: string;
  value: string;
  options: { value: string; label: ReactNode; title?: string }[];
  label: string;
  size?: "sm" | "md";
}) {
  const [optimistic, setOptimistic] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (value !== lastValue) {
    setLastValue(value);
    setOptimistic(value);
  }

  const choose = (next: string) => {
    if (next === optimistic || pending) return;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await action(toFormData({ ...fields, [name]: next }));
      } catch (err) {
        if (isNextControlFlow(err)) throw err;
        setOptimistic(value);
        toast.error("Modification impossible", errorMessage(err));
      }
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex items-center rounded-lg border border-border bg-surface-2/70 p-0.5 ${size === "sm" ? "h-6" : "h-7"}`}
    >
      {options.map((opt) => {
        const on = optimistic === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={opt.title}
            onClick={() => choose(opt.value)}
            className={`flex h-full items-center gap-1.5 rounded-md transition-colors ${size === "sm" ? "px-2 text-2xs" : "px-2.5 text-xs"} ${
              on ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted hover:text-fg"
            }`}
          >
            {on && pending && <Spinner size={11} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
