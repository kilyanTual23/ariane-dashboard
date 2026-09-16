import type { ReactNode } from "react";

type BarItem = {
  label: ReactNode;
  value: number;
  /** Texte affiché à droite ; par défaut la valeur brute. */
  display?: string;
  /** Infobulle native au survol. */
  title?: string;
  /** Classe de remplissage ; une seule teinte par défaut (grandeur, pas identité). */
  tone?: string;
};

/**
 * Barres horizontales : une seule série, valeurs étiquetées directement,
 * axe implicite (la ligne de base est le bord gauche). Pas de légende.
 */
export function BarList({
  items,
  max,
  className = "",
}: {
  items: BarItem[];
  max?: number;
  className?: string;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-fg-muted" title={typeof item.label === "string" ? item.label : undefined}>
            {item.label}
          </span>
          <span className="flex h-1.5 items-center" title={item.title}>
            <span
              className={`h-1.5 rounded-full ${item.tone ?? "bg-fg/30"}`}
              style={{ width: `${Math.max(2, (item.value / top) * 100)}%` }}
            />
          </span>
          <span className="w-12 text-right text-xs tabular-nums text-fg-muted">
            {item.display ?? item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Jauge de progression d'une génération : part connue sur part théorique.
 */
export function GenerationBars({
  rows,
}: {
  rows: { gen: number; found: number; expected: number; percent: number; avgCompletion: number }[];
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.gen} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
          <span className="text-xs text-fg-muted">
            G{row.gen}
            <span className="ml-1 text-fg-subtle">
              {row.gen === 1 ? "de cujus" : row.gen === 2 ? "parents" : `×${row.expected}`}
            </span>
          </span>
          <span
            className="flex h-1.5 items-center overflow-hidden rounded-full bg-surface-3"
            title={`${row.found} ancêtre(s) identifié(s) sur ${row.expected} — complétion moyenne ${row.avgCompletion}%`}
          >
            <span
              className="h-1.5 rounded-full bg-fg/35"
              style={{ width: `${Math.min(100, row.percent)}%` }}
            />
          </span>
          <span className="w-16 text-right text-xs tabular-nums text-fg-muted">
            {row.found}/{row.expected}
          </span>
        </li>
      ))}
    </ul>
  );
}
