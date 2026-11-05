"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { IconCheck } from "@/components/icons";

type Align = "start" | "end";
type Side = "bottom" | "top";

type TriggerProps = {
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-haspopup": "menu" | "dialog";
  "aria-controls": string;
};

/** Ouverture, fermeture au clic extérieur et à Échap : commun aux menus et popovers. */
function useDismissable(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return root;
}

function placement(align: Align, side: Side) {
  return `${align === "end" ? "right-0" : "left-0"} ${side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`;
}

const MenuContext = createContext<{ close: () => void } | null>(null);

/**
 * Menu déroulant accessible : flèches haut/bas, Entrée, Échap, Tab ferme.
 * Le déclencheur reçoit ses props par une fonction de rendu.
 */
export function Menu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  className = "",
  panelClassName = "w-56",
}: {
  trigger: (props: TriggerProps & { open: boolean }) => ReactNode;
  children: ReactNode;
  align?: Align;
  side?: Side;
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const root = useDismissable(open, close);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    const items = Array.from(
      panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      {trigger({
        open,
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": "menu",
        "aria-controls": id,
      })}
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={panel}
            id={id}
            role="menu"
            onKeyDown={onKeyDown}
            className={`absolute z-50 ${placement(align, side)} max-h-[min(70vh,28rem)] origin-top animate-pop-in overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop ${panelClassName}`}
          >
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

const itemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-ui text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus:bg-surface-2";

export function MenuItem({
  children,
  onSelect,
  icon,
  hint,
  checked,
  danger = false,
  disabled = false,
  keepOpen = false,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  keepOpen?: boolean;
}) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        onSelect?.();
        if (!keepOpen) ctx?.close();
      }}
      className={`${itemClass} ${danger ? "text-danger hover:bg-danger-soft focus:bg-danger-soft" : ""} disabled:opacity-50`}
    >
      {icon !== undefined && (
        <span className={`flex w-4 justify-center ${danger ? "" : "text-fg-subtle"}`}>{icon}</span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-2xs text-fg-subtle">{hint}</span>}
      {checked !== undefined && (
        <span className="flex w-4 justify-center text-fg">{checked && <IconCheck size={14} />}</span>
      )}
    </button>
  );
}

export function MenuLink({
  children,
  href,
  icon,
  hint,
  external = false,
}: {
  children: ReactNode;
  href: string;
  icon?: ReactNode;
  hint?: ReactNode;
  external?: boolean;
}) {
  const ctx = useContext(MenuContext);
  const content = (
    <>
      {icon !== undefined && <span className="flex w-4 justify-center text-fg-subtle">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-2xs text-fg-subtle">{hint}</span>}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" role="menuitem" tabIndex={-1} onClick={() => ctx?.close()} className={itemClass}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} role="menuitem" tabIndex={-1} onClick={() => ctx?.close()} className={itemClass}>
      {content}
    </Link>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-2xs font-medium text-fg-subtle">{children}</div>;
}

/**
 * Panneau flottant libre (filtres, formulaires courts) : reste ouvert tant
 * qu'on interagit dedans, se ferme au clic extérieur ou à Échap.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  side = "bottom",
  className = "",
  panelClassName = "w-72",
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: TriggerProps & { open: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: Align;
  side?: Side;
  className?: string;
  panelClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      setInnerOpen(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const id = useId();
  const close = useCallback(() => setOpen(false), [setOpen]);
  const root = useDismissable(open, close);

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      {trigger({
        open,
        onClick: () => setOpen(!open),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": id,
      })}
      {open && (
        <div
          id={id}
          role="dialog"
          className={`absolute z-50 ${placement(align, side)} animate-pop-in rounded-xl border border-border bg-surface shadow-pop ${panelClassName}`}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
