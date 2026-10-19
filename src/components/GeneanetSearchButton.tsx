"use client";

import { useState } from "react";
import type { Person } from "@/lib/types";
import { GeneanetSearchModal } from "./GeneanetSearchModal";

export function GeneanetSearchButton({
  person,
  className = "",
}: {
  person: Person;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-2xs hover:bg-surface-2 hover:border-border-strong transition-all cursor-pointer ${className}`}
        title="Rechercher sur Geneanet avec filtres personnalisables"
      >
        <span className="flex size-4 items-center justify-center rounded-full bg-surface-2 text-fg-muted font-semibold text-[10px] border border-border/80">
          G
        </span>
        <span>Rechercher sur Geneanet</span>
      </button>

      {isOpen && (
        <GeneanetSearchModal
          person={person}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

