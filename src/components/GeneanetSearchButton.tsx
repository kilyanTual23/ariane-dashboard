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
        <span className="flex size-4 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 font-bold text-[10px]">
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

