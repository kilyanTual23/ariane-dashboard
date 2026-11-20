import Link from "next/link";

import { IconCalendar } from "@/components/icons";
import type { Anniversary, AnniversaryDay } from "@/lib/anniversaries";

const DAY_LABEL: Record<AnniversaryDay, string> = {
  hier: "Hier",
  aujourdhui: "Aujourd’hui",
  demain: "Demain",
};

/** Combien d'événements tiennent sur la ligne : un sur téléphone, trois sur ordinateur. */
const SHOWN_PHONE = 1;
const SHOWN_DESKTOP = 3;

const plural = (n: number) => `${n} an${n > 1 ? "s" : ""}`;

function what(a: Anniversary) {
  if (a.kind === "naissance") return a.living ? "Anniversaire de" : "Naissance de";
  return a.kind === "mariage" ? "Mariage de" : "Décès de";
}

/** « Naissance de François Emmanuel TUAL le 20 novembre 1882, il y a 144 ans ». */
function sentence(a: Anniversary) {
  const age = a.kind === "naissance" && a.living ? `${plural(a.years)} (${a.year})` : `${a.year}, il y a ${plural(a.years)}`;
  return `${DAY_LABEL[a.day]} : ${what(a).toLowerCase()} ${a.fullLabel} · ${age}`;
}

function Item({ slug, a, className = "" }: { slug: string; a: Anniversary; className?: string }) {
  return (
    <Link
      href={`/p/${slug}/personnes/${a.personId}`}
      title={sentence(a)}
      className={`min-w-0 truncate transition-colors hover:text-fg ${className}`}
    >
      <span className={a.day === "aujourdhui" ? "font-medium text-accent-text" : "text-fg-subtle"}>{DAY_LABEL[a.day]}</span>
      {" · "}
      {what(a)} <span className="text-fg">{a.label}</span>
      <span className="num text-fg-subtle"> · {plural(a.years)}</span>
    </Link>
  );
}

/**
 * Une ligne discrète sous le titre : anniversaires de naissance, de mariage ou de décès
 * d'hier, d'aujourd'hui et de demain. Rien ne s'affiche s'il n'y en a aucun.
 */
export function AnniversaryStrip({ slug, items }: { slug: string; items: Anniversary[] }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, SHOWN_DESKTOP);
  const morePhone = items.length - SHOWN_PHONE;
  const moreDesktop = items.length - SHOWN_DESKTOP;

  return (
    <aside aria-label="Anniversaires" className="-mt-5 flex min-w-0 items-center gap-2 text-xs text-fg-muted">
      <IconCalendar size={13} className="shrink-0 text-fg-subtle" aria-hidden />
      <div className="flex min-w-0 items-center gap-4 overflow-hidden">
        {visible.map((a, i) => (
          <Item key={`${a.day}-${a.kind}-${a.personId}-${a.year}`} slug={slug} a={a} className={i >= SHOWN_PHONE ? "max-sm:hidden" : ""} />
        ))}
      </div>

      {morePhone > 0 && (
        <details className={`group relative shrink-0 ${moreDesktop > 0 ? "" : "sm:hidden"}`}>
          <summary className="cursor-pointer list-none rounded px-1 text-fg-subtle transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
            <span className="sm:hidden">+{morePhone}</span>
            <span className="max-sm:hidden">+{moreDesktop}</span>
          </summary>
          <ul className="absolute right-0 top-full z-30 mt-1.5 flex w-[min(22rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-surface p-1.5 shadow-pop">
            {items.map((a) => (
              <li key={`${a.day}-${a.kind}-${a.personId}-${a.year}`}>
                <Link
                  href={`/p/${slug}/personnes/${a.personId}`}
                  className="flex flex-col rounded-lg px-2.5 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <span className="text-fg">
                    {what(a)} {a.fullLabel}
                  </span>
                  <span className="num text-2xs text-fg-subtle">
                    <span className={a.day === "aujourdhui" ? "font-medium text-accent-text" : ""}>{DAY_LABEL[a.day]}</span>
                    {" · "}
                    {a.kind === "naissance" && a.living ? `${plural(a.years)} (${a.year})` : `${a.year}, il y a ${plural(a.years)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
