"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/icons";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui";

/**
 * Bouton d'envoi qui montre que le serveur travaille : désactivé et animé
 * tant que la Server Action du formulaire parent n'a pas répondu.
 */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  pendingLabel,
  disabled = false,
  title,
  name,
  value,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  pendingLabel?: ReactNode;
  disabled?: boolean;
  title?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending || disabled}
      aria-busy={pending}
      className={buttonClass(variant, className, size)}
    >
      {pending ? (
        <>
          <Spinner size={size === "xs" || size === "sm" ? 12 : 14} />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
