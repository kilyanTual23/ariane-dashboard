"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PersonCard, type CardPerson } from "@/components/PersonCard";
import { buttonClass } from "@/components/ui";
import { PUBLICATIONS } from "@/lib/publication";
import { KINSHIPS, STATUSES } from "@/lib/types";

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

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function PersonGrid({
  slug,
  people,
  initialStatus,
  initialPublication,
}: {
  slug: string;
  people: GridPerson[];
  initialStatus?: string;
  initialPublication?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [kinship, setKinship] = useState("");
  const [missing, setMissing] = useState("");
  const [publication, setPublication] = useState(initialPublication ?? "");
  const [sort, setSort] = useState<SortKey>("name");
  const [desc, setDesc] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const result = people.filter((p) => {
      if (status && p.status !== status) return false;
      if (kinship && (p.kinship ?? "") !== kinship) return false;
      if (missing && !p.missing.includes(missing)) return false;
      if (publication && p.publication !== publication) return false;
      if (!q) return true;
      return norm(
        [p.name, p.place, p.deathPlace, p.occupation, p.spouse].filter(Boolean).join(" "),
      ).includes(q);
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
  }, [people, query, status, kinship, missing, publication, sort, desc]);

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
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-personnes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field max-w-72 flex-1"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
          className="rounded-lg px-1.5 py-1 text-xs text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          title={desc ? "Ordre décroissant" : "Ordre croissant"}
        >
          {desc ? "↓" : "↑"}
        </button>
        <button
          type="button"
          onClick={() => setMoreFilters((v) => !v)}
          className="text-xs text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          {moreFilters ? "moins de filtres" : "plus de filtres"}
        </button>
        <span className="num text-xs text-fg-subtle">
          {filtered.length} / {people.length}
        </span>
        <Link
          href={`/p/${slug}/personnes?vue=kanban`}
          className={buttonClass("ghost", "ml-auto")}
        >
          Vue kanban
        </Link>
        <Link href={`/p/${slug}/personnes/nouvelle`} className={buttonClass("primary")}>
          Nouvelle carte
        </Link>
      </div>

      {moreFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field w-auto"
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
            className="field w-auto"
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
            className="field w-auto"
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
          <button type="button" onClick={exportCsv} className={buttonClass("ghost", "text-xs")}>
            Exporter la sélection en CSV
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-fg-muted">
          Aucune carte ne correspond à ces filtres.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((person) => (
            <PersonCard key={person.id} slug={slug} person={person} />
          ))}
        </div>
      )}
    </div>
  );
}
