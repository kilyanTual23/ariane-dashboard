"use client";

import { useActionState, type ReactNode } from "react";

import { IconAlert, IconLock, IconUser, Spinner } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { bootstrapAction, loginAction } from "./actions";

function Field({
  label,
  icon,
  hint,
  ...input
}: { label: string; icon?: ReactNode; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">{icon}</span>
        )}
        <input {...input} className={`field h-10 text-sm ${icon ? "pl-9" : ""}`} />
      </span>
      {hint && <span className="mt-1 block text-2xs text-fg-subtle">{hint}</span>}
    </label>
  );
}

function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-xs text-danger">
      <IconAlert size={14} className="mt-px shrink-0" />
      {error}
    </p>
  );
}

export function LoginForm({ from }: { from?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={from ?? "/"} />
      <Field
        label="Identifiant"
        icon={<IconUser size={15} />}
        id="username"
        name="username"
        required
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="username"
        defaultValue={state?.username}
      />
      <Field
        label="Mot de passe"
        icon={<IconLock size={15} />}
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-invalid={Boolean(state?.error)}
      />
      <ErrorNote error={state?.error} />
      <button type="submit" disabled={isPending} className={buttonClass("primary", "w-full", "lg")}>
        {isPending ? <Spinner /> : "Ouvrir le carnet"}
      </button>
    </form>
  );
}

export function BootstrapForm() {
  const [state, formAction, isPending] = useActionState(bootstrapAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Identifiant"
        icon={<IconUser size={15} />}
        id="username"
        name="username"
        required
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="username"
        defaultValue={state?.username}
        hint="Pour vous connecter : lettres, chiffres, point ou tiret."
      />
      <Field label="Nom affiché" id="display_name" name="display_name" placeholder="Facultatif" autoComplete="name" />
      <Field
        label="Mot de passe"
        icon={<IconLock size={15} />}
        id="password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        hint="8 caractères au moins."
      />
      <Field
        label="Confirmer le mot de passe"
        icon={<IconLock size={15} />}
        id="confirm"
        name="confirm"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <div className="border-t border-border pt-4">
        <Field
          label="Mot de passe actuel du site"
          icon={<IconLock size={15} />}
          id="site_password"
          name="site_password"
          type="password"
          required
          autoComplete="off"
          hint="Celui d’avant les comptes : il prouve que vous êtes le propriétaire d’Ariane."
        />
      </div>
      <ErrorNote error={state?.error} />
      <button type="submit" disabled={isPending} className={buttonClass("primary", "w-full", "lg")}>
        {isPending ? <Spinner /> : "Créer mon compte"}
      </button>
    </form>
  );
}
