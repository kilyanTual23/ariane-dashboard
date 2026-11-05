"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { IconAlert, IconX, Spinner } from "@/components/icons";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui";

/**
 * Fenêtre modale sur l'élément <dialog> natif : piège du focus, Échap et
 * couche supérieure fournis par le navigateur. Un clic hors du panneau ferme.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className = "",
  scrollable = true,
  autoFocusField = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Faux pour les formulaires courts : les listes déroulantes peuvent déborder du cadre. */
  scrollable?: boolean;
  /** Faux : aucun champ ne prend le focus à l'ouverture (pas de clavier qui surgit sur mobile). */
  autoFocusField?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  // Sur téléphone, la fenêtre est un tiroir : on le referme en le tirant vers le bas.
  const sheetHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (!window.matchMedia("(max-width: 639px)").matches || e.pointerType === "mouse") return;
      drag.current = { y: e.clientY, dy: 0 };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      const el = ref.current;
      if (!d || !el) return;
      d.dy = Math.max(0, e.clientY - d.y);
      el.style.transition = "none";
      el.style.transform = `translateY(${d.dy}px)`;
    },
    onPointerUp: () => {
      const d = drag.current;
      const el = ref.current;
      drag.current = null;
      if (!d || !el) return;
      el.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
      if (d.dy > 90) {
        el.style.transform = "translateY(100%)";
        window.setTimeout(() => {
          onClose();
          el.style.transform = "";
          el.style.transition = "";
        }, 200);
      } else {
        el.style.transform = "";
      }
    },
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal() place le focus sur le premier bouton (« Fermer ») : on le
      // ramène sur l'élément désigné, sinon sur le premier champ de saisie.
      const target = autoFocusField
        ? (el.querySelector<HTMLElement>("[data-autofocus]") ??
          el.querySelector<HTMLElement>(
            "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])",
          ))
        : null;
      // Sans champ, le focus va au panneau lui-même : pas d'anneau parasite sur « Fermer ».
      (target ?? el).focus();
    }
    if (!open && el.open) el.close();
  }, [open, autoFocusField]);

  const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-xl", xl: "max-w-3xl" };

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`dialog m-auto outline-none w-[calc(100%-2rem)] ${widths[size]} max-h-[calc(100dvh-4rem)] ${scrollable ? "overflow-hidden" : "overflow-visible"} rounded-2xl border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-transparent ${className}`}
    >
      {open && (
        <div className={`flex flex-col ${scrollable ? "max-h-[calc(100dvh-4rem)]" : ""}`}>
          {/* Poignée du tiroir (téléphone) : on la tire vers le bas pour fermer. */}
          <div {...sheetHandlers} onPointerCancel={sheetHandlers.onPointerUp} className="flex touch-none justify-center pb-1 pt-2.5 sm:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
          {(title || description) && (
            <header
              {...sheetHandlers}
              onPointerCancel={sheetHandlers.onPointerUp}
              className="flex items-start justify-between gap-4 px-5 pt-2 sm:pt-5"
            >
              <div className="min-w-0">
                {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
                {description && <p className="mt-1 text-ui text-fg-muted">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className={buttonClass("quiet", "-mr-1.5 -mt-1", "icon-sm")}
              >
                <IconX size={16} />
              </button>
            </header>
          )}
          {children && (
            <div className={`min-h-0 flex-1 px-5 py-4 ${scrollable ? "overflow-y-auto" : ""}`}>{children}</div>
          )}
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Les erreurs internes de Next (redirection, 404) doivent remonter telles quelles. */
export function isNextControlFlow(err: unknown) {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR") || digest === "NEXT_NOT_FOUND");
}

type ServerAction = (fd: FormData) => unknown | Promise<unknown>;

export function toFormData(fields: Record<string, string | number | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.append(k, String(v));
  }
  return fd;
}

/**
 * Bouton qui demande confirmation avant une action destructrice.
 * L'action est soit une fonction, soit une Server Action alimentée par `fields`.
 * Avec `confirmText`, il faut retaper ce texte pour valider (suppression d'un profil).
 */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Supprimer",
  confirmText,
  onConfirm,
  action,
  fields,
  successMessage,
  variant = "danger-soft",
  size = "md",
  className = "",
  buttonTitle,
  tone = "danger",
  disabled = false,
}: {
  children: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  onConfirm?: () => unknown | Promise<unknown>;
  action?: ServerAction;
  fields?: Record<string, string | number | null | undefined>;
  successMessage?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  buttonTitle?: string;
  tone?: "danger" | "default";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const canConfirm = !confirmText || typed.trim() === confirmText.trim();

  const run = () =>
    startTransition(async () => {
      try {
        if (onConfirm) await onConfirm();
        else if (action) await action(toFormData(fields ?? {}));
        setOpen(false);
        if (successMessage) toast.success(successMessage);
      } catch (err) {
        if (isNextControlFlow(err)) throw err;
        toast.error("L’action a échoué", errorMessage(err));
      }
    });

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={buttonTitle}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        className={className || buttonClass(variant, "", size)}
      >
        {children}
      </button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={buttonClass("secondary")}
              data-autofocus={confirmText ? undefined : ""}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={run}
              disabled={!canConfirm || pending}
              className={buttonClass(tone === "danger" ? "danger" : "primary", "min-w-24")}
            >
              {pending ? <Spinner /> : confirmLabel}
            </button>
          </>
        }
      >
        <div className="flex gap-3.5">
          {tone === "danger" && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <IconAlert size={17} />
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
            {description && <div className="mt-1.5 text-ui text-fg-muted">{description}</div>}
            {confirmText && (
              <label className="mt-4 block">
                <span className="label">
                  Pour confirmer, tapez <strong className="font-semibold text-fg">{confirmText}</strong>
                </span>
                <input
                  className="field"
                  value={typed}
                  autoFocus
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canConfirm) run();
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
