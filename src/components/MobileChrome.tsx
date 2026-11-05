"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { logoutAction } from "@/app/login/actions";
import { Dialog } from "@/components/Dialog";
import {
  IconArrowLeft,
  IconBookOpen,
  IconChart,
  IconCheck,
  IconHome,
  IconListChecks,
  IconLogOut,
  IconMap,
  IconMerge,
  IconMonitor,
  IconMoon,
  IconMore,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSun,
  IconTree,
  IconUsers,
  Logo,
} from "@/components/icons";
import { toggleNotebook, useNotebookOpen } from "@/components/Notebook";
import { buttonClass } from "@/components/ui";
import { useTheme, type Theme } from "@/lib/theme";
import { useKeyboardOpen, useScrolledPast } from "@/lib/use-media";

/*
 * L'interface mobile (sous 1024 px) : une barre contextuelle en haut, une barre
 * d'onglets à portée de pouce en bas, et un tiroir « Plus » pour le reste.
 * Les pages y ajoutent leur titre et leurs actions par des portails.
 */

const TITLE_SLOT = "mobile-title-slot";
const ACTIONS_SLOT = "mobile-actions-slot";

const subscribeNoop = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/** Place un titre ou des actions dans la barre mobile depuis n'importe quelle page. */
export function MobileBar({ title, actions }: { title?: ReactNode; actions?: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return null;
  const titleSlot = document.getElementById(TITLE_SLOT);
  const actionsSlot = document.getElementById(ACTIONS_SLOT);
  return (
    <>
      {title && titleSlot && createPortal(title, titleSlot)}
      {actions && actionsSlot && createPortal(actions, actionsSlot)}
    </>
  );
}

/** Bouton d'action flottant, au-dessus de la barre d'onglets (téléphone et tablette). */
export function MobileFab({
  href,
  onClick,
  label,
  icon = <IconPlus size={22} />,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  icon?: ReactNode;
}) {
  const keyboard = useKeyboardOpen();
  if (keyboard) return null;
  const className =
    "fixed right-4 z-30 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-pop transition-transform active:scale-95 lg:hidden bottom-[calc(4.5rem+env(safe-area-inset-bottom))]";
  return href ? (
    <Link href={href} aria-label={label} title={label} className={className}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={className}>
      {icon}
    </button>
  );
}

type Section = { href: string; title: string; parent?: string };

/** Titre et page parente selon l'adresse. */
function sectionOf(pathname: string, base: string, profileName: string): Section {
  const rest = pathname.slice(base.length);
  if (rest === "" || rest === "/") return { href: base, title: profileName };
  if (rest === "/personnes/nouvelle") return { href: pathname, title: "Nouvelle fiche", parent: `${base}/personnes` };
  if (/^\/personnes\/\d+/.test(rest)) return { href: pathname, title: "Fiche", parent: `${base}/personnes` };
  const titles: Record<string, string> = {
    "/personnes": "Personnes",
    "/arbre": "Arbre",
    "/carte": "Carte",
    "/taches": "Tâches",
    "/parente": "Parenté",
    "/statistiques": "Statistiques",
    "/reglages": "Réglages",
  };
  const key = Object.keys(titles).find((k) => rest === k || rest.startsWith(`${k}/`));
  return { href: pathname, title: key ? titles[key] : profileName };
}

export function MobileTopBar({
  base,
  pathname,
  profileName,
  fullBleed,
  onSearch,
}: {
  base: string;
  pathname: string;
  profileName: string;
  fullBleed: boolean;
  onSearch: () => void;
}) {
  const section = sectionOf(pathname, base, profileName);
  // Le grand titre de la page fait foi ; celui de la barre apparaît quand il sort de l'écran.
  const scrolled = useScrolledPast(56);
  const showTitle = fullBleed || scrolled || Boolean(section.parent);

  return (
    <header className="pt-safe sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-12 items-center gap-1 px-2">
        {section.parent ? (
          <Link href={section.parent} className={buttonClass("quiet", "-ml-0.5 gap-1 px-2", "md")} aria-label="Retour">
            <IconArrowLeft size={18} />
          </Link>
        ) : (
          <Link href={base} className="flex size-10 shrink-0 items-center justify-center" aria-label="Accueil du profil">
            <Logo size={24} className="text-accent" />
          </Link>
        )}

        <div
          className={`min-w-0 flex-1 truncate px-1 text-[15px] font-semibold transition-opacity duration-200 [&:has(#mobile-title-slot:not(:empty))_.default-title]:hidden ${
            showTitle ? "opacity-100" : "opacity-0"
          }`}
        >
          <span id={TITLE_SLOT} className="block truncate" />
          <span className="default-title block truncate">{section.title}</span>
        </div>

        <div id={ACTIONS_SLOT} className="flex items-center" />
        <NotebookButton />
        <button type="button" onClick={onSearch} className={buttonClass("quiet", "", "icon")} aria-label="Rechercher">
          <IconSearch size={19} />
        </button>
      </div>
    </header>
  );
}

function NotebookButton() {
  const open = useNotebookOpen();
  return (
    <button
      type="button"
      onClick={toggleNotebook}
      aria-pressed={open}
      className={buttonClass("quiet", open ? "text-accent-text" : "", "icon")}
      aria-label={open ? "Fermer le carnet" : "Ouvrir le carnet"}
    >
      <IconBookOpen size={19} />
    </button>
  );
}

const THEMES: [Theme, ReactNode, string][] = [
  ["light", <IconSun key="l" size={15} />, "Clair"],
  ["dark", <IconMoon key="d" size={15} />, "Sombre"],
  ["system", <IconMonitor key="s" size={15} />, "Auto"],
];

export function MobileTabBar({
  base,
  pathname,
  openTasks,
  profiles,
  slug,
}: {
  base: string;
  pathname: string;
  openTasks: number;
  profiles: { slug: string; name: string }[];
  slug: string;
}) {
  const keyboard = useKeyboardOpen();
  const [moreOpen, setMoreOpen] = useState(false);
  const { theme, setTheme, mounted } = useTheme();

  const tabs = [
    { href: base, label: "Accueil", icon: <IconHome size={22} />, exact: true },
    { href: `${base}/personnes`, label: "Personnes", icon: <IconUsers size={22} /> },
    { href: `${base}/arbre`, label: "Arbre", icon: <IconTree size={22} /> },
    { href: `${base}/taches`, label: "Tâches", icon: <IconListChecks size={22} />, badge: openTasks },
  ];
  const more = [
    { href: `${base}/carte`, label: "Carte", icon: <IconMap size={20} /> },
    { href: `${base}/parente`, label: "Parenté", icon: <IconMerge size={20} /> },
    { href: `${base}/statistiques`, label: "Statistiques", icon: <IconChart size={20} /> },
    { href: `${base}/reglages`, label: "Réglages", icon: <IconSettings size={20} /> },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = more.some((m) => active(m.href));

  const tabClass = (on: boolean) =>
    `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
      on ? "text-accent-text" : "text-fg-subtle active:text-fg"
    }`;

  return (
    <>
      {/* Masquée pendant la saisie : le clavier a besoin de la place. */}
      <nav
        aria-label="Navigation principale"
        className={`pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl transition-transform duration-200 lg:hidden ${
          keyboard ? "translate-y-full" : ""
        }`}
      >
        <div className="flex h-14">
          {tabs.map((t) => {
            const on = active(t.href, t.exact);
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={tabClass(on)}>
                <span className="relative">
                  {t.icon}
                  {t.badge ? (
                    <span className="num absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                      {t.badge > 99 ? "99+" : t.badge}
                    </span>
                  ) : null}
                </span>
                {t.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className={tabClass(moreActive)} aria-haspopup="dialog">
            <IconMore size={22} />
            Plus
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} size="sm" title="Plus">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2">
            {more.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMoreOpen(false)}
                className={`flex h-20 flex-col items-start justify-between rounded-xl border p-3 text-ui font-medium transition-colors active:bg-surface-2 ${
                  active(m.href) ? "border-accent/50 bg-accent-soft text-accent-text" : "border-border bg-surface-2/40"
                }`}
              >
                <span className={active(m.href) ? "" : "text-fg-muted"}>{m.icon}</span>
                {m.label}
              </Link>
            ))}
          </div>

          <Link
            href={`${base}/personnes/nouvelle`}
            onClick={() => setMoreOpen(false)}
            className={buttonClass("primary", "h-11 w-full justify-center")}
          >
            <IconPlus size={16} />
            Nouvelle fiche
          </Link>

          <div>
            <p className="label">Apparence</p>
            <div className="grid grid-cols-3 rounded-xl border border-border bg-surface-2/60 p-1" role="radiogroup" aria-label="Thème">
              {THEMES.map(([value, icon, label]) => {
                const on = mounted && theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTheme(value)}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-ui transition-colors ${
                      on ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted"
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="label">Profils</p>
            <ul className="overflow-hidden rounded-xl border border-border">
              {profiles.map((p) => (
                <li key={p.slug} className="border-b border-border last:border-0">
                  <Link
                    href={`/p/${p.slug}`}
                    onClick={() => setMoreOpen(false)}
                    className="flex h-11 items-center gap-3 px-3 text-ui active:bg-surface-2"
                  >
                    <Logo size={20} className="text-accent" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.slug === slug && <IconCheck size={15} className="text-accent-text" />}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/" onClick={() => setMoreOpen(false)} className="flex h-11 items-center px-3 text-ui text-fg-muted active:bg-surface-2">
                  Tous les profils
                </Link>
              </li>
            </ul>
          </div>

          <form action={logoutAction}>
            <button type="submit" className={buttonClass("secondary", "h-11 w-full justify-center")}>
              <IconLogOut size={15} />
              Se déconnecter
            </button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
