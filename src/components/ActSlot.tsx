"use client";

import { useEffect, useState, useTransition } from "react";
import { downloadActAction, toggleActIgnoredAction } from "@/app/actions";
import { Inline, type InlineTarget } from "@/components/Inline";
import { ActViewerModal } from "@/components/ActViewerModal";

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
  hasLocalCopy = false,
}: {
  slug: string;
  personId?: number;
  unionId?: number;
  actKind: "birth" | "death" | "marriage";
  label?: string;
  value: string | null | undefined;
  isIgnored: boolean;
  hasLocalCopy?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [optimisticIgnored, setOptimisticIgnored] = useState(isIgnored);
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const localImageUrl =
    personId
      ? `/api/actes/person_${personId}_${actKind}.jpg`
      : unionId
        ? `/api/actes/union_${unionId}_marriage.jpg`
        : null;

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

  const handleDownload = () => {
    if (!value?.startsWith("http")) return;
    setDownloading(true);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("slug", slug);
        fd.append("url", value);
        if (personId) fd.append("personId", String(personId));
        if (unionId) fd.append("unionId", String(unionId));
        fd.append("actKind", actKind);
        await downloadActAction(fd);
      } finally {
        setDownloading(false);
      }
    });
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
          : value?.trim() || (hasLocalCopy && localImageUrl)
            ? ""
            : "slot-empty"
      }`}
    >
      {/* En-tête du Slot */}
      <div className="flex items-center justify-between gap-1 pb-0.5">
        <span className="slot-label">{label}</span>

        <div className="flex items-center gap-1.5">
          {!hasLocalCopy && value?.startsWith("http") && !optimisticIgnored && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              title="Télécharger une copie haute définition sur le serveur en cas d'indisponibilité du lien"
            >
              {downloading ? "⏳" : "⬇️ Sauvegarder"}
            </button>
          )}

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
      </div>

      {/* Contenu principal du Slot */}
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
        ) : hasLocalCopy && localImageUrl && !editingUrl ? (
          /* Mode par défaut épuré : lien direct vers la visionneuse sans badge encombrant */
          <div className="flex items-center justify-between gap-1 py-0.5">
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="group/btn flex min-w-0 flex-1 items-center gap-1.5 rounded text-left text-xs text-fg transition-colors hover:text-accent"
              title="Consulter l'acte dans la visionneuse interactive"
            >
              <span className="text-xs shrink-0">🖼️</span>
              <span className="truncate font-medium text-fg underline decoration-border-strong underline-offset-4 group-hover/btn:decoration-accent group-hover/btn:text-accent">
                Consulter l’acte
              </span>
            </button>

            {/* Accès discret au lien d'origine, copie et modification */}
            <div className="flex shrink-0 items-center gap-0.5">
              {value?.startsWith("http") && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(value);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 1500);
                    }}
                    className="flex size-5 items-center justify-center rounded text-[11px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                    title={copiedUrl ? "Lien copié !" : "Copier le permalien d'origine"}
                  >
                    {copiedUrl ? (
                      <span className="text-emerald-500 font-bold text-[10px]">✓</span>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="size-3"
                      >
                        <path fillRule="evenodd" d="M11 2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM5 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H5Z" clipRule="evenodd" />
                        <path d="M3 5a1 1 0 0 0-1 1v7a2 2 0 0 0 2 2h7a1 1 0 1 0 0-2H4a1 1 0 0 1-1-1V6a1 1 0 0 0-1-1Z" />
                      </svg>
                    )}
                  </button>
                  <a
                    href={value}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-5 items-center justify-center rounded text-[11px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                    title={`Ouvrir le permalien d'origine (${value})`}
                  >
                    ↗
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={() => setEditingUrl(true)}
                className="flex size-5 items-center justify-center rounded text-[11px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                title="Modifier l'URL d'origine"
              >
                ✎
              </button>
            </div>
          </div>
        ) : (
          /* Mode saisie ou modification d'URL */
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <Inline
                slug={slug}
                target={target}
                value={value}
                placeholder="lien ou cote"
                variant="source"
                fill
              />
            </div>
            {editingUrl && (
              <button
                type="button"
                onClick={() => setEditingUrl(false)}
                className="shrink-0 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-fg hover:bg-surface-3"
                title="Fermer la modification"
              >
                OK
              </button>
            )}
          </div>
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

      {/* Visionneuse interactive complète */}
      {viewerOpen && localImageUrl && (
        <ActViewerModal
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          imageUrl={localImageUrl}
          title={`${label} : ${slug}`}
          originalUrl={value}
          downloadFilename={`acte_${slug}_${actKind}_${personId ?? unionId}.jpg`}
          slug={slug}
          personId={personId}
          unionId={unionId}
          actKind={actKind}
        />
      )}
    </div>
  );
}
