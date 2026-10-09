import Link from "next/link";
import type { ReactNode } from "react";
import type { Kinship, Status } from "@/lib/types";

/* ------------------------------------------------------------------ couleurs */

/**
 * Les cinq états de recherche. Ce sont les seules couleurs de l'interface :
 * palette validée pour les daltonismes, et toujours accompagnée du mot.
 */
export const STATUS_DOT: Record<Status, string> = {
  "Pas commencé": "bg-neutral",
  "En recherche": "bg-info",
  Bloqué: "bg-danger",
  Complet: "bg-ok",
  "Complet (lacunes)": "bg-ok ring-2 ring-ok/30",
};

/** Teinte de texte assortie, pour les endroits où le statut doit sauter aux yeux. */
export const STATUS_TEXT: Record<Status, string> = {
  "Pas commencé": "text-neutral",
  "En recherche": "text-info",
  Bloqué: "text-danger",
  Complet: "text-ok",
  "Complet (lacunes)": "text-ok",
};

/** Pastille pleine : fond teinté, texte assorti. */
export const STATUS_SOFT: Record<Status, string> = {
  "Pas commencé": "bg-neutral-soft text-fg-muted",
  "En recherche": "bg-info-soft text-info",
  Bloqué: "bg-danger-soft text-danger",
  Complet: "bg-ok-soft text-ok",
  "Complet (lacunes)": "bg-ok-soft text-ok",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] text-fg-muted">
      <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[status] ?? "bg-neutral"}`} />
      {status}
    </span>
  );
}

export function KinshipBadge({ kinship }: { kinship: Kinship | null }) {
  if (!kinship) return <span className="text-fg-subtle">-</span>;
  return (
    <span
      className={`inline-block text-xs ${
        kinship === "SOSA" ? "text-fg-muted" : "text-fg-subtle"
      }`}
    >
      {kinship}
    </span>
  );
}

/* ------------------------------------------------------------- complétion */

/**
 * Avancement d'une carte, du rouge au vert. La couleur ne porte jamais seule
 * l'information : le compte (« 8/11 ») et la longueur remplie l'accompagnent
 * partout, ce qui la rend lisible aussi en cas de daltonisme.
 */
export function completionTone(score: number, total: number) {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 1) return "bg-grade-4";
  if (ratio >= 0.7) return "bg-grade-3";
  if (ratio >= 0.45) return "bg-grade-2";
  if (ratio >= 0.2) return "bg-grade-1";
  return "bg-grade-0";
}

export function CompletionBar({
  percent,
  className = "",
  showValue = true,
}: {
  percent: number;
  className?: string;
  showValue?: boolean;
}) {
  const tone = completionTone(percent, 100);
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="h-1 min-w-14 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue && (
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-fg-subtle">
          {percent}%
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ blocs */

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface shadow-soft ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
          <h2 className="text-[13px] font-medium text-fg">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "info";
}) {
  const toneClass = {
    default: "text-fg",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className={`mt-1.5 font-display text-[27px] font-light leading-none tracking-tight ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-fg-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-fg-subtle">{children}</p>;
}

export function PersonLink({
  slug,
  id,
  children,
}: {
  slug: string;
  id: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/p/${slug}/personnes/${id}`}
      className="font-medium underline-offset-4 transition-colors hover:underline"
    >
      {children}
    </Link>
  );
}

export function buttonClass(variant: "primary" | "ghost" | "danger" = "ghost", extra = "") {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.985] disabled:opacity-50";
  const variants = {
    primary: "bg-accent text-accent-fg shadow-soft hover:opacity-90",
    ghost: "border border-border bg-surface text-fg shadow-soft hover:bg-surface-2",
    danger: "border border-transparent text-danger hover:bg-danger-soft",
  };
  return `${base} ${variants[variant]} ${extra}`;
}
