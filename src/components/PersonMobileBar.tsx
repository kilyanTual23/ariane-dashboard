"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Dialog } from "@/components/Dialog";
import { IconChevronLeft, IconChevronRight, IconMore } from "@/components/icons";
import { MobileBar } from "@/components/MobileChrome";
import { buttonClass } from "@/components/ui";

/**
 * Fiche sur mobile : le nom dans la barre du haut, fiche précédente / suivante
 * et un tiroir « ⋯ » qui reprend les actions de la colonne de droite.
 */
export function PersonMobileBar({
  title,
  prevHref,
  nextHref,
  position,
  children,
}: {
  title: string;
  prevHref: string | null;
  nextHref: string | null;
  position: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const nav = (href: string | null, label: string, icon: ReactNode) =>
    href ? (
      <Link href={href} className={buttonClass("quiet", "", "icon")} aria-label={label}>
        {icon}
      </Link>
    ) : (
      <span className={buttonClass("quiet", "pointer-events-none opacity-30", "icon")} aria-hidden>
        {icon}
      </span>
    );

  return (
    <>
      <MobileBar
        title={title}
        actions={
          <>
            {nav(prevHref, "Fiche précédente", <IconChevronLeft size={19} />)}
            {nav(nextHref, "Fiche suivante", <IconChevronRight size={19} />)}
            <button type="button" onClick={() => setOpen(true)} className={buttonClass("quiet", "", "icon")} aria-label="Actions sur la fiche">
              <IconMore size={19} />
            </button>
          </>
        }
      />
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title={title} description={`Fiche ${position} · glissez à gauche ou à droite pour changer de fiche`}>
        {/* Un lien referme le tiroir ; une action à confirmer garde sa fenêtre ouverte. */}
        <div
          className="-mx-2 flex flex-col [&_a]:h-11 [&_button]:h-11"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) window.setTimeout(() => setOpen(false), 0);
          }}
        >
          {children}
        </div>
      </Dialog>
    </>
  );
}
