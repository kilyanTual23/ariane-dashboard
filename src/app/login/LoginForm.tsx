"use client";

import { useActionState } from "react";

import { IconAlert, IconLock, Spinner } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm({ initialError, from }: { initialError?: string; from?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, { error: initialError });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={from ?? "/"} />

      <label className="block">
        <span className="label">Mot de passe</span>
        <span className="relative block">
          <IconLock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={Boolean(state?.error)}
            className="field h-10 pl-9 text-sm"
          />
        </span>
      </label>

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-xs text-danger">
          <IconAlert size={14} className="mt-px" />
          {state.error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={buttonClass("primary", "w-full", "lg")}>
        {isPending ? <Spinner /> : "Ouvrir le carnet"}
      </button>
    </form>
  );
}
