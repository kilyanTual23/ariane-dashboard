import type { ReactNode } from "react";

import { COMPLETION_FILL } from "@/components/ui";

type BarItem = {
  label: ReactNode;
  value: number;
  /** Texte affiché à droite ; par défaut la valeur brute. */
  display?: ReactNode;
  /** Infobulle native au survol. */
  title?: string;
  /** Classe de remplissage ; une seule teinte par défaut (grandeur, pas identité). */
  tone?: string;
  href?: string;
};

/**
 * Barres horizontales : une seule série, valeurs étiquetées directement,
 * piste de fond pour lire la proportion. Pas de légende.
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
    <ul className={`flex flex-col gap-2.5 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[minmax(6rem,10rem)_1fr_minmax(3rem,auto)] items-center gap-3" title={item.title}>
          <span className="truncate text-ui text-fg-muted">{item.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span
              className={`block h-full rounded-full ${item.tone ?? "bg-fg/25"}`}
              style={{ width: `${Math.max(item.value ? 2 : 0, (item.value / top) * 100)}%` }}
            />
          </span>
          <span className="num whitespace-nowrap text-right text-xs text-fg">{item.display ?? item.value}</span>
        </li>
      ))}
    </ul>
  );
}



/** Jauge de progression d'une génération : part connue sur part théorique. */
export function GenerationBars({
  rows,
}: {
  rows: { gen: number; found: number; expected: number; percent: number; avgCompletion: number }[];
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li
          key={row.gen}
          className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3"
          title={`${row.found} ancêtre(s) identifié(s) sur ${row.expected} · complétion moyenne ${row.avgCompletion} %`}
        >
          <span className="text-ui">
            <span className="num font-medium">G{row.gen}</span>{" "}
            <span className="text-xs text-fg-subtle">
              {row.gen === 1 ? "de cujus" : row.gen === 2 ? "parents" : row.gen === 3 ? "grands-p." : `×${row.expected}`}
            </span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span className={`block h-full rounded-full ${COMPLETION_FILL}`} style={{ width: `${Math.min(100, row.percent)}%` }} />
          </span>
          <span className="num text-right text-xs">
            {row.found}
            <span className="text-fg-subtle">/{row.expected}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
