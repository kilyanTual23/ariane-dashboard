"use client";

import { useState, useTransition } from "react";

import { setPersonField } from "@/app/actions";
import { IconChevronDown, Spinner } from "@/components/icons";
import { Menu, MenuItem } from "@/components/Menu";
import { errorMessage, useToast } from "@/components/Toast";
import { STATUS_MEANING, StatusDot } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/types";

/** Choix du statut de recherche d'une fiche, avec le sens de chaque état. */
export function StatusPicker({
  slug,
  personId,
  status,
  className = "",
  appearance = "field",
}: {
  slug: string;
  personId: number;
  status: Status;
  className?: string;
  /** « plain » : sans cadre, pour une liste de propriétés. */
  appearance?: "field" | "plain";
}) {
  const [optimistic, setOptimistic] = useState<Status>(status);
  const [lastStatus, setLastStatus] = useState(status);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (status !== lastStatus) {
    setLastStatus(status);
    setOptimistic(status);
  }

  const choose = (next: Status) => {
    if (next === optimistic) return;
    const previous = optimistic;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await setPersonField({ slug, personId, field: "status", value: next });
      } catch (err) {
        setOptimistic(previous);
        toast.error("Statut non modifié", errorMessage(err));
      }
    });
  };

  return (
    <Menu
      className={className}
      panelClassName="w-72"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={
            appearance === "plain"
              ? `-mx-2 flex h-8 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-ui font-medium transition-colors hover:bg-surface-2 ${
                  props.open ? "bg-surface-2" : ""
                }`
              : `flex h-9 w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-ui font-medium shadow-xs transition-colors hover:border-border-strong ${
                  props.open ? "border-border-strong" : ""
                }`
          }
        >
          {pending ? <Spinner size={12} /> : <StatusDot status={optimistic} />}
          <span className="flex-1 truncate text-left">{optimistic}</span>
          <IconChevronDown size={14} className="text-fg-subtle" />
        </button>
      )}
    >
      {STATUSES.map((s) => (
        <MenuItem key={s} icon={<StatusDot status={s} />} checked={s === optimistic} onSelect={() => choose(s)}>
          <span className="block text-ui text-fg">{s}</span>
          <span className="block text-2xs text-fg-subtle">{STATUS_MEANING[s]}</span>
        </MenuItem>
      ))}
    </Menu>
  );
}
