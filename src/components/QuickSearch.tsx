"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { quickCreatePersonAction } from "@/app/actions";

export type SearchPerson = {
  id: number;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  place: string | null;
  percent: number;
};

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Le point d'entrée : on tape un nom, on tombe sur la fiche.
 * Si personne ne correspond, on crée la fiche depuis la même saisie.
 */
export function QuickSearch({
  slug,
  profileId,
  people,
}: {
  slug: string;
  profileId: number;
  people: SearchPerson[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    return people
      .filter((p) => norm(`${p.name} ${p.place ?? ""}`).includes(q))
      .slice(0, 8);
  }, [people, query]);

  return (
    <div className="relative">
      <input
        className="field w-full rounded-xl py-3.5 text-[15px]"
        placeholder="Chercher une personne, une commune…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            router.push(`/p/${slug}/personnes/${results[0].id}`);
          }
        }}
        autoFocus
      />

      {query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/p/${slug}/personnes/${p.id}`)}
              className="flex w-full items-baseline gap-3 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-surface-2"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs tabular-nums text-fg-subtle">
                {p.birthYear ?? "?"}–{p.deathYear ?? "?"}
              </span>
              {p.place && (
                <span className="truncate text-xs text-fg-subtle">{p.place.split(",")[0]}</span>
              )}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-subtle">
                {p.percent}%
              </span>
            </button>
          ))}

          <form action={quickCreatePersonAction} className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="profileId" value={profileId} />
            <input type="hidden" name="fullName" value={query.trim()} />
            <button type="submit" className="text-sm underline-offset-4 hover:underline">
              + Créer la fiche « {query.trim()} »
            </button>
            <span className="text-xs text-fg-subtle">prénoms puis NOM en majuscules</span>
          </form>
        </div>
      )}
    </div>
  );
}
