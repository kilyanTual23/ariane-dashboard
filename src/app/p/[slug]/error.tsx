"use client";

import { useEffect } from "react";

import { IconAlert, IconUndo } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export default function ProfileError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <IconAlert size={20} />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">Cette page n’a pas pu s’afficher</h1>
      <p className="mt-1.5 text-ui text-fg-muted">
        La base de données n’a peut-être pas répondu à temps. Vos données ne sont pas perdues.
      </p>
      {error.digest && <p className="mt-2 font-mono text-2xs text-fg-subtle">Réf. {error.digest}</p>}
      <button type="button" onClick={() => retry()} className={buttonClass("primary", "mt-6")}>
        <IconUndo size={14} />
        Réessayer
      </button>
    </div>
  );
}
