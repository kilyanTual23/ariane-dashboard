"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Dialog, isNextControlFlow } from "@/components/Dialog";
import { Spinner } from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui";

type ServerAction = (fd: FormData) => unknown | Promise<unknown>;

/**
 * Un bouton qui ouvre un petit formulaire en fenêtre modale, envoyé à une
 * Server Action. Les champs cachés (`fields`) sont ajoutés automatiquement ;
 * la fenêtre se ferme et un message confirme quand le serveur a répondu.
 */
export function FormDialog({
  trigger,
  triggerVariant = "secondary",
  triggerSize = "sm",
  triggerClassName,
  triggerTitle,
  title,
  description,
  action,
  fields,
  submitLabel = "Enregistrer",
  successMessage,
  size = "md",
  children,
}: {
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerTitle?: string;
  title: ReactNode;
  description?: ReactNode;
  action: ServerAction;
  fields: Record<string, string | number | null | undefined>;
  submitLabel?: ReactNode;
  successMessage?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <>
      <button
        type="button"
        title={triggerTitle}
        onClick={() => setOpen(true)}
        className={triggerClassName ?? buttonClass(triggerVariant, "", triggerSize)}
      >
        {trigger}
      </button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={title}
        description={description}
        size={size}
        scrollable={false}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            for (const [k, v] of Object.entries(fields)) {
              if (v !== null && v !== undefined) fd.set(k, String(v));
            }
            startTransition(async () => {
              try {
                await action(fd);
                setOpen(false);
                if (successMessage) toast.success(successMessage);
              } catch (err) {
                if (isNextControlFlow(err)) throw err;
                toast.error("L’enregistrement a échoué", errorMessage(err));
              }
            });
          }}
          className="flex flex-col gap-4"
        >
          {children}
          <div className="-mx-5 -mb-4 mt-1 flex justify-end gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-5 py-3">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
              Annuler
            </button>
            <button type="submit" disabled={pending} className={buttonClass("primary", "min-w-28")}>
              {pending ? <Spinner /> : submitLabel}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * Formulaire en page envoyé à une Server Action, avec message de succès ou
 * d'erreur. À combiner avec <SubmitButton> pour l'état « en cours ». Comme tout
 * formulaire à action, ses champs non contrôlés se réinitialisent après envoi.
 */
export function ActionForm({
  action,
  fields = {},
  successMessage,
  className = "",
  children,
}: {
  action: ServerAction;
  fields?: Record<string, string | number | null | undefined>;
  successMessage?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const toast = useToast();
  return (
    <form
      className={className}
      action={async (fd) => {
        for (const [k, v] of Object.entries(fields)) {
          if (v !== null && v !== undefined) fd.set(k, String(v));
        }
        try {
          await action(fd);
          if (successMessage) toast.success(successMessage);
        } catch (err) {
          if (isNextControlFlow(err)) throw err;
          toast.error("L’enregistrement a échoué", errorMessage(err));
        }
      }}
    >
      {children}
    </form>
  );
}

/** Champ de formulaire avec son intitulé et une aide facultative. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-fg-subtle">{hint}</span>}
    </label>
  );
}
