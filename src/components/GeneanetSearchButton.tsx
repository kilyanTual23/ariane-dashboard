"use client";

import { useState } from "react";

import { GeneanetSearchModal } from "@/components/GeneanetSearchModal";
import { IconGlobe } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import type { Person } from "@/lib/types";

export function GeneanetSearchButton({ person, className }: { person: Person; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className ?? buttonClass("secondary")}
        title="Rechercher cette personne sur Geneanet, critères préremplis"
      >
        <IconGlobe size={14} />
        Chercher sur Geneanet
      </button>
      {isOpen && <GeneanetSearchModal person={person} isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
