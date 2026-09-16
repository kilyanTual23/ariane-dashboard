"use client";

import { useState, type ReactNode } from "react";

/** Un formulaire replié : visible seulement quand on en a besoin. */
export function Disclosure({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline ${className}`}
      >
        {label}
      </button>
    );
  return (
    <div className={className}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1 text-xs text-fg-subtle hover:text-fg"
      >
        Annuler
      </button>
    </div>
  );
}
