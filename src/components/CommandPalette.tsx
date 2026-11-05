"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { quickCreatePersonAction } from "@/app/actions";
import { toFormData } from "@/components/Dialog";
import {
  IconArrowRight,
  IconChart,
  IconCornerDownLeft,
  IconHome,
  IconLayers,
  IconListChecks,
  IconMap,
  IconMerge,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSun,
  IconTree,
  IconUserPlus,
  IconUsers,
  Spinner,
} from "@/components/icons";
import { Avatar, Kbd, StatusDot } from "@/components/ui";
import { readRecent } from "@/lib/recent";
import { searchList } from "@/lib/search";
import { useTheme } from "@/lib/theme";
import type { Kinship, Status } from "@/lib/types";

export type GlobalSearchItem = {
  id: number;
  name: string;
  givenNames?: string | null;
  surname?: string | null;
  sosa: number | null;
  kinship: Kinship | null;
  status: Status;
  occupation: string | null;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  deathPlace: string | null;
  percent: number;
};

type Command = {
  id: string;
  group: "Personnes" | "Récemment consultées" | "Aller à" | "Actions";
  label: ReactNode;
  keywords?: string;
  icon: ReactNode;
  hint?: ReactNode;
  run: () => void;
};

function commune(place: string | null) {
  return place?.split(",")[0]?.trim() ?? "";
}

/**
 * Palette de commandes (Ctrl K / ⌘ K / « / ») : trouver une fiche, changer de
 * page ou lancer une action sans quitter le clavier.
 */
export function CommandPalette({
  slug,
  profileId,
  items,
  open,
  onClose,
}: {
  slug: string;
  profileId: number;
  items: GlobalSearchItem[];
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Palette de commandes"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="dialog palette-dialog mx-auto mb-auto mt-[12vh] w-[calc(100%-2rem)] max-w-[640px] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-transparent"
    >
      {open && <PaletteBody slug={slug} profileId={profileId} items={items} onClose={onClose} />}
    </dialog>
  );
}

/** Contenu monté à chaque ouverture : la recherche repart toujours de zéro. */
function PaletteBody({
  slug,
  profileId,
  items,
  onClose,
}: {
  slug: string;
  profileId: number;
  items: GlobalSearchItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, startCreate] = useTransition();
  const { resolvedTheme, setTheme } = useTheme();
  const [recentIds] = useState<number[]>(() => readRecent(slug));

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const commands = useMemo<Command[]>(() => {
    const q = query.trim();
    const out: Command[] = [];

    const personCommand = (p: GlobalSearchItem, group: Command["group"]): Command => ({
      id: `p-${p.id}`,
      group,
      label: (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium">{p.name}</span>
          <span className="num shrink-0 text-xs text-fg-subtle">
            {p.birthYear ?? "?"} – {p.deathYear ?? "?"}
          </span>
          {(p.birthPlace || p.deathPlace) && (
            <span className="hidden truncate text-xs text-fg-subtle sm:inline">
              {commune(p.birthPlace ?? p.deathPlace)}
            </span>
          )}
        </span>
      ),
      icon: <Avatar seed={p.id} given={p.givenNames} surname={p.surname} size="sm" />,
      hint: (
        <span className="flex items-center gap-2">
          {p.sosa ? <span className="num text-2xs text-fg-subtle">#{p.sosa}</span> : null}
          <StatusDot status={p.status} className="size-1.5" />
          <span className="num w-8 text-right text-2xs text-fg-subtle">{p.percent}%</span>
        </span>
      ),
      run: () => go(`/p/${slug}/personnes/${p.id}`),
    });

    if (q) {
      const found = searchList(
        items,
        q,
        (p) => ({
          name: p.name,
          givenNames: p.givenNames,
          surname: p.surname,
          sosa: p.sosa,
          birthYear: p.birthYear,
          deathYear: p.deathYear,
          places: [p.birthPlace, p.deathPlace],
          extra: [p.occupation],
        }),
        8,
      );
      out.push(...found.map((p) => personCommand(p, "Personnes")));
    } else {
      const byId = new Map(items.map((p) => [p.id, p]));
      const recent = recentIds.map((id) => byId.get(id)).filter((p): p is GlobalSearchItem => !!p);
      out.push(...recent.slice(0, 5).map((p) => personCommand(p, "Récemment consultées")));
    }

    const pages: [string, string, ReactNode, string][] = [
      ["Accueil", `/p/${slug}`, <IconHome key="h" />, "tableau de bord"],
      ["Personnes", `/p/${slug}/personnes`, <IconUsers key="u" />, "fiches cartes liste"],
      ["Arbre", `/p/${slug}/arbre`, <IconTree key="t" />, "ascendance"],
      ["Carte", `/p/${slug}/carte`, <IconMap key="m" />, "lieux communes géographie"],
      ["Tâches", `/p/${slug}/taches`, <IconListChecks key="l" />, "liste pistes à faire"],
      ["Parenté", `/p/${slug}/parente`, <IconMerge key="g" />, "calculateur ancêtre commun"],
      ["Statistiques", `/p/${slug}/statistiques`, <IconChart key="c" />, "chiffres générations"],
      ["Réglages", `/p/${slug}/reglages`, <IconSettings key="s" />, "paramètres export thème"],
    ];
    const qn = q.toLowerCase();
    for (const [label, href, icon, kw] of pages) {
      if (!qn || `${label} ${kw}`.toLowerCase().includes(qn)) {
        out.push({ id: `nav-${href}`, group: "Aller à", label, icon, run: () => go(href) });
      }
    }

    if (q) {
      out.push({
        id: "search-all",
        group: "Actions",
        label: (
          <>
            Voir tous les résultats pour « <strong className="font-medium">{q}</strong> »
          </>
        ),
        icon: <IconSearch />,
        run: () => go(`/p/${slug}/personnes?q=${encodeURIComponent(q)}`),
      });
      out.push({
        id: "create",
        group: "Actions",
        label: (
          <>
            Créer la fiche « <strong className="font-medium">{q}</strong> »
          </>
        ),
        icon: <IconPlus />,
        run: () =>
          startCreate(async () => {
            await quickCreatePersonAction(toFormData({ slug, profileId, fullName: q }));
            onClose();
          }),
      });
    }
    const actions: [string, ReactNode, () => void, string][] = [
      ["Nouvelle fiche", <IconUserPlus key="n" />, () => go(`/p/${slug}/personnes/nouvelle`), "ajouter créer personne"],
      [
        resolvedTheme === "dark" ? "Passer en thème clair" : "Passer en thème sombre",
        resolvedTheme === "dark" ? <IconSun key="s" /> : <IconMoon key="m" />,
        () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
        "thème sombre clair apparence",
      ],
      ["Changer de profil", <IconLayers key="p" />, () => go("/"), "profils"],
    ];
    for (const [label, icon, run, kw] of actions) {
      if (!qn || `${label} ${kw}`.toLowerCase().includes(qn)) {
        out.push({ id: `act-${label}`, group: "Actions", label, icon, run });
      }
    }
    return out;
    // `go` ne dépend que de router et onClose, stables pour la session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items, recentIds, slug, profileId, resolvedTheme]);

  const safeActive = Math.min(active, Math.max(0, commands.length - 1));

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${safeActive}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  const grouped: [Command["group"], { cmd: Command; index: number }[]][] = [];
  commands.forEach((cmd, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last[0] === cmd.group) last[1].push({ cmd, index });
    else grouped.push([cmd.group, [{ cmd, index }]]);
  });

  return (
    <div className="flex max-h-[min(70vh,560px)] flex-col max-sm:h-full max-sm:max-h-none">
      <div className="flex items-center gap-3 border-b border-border px-4">
        {creating ? <Spinner size={16} className="text-fg-subtle" /> : <IconSearch size={17} className="text-fg-subtle" />}
        <input
          ref={input}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % Math.max(1, commands.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + commands.length) % Math.max(1, commands.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              commands[safeActive]?.run();
            }
          }}
          placeholder="Rechercher une personne, une commune, un Sosa, une page…"
          className="h-13 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-fg outline-none placeholder:text-fg-subtle"
          aria-controls="palette-list"
          aria-activedescendant={commands[safeActive] ? `cmd-${commands[safeActive].id}` : undefined}
        />
        <span className="[@media(pointer:coarse)]:hidden">
          <Kbd>Échap</Kbd>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="hidden shrink-0 text-ui font-medium text-accent-text [@media(pointer:coarse)]:inline"
        >
          Annuler
        </button>
      </div>

      <div ref={list} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
        {commands.length === 0 && (
          <p className="px-3 py-10 text-center text-ui text-fg-muted">Aucun résultat.</p>
        )}
        {grouped.map(([group, entries]) => (
          <div key={group} className="mb-1 last:mb-0">
            <div className="px-2.5 pb-1 pt-2 text-2xs font-medium text-fg-subtle">{group}</div>
            {entries.map(({ cmd, index }) => (
              <button
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                data-index={index}
                type="button"
                role="option"
                aria-selected={index === safeActive}
                onMouseMove={() => setActive(index)}
                onClick={() => cmd.run()}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-ui transition-colors ${
                  index === safeActive ? "bg-surface-2 text-fg" : "text-fg-muted"
                }`}
              >
                <span className="flex w-6 shrink-0 justify-center text-fg-subtle [&>svg]:size-4">{cmd.icon}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{cmd.label}</span>
                {cmd.hint}
                {index === safeActive && !cmd.hint && (
                  <IconArrowRight size={14} className="text-fg-subtle" />
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 border-t border-border bg-surface-2/50 px-4 py-2 text-2xs text-fg-subtle [@media(pointer:coarse)]:hidden">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> naviguer
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <IconCornerDownLeft size={10} />
          </Kbd>
          ouvrir
        </span>
        <span className="ml-auto hidden sm:inline">Astuce : tapez un Sosa (« 16 ») ou une année</span>
      </div>
    </div>
  );
}
