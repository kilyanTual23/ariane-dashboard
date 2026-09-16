"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setPersonField } from "@/app/actions";
import { STATUS_DOT } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/types";

/** Ce que veut dire chaque état, en clair, sous le libellé. */
const MEANING: Record<Status, string> = {
  "Pas commencé": "personne ne s’en est encore occupé",
  "En recherche": "en cours, ou des pistes sont ouvertes",
  Bloqué: "plus rien à tirer pour l’instant",
  Complet: "rien de plus à trouver",
};

export function StatusPicker({
  slug,
  personId,
  status,
}: {
  slug: string;
  personId: number;
  status: Status;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: Status) => {
    setOpen(false);
    if (next === status) return;
    startTransition(async () => {
      await setPersonField({ slug, personId, field: "status", value: next });
      router.refresh();
    });
  };

  return (
    <div className="relative inline-block" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] shadow-soft transition-all hover:border-border-strong ${
          pending ? "opacity-50" : ""
        }`}
      >
        <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
        {status}
        <span className="text-[10px] text-fg-subtle">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-pop">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                s === status ? "bg-surface-2" : ""
              }`}
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[s]}`} />
              <span className="min-w-0">
                <span className="block text-sm">{s}</span>
                <span className="block text-[11px] text-fg-subtle">{MEANING[s]}</span>
              </span>
              {s === status && <span className="ml-auto text-xs text-fg">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
