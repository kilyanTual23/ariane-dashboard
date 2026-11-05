import Link from "next/link";
import type { ReactNode } from "react";

import { Orb } from "@/components/Orb";
import type { Kinship, Status } from "@/lib/types";

/* ------------------------------------------------------------------ couleurs */

/**
 * Les cinq états de recherche. Ce sont les seules couleurs de l'interface :
 * palette validée pour les daltonismes, et toujours accompagnée du mot.
 */
export const STATUS_DOT: Record<Status, string> = {
  "Pas commencé": "bg-neutral",
  "En recherche": "bg-info-dot",
  Bloqué: "bg-danger-dot",
  Complet: "bg-ok-dot",
  "Complet (lacunes)": "bg-teal",
};

/** Teinte de texte assortie, pour les endroits où le statut doit sauter aux yeux. */
export const STATUS_TEXT: Record<Status, string> = {
  "Pas commencé": "text-fg-muted",
  "En recherche": "text-info",
  Bloqué: "text-danger",
  Complet: "text-ok",
  "Complet (lacunes)": "text-teal",
};

/** Pastille pleine : fond teinté, texte assorti. */
export const STATUS_SOFT: Record<Status, string> = {
  "Pas commencé": "bg-neutral-soft text-fg-muted",
  "En recherche": "bg-info-soft text-info",
  Bloqué: "bg-danger-soft text-danger",
  Complet: "bg-ok-soft text-ok",
  "Complet (lacunes)": "bg-teal-soft text-teal",
};

/** Ce que veut dire chaque état, en clair. */
export const STATUS_MEANING: Record<Status, string> = {
  "Pas commencé": "Personne ne s’en est encore occupé",
  "En recherche": "En cours, ou des pistes sont ouvertes",
  Bloqué: "Plus rien à tirer pour l’instant",
  Complet: "Rien de plus à trouver",
  "Complet (lacunes)": "Recherche close malgré des actes introuvables",
};

export function StatusDot({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOT[status] ?? "bg-neutral"} ${className}`}
    />
  );
}

export function StatusBadge({
  status,
  variant = "plain",
  className = "",
}: {
  status: Status;
  variant?: "plain" | "soft";
  className?: string;
}) {
  if (variant === "soft") {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ${STATUS_SOFT[status]} ${className}`}
      >
        <StatusDot status={status} className="size-1.5" />
        {status}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted ${className}`}
    >
      <StatusDot status={status} className="size-1.5" />
      {status}
    </span>
  );
}

export function KinshipBadge({ kinship }: { kinship: Kinship | null }) {
  if (!kinship) return <span className="text-fg-subtle">–</span>;
  return (
    <span className={`inline-block text-xs ${kinship === "SOSA" ? "text-fg-muted" : "text-fg-subtle"}`}>
      {kinship}
    </span>
  );
}

/* ------------------------------------------------------------- complétion */

/**
 * Avancement d'une fiche, du rouge au vert. La couleur ne porte jamais seule
 * l'information : le compte (« 8/11 ») et la longueur remplie l'accompagnent
 * partout, ce qui la rend lisible aussi en cas de daltonisme.
 */
/*
  Jauges de complétion : une seule couleur, celle de l'accent. Le vert, l'orange
  et le rouge restent réservés aux statuts de recherche, pour qu'une même teinte
  ne dise jamais deux choses différentes.
*/
export const COMPLETION_FILL = "bg-accent";
export const COMPLETION_COLOR = "var(--accent)";

export function CompletionBar({
  percent,
  className = "",
  showValue = true,
  size = "sm",
}: {
  percent: number;
  className?: string;
  showValue?: boolean;
  size?: "sm" | "md";
}) {
  const tone = COMPLETION_FILL;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`min-w-12 flex-1 overflow-hidden rounded-full bg-surface-3 ${size === "md" ? "h-1.5" : "h-1"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      {showValue && (
        <span className="num w-9 shrink-0 text-right text-xs text-fg-subtle">{percent}%</span>
      )}
    </div>
  );
}

/** Anneau de complétion : la jauge principale d'une fiche. */
export function CompletionRing({
  score,
  total,
  size = 44,
  stroke = 4,
  children,
}: {
  score: number;
  total: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(1, score / total) : 0;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={COMPLETION_COLOR}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ blocs */

export function Card({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface shadow-soft ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-ui text-fg-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={`p-5 ${title || action ? "pt-4" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "info";
  icon?: ReactNode;
  href?: string;
}) {
  const toneClass = {
    default: "text-fg",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
  }[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-ui text-fg-muted">
        <span className="truncate">{label}</span>
        {icon && <span className="text-fg-subtle">{icon}</span>}
      </div>
      <div className={`num mt-2 text-[1.375rem] font-semibold leading-none tracking-tight sm:text-[1.625rem] ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="mt-2 truncate text-xs text-fg-subtle sm:mt-2.5">{hint}</div>}
    </>
  );
  const cls =
    "block min-w-0 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-soft transition-colors active:bg-surface-2/60 sm:px-4 sm:py-3.5";
  if (href) {
    return (
      <Link href={href} className={`${cls} hover:border-border-strong hover:bg-surface-2/40`}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center ${className}`}
    >
      {icon && (
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
          {icon}
        </span>
      )}
      {title && <p className="text-sm font-medium text-fg">{title}</p>}
      {children && <div className="mt-1 max-w-sm text-ui text-fg-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** En-tête de page : titre, sous-titre et actions alignées à droite. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight lg:text-[1.375rem] lg:font-semibold">{title}</h1>
          {description && <p className="mt-1 text-ui text-fg-muted max-sm:hidden">{description}</p>}
        </div>
        {/* Sur mobile, la barre d'onglets et le tiroir « Plus » portent ces actions. */}
        {actions && <div className="flex flex-wrap items-center gap-2 max-lg:hidden">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function PersonLink({
  slug,
  id,
  children,
  className = "",
}: {
  slug: string;
  id: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/p/${slug}/personnes/${id}`}
      className={`font-medium underline-offset-4 transition-colors hover:underline ${className}`}
    >
      {children}
    </Link>
  );
}

export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1 font-mono text-[0.625rem] font-medium text-fg-subtle shadow-xs ${className}`}
    >
      {children}
    </kbd>
  );
}

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "teal" | "ink";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  teal: "bg-teal-soft text-teal border-transparent",
  ink: "bg-accent text-accent-fg border-transparent",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-2xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Pastille aux initiales : l'avatar d'une fiche. */
/** Pastille propre à chaque personne : une sphère graphique colorée, toujours la même pour elle. */
export function Avatar({
  given,
  surname,
  seed,
  size = "md",
  className = "",
}: {
  given?: string | null;
  surname?: string | null;
  /** Identifiant de la fiche ; à défaut, le nom sert de graine. */
  seed?: number | string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { sm: "size-6", md: "size-8", lg: "size-10", xl: "size-14" };
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10 ${sizes[size]} ${className}`}
    >
      <Orb seed={seed ?? `${given ?? ""}|${surname ?? ""}`} />
    </span>
  );
}

/* --------------------------------------------------------------- boutons */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger" | "danger-soft";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg shadow-soft hover:bg-accent-hover",
  secondary: "border border-border bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-border-strong",
  // Ancien nom de la variante bordée, conservé pour les écrans non migrés.
  ghost: "border border-border bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-border-strong",
  quiet: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger-dot text-white shadow-soft hover:opacity-90",
  "danger-soft": "text-danger hover:bg-danger-soft",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 rounded-md px-2 text-2xs",
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-8 gap-1.5 rounded-lg px-3 text-ui",
  lg: "h-10 gap-2 rounded-lg px-4 text-sm",
  icon: "size-8 rounded-lg",
  "icon-sm": "size-7 rounded-md",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  extra = "",
  size: ButtonSize = "md",
) {
  const base =
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return `${base} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${extra}`;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
