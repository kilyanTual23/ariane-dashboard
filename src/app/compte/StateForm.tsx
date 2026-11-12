"use client";

import { useActionState, type ReactNode } from "react";

import { IconAlert, IconCircleCheck } from "@/components/icons";
import type { FormState } from "./actions";

/**
 * Formulaire relié à une server action qui renvoie un message (erreur ou succès),
 * affiché sous les champs.
 */
export function StateForm({
  action,
  fields = {},
  className = "",
  children,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  fields?: Record<string, string | number>;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      {children}
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-xs text-danger">
          <IconAlert size={14} className="mt-px shrink-0" />
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-ok-soft px-3 py-2.5 text-xs text-ok">
          <IconCircleCheck size={14} className="mt-px shrink-0" />
          {state.success}
        </p>
      )}
    </form>
  );
}
