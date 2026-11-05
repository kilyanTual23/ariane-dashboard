"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { bulkDeletePersonsAction, bulkSetStatusAction } from "@/app/actions";
import { ConfirmButton, Dialog } from "@/components/Dialog";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowUpDown,
  IconBookmark,
  IconCheck,
  IconDownload,
  IconFilter,
  IconGrid,
  IconKanban,
  IconMore,
  IconPlus,
  IconRows,
  IconSearch,
  IconSquareCheck,
  IconStar,
  IconTrash,
  IconUsers,
  IconX,
  Spinner,
} from "@/components/icons";
import { Menu, MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/Menu";
import { MobileFab } from "@/components/MobileChrome";
import { PersonBoard } from "@/components/PersonBoard";
import { PersonCard, SlotStrip, type CardPerson } from "@/components/PersonCard";
import { errorMessage, useToast } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Avatar, buttonClass, EmptyState, Kbd, StatusDot } from "@/components/ui";
import { missingHint, shortPlace } from "@/lib/names";
import {
  BRANCHES,
  CENTURIES,
  countActiveFilters,
  DEFAULT_FILTERS,
  filtersCookie,
  filtersToParams,
  MISSING_FILTERS,
  SORTS,
  type FilterState,
  type SortKey,
  type ViewKey,
} from "@/lib/person-filters";
import { matches } from "@/lib/search";
import { useIsPhone } from "@/lib/use-media";
import { KINSHIPS, STATUSES, type Status } from "@/lib/types";

export type GridPerson = CardPerson & {
  spouse: string | null;
  marriageYear: number | null;
  deathPlace: string | null;
  /** Communes de naissance, de mariage et de décès. */
  communes: string[];
  generation: number | null;
  branch: "paternelle" | "maternelle" | null;
};

/** Nom de famille pour le tri : sans ponctuation de tête, « (LE) BARON » se range à L. */
function surnameKey(p: GridPerson) {
  return (p.surname ?? "").replace(/^[^\p{L}]+/u, "");
}

/** Première lettre du nom de famille, sans accent : la clé des regroupements A–Z. */
function initialOf(p: GridPerson) {
  const letter = surnameKey(p).normalize("NFD").match(/\p{L}/u)?.[0];
  return letter ? letter.toUpperCase() : "#";
}

const collator = new Intl.Collator("fr", { sensitivity: "base" });

/** Tri généalogique : NOM d'abord, puis prénoms ; les fiches sans nom à la fin. */
function compareBySurname(a: GridPerson, b: GridPerson) {
  const ka = surnameKey(a);
  const kb = surnameKey(b);
  if (!ka !== !kb) return ka ? -1 : 1;
  return collator.compare(ka, kb) || collator.compare(a.given ?? "", b.given ?? "");
}


type SavedView = { id: string; name: string; filters: FilterState };

const PRESETS: SavedView[] = [
  {
    id: "sosa-recherche",
    name: "Ancêtres directs en recherche",
    filters: { ...DEFAULT_FILTERS, status: "En recherche", sosaOnly: true, sort: "filled", desc: true },
  },
  {
    id: "sosa-bloques",
    name: "Ancêtres directs bloqués",
    filters: { ...DEFAULT_FILTERS, status: "Bloqué", sosaOnly: true, sort: "birth" },
  },
  {
    id: "sans-naissance",
    name: "Sans acte de naissance",
    filters: { ...DEFAULT_FILTERS, missing: "Acte de naissance" },
  },
  {
    id: "sans-mariage",
    name: "Sans acte de mariage",
    filters: { ...DEFAULT_FILTERS, missing: "Acte de mariage" },
  },
];

/** Les statuts proposés en onglets : « Complet » regroupe aussi les complètes avec lacunes. */
const STATUS_TABS: Status[] = ["Pas commencé", "En recherche", "Bloqué", "Complet"];

function statusMatches(filter: string, status: Status) {
  if (!filter) return true;
  if (filter === "Complet") return status === "Complet" || status === "Complet (lacunes)";
  return status === filter;
}

function passes(p: GridPerson, f: FilterState, ignoreStatus = false) {
  if (f.sosaOnly && !p.sosa) return false;
  if (!ignoreStatus && !statusMatches(f.status, p.status)) return false;
  if (f.kinship && (p.kinship ?? "") !== f.kinship) return false;
  if (f.missing && !p.missing.includes(f.missing)) return false;
  if (f.commune && !p.communes.includes(f.commune)) return false;
  if (f.century) {
    const c = Number(f.century);
    if (!p.birthYear) return false;
    const born = Math.floor(p.birthYear / 100) * 100;
    if (c === 1600 ? born > 1600 : born !== c) return false;
  }
  if (f.generation && String(p.generation ?? "") !== f.generation) return false;
  if (f.branch && p.branch !== f.branch) return false;
  return matches(
    {
      name: p.name,
      givenNames: p.given,
      surname: p.surname,
      sosa: p.sosa,
      birthYear: p.birthYear,
      deathYear: p.deathYear,
      marriageYear: p.marriageYear,
      places: [p.place, p.deathPlace],
      extra: [p.occupation, p.spouse],
    },
    f.query,
  );
}

function sortPeople(list: GridPerson[], sort: SortKey, desc: boolean) {
  const dir = desc ? -1 : 1;
  const value = (p: GridPerson): number => {
    switch (sort) {
      case "sosa":
        return p.sosa ?? Number.MAX_SAFE_INTEGER;
      case "birth":
        return p.birthYear ?? 9999;
      case "death":
        return p.deathYear ?? 9999;
      case "filled":
        return p.score / Math.max(1, p.total);
      case "status":
        return STATUSES.indexOf(p.status);
      default:
        return 0;
    }
  };
  return [...list].sort((a, b) => {
    if (sort === "name") return dir * compareBySurname(a, b);
    const va = value(a);
    const vb = value(b);
    return va === vb ? compareBySurname(a, b) : dir * (va - vb);
  });
}

function readCustomViews(slug: string): SavedView[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`ariane_cards_presets_${slug}`) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeCustomViews(slug: string, views: SavedView[]) {
  try {
    localStorage.setItem(`ariane_cards_presets_${slug}`, JSON.stringify(views));
  } catch {}
}

export function PersonExplorer({
  slug,
  profileId,
  people,
  initialFilters,
  initialView,
}: {
  slug: string;
  profileId: number;
  people: GridPerson[];
  initialFilters: FilterState;
  initialView: ViewKey;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [view, setView] = useState<ViewKey>(initialView);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [customViews, setCustomViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const narrow = useIsPhone();
  // Sur téléphone, le tableau par colonnes laisse place à la grille.
  const shownView: ViewKey = narrow && view === "tableau" ? "grille" : view;

  // Les liens internes (« voir les bloquées ») changent l'URL : on suit.
  const initialKey = JSON.stringify(initialFilters);
  const [lastInitial, setLastInitial] = useState(initialKey);
  if (initialKey !== lastInitial) {
    setLastInitial(initialKey);
    setFilters(initialFilters);
  }

  const update = (patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setActiveViewId(null);
  };

  // Mémorisation : URL partageable + cookie relu par le serveur au prochain passage.
  useEffect(() => {
    const qs = filtersToParams(filters, view).toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    const stored = encodeURIComponent(JSON.stringify({ f: filters, v: view }));
    document.cookie = `${filtersCookie(slug)}=${stored}; path=/; max-age=31536000; samesite=lax`;
  }, [filters, view, slug]);

  const statusCounts = useMemo(() => {
    const base = people.filter((p) => passes(p, filters, true));
    const counts = new Map<string, number>([["", base.length]]);
    for (const s of STATUS_TABS) counts.set(s, base.filter((p) => statusMatches(s, p.status)).length);
    return counts;
  }, [people, filters]);

  const filtered = useMemo(
    () =>
      sortPeople(
        people.filter((p) => passes(p, filters, shownView === "tableau")),
        filters.sort,
        filters.desc,
      ),
    [people, filters, shownView],
  );

  // Valeurs proposées dans les filtres, tirées des fiches elles-mêmes.
  const communeOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of people) for (const c of p.communes) count.set(c, (count.get(c) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));
  }, [people]);
  const maxGeneration = useMemo(() => Math.max(0, ...people.map((p) => p.generation ?? 0)), [people]);

  // Trié par nom : regroupement par initiale, avec un index pour sauter d'une lettre à l'autre.
  const groups = useMemo(() => {
    if (filters.sort !== "name") return [{ letter: null as string | null, people: filtered }];
    // Une seule section par lettre, dans l'ordre du tri.
    const byLetter = new Map<string, GridPerson[]>();
    for (const p of filtered) {
      const letter = initialOf(p);
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), p]);
    }
    return [...byLetter.entries()].map(([letter, people]) => ({ letter: letter as string | null, people }));
  }, [filtered, filters.sort]);
  const grouped = groups.length > 1 || groups[0]?.letter !== null;

  const activeFilterCount = countActiveFilters(filters);
  const anyFilter = Boolean(filters.query.trim() || filters.status || activeFilterCount);

  const reset = () => {
    setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, desc: f.desc }));
    setActiveViewId(null);
  };

  const applyView = (v: SavedView) => {
    setFilters({ ...DEFAULT_FILTERS, ...v.filters });
    setActiveViewId(v.id);
  };

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const bulkStatus = (status: Status) => {
    const ids = Array.from(selected);
    startTransition(async () => {
      try {
        const res = await bulkSetStatusAction({ slug, profileId, personIds: ids, status });
        if (!res.ok) throw new Error(res.error);
        toast.success(`${ids.length} fiche${ids.length > 1 ? "s" : ""} passée${ids.length > 1 ? "s" : ""} en « ${status} »`);
        exitSelection();
        router.refresh();
      } catch (err) {
        toast.error("Mise à jour impossible", errorMessage(err));
      }
    });
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    const res = await bulkDeletePersonsAction({ slug, profileId, personIds: ids });
    if (!res.ok) throw new Error(res.error);
    toast.success(`${ids.length} fiche${ids.length > 1 ? "s" : ""} supprimée${ids.length > 1 ? "s" : ""}`);
    exitSelection();
    router.refresh();
  };

  const exportCsv = () => {
    const header = [
      "Nom", "Sosa", "Statut", "Lien", "Naissance", "Lieu de naissance", "Décès", "Lieu de décès",
      "Conjoint", "Mariage", "Métier", "Cases remplies", "Manquant",
    ];
    const lines = filtered.map((p) =>
      [
        p.name, p.sosa ?? "", p.status, p.kinship ?? "", p.birthYear ?? "", p.place ?? "",
        p.deathYear ?? "", p.deathPlace ?? "", p.spouse ?? "", p.marriageYear ?? "", p.occupation ?? "",
        `${p.score}/${p.total}`, p.missing.join(" / "),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-personnes.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} fiches exportées en CSV`);
  };

  const sortLabel = SORTS.find((s) => s.key === filters.sort)?.label ?? "Nom";
  const activeView = [...PRESETS, ...customViews].find((v) => v.id === activeViewId);

  // Le panneau de filtres : menu déroulant sur ordinateur, tiroir sur téléphone.
  const filterPanel = (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-3 text-ui">
        <span className="flex items-center gap-2">
          <IconStar size={14} className="text-fg-subtle" />
          Ancêtres directs (Sosa) uniquement
        </span>
        <Toggle checked={filters.sosaOnly} onChange={(v) => update({ sosaOnly: v })} />
      </label>
      <label className="block">
        <span className="label">Il manque</span>
        <select className="field" value={filters.missing} onChange={(e) => update({ missing: e.target.value })}>
          <option value="">Peu importe</option>
          {MISSING_FILTERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Commune</span>
        <select className="field" value={filters.commune} onChange={(e) => update({ commune: e.target.value })}>
          <option value="">Toutes</option>
          {communeOptions.map(([c, n]) => (
            <option key={c} value={c}>
              {c} ({n})
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Naissance</span>
          <select className="field" value={filters.century} onChange={(e) => update({ century: e.target.value })}>
            <option value="">Toute époque</option>
            {CENTURIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Génération</span>
          <select
            className="field"
            value={filters.generation}
            onChange={(e) => update({ generation: e.target.value })}
            disabled={!maxGeneration}
          >
            <option value="">Toutes</option>
            {Array.from({ length: maxGeneration }, (_, i) => i + 1).map((g) => (
              <option key={g} value={String(g)}>
                G{g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Branche</span>
        <select
          className="field"
          value={filters.branch}
          onChange={(e) => update({ branch: e.target.value })}
          disabled={!maxGeneration}
        >
          <option value="">Les deux</option>
          {BRANCHES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Lien de parenté</span>
        <select className="field" value={filters.kinship} onChange={(e) => update({ kinship: e.target.value })}>
          <option value="">Tous</option>
          {KINSHIPS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() =>
            update({ sosaOnly: false, missing: "", kinship: "", commune: "", century: "", generation: "", branch: "" })
          }
          className={buttonClass("quiet", "self-start -ml-1", "sm")}
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------- barre d'outils */}
      <div className="flex items-center gap-2 max-sm:sticky max-sm:top-[calc(3rem+env(safe-area-inset-top))] max-sm:z-20 max-sm:-mx-4 max-sm:bg-canvas/90 max-sm:px-4 max-sm:py-2 max-sm:backdrop-blur-xl sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
          <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={searchRef}
            className="field pl-8 pr-8"
            placeholder={narrow ? "Rechercher…" : "Nom, lieu, métier, année, Sosa…"}
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filters.query) {
                e.stopPropagation();
                update({ query: "" });
              }
            }}
            aria-label="Filtrer les fiches"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => {
                update({ query: "" });
                searchRef.current?.focus();
              }}
              aria-label="Effacer la recherche"
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <IconX size={13} />
            </button>
          )}
        </div>

        {narrow ? (
          <>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={buttonClass("secondary", "relative size-10", "icon")}
              aria-label="Filtres"
            >
              <IconFilter size={16} />
              {activeFilterCount > 0 && (
                <span className="num absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] text-accent-fg">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <Dialog
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              title="Filtres"
              autoFocusField={false}
              footer={
                <button type="button" onClick={() => setFiltersOpen(false)} className={buttonClass("primary", "h-11 w-full justify-center")}>
                  Voir {filtered.length} fiche{filtered.length > 1 ? "s" : ""}
                </button>
              }
            >
              {filterPanel}
            </Dialog>
          </>
        ) : (
          <Popover
            panelClassName="w-72 p-3"
            trigger={(props) => (
              <button type="button" {...props} className={buttonClass("secondary", props.open ? "bg-surface-2" : "")}>
                <IconFilter size={14} />
                Filtres
                {activeFilterCount > 0 && (
                  <span className="num flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] text-accent-fg">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          >
            {filterPanel}
          </Popover>
        )}

        <Menu
          panelClassName="w-64"
          trigger={(props) => (
            <button
              type="button"
              {...props}
              onClick={() => {
                if (!props["aria-expanded"]) setCustomViews(readCustomViews(slug));
                props.onClick();
              }}
              className={buttonClass("secondary", "max-w-56 max-sm:size-10 max-sm:justify-center max-sm:px-0")}
              aria-label="Vues enregistrées"
            >
              <IconBookmark size={14} />
              <span className="truncate max-sm:hidden">{activeView ? activeView.name : "Vues"}</span>
            </button>
          )}
        >
          <MenuLabel>Vues proposées</MenuLabel>
          {PRESETS.map((v) => (
            <MenuItem key={v.id} onSelect={() => applyView(v)} checked={activeViewId === v.id}>
              {v.name}
            </MenuItem>
          ))}
          {customViews.length > 0 && (
            <>
              <MenuSeparator />
              <MenuLabel>Mes vues</MenuLabel>
              {customViews.map((v) => (
                <MenuItem key={v.id} onSelect={() => applyView(v)} checked={activeViewId === v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </>
          )}
          <MenuSeparator />
          <MenuItem icon={<IconPlus size={14} />} onSelect={() => setSaveOpen(true)} disabled={!anyFilter}>
            Enregistrer les filtres actuels…
          </MenuItem>
          {activeView && customViews.some((v) => v.id === activeView.id) && (
            <MenuItem
              danger
              icon={<IconTrash size={14} />}
              onSelect={() => {
                const next = customViews.filter((v) => v.id !== activeView.id);
                writeCustomViews(slug, next);
                setCustomViews(next);
                setActiveViewId(null);
                toast.success(`Vue « ${activeView.name} » supprimée`);
              }}
            >
              Supprimer « {activeView.name} »
            </MenuItem>
          )}
        </Menu>

        {filtered.length !== people.length && (
          <span className="num hidden text-xs text-fg-subtle md:inline">
            {filtered.length} sur {people.length}
          </span>
        )}

        <div className="flex items-center gap-2 sm:ml-auto">
          <Menu
            align="end"
            panelClassName="w-56"
            trigger={(props) => (
              <button
                type="button"
                {...props}
                className={buttonClass("quiet", "max-sm:size-10 max-sm:justify-center max-sm:px-0")}
                title="Trier"
                aria-label="Trier"
              >
                <IconArrowUpDown size={14} />
                <span className="hidden sm:inline">{sortLabel}</span>
              </button>
            )}
          >
            <MenuLabel>Trier par</MenuLabel>
            {SORTS.map((s) => (
              <MenuItem
                key={s.key}
                checked={filters.sort === s.key}
                onSelect={() => update({ sort: s.key, desc: Boolean(s.defaultDesc) })}
              >
                {s.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              icon={filters.desc ? <IconArrowDown size={14} /> : <IconArrowUp size={14} />}
              onSelect={() => update({ desc: !filters.desc })}
            >
              {filters.desc ? "Ordre décroissant" : "Ordre croissant"}
            </MenuItem>
          </Menu>

          {!narrow && <ViewSwitch view={shownView} onChange={setView} narrow={narrow} />}

          <Menu
            align="end"
            className="max-sm:hidden"
            trigger={(props) => (
              <button type="button" {...props} className={buttonClass("secondary", "", "icon")} aria-label="Plus d’actions">
                <IconMore size={16} />
              </button>
            )}
          >
            <MenuItem
              icon={<IconSquareCheck size={14} />}
              onSelect={() => (selecting ? exitSelection() : setSelecting(true))}
              disabled={shownView === "tableau"}
            >
              {selecting ? "Quitter la sélection" : "Sélectionner des fiches"}
            </MenuItem>
            <MenuItem icon={<IconDownload size={14} />} onSelect={exportCsv} hint={<span className="num">{filtered.length}</span>}>
              Exporter en CSV
            </MenuItem>
          </Menu>

          <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary", "max-lg:hidden")}>
            <IconPlus size={15} />
            Nouvelle fiche
          </Link>
        </div>
      </div>

      {/* --------------------------------------------------- onglets statut */}
      {shownView !== "tableau" && (
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
          <StatusTab active={!filters.status} onClick={() => update({ status: "" })} count={statusCounts.get("")}>
            Toutes
          </StatusTab>
          {STATUS_TABS.map((s) => (
            <StatusTab
              key={s}
              active={filters.status === s}
              onClick={() => update({ status: filters.status === s ? "" : s })}
              count={statusCounts.get(s)}
              status={s}
            >
              {s === "Complet" ? "Complètes" : s}
            </StatusTab>
          ))}
        </div>
      )}

      {/* ------------------------------------------------- filtres actifs */}
      {(activeFilterCount > 0 || filters.query.trim()) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.query.trim() && (
            <FilterChip onRemove={() => update({ query: "" })}>« {filters.query.trim()} »</FilterChip>
          )}
          {filters.sosaOnly && <FilterChip onRemove={() => update({ sosaOnly: false })}>Sosa uniquement</FilterChip>}
          {filters.missing && (
            <FilterChip onRemove={() => update({ missing: "" })}>Sans {filters.missing.toLowerCase()}</FilterChip>
          )}
          {filters.commune && <FilterChip onRemove={() => update({ commune: "" })}>{filters.commune}</FilterChip>}
          {filters.century && (
            <FilterChip onRemove={() => update({ century: "" })}>
              Né·e au {CENTURIES.find((c) => c.value === filters.century)?.label ?? filters.century}
            </FilterChip>
          )}
          {filters.generation && (
            <FilterChip onRemove={() => update({ generation: "" })}>Génération G{filters.generation}</FilterChip>
          )}
          {filters.branch && (
            <FilterChip onRemove={() => update({ branch: "" })}>
              {BRANCHES.find((b) => b.value === filters.branch)?.label ?? filters.branch}
            </FilterChip>
          )}
          {filters.kinship && <FilterChip onRemove={() => update({ kinship: "" })}>Lien : {filters.kinship}</FilterChip>}
          <button type="button" onClick={reset} className="ml-1 text-xs text-fg-subtle underline-offset-4 hover:text-fg hover:underline">
            Tout effacer
          </button>
        </div>
      )}

      {/* ------------------------------------------------------- résultats */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={people.length ? <IconSearch size={18} /> : <IconUsers size={18} />}
          title={people.length ? "Aucune fiche ne correspond" : "Aucune fiche pour l’instant"}
          action={
            people.length ? (
              <button type="button" onClick={reset} className={buttonClass("secondary")}>
                Effacer les filtres
              </button>
            ) : (
              <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary")}>
                <IconPlus size={15} />
                Créer la première fiche
              </Link>
            )
          }
        >
          {people.length
            ? "Essayez un autre mot, ou retirez un filtre."
            : "Une fiche par personne : on commence par un nom, le reste se remplit au fil des trouvailles."}
        </EmptyState>
      ) : narrow ? (
        <MobilePersonList slug={slug} groups={groups} />
      ) : shownView === "tableau" ? (
        <PersonBoard slug={slug} people={filtered} />
      ) : shownView === "liste" ? (
        <PersonTable
          slug={slug}
          people={filtered}
          groups={grouped ? groups : null}
          sort={filters.sort}
          desc={filters.desc}
          onSort={(key) =>
            update(
              filters.sort === key
                ? { desc: !filters.desc }
                : { sort: key, desc: Boolean(SORTS.find((s) => s.key === key)?.defaultDesc) },
            )
          }
          selecting={selecting}
          selected={selected}
          onToggle={toggleSelect}
          onToggleAll={() =>
            setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))))
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped && !narrow && <LetterIndex groups={groups} />}
          {groups.map((group) => (
            <section key={group.letter ?? "all"} aria-labelledby={group.letter ? `lettre-${group.letter}` : undefined}>
              {group.letter && <LetterHeading letter={group.letter} count={group.people.length} />}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {group.people.map((person) => (
                  <PersonCard
                    key={person.id}
                    slug={slug}
                    person={person}
                    selectable={selecting}
                    selected={selected.has(person.id)}
                    onToggleSelect={selecting ? toggleSelect : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* --------------------------------------------- actions groupées */}
      {selecting && (
        <div className="pointer-events-none sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:bottom-4">
          <div className="pointer-events-auto flex animate-slide-up flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1.5 pl-3 shadow-pop">
            <span className="num mr-1 text-ui">
              <strong className="font-semibold">{selected.size}</strong>
              <span className="text-fg-muted"> sélectionnée{selected.size > 1 ? "s" : ""}</span>
            </span>
            <button
              type="button"
              onClick={() =>
                setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))))
              }
              className={buttonClass("quiet", "", "sm")}
            >
              {selected.size === filtered.length ? "Tout désélectionner" : `Tout (${filtered.length})`}
            </button>
            <span className="mx-0.5 h-5 w-px bg-border" />
            <Menu
              side="top"
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  disabled={!selected.size || pending}
                  className={buttonClass("secondary", "", "sm")}
                >
                  {pending ? <Spinner size={12} /> : <StatusDot status="En recherche" className="size-1.5" />}
                  Changer le statut
                </button>
              )}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} icon={<StatusDot status={s} />} onSelect={() => bulkStatus(s)}>
                  {s}
                </MenuItem>
              ))}
            </Menu>
            <ConfirmButton
              size="sm"
              disabled={!selected.size}
              title={`Supprimer ${selected.size} fiche${selected.size > 1 ? "s" : ""} ?`}
              description="Les fiches et tous leurs rattachements (filiations, unions, sources) seront définitivement supprimés."
              onConfirm={bulkDelete}
            >
              <IconTrash size={13} />
              Supprimer
            </ConfirmButton>
            <button type="button" onClick={exitSelection} className={buttonClass("quiet", "", "icon-sm")} aria-label="Quitter la sélection">
              <IconX size={15} />
            </button>
          </div>
        </div>
      )}

      <MobileFab href={`/p/${slug}/personnes/nouvelle`} label="Nouvelle fiche" />

      <SaveViewDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={(name) => {
          const view: SavedView = { id: `custom_${Date.now()}`, name, filters };
          const next = [...readCustomViews(slug).filter((v) => v.name !== name), view];
          writeCustomViews(slug, next);
          setCustomViews(next);
          setActiveViewId(view.id);
          setSaveOpen(false);
          toast.success(`Vue « ${name} » enregistrée`);
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- pièces */

function StatusTab({
  children,
  active,
  onClick,
  count,
  status,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  status?: Status;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-ui transition-colors ${
        active ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {status && <StatusDot status={status} className="size-1.5" />}
      {children}
      <span className="num text-2xs text-fg-subtle">{count ?? 0}</span>
    </button>
  );
}

function FilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface pl-2 pr-1 text-xs text-fg shadow-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer ce filtre"
        className="flex size-4 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
      >
        <IconX size={11} />
      </button>
    </span>
  );
}

/* ------------------------------------------------------- liste mobile */

/** Téléphone : une ligne par fiche, à portée de pouce, et un index A–Z à faire glisser. */
function MobilePersonList({ slug, groups }: { slug: string; groups: { letter: string | null; people: GridPerson[] }[] }) {
  const letters = groups.map((g) => g.letter).filter((l): l is string => Boolean(l));
  return (
    <div className="-mx-4">
      {letters.length > 1 && <LetterScrubber letters={letters} />}
      {groups.map((group) => (
        <section key={group.letter ?? "all"}>
          {group.letter && (
            <h2
              id={`lettre-${group.letter}`}
              className="sticky top-[calc(6.5rem+env(safe-area-inset-top))] z-10 scroll-mt-[calc(6.5rem+env(safe-area-inset-top))] border-y border-border bg-surface-2/95 px-4 py-1 text-xs font-semibold backdrop-blur"
            >
              {group.letter}
            </h2>
          )}
          <ul className="divide-y divide-border bg-surface">
            {group.people.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${slug}/personnes/${p.id}`} className="flex min-h-16 items-center gap-3 py-2.5 pl-4 pr-8 active:bg-surface-2">
                  <Avatar seed={p.id} given={p.given} surname={p.surname} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[15px] font-medium text-fg">{p.name}</span>
                      {p.sosa != null && <span className="num shrink-0 text-2xs text-fg-subtle">#{p.sosa}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-fg-subtle">
                      <StatusDot status={p.status} className="size-1.5" />
                      <span className="num shrink-0">{lifeSpanOf(p)}</span>
                      {p.place && <span className="truncate">· {shortPlace(p.place)}</span>}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-fg-subtle">
                    {p.score}/{p.total}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function lifeSpanOf(p: GridPerson) {
  const birth = p.birthYear ? `${p.birthYearEstimated ? "~" : ""}${p.birthYear}` : "?";
  const death = p.isLiving ? "vivant" : (p.deathYear ?? "?");
  return `${birth} – ${death}`;
}

/** Index vertical sur le bord droit, comme dans les contacts : on le touche ou on le fait glisser. */
function LetterScrubber({ letters }: { letters: string[] }) {
  const jump = (clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const i = Math.min(letters.length - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * letters.length)));
    document.getElementById(`lettre-${letters[i]}`)?.scrollIntoView({ block: "start" });
  };
  return (
    <nav
      aria-label="Aller à la lettre"
      data-no-swipe
      className="fixed right-0.5 top-1/2 z-30 flex -translate-y-1/2 touch-none select-none flex-col items-center py-1"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e.clientY, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pointerType === "touch") jump(e.clientY, e.currentTarget);
      }}
    >
      {letters.map((l) => (
        <span key={l} className="flex h-[1.05rem] w-5 items-center justify-center text-[10px] font-semibold text-accent-text">
          {l}
        </span>
      ))}
    </nav>
  );
}

function LetterHeading({ letter, count }: { letter: string; count: number }) {
  return (
    <h2 id={`lettre-${letter}`} className="mb-2.5 flex scroll-mt-6 items-baseline gap-2 text-sm font-semibold">
      {letter}
      <span className="num text-xs font-normal text-fg-subtle">{count}</span>
    </h2>
  );
}

/** Index A–Z : un clic amène à la lettre. Les lettres sans fiche restent grisées. */
function LetterIndex({ groups }: { groups: { letter: string | null }[] }) {
  const present = new Set(groups.map((g) => g.letter));
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ...(present.has("#") ? ["#"] : [])];
  return (
    <nav aria-label="Aller à la lettre" className="-mx-1 flex flex-wrap gap-0.5">
      {letters.map((l) =>
        present.has(l) ? (
          <button
            key={l}
            type="button"
            onClick={() => document.getElementById(`lettre-${l}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex size-7 items-center justify-center rounded-md text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {l}
          </button>
        ) : (
          <span key={l} aria-hidden className="flex size-7 items-center justify-center text-xs text-fg-subtle/50">
            {l}
          </span>
        ),
      )}
    </nav>
  );
}

function ViewSwitch({ view, onChange, narrow }: { view: ViewKey; onChange: (v: ViewKey) => void; narrow: boolean }) {
  const options: [ViewKey, React.ReactNode, string][] = [
    ["grille", <IconGrid key="g" size={14} />, "Grille"],
    ["liste", <IconRows key="l" size={14} />, "Liste"],
    ...(narrow ? [] : [["tableau", <IconKanban key="k" size={14} />, "Tableau par statut"] as [ViewKey, React.ReactNode, string]]),
  ];
  return (
    <div className="flex h-8 items-center rounded-lg border border-border bg-surface-2/70 p-0.5" role="radiogroup" aria-label="Affichage">
      {options.map(([key, icon, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={view === key}
          title={label}
          onClick={() => onChange(key)}
          className={`flex h-full w-8 items-center justify-center rounded-md transition-colors ${
            view === key ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function SaveViewDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Enregistrer la vue" description="Retrouvez ces filtres en un clic depuis le menu Vues.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
          if (name) onSave(name);
        }}
        className="flex flex-col gap-4"
      >
        <input name="name" className="field" placeholder="Ex. Branche maternelle à finir" autoFocus required />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Annuler
          </button>
          <button type="submit" className={buttonClass("primary")}>
            <IconCheck size={14} />
            Enregistrer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* --------------------------------------------------------- vue liste */

function PersonTable({
  slug,
  people,
  groups,
  sort,
  desc,
  onSort,
  selecting,
  selected,
  onToggle,
  onToggleAll,
}: {
  slug: string;
  people: GridPerson[];
  /** Regroupement par initiale quand la liste est triée par nom. */
  groups: { letter: string | null; people: GridPerson[] }[] | null;
  sort: SortKey;
  desc: boolean;
  onSort: (key: SortKey) => void;
  selecting: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}) {
  const router = useRouter();
  const h = { sort, desc, onSort };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
      <table className="w-full min-w-[900px] table-fixed border-collapse text-ui">
        <thead className="border-b border-border bg-surface-2/50">
          <tr>
            {selecting && (
              <th className="w-10 pl-3">
                <Checkbox checked={selected.size === people.length && people.length > 0} onChange={onToggleAll} />
              </th>
            )}
            <Header {...h} k="name" className="w-[30%] pl-4">Nom</Header>
            <Header {...h} k="sosa" className="w-20">Sosa</Header>
            <Header {...h} k="birth" className="w-44">Naissance</Header>
            <Header {...h} k="death" className="w-28">Décès</Header>
            <Header {...h} k="status" className="w-40">Statut</Header>
            <Header {...h} k="filled" className="w-40">Complétion</Header>
            <Header {...h} className="w-48">Il manque</Header>
          </tr>
        </thead>
        <tbody>
          {(groups ?? [{ letter: null, people }]).map((group) => (
            <Fragment key={group.letter ?? "all"}>
              {group.letter && (
                <tr className="border-b border-border bg-surface-2/40">
                  <th
                    scope="rowgroup"
                    colSpan={selecting ? 8 : 7}
                    id={`lettre-${group.letter}`}
                    className="scroll-mt-6 px-4 py-1.5 text-left text-xs font-semibold"
                  >
                    {group.letter}
                    <span className="num ml-2 font-normal text-fg-subtle">{group.people.length}</span>
                  </th>
                </tr>
              )}
          {group.people.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <tr
                key={p.id}
                onClick={() => (selecting ? onToggle(p.id) : router.push(`/p/${slug}/personnes/${p.id}`))}
                className={`cursor-pointer border-b border-border last:border-0 transition-colors ${
                  isSelected ? "bg-info-soft/50" : "hover:bg-surface-2/60"
                }`}
              >
                {selecting && (
                  <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onChange={() => onToggle(p.id)} />
                  </td>
                )}
                <td className="py-2 pl-4 pr-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar seed={p.id} given={p.given} surname={p.surname} size="sm" />
                    <div className="flex min-w-0 items-baseline gap-2">
                      <Link
                        href={`/p/${slug}/personnes/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-medium text-fg hover:underline"
                        title={p.occupation ? `${p.name} · ${p.occupation}` : p.name}
                      >
                        {p.name}
                      </Link>
                      {p.occupation && <span className="hidden truncate text-xs text-fg-subtle xl:inline">{p.occupation}</span>}
                    </div>
                  </div>
                </td>
                <td className="num px-3 text-fg-muted">{p.sosa ?? <span className="text-fg-subtle">–</span>}</td>
                <td className="px-3">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="num shrink-0 text-fg">
                      {p.birthYear ? `${p.birthYearEstimated ? "~" : ""}${p.birthYear}` : <span className="text-fg-subtle">?</span>}
                    </span>
                    {p.place && <span className="truncate text-xs text-fg-subtle">{shortPlace(p.place)}</span>}
                  </span>
                </td>
                <td className="num px-3 text-fg">
                  {p.isLiving ? <span className="text-xs text-fg-subtle">vivant</span> : (p.deathYear ?? <span className="text-fg-subtle">?</span>)}
                </td>
                <td className="px-3">
                  <span className="flex items-center gap-1.5 text-fg-muted">
                    <StatusDot status={p.status} className="size-1.5" />
                    <span className="truncate">{p.status}</span>
                  </span>
                </td>
                <td className="px-3">
                  <span className="flex items-center gap-2">
                    <SlotStrip score={p.score} total={p.total} missing={p.missing} ignored={p.ignored} className="w-24" />
                    <span className="num text-2xs text-fg-subtle">
                      {p.score}/{p.total}
                    </span>
                  </span>
                </td>
                <td className="px-3 text-xs text-fg-muted">
                  <span className="block truncate" title={p.missing.join(", ")}>
                    {missingHint(p.missing) ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-2 text-2xs text-fg-subtle">
        <span className="num">{people.length}</span> fiche{people.length > 1 ? "s" : ""} · cliquez une ligne pour
        ouvrir la fiche · <Kbd>/</Kbd> pour la recherche globale
      </p>
    </div>
  );
}

function Header({
  k,
  children,
  className = "",
  sort,
  desc,
  onSort,
}: {
  k?: SortKey;
  children: React.ReactNode;
  className?: string;
  sort: SortKey;
  desc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th scope="col" className={`h-9 px-3 text-left text-2xs font-medium text-fg-subtle ${className}`}>
      {k ? (
        <button
          type="button"
          onClick={() => onSort(k)}
          className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-fg ${sort === k ? "text-fg" : ""}`}
        >
          {children}
          {sort === k && (desc ? <IconArrowDown size={11} /> : <IconArrowUp size={11} />)}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`flex size-4 items-center justify-center rounded-[4px] border transition-colors ${
        checked ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface"
      }`}
    >
      {checked && <IconCheck size={11} strokeWidth={3} />}
    </button>
  );
}
