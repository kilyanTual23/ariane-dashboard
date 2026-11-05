"use client";

import { useTransition, type ReactNode } from "react";

import { isNextControlFlow, toFormData } from "@/components/Dialog";
import { Spinner } from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui";

type ServerAction = (fd: FormData) => unknown | Promise<unknown>;

/**
 * Déclenche une Server Action en un clic, avec retour visuel : le bouton
 * tourne pendant l'appel, puis un message confirme (ou signale l'erreur).
 */
export function ActionButton({
  action,
  fields,
  children,
  successMessage,
  variant = "secondary",
  size = "md",
  className,
  title,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  action: ServerAction;
  fields: Record<string, string | number | null | undefined>;
  children: ReactNode;
  successMessage?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  title?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      disabled={pending || disabled}
      onClick={() =>
        startTransition(async () => {
          try {
            await action(toFormData(fields));
            if (successMessage) toast.success(successMessage);
          } catch (err) {
            if (isNextControlFlow(err)) throw err;
            toast.error("L’action a échoué", errorMessage(err));
          }
        })
      }
      className={`relative ${className ?? buttonClass(variant, "", size)}`}
    >
      {/* Le contenu garde sa place : le bouton ne change pas de largeur pendant l'appel. */}
      <span className={`contents ${pending ? "invisible" : ""}`}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === "xs" || size === "sm" || size === "icon-sm" ? 12 : 14} />
        </span>
      )}
    </button>
  );
}
