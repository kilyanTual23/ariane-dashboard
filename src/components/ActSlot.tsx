"use client";

import { useEffect, useState, useTransition } from "react";
import { toggleActIgnoredAction } from "@/app/actions";
import { Inline, type InlineTarget } from "@/components/Inline";

const COMMON_REASONS = [
  "Introuvable (archives lacunaires)",
  "Inaccessible (délai légal 75/100 ans)",
  "Archives détruites ou disparues",
  "Non mentionné / Sans motif particulier",
] as const;

export function ActSlot({
  slug,
  personId,
  unionId,
  actKind,
  label = "Acte",
  value,
  isIgnored,
}: {
  slug: string;
  personId?: number;
  unionId?: number;
  actKind: "birth" | "death" | "marriage";
  label?: string;
  value: string | null | undefined;
  isIgnored: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [optimisticIgnored, setOptimisticIgnored] = useState(isIgnored);
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState("");

  useEffect(() => {
    setOptimisticIgnored(isIgnored);
  }, [isIgnored]);

  const target: InlineTarget =
    actKind === "marriage" && unionId
      ? { kind: "union", unionId, field: "source" }
      : {
          kind: "person",
          personId: personId!,
          field: actKind === "birth" ? "birth_source" : "death_source",
        };

  const handleIgnore = (e: React.FormEvent) => {
    e.preventDefault();
    const reasonToSave = (customReason.trim() || selectedReason).trim();
    setModalOpen(false);
    setOptimisticIgnored(true);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("slug", slug);
        if (personId) fd.append("personId", String(personId));
        if (unionId) fd.append("unionId", String(unionId));
        fd.append("actKind", actKind);
        fd.append("ignored", "1");
        if (reasonToSave && reasonToSave !== "Non mentionné / Sans motif particulier") {
          fd.append("reason", reasonToSave);
        }
        await toggleActIgnoredAction(fd);
      } catch {
        setOptimisticIgnored(isIgnored);
      }
    });
  };

  const handleRestore = () => {
    setOptimisticIgnored(false);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("slug", slug);
        if (personId) fd.append("personId", String(personId));
        if (unionId) fd.append("unionId", String(unionId));
        fd.append("actKind", actKind);
        fd.append("ignored", "0");
        // Si la valeur actuelle était simplement un motif d'ignorance, la nettoyer
        if (
          value &&
          (COMMON_REASONS.some((r) => value.includes(r)) ||
            value.startsWith("Introuvable") ||
            value.startsWith("Inaccessible") ||
            value.startsWith("Archives détruites"))
        ) {
          fd.append("reason", "clear");
        }
        await toggleActIgnoredAction(fd);
      } catch {
        setOptimisticIgnored(isIgnored);
      }
    });
  };

  return (
    <div
      className={`slot group/slot relative transition-colors ${
        optimisticIgnored
          ? "border-border/60 bg-surface-2/40"
          : value?.trim()
            ? ""
            : "slot-empty"
      }`}
    >
      {/* En-tête du Slot */}
      <div className="flex items-center justify-between gap-1 pb-0.5">
        <span className="slot-label">{label}</span>

        {!optimisticIgnored ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            title="Marquer cet acte comme introuvable ou inaccessible pour ne pas pénaliser la complétion de la carte"
          >
            Ø Ignorer
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded bg-fg/10 px-1.5 py-0.2 text-[10px] font-semibold text-fg">
              🚫 Ignoré
            </span>
            <button
              type="button"
              onClick={handleRestore}
              className="text-[10.5px] text-fg-subtle underline hover:text-fg"
              title="Rétablir l'exigence de cet acte pour cette personne"
            >
              Rétablir
            </button>
          </div>
        )}
      </div>

      {/* Contenu du Slot */}
      <div className="flex min-w-0 flex-1 flex-col text-sm">
        {optimisticIgnored ? (
          <div className="flex flex-col justify-center py-0.5">
            <p className="truncate text-xs font-medium text-fg-muted">
              {value?.trim() ? value : "Acte introuvable ou inaccessible"}
            </p>
            <p className="text-[10.5px] text-fg-subtle">
              Dispense accordée · Carte complétable à 100%
            </p>
          </div>
        ) : (
          <Inline
            slug={slug}
            target={target}
            value={value}
            placeholder="lien ou cote"
            variant="source"
            fill
          />
        )}
      </div>

      {/* Modal / Popover de choix du motif */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-fg">Ignorer l’exigence de l’acte</h3>
                <p className="mt-1 text-xs text-fg-subtle">
                  Cet acte ne sera plus requis pour que la carte soit considérée comme
                  complète (100 %).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIgnore} className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-fg-muted">
                Motif principal :
              </label>
              <div className="flex flex-col gap-1.5 text-xs">
                {COMMON_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition-colors ${
                      selectedReason === reason
                        ? "border-fg bg-surface-2 font-medium text-fg"
                        : "border-border bg-surface hover:bg-surface-2/60 text-fg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-fg"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Précision ou cote de référence (optionnel) :
                </label>
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Ex : Registres de Paris brûlés en 1871, lacune 1702-1715…"
                  className="field w-full text-xs"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-fg px-3.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Enregistrement…" : "Confirmer et ignorer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
