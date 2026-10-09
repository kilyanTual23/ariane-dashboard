"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { bulkDeletePersonsAction, bulkSetStatusAction } from "@/app/actions";
import { PersonCard, type CardPerson } from "@/components/PersonCard";
import { buttonClass } from "@/components/ui";
import { PUBLICATIONS } from "@/lib/publication";
import { KINSHIPS, STATUSES, type Status } from "@/lib/types";

export type GridPerson = CardPerson & {
  spouse: string | null;
  marriageYear: number | null;
  deathPlace: string | null;
};

type SortKey = "name" | "birth" | "death" | "filled" | "status";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Nom" },
  { key: "birth", label: "Naissance" },
  { key: "death", label: "Décès" },
  { key: "filled", label: "Cases remplies" },
  { key: "status", label: "Statut" },
];

const MISSING_FILTERS = [
  "Acte de naissance",
  "Acte de mariage",
  "Acte de décès",
  "Parents",
  "Date de naissance",
  "Lieu de naissance",
] as const;

function norm(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[()[\]{},;:'"«»_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type FilterState = {
  query: string;
  status: string;
  sosaOnly: boolean;
  kinship: string;
  missing: string;
  publication: string;
  sort: SortKey;
  desc: boolean;
  moreFilters?: boolean;
};

export type SavedView = {
  id: string;
  name: string;
  isSystem?: boolean;
  filters: FilterState;
};

export const SYSTEM_PRESETS: SavedView[] = [
  {
    id: "sosa-recherche",
    name: "⭐ SOSA en recherche",
    isSystem: true,
    filters: {
      query: "",
      status: "En recherche",
      sosaOnly: true,
      kinship: "",
      missing: "",
      publication: "",
      sort: "filled",
      desc: true,
      moreFilters: false,
    },
  },
  {
    id: "a-publier",
    name: "📦 Prêts pour Geneanet",
    isSystem: true,
    filters: {
      query: "",
      status: "Complet",
      sosaOnly: false,
      kinship: "",
      missing: "",
      publication: "à mettre sur Geneanet",
      sort: "name",
      desc: false,
      moreFilters: true,
    },
  },
  {
    id: "sosa-bloques",
    name: "⚠️ SOSA bloqués",
    isSystem: true,
    filters: {
      query: "",
      status: "Bloqué",
      sosaOnly: true,
      kinship: "",
      missing: "",
      publication: "",
      sort: "birth",
      desc: false,
      moreFilters: false,
    },
  },
  {
    id: "sans-naissance",
    name: "📜 Acte de naissance manquant",
    isSystem: true,
    filters: {
      query: "",
      status: "",
      sosaOnly: false,
      kinship: "",
      missing: "Acte de naissance",
      publication: "",
      sort: "name",
      desc: false,
      moreFilters: true,
    },
  },
  {
    id: "sans-mariage",
    name: "💍 Acte de mariage manquant",
    isSystem: true,
    filters: {
      query: "",
      status: "",
      sosaOnly: false,
      kinship: "",
      missing: "Acte de mariage",
      publication: "",
      sort: "name",
      desc: false,
      moreFilters: true,
    },
  },
];

export function PersonGrid({
  slug,
  profileId,
  people,
  initialQuery,
  initialStatus,
  initialSosaOnly,
  initialKinship,
  initialMissing,
  initialPublication,
  initialSort,
  initialDesc,
}: {
  slug: string;
  profileId?: number;
  people: GridPerson[];
  initialQuery?: string;
  initialStatus?: string;
  initialSosaOnly?: boolean;
  initialKinship?: string;
  initialMissing?: string;
  initialPublication?: string;
  initialSort?: SortKey;
  initialDesc?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const storageKey = `ariane_cards_filters_${slug}`;
  const presetsStorageKey = `ariane_cards_presets_${slug}`;

  const [sosaOnly, setSosaOnly] = useState(initialSosaOnly ?? false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [kinship, setKinship] = useState(initialKinship ?? "");
  const [missing, setMissing] = useState(initialMissing ?? "");
  const [publication, setPublication] = useState(initialPublication ?? "");
  const [sort, setSort] = useState<SortKey>(initialSort ?? "name");
  const [desc, setDesc] = useState(initialDesc ?? false);
  const [moreFilters, setMoreFilters] = useState(false);

  // Sélection groupée
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatusMenuOpen, setBulkStatusMenuOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => setFeedbackMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const [customPresets, setCustomPresets] = useState<SavedView[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [isSavingView, setIsSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  // 1. Hydratation initiale : restaurer les filtres depuis l'URL ou localStorage
  useEffect(() => {
    // Vues personnalisées sauvegardées
    try {
      const rawPresets = localStorage.getItem(presetsStorageKey);
      if (rawPresets) {
        setCustomPresets(JSON.parse(rawPresets));
      }
    } catch {}

    // Vérifier si des filtres explicites sont déjà dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const hasUrlParams =
      urlParams.has("q") ||
      urlParams.has("statut") ||
      urlParams.has("sosa") ||
      urlParams.has("lien") ||
      urlParams.has("manquant") ||
      urlParams.has("publication") ||
      urlParams.has("tri") ||
      urlParams.has("ordre");

    if (!hasUrlParams) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved: Partial<FilterState> = JSON.parse(raw);
          if (typeof saved.query === "string") setQuery(saved.query);
          if (typeof saved.status === "string") setStatus(saved.status);
          if (typeof saved.sosaOnly === "boolean") setSosaOnly(saved.sosaOnly);
          if (typeof saved.kinship === "string") setKinship(saved.kinship);
          if (typeof saved.missing === "string") setMissing(saved.missing);
          if (typeof saved.publication === "string") setPublication(saved.publication);
          if (typeof saved.sort === "string" && SORTS.some((s) => s.key === saved.sort)) {
            setSort(saved.sort);
          }
          if (typeof saved.desc === "boolean") setDesc(saved.desc);
          if (typeof saved.moreFilters === "boolean") setMoreFilters(saved.moreFilters);
        }
      } catch {}
    }

    setIsHydrated(true);
  }, [slug, storageKey, presetsStorageKey]);

  // Synchronisation avec les props externes (recherche globale, liens d'onglets, navigation)
  useEffect(() => {
    if (initialQuery !== undefined) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (initialStatus !== undefined) setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (initialSosaOnly !== undefined) setSosaOnly(initialSosaOnly);
  }, [initialSosaOnly]);

  useEffect(() => {
    if (initialKinship !== undefined) setKinship(initialKinship);
  }, [initialKinship]);

  useEffect(() => {
    if (initialMissing !== undefined) setMissing(initialMissing);
  }, [initialMissing]);

  useEffect(() => {
    if (initialPublication !== undefined) setPublication(initialPublication);
  }, [initialPublication]);

  useEffect(() => {
    if (initialSort !== undefined) setSort(initialSort);
  }, [initialSort]);

  useEffect(() => {
    if (initialDesc !== undefined) setDesc(initialDesc);
  }, [initialDesc]);

  // 2. Mémorisation automatique : dès qu'un filtre change, sauvegarder dans localStorage et synchroniser l'URL
  useEffect(() => {
    if (!isHydrated) return;

    const current: FilterState = {
      query,
      status,
      sosaOnly,
      kinship,
      missing,
      publication,
      sort,
      desc,
      moreFilters,
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(current));
    } catch {}

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("statut", status);
    if (sosaOnly) params.set("sosa", "1");
    if (kinship) params.set("lien", kinship);
    if (missing) params.set("manquant", missing);
    if (publication) params.set("publication", publication);
    if (sort && sort !== "name") params.set("tri", sort);
    if (desc) params.set("ordre", "desc");

    const qs = params.toString();
    const targetUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", targetUrl);
  }, [
    isHydrated,
    query,
    status,
    sosaOnly,
    kinship,
    missing,
    publication,
    sort,
    desc,
    moreFilters,
    storageKey,
  ]);

  const resetAllFilters = () => {
    setQuery("");
    setStatus("");
    setKinship("");
    setMissing("");
    setPublication("");
    setSosaOnly(false);
    setSort("name");
    setDesc(false);
    setSelectedPresetId("");
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    window.history.replaceState(null, "", window.location.pathname);
  };

  const applyPreset = (preset: SavedView) => {
    setSelectedPresetId(preset.id);
    setQuery(preset.filters.query ?? "");
    setStatus(preset.filters.status ?? "");
    setSosaOnly(Boolean(preset.filters.sosaOnly));
    setKinship(preset.filters.kinship ?? "");
    setMissing(preset.filters.missing ?? "");
    setPublication(preset.filters.publication ?? "");
    setSort(preset.filters.sort ?? "name");
    setDesc(Boolean(preset.filters.desc));
    if (preset.filters.kinship || preset.filters.missing || preset.filters.publication) {
      setMoreFilters(true);
    }
  };

  const handleSaveView = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newViewName.trim();
    if (!name) return;

    const newView: SavedView = {
      id: `custom_${Date.now()}`,
      name,
      isSystem: false,
      filters: {
        query,
        status,
        sosaOnly,
        kinship,
        missing,
        publication,
        sort,
        desc,
        moreFilters,
      },
    };

    const updated = [...customPresets.filter((p) => p.name !== name), newView];
    setCustomPresets(updated);
    setSelectedPresetId(newView.id);
    setNewViewName("");
    setIsSavingView(false);

    try {
      localStorage.setItem(presetsStorageKey, JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteView = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    if (selectedPresetId === id) setSelectedPresetId("");
    try {
      localStorage.setItem(presetsStorageKey, JSON.stringify(updated));
    } catch {}
  };

  const hasActiveFilters = Boolean(
    query.trim() || status || kinship || missing || publication || sosaOnly,
  );

  const filtered = useMemo(() => {
    const qClean = norm(query);
    const tokens = qClean ? qClean.split(" ").filter(Boolean) : [];

    const result = people.filter((p) => {
      if (sosaOnly && !p.sosa) return false;
      if (status) {
        if (status === "Complet") {
          if (p.status !== "Complet" && p.status !== "Complet (lacunes)") return false;
        } else if (p.status !== status) {
          return false;
        }
      }
      if (kinship && (p.kinship ?? "") !== kinship) return false;
      if (missing && !p.missing.includes(missing)) return false;
      if (publication && p.publication !== publication) return false;
      if (tokens.length === 0) return true;

      const nameNorm = norm(p.name);
      const givenNorm = norm(p.given);
      const surnameNorm = norm(p.surname);
      const bPlaceNorm = norm(p.place);
      const dPlaceNorm = norm(p.deathPlace);
      const occNorm = norm(p.occupation);
      const spouseNorm = norm(p.spouse);
      const sosaStr = p.sosa ? String(p.sosa) : "";
      const sosaFull = p.sosa ? `sosa ${p.sosa} #${p.sosa}` : "";
      const bYearStr = p.birthYear ? String(p.birthYear) : "";
      const dYearStr = p.deathYear ? String(p.deathYear) : "";
      const mYearStr = p.marriageYear ? String(p.marriageYear) : "";

      const pool = `${nameNorm} ${givenNorm} ${surnameNorm} ${bPlaceNorm} ${dPlaceNorm} ${occNorm} ${spouseNorm} ${sosaFull} ${bYearStr} ${dYearStr} ${mYearStr}`;

      for (const token of tokens) {
        const cleanToken = token.replace(/^(#|sosa:?)/, "");
        const matched =
          pool.includes(token) ||
          (cleanToken && sosaStr === cleanToken) ||
          (cleanToken && (bYearStr === cleanToken || dYearStr === cleanToken || mYearStr === cleanToken));

        if (!matched) return false;
      }
      return true;
    });

    const dir = desc ? -1 : 1;
    const value = (p: GridPerson) => {
      switch (sort) {
        case "birth":
          return p.birthYear ?? 9999;
        case "death":
          return p.deathYear ?? 9999;
        case "filled":
          return p.score;
        case "status":
          return STATUSES.indexOf(p.status);
        default:
          return 0;
      }
    };
    return result.sort((a, b) => {
      if (sort === "name") return dir * a.name.localeCompare(b.name, "fr");
      const va = value(a);
      const vb = value(b);
      return va === vb ? a.name.localeCompare(b.name, "fr") : dir * (va - vb);
    });
  }, [people, query, status, kinship, missing, publication, sosaOnly, sort, desc]);

  const exportCsv = () => {
    const header = [
      "Nom", "Sosa", "Statut", "Lien", "Naissance", "Lieu de naissance",
      "Décès", "Lieu de décès", "Conjoint", "Mariage", "Métier", "Cases remplies", "Manquant", "Publication",
    ];
    const lines = filtered.map((p) =>
      [
        p.name, p.sosa ?? "", p.status, p.kinship ?? "",
        p.birthYear ?? "", p.place ?? "",
        p.deathYear ?? "", p.deathPlace ?? "",
        p.spouse ?? "", p.marriageYear ?? "", p.occupation ?? "",
        `${p.score}/${p.total}`, p.missing.join(" / "), p.publication,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-personnes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
      setIsSelectionMode(true);
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer définitivement ${count} carte(s) ?\nCette opération est irréversible et supprimera également les rattachements associés.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const targetProfileId = profileId ?? 1;
      const res = await bulkDeletePersonsAction({
        slug,
        profileId: targetProfileId,
        personIds: Array.from(selectedIds),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setFeedbackMessage({ text: `${count} carte(s) supprimée(s) avec succès.`, type: "ok" });
        router.refresh();
      } else {
        setFeedbackMessage({ text: res.error || "Erreur lors de la suppression.", type: "err" });
      }
    });
  };

  const handleBulkSetStatus = (newStatus: Status) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setBulkStatusMenuOpen(false);

    startTransition(async () => {
      const targetProfileId = profileId ?? 1;
      const res = await bulkSetStatusAction({
        slug,
        profileId: targetProfileId,
        personIds: Array.from(selectedIds),
        status: newStatus,
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setFeedbackMessage({ text: `Statut mis à jour pour ${count} carte(s) : "${newStatus}".`, type: "ok" });
        router.refresh();
      } else {
        setFeedbackMessage({ text: res.error || "Erreur lors de la mise à jour.", type: "err" });
      }
    });
  };

  // Pre-calculated counts for quick tabs
  const enRechercheCount = useMemo(() => people.filter((p) => p.status === "En recherche").length, [people]);
  const completsCount = useMemo(
    () => people.filter((p) => p.status === "Complet" || p.status === "Complet (lacunes)").length,
    [people],
  );
  const bloquésCount = useMemo(() => people.filter((p) => p.status === "Bloqué").length, [people]);
  const sosaCount = useMemo(() => people.filter((p) => !!p.sosa).length, [people]);

  return (
    <div className="flex flex-col gap-4">
      {/* Barre supérieure : Recherche, filtres principaux et sélecteur de vue */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-72 flex-1">
          <input
            className="field w-full pl-8 pr-7"
            placeholder="Rechercher (nom, lieu, métier, sosa)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
            🔍
          </span>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-fg-subtle transition-colors hover:text-fg"
              title="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>

        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className="field w-auto"
          value={sort}
          onChange={(e) => {
            const key = e.target.value as SortKey;
            setSort(key);
            setDesc(key === "filled");
          }}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Trier par {s.label.toLowerCase()}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setDesc((d) => !d)}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          title={desc ? "Ordre décroissant (cliquer pour inverser)" : "Ordre croissant (cliquer pour inverser)"}
        >
          {desc ? "↓ Décroissant" : "↑ Croissant"}
        </button>

        <button
          type="button"
          onClick={() => setMoreFilters((v) => !v)}
          className="rounded-lg border border-border/80 px-2.5 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {moreFilters ? "Moins de filtres ▲" : "Plus de filtres ▼"}
        </button>

        {/* Sélecteur de vues / préréglages */}
        <select
          className="field w-auto text-xs font-medium"
          value={selectedPresetId}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              setSelectedPresetId("");
              return;
            }
            const allPresets = [...SYSTEM_PRESETS, ...customPresets];
            const found = allPresets.find((p) => p.id === id);
            if (found) applyPreset(found);
          }}
        >
          <option value="">📁 Vues enregistrées…</option>
          <optgroup label="Recommandées">
            {SYSTEM_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {customPresets.length > 0 && (
            <optgroup label="Mes vues enregistrées">
              {customPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  📌 {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <span className="num ml-1 text-xs text-fg-subtle">
          {filtered.length} / {people.length}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Bouton bascule Sélection multiple */}
          <button
            type="button"
            onClick={() => {
              setIsSelectionMode((prev) => !prev);
              if (isSelectionMode) {
                setSelectedIds(new Set());
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              isSelectionMode || selectedIds.size > 0
                ? "border-accent bg-accent/10 text-accent font-semibold"
                : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg shadow-xs"
            }`}
            title="Activer la sélection multiple pour modifier ou supprimer des cartes en lot"
          >
            <span className="text-sm">☑</span>
            <span>Sélectionner</span>
            {selectedIds.size > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.2 text-[10px] text-white font-bold">
                {selectedIds.size}
              </span>
            )}
          </button>

          <div className="inline-flex items-center rounded-xl border border-border bg-surface-2 p-0.5 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 font-medium text-fg shadow-xs">
              <span>⊞</span> Grille
            </span>
            <Link
              href={`/p/${slug}/personnes?vue=kanban`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
            >
              <span>▥</span> Tableau
            </Link>
          </div>
          <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary")}>
            + Nouvelle carte
          </Link>
        </div>
      </div>

      {/* Onglets rapides de filtrage */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2 text-xs">
        <button
          type="button"
          onClick={() => {
            setStatus("");
            setSosaOnly(false);
          }}
          className={`rounded-lg px-2.5 py-1 transition-colors ${
            !status && !sosaOnly
              ? "bg-surface-3 font-medium text-fg"
              : "text-fg-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          Toutes ({people.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus("En recherche");
            setSosaOnly(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
            status === "En recherche" && !sosaOnly
              ? "bg-surface-3 font-medium text-fg"
              : "text-fg-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <span className="size-1.5 rounded-full bg-accent" />
          En recherche ({enRechercheCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus("Complet");
            setSosaOnly(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
            (status === "Complet" || status === "Complet (lacunes)") && !sosaOnly
              ? "bg-surface-3 font-medium text-fg"
              : "text-fg-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <span className="size-1.5 rounded-full bg-ok" />
          Complets ({completsCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus("Bloqué");
            setSosaOnly(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
            status === "Bloqué" && !sosaOnly
              ? "bg-surface-3 font-medium text-fg"
              : "text-fg-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <span className="size-1.5 rounded-full bg-warn" />
          Bloqués ({bloquésCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setSosaOnly((s) => !s);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${
            sosaOnly
              ? "bg-fg font-medium text-accent-fg"
              : "text-fg-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <span>⭐ SOSA uniquement ({sosaCount})</span>
        </button>
      </div>

      {/* Filtres avancés dépliables */}
      {moreFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/60 p-3">
          <select
            className="field w-auto bg-surface"
            value={kinship}
            onChange={(e) => setKinship(e.target.value)}
          >
            <option value="">Tous les liens</option>
            {KINSHIPS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="field w-auto bg-surface"
            value={publication}
            onChange={(e) => setPublication(e.target.value)}
          >
            <option value="">Publication : indifférent</option>
            {PUBLICATIONS.map((v) => (
              <option key={v} value={v}>
                {v === "en cours" ? "Recherche en cours" : v === "archivée" ? "Archivées" : "À mettre sur Geneanet"}
              </option>
            ))}
          </select>
          <select
            className="field w-auto bg-surface"
            value={missing}
            onChange={(e) => setMissing(e.target.value)}
          >
            <option value="">Complètes ou non</option>
            {MISSING_FILTERS.map((m) => (
              <option key={m} value={m}>
                Sans {m.toLowerCase()}
              </option>
            ))}
          </select>
          <button type="button" onClick={exportCsv} className={buttonClass("ghost", "text-xs ml-auto")}>
            Exporter la sélection en CSV (↓)
          </button>
        </div>
      )}

      {/* Badges de filtres actifs & Actions de sauvegarde */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-surface-2/40 px-3 py-2 text-xs">
          <span className="text-fg-subtle">Filtres actifs :</span>
          {query && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-fg">
              « {query} »
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-fg-subtle hover:text-fg"
                title="Supprimer ce filtre"
              >
                ✕
              </button>
            </span>
          )}
          {status && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-fg">
              Statut : {status}
              <button
                type="button"
                onClick={() => setStatus("")}
                className="text-fg-subtle hover:text-fg"
                title="Supprimer ce filtre"
              >
                ✕
              </button>
            </span>
          )}
          {sosaOnly && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-fg">
              SOSA uniquement
              <button
                type="button"
                onClick={() => setSosaOnly(false)}
                className="text-fg-subtle hover:text-fg"
                title="Supprimer ce filtre"
              >
                ✕
              </button>
            </span>
          )}
          {kinship && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-fg">
              Lien : {kinship}
              <button
                type="button"
                onClick={() => setKinship("")}
                className="text-fg-subtle hover:text-fg"
                title="Supprimer ce filtre"
              >
                ✕
              </button>
            </span>
          )}
          {publication && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-fg">
              Publication : {publication}
              <button
                type="button"
                onClick={() => setPublication("")}
                className="text-fg-subtle hover:text-fg"
                title="Supprimer ce filtre"
              >
                ✕
              </button>
            </span>
          )}
          {missing && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-fg">
              Sans {missing.toLowerCase()}
              <button
                type="button"
                onClick={() => setMissing("")}
                className="text-fg-subtle hover:text-fg"
                title="Supprimer ce filtre"
              >
                ✕
              </button>
            </span>
          )}

          {/* Indicateur de mémorisation automatique */}
          <span
            className="inline-flex items-center gap-1 rounded-md border border-ok/30 bg-ok-soft/60 px-2 py-0.5 text-[11px] font-medium text-ok"
            title="Vos filtres restent actifs automatiquement même en quittant la page ou en visitant une fiche."
          >
            <span>✓</span> Mémorisés
          </span>

          <button
            type="button"
            onClick={resetAllFilters}
            className="ml-1 text-fg-subtle underline underline-offset-2 transition-colors hover:text-fg"
          >
            Tout effacer
          </button>

          {/* Enregistrer la sélection en vue personnalisée */}
          <div className="ml-auto flex items-center gap-2">
            {!isSavingView ? (
              <button
                type="button"
                onClick={() => {
                  setIsSavingView(true);
                  setNewViewName("");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg shadow-xs"
                title="Enregistrer ces filtres pour les retrouver dans la liste des vues"
              >
                <span>💾</span> Enregistrer cette vue…
              </button>
            ) : (
              <form onSubmit={handleSaveView} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Nom de la vue…"
                  className="field h-6 w-36 px-2 text-xs py-0 bg-surface"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newViewName.trim()}
                  className="rounded bg-fg px-2 py-0.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Sauvegarder
                </button>
                <button
                  type="button"
                  onClick={() => setIsSavingView(false)}
                  className="rounded px-1.5 py-0.5 text-xs text-fg-subtle hover:text-fg"
                >
                  ✕
                </button>
              </form>
            )}

            {selectedPresetId && customPresets.some((p) => p.id === selectedPresetId) && (
              <button
                type="button"
                onClick={(e) => handleDeleteView(selectedPresetId, e)}
                className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-surface px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10"
                title="Supprimer définitivement cette vue personnalisée"
              >
                <span>🗑️</span> Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Message de notification / retour d'action */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-xs font-medium shadow-xs transition-all ${
            feedbackMessage.type === "ok"
              ? "border border-ok/30 bg-ok/10 text-ok"
              : "border border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-fg-subtle hover:text-fg ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Barre d'action groupée / par lot */}
      {(isSelectionMode || selectedIds.size > 0) && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-surface/95 p-3 shadow-card backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3 transition-colors"
            >
              <span>{selectedIds.size === filtered.length && filtered.length > 0 ? "☑" : "☐"}</span>
              <span>
                {selectedIds.size === filtered.length && filtered.length > 0
                  ? "Tout désélectionner"
                  : `Tout sélectionner (${filtered.length})`}
              </span>
            </button>

            <span className="text-xs text-fg-muted">
              <strong className="text-fg font-semibold">{selectedIds.size}</strong> carte(s) sélectionnée(s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Changer statut */}
            <div className="relative">
              <button
                type="button"
                disabled={selectedIds.size === 0 || isPending}
                onClick={() => setBulkStatusMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 transition-colors disabled:opacity-40"
              >
                <span>🏷️</span>
                <span>Changer statut</span>
                <span className="text-[10px] text-fg-subtle">▼</span>
              </button>

              {bulkStatusMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-card">
                  <div className="px-2 py-1 text-[11px] font-medium text-fg-subtle">
                    Appliquer le statut :
                  </div>
                  {STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleBulkSetStatus(st)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-fg hover:bg-surface-2 transition-colors"
                    >
                      <span>{st}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Supprimer */}
            <button
              type="button"
              disabled={selectedIds.size === 0 || isPending}
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors disabled:opacity-40"
              title="Supprimer définitivement les cartes sélectionnées"
            >
              <span>🗑️</span>
              <span>Supprimer ({selectedIds.size})</span>
            </button>

            <button
              type="button"
              onClick={handleClearSelection}
              className="rounded-lg px-2.5 py-1.5 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Grille ou état vide */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <span className="text-3xl">🔍</span>
          <h3 className="mt-3 font-medium text-fg">Aucune carte trouvée</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Aucune personne ne correspond aux critères sélectionnés.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className={`mt-4 ${buttonClass()}`}
            >
              Réinitialiser tous les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((person) => (
            <PersonCard
              key={person.id}
              slug={slug}
              person={person}
              selectable={isSelectionMode || selectedIds.size > 0}
              selected={selectedIds.has(person.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
