"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { logoutAction } from "@/app/login/actions";
import { CommandPalette, type GlobalSearchItem } from "@/components/CommandPalette";
import {
  IconBookOpen,
  IconChart,
  IconCheck,
  IconChevronsUpDown,
  IconHome,
  IconLayers,
  IconListChecks,
  IconLogOut,
  IconMap,
  IconMerge,
  IconMonitor,
  IconMoon,
  IconPanelLeft,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSun,
  IconTree,
  IconUsers,
  Logo,
} from "@/components/icons";
import { Menu, MenuLabel, MenuLink, MenuSeparator } from "@/components/Menu";
import { MobileTabBar, MobileTopBar } from "@/components/MobileChrome";
import { Notebook, toggleNotebook, useNotebookOpen } from "@/components/Notebook";
import { buttonClass, Kbd } from "@/components/ui";
import { useTheme, type Theme } from "@/lib/theme";

/* ------------------------------------------------------------ palette ctx */

const PaletteContext = createContext<{ open: () => void } | null>(null);

/** Ouvre la palette de commandes depuis n'importe quel composant de la page. */
export function useCommandPalette() {
  return useContext(PaletteContext);
}

const subscribeNoop = () => () => {};

/** « ⌘ » sur Mac, « Ctrl » ailleurs. */
export function useModKey() {
  return useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

/* ---------------------------------------------------------------- shell */

type NavItem = { href: string; label: string; icon: ReactNode; badge?: number; exact?: boolean };

const SIDEBAR_COOKIE = "ariane-sidebar";

export function AppShell({
  slug,
  profileId,
  profileName,
  profiles,
  searchItems,
  personCount,
  openTasks,
  initialCollapsed,
  notebook,
  children,
}: {
  slug: string;
  profileId: number;
  profileName: string;
  profiles: { slug: string; name: string }[];
  searchItems: GlobalSearchItem[];
  personCount: number;
  openTasks: number;
  initialCollapsed: boolean;
  notebook: { content: string; updated_at: string | null };
  children: ReactNode;
}) {
  const pathname = usePathname();
  // L'arbre occupe toute la surface disponible, sans marges ni largeur maximale.
  const fullBleed = /^\/p\/[^/]+\/arbre$/.test(pathname);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const key = e.key.toLowerCase();
      const modK = (e.ctrlKey || e.metaKey) && !e.altKey && key === "k";
      const altK = e.altKey && !e.ctrlKey && !e.metaKey && key === "k";
      const slash = e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (modK || altK || slash) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      // Ctrl . (⌘ . sur Mac) : ouvrir ou fermer le carnet, même en cours de saisie.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === ".") {
        e.preventDefault();
        toggleNotebook();
      }
      if ((e.ctrlKey || e.metaKey) && key === "b" && !typing) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // toggleCollapsed ne lit que l'état courant via le setter.
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  const base = `/p/${slug}`;
  const nav: NavItem[] = [
    { href: base, label: "Accueil", icon: <IconHome />, exact: true },
    { href: `${base}/personnes`, label: "Personnes", icon: <IconUsers />, badge: personCount },
    { href: `${base}/arbre`, label: "Arbre", icon: <IconTree /> },
    { href: `${base}/carte`, label: "Carte", icon: <IconMap /> },
    { href: `${base}/taches`, label: "Tâches", icon: <IconListChecks />, badge: openTasks },
  ];
  const tools: NavItem[] = [
    { href: `${base}/parente`, label: "Parenté", icon: <IconMerge /> },
    { href: `${base}/statistiques`, label: "Statistiques", icon: <IconChart /> },
  ];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const sidebar = (mode: "desktop") => {
    const compact = mode === "desktop" && collapsed;
    return (
      <div className="flex h-full flex-col gap-1 px-2.5 pb-2.5 pt-2.5">
        {/* Profil */}
        <div className={`flex items-center gap-1 ${compact ? "flex-col" : ""}`}>
          <ProfileSwitcher
            slug={slug}
            profileName={profileName}
            profiles={profiles}
            compact={compact}
          />
        </div>

        {/* Recherche et création */}
        <div className={`mt-2 flex gap-1 ${compact ? "flex-col" : ""}`}>
          <button
            type="button"
            onClick={openPalette}
            title="Rechercher (Ctrl K)"
            className={`flex h-8 items-center gap-2 rounded-lg border border-border bg-surface text-ui text-fg-subtle shadow-xs transition-colors hover:border-border-strong hover:text-fg-muted ${
              compact ? "w-full justify-center" : "min-w-0 flex-1 px-2.5"
            }`}
          >
            <IconSearch size={15} />
            {!compact && (
              <>
                <span className="flex-1 truncate text-left">Rechercher…</span>
                <ModHint />
              </>
            )}
          </button>
          <Link
            href={`${base}/personnes/nouvelle`}
            title="Nouvelle fiche"
            aria-label="Nouvelle fiche"
            className={buttonClass("secondary", compact ? "w-full" : "", "icon")}
          >
            <IconPlus size={16} />
          </Link>
        </div>

        <nav className="mt-3 flex flex-col gap-px" aria-label="Navigation principale">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} compact={compact} />
          ))}
        </nav>

        <div className={`mt-4 ${compact ? "border-t border-border pt-3" : ""}`}>
          {!compact && <div className="px-2.5 pb-1 text-2xs font-medium text-fg-subtle">Outils</div>}
          <nav className="flex flex-col gap-px" aria-label="Outils">
            {tools.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item)} compact={compact} />
            ))}
            <NotebookToggle compact={compact} />
          </nav>
        </div>

        <div className="mt-auto flex flex-col gap-px pt-3">
          <NavLink
            item={{ href: `${base}/reglages`, label: "Réglages", icon: <IconSettings /> }}
            active={pathname.startsWith(`${base}/reglages`)}
            compact={compact}
          />
          {/* Le bouton de repli reste au même endroit (en bas à gauche) dans les deux états. */}
          <div className={`mt-2 flex items-center gap-1 ${compact ? "flex-col-reverse" : "justify-between px-1"}`}>
            {mode === "desktop" && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className={buttonClass("quiet", "text-fg-subtle", "icon-sm")}
                title={`${compact ? "Déplier" : "Replier"} la barre latérale (Ctrl B)`}
                aria-label={`${compact ? "Déplier" : "Replier"} la barre latérale`}
                aria-expanded={!compact}
              >
                <IconPanelLeft size={16} />
              </button>
            )}
            <ThemeSwitch compact={compact} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <PaletteContext.Provider value={{ open: openPalette }}>
      <div className="flex min-h-dvh">
        <aside
          className={`sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 ease-out lg:block ${
            collapsed ? "w-[3.75rem]" : "w-60"
          }`}
        >
          {sidebar("desktop")}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar
            base={base}
            pathname={pathname}
            profileName={profileName}
            fullBleed={fullBleed}
            onSearch={openPalette}
          />

          {/* Sur mobile, la place de la barre d'onglets est réservée en bas. */}
          <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:py-2 lg:pr-2">
            {fullBleed ? (
              <div className="h-[calc(100dvh-3rem-3.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-hidden bg-canvas lg:h-[calc(100dvh-1rem)] lg:rounded-xl lg:border lg:border-border lg:shadow-soft">
                {children}
              </div>
            ) : (
              <div className="min-h-full bg-canvas lg:min-h-[calc(100dvh-1rem)] lg:rounded-xl lg:border lg:border-border lg:shadow-soft">
                <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:py-8">{children}</div>
              </div>
            )}
          </main>
        </div>

        <Notebook profileId={profileId} initialContent={notebook.content} initialUpdatedAt={notebook.updated_at} />
      </div>

      <MobileTabBar base={base} pathname={pathname} openTasks={openTasks} profiles={profiles} slug={slug} />

      <CommandPalette
        slug={slug}
        profileId={profileId}
        items={searchItems}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </PaletteContext.Provider>
  );
}

/** Entrée de la barre latérale : ouvre le carnet à côté de la page en cours. */
function NotebookToggle({ compact }: { compact: boolean }) {
  const open = useNotebookOpen();
  return (
    <button
      type="button"
      onClick={toggleNotebook}
      aria-pressed={open}
      title={compact ? "Carnet (Ctrl .)" : "Ouvrir ou fermer le carnet (Ctrl .)"}
      className={`group flex h-8 items-center gap-2.5 rounded-lg text-ui transition-colors ${compact ? "justify-center" : "px-2.5"} ${
        open ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:bg-surface-3/60 hover:text-fg"
      }`}
    >
      <span className={`[&>svg]:size-4 ${open ? "text-accent-text" : "text-fg-subtle group-hover:text-fg-muted"}`}>
        <IconBookOpen />
      </span>
      {!compact && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">Carnet</span>
          <span className="text-2xs text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">Ctrl .</span>
        </>
      )}
    </button>
  );
}

function ModHint() {
  const mod = useModKey();
  return <Kbd className="px-1.5">{mod === "⌘" ? "⌘K" : "Ctrl K"}</Kbd>;
}

function NavLink({ item, active, compact }: { item: NavItem; active: boolean; compact: boolean }) {
  return (
    <Link
      href={item.href}
      title={compact ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group flex h-8 items-center gap-2.5 rounded-lg text-ui transition-colors ${
        compact ? "justify-center" : "px-2.5"
      } ${
        active
          ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border"
          : "text-fg-muted hover:bg-surface-3/60 hover:text-fg"
      }`}
    >
      <span className={`[&>svg]:size-4 ${active ? "text-accent-text" : "text-fg-subtle group-hover:text-fg-muted"}`}>
        {item.icon}
      </span>
      {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!compact && item.badge ? (
        <span className="num text-2xs text-fg-subtle">{item.badge}</span>
      ) : null}
    </Link>
  );
}

function ProfileSwitcher({
  slug,
  profileName,
  profiles,
  compact,
}: {
  slug: string;
  profileName: string;
  profiles: { slug: string; name: string }[];
  compact: boolean;
}) {
  return (
    <Menu
      className={compact ? "" : "min-w-0 flex-1"}
      panelClassName="w-64"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          title={compact ? profileName : undefined}
          className={`flex h-9 items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-surface-3/60 ${
            compact ? "w-10 justify-center" : "w-full min-w-0 px-1.5"
          } ${props.open ? "bg-surface-3/60" : ""}`}
        >
          <Logo size={22} className="text-accent" />
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-semibold leading-tight">{profileName}</span>
                <span className="block text-2xs leading-tight text-fg-subtle">Ariane</span>
              </span>
              <IconChevronsUpDown size={14} className="text-fg-subtle" />
            </>
          )}
        </button>
      )}
    >
      <MenuLabel>Profils de recherche</MenuLabel>
      {profiles.map((p) => (
        <MenuLink key={p.slug} href={`/p/${p.slug}`} icon={p.slug === slug ? <IconCheck size={14} /> : <span />}>
          {p.name}
        </MenuLink>
      ))}
      <MenuSeparator />
      <MenuLink href="/" icon={<IconLayers size={14} />}>
        Tous les profils
      </MenuLink>
      <MenuLink href={`/p/${slug}/reglages`} icon={<IconSettings size={14} />}>
        Réglages du profil
      </MenuLink>
      <MenuSeparator />
      <form action={logoutAction}>
        <button
          type="submit"
          role="menuitem"
          tabIndex={-1}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-ui text-fg outline-none transition-colors hover:bg-surface-2 focus:bg-surface-2"
        >
          <span className="flex w-4 justify-center text-fg-subtle">
            <IconLogOut size={14} />
          </span>
          Se déconnecter
        </button>
      </form>
    </Menu>
  );
}

function ThemeSwitch({ compact }: { compact: boolean }) {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme();
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className={buttonClass("quiet", "text-fg-subtle", "icon-sm")}
        title={resolvedTheme === "dark" ? "Thème clair" : "Thème sombre"}
        aria-label="Changer de thème"
      >
        {mounted && resolvedTheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>
    );
  }
  const options: [Theme, ReactNode, string][] = [
    ["light", <IconSun key="l" size={14} />, "Clair"],
    ["dark", <IconMoon key="d" size={14} />, "Sombre"],
    ["system", <IconMonitor key="s" size={14} />, "Système"],
  ];
  return (
    <div className="flex items-center rounded-lg border border-border bg-surface-2/60 p-0.5" role="radiogroup" aria-label="Thème">
      {options.map(([value, icon, label]) => {
        const on = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex h-6 w-7 items-center justify-center rounded-md transition-colors ${
              on ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg"
            }`}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
