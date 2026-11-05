"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { IconAlert, IconCircleCheck, IconInfo, IconX } from "@/components/icons";

type ToastTone = "success" | "error" | "info";

type ToastInput = {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Durée d'affichage en ms ; 0 pour garder le message jusqu'à fermeture. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastInput & { id: number };

type ToastApi = {
  (input: ToastInput): number;
  success: (title: ReactNode, description?: ReactNode) => number;
  error: (title: ReactNode, description?: ReactNode) => number;
  info: (title: ReactNode, description?: ReactNode) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Retours d'action discrets en bas de l'écran : « Enregistré », « Supprimé »,
 * erreurs serveur. Remplace les bandeaux posés au milieu des pages.
 */
export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const api = useMemo(() => {
    const push = (input: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { tone: "success", ...input, id }]);
      return id;
    };
    const fn = push as ToastApi;
    fn.success = (title, description) => push({ title, description, tone: "success" });
    fn.error = (title, description) => push({ title, description, tone: "error", duration: 7000 });
    fn.info = (title, description) => push({ title, description, tone: "info" });
    fn.dismiss = dismiss;
    return fn;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-5 lg:bottom-11"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [hover, setHover] = useState(false);
  const duration = item.duration ?? 4000;

  useEffect(() => {
    if (!duration || hover) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, hover, onDismiss]);

  const icon =
    item.tone === "error" ? (
      <IconAlert size={16} className="text-danger" />
    ) : item.tone === "info" ? (
      <IconInfo size={16} className="text-info" />
    ) : (
      <IconCircleCheck size={16} className="text-ok" />
    );

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-pop"
    >
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-fg">{item.title}</p>
        {item.description && <p className="mt-0.5 text-xs text-fg-muted">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-fg hover:bg-surface-2"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer"
        className="-mr-1 shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

const silent = Object.assign(() => 0, {
  success: () => 0,
  error: () => 0,
  info: () => 0,
  dismiss: () => {},
}) as ToastApi;

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? silent;
}

/** Message lisible à partir d'une erreur inconnue. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Une erreur inattendue est survenue.";
}
