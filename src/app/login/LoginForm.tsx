"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { buttonClass } from "@/components/ui";

interface LoginFormProps {
  initialError?: string;
  from?: string;
}

export function LoginForm({ initialError, from }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, {
    error: initialError,
  });

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="from" value={from ?? "/"} />

      {state?.error && (
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-3.5 text-xs text-danger">
          <p className="font-medium">{state.error}</p>
        </div>
      )}

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-medium uppercase tracking-wider text-fg-muted"
        >
          Mot de passe
        </label>
        <div className="mt-2">
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Entrez votre mot de passe"
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-fg shadow-soft outline-none transition-colors placeholder:text-fg-subtle focus:border-fg"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={buttonClass(
          "primary",
          "w-full py-2.5 text-sm font-medium shadow-md transition-all active:scale-[0.99]",
        )}
      >
        {isPending ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            Vérification...
          </span>
        ) : (
          "Accéder au carnet"
        )}
      </button>
    </form>
  );
}
