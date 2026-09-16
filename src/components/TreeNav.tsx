"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { buttonClass } from "@/components/ui";

const GENERATIONS = [3, 4, 5, 6];

export function TreeNav({
  slug,
  rootId,
  rootName,
  generations,
  sosaRoot,
  spouses,
  people,
}: {
  slug: string;
  rootId: number;
  rootName: string;
  generations: number;
  sosaRoot?: { id: number; name: string } | null;
  spouses: { id: number; name: string }[];
  people: { id: number; name: string; year?: number | null }[];
}) {
  const router = useRouter();

  const handlePersonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    router.push(`/p/${slug}/arbre?de=${id}&gen=${generations}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Sélecteur de personne instantané */}
        <select
          value={String(rootId)}
          onChange={handlePersonChange}
          className="field max-w-72 cursor-pointer font-medium text-sm"
          aria-label="Changer de personne racine"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.year ? `(${p.year})` : ""}
            </option>
          ))}
        </select>

        {/* Sélecteur instantané de générations */}
        <div className="inline-flex items-center rounded-xl border border-border bg-surface-2 p-0.5 text-xs">
          {GENERATIONS.map((g) => {
            const active = generations === g;
            return (
              <Link
                key={g}
                href={`/p/${slug}/arbre?de=${rootId}&gen=${g}`}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                  active
                    ? "bg-surface text-fg shadow-xs"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {g} gén.
              </Link>
            );
          })}
        </div>

        {/* Bouton retour G1 */}
        {sosaRoot && sosaRoot.id !== rootId && (
          <Link
            href={`/p/${slug}/arbre?de=${sosaRoot.id}&gen=${generations}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-xs transition-all hover:bg-surface-2"
            title={`Revenir sur ${sosaRoot.name}`}
          >
            <span className="rounded bg-fg/10 px-1 py-0.5 text-[10px] font-semibold">G1</span>
            <span>{sosaRoot.name}</span>
          </Link>
        )}

        {/* Conjoints */}
        {spouses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
            <span>marié(e) à :</span>
            {spouses.map((s) => (
              <Link
                key={s.id}
                href={`/p/${slug}/arbre?de=${s.id}&gen=${generations}`}
                className="rounded-lg border border-border/80 bg-surface px-2 py-1 text-fg hover:border-border-strong hover:bg-surface-2 transition-colors font-medium"
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/p/${slug}/personnes/${rootId}`}
          className={buttonClass("ghost", "text-xs")}
        >
          Ouvrir la carte de {rootName} ↗
        </Link>
      </div>
    </div>
  );
}

