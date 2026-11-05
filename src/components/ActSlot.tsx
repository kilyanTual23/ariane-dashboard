"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { downloadActAction, toggleActIgnoredAction } from "@/app/actions";
import { Dialog, toFormData } from "@/components/Dialog";
import {
  IconBan,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconImage,
  IconMore,
  IconPencil,
  IconUndo,
  Spinner,
} from "@/components/icons";
import { Inline, type InlineTarget } from "@/components/Inline";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { errorMessage, useToast } from "@/components/Toast";
import { buttonClass } from "@/components/ui";
import { sourceLabel } from "@/lib/dates";

// La visionneuse est lourde (canvas, OCR) : chargée seulement quand on l'ouvre.
const ActViewerModal = dynamic(() => import("@/components/ActViewerModal").then((m) => m.ActViewerModal), {
  ssr: false,
});

const COMMON_REASONS = [
  { value: "Introuvable (archives lacunaires)", hint: "Registre manquant ou page absente" },
  { value: "Inaccessible (délai légal 75/100 ans)", hint: "Acte trop récent pour être communicable" },
  { value: "Archives détruites ou disparues", hint: "Incendie, guerre, perte du registre" },
  { value: "Non mentionné / Sans motif particulier", hint: "Aucun motif à retenir" },
] as const;

export function ActSlot({
  slug,
  personId,
  unionId,
  actKind,
  label = "Acte",
  value,
  isIgnored,
  localVersion = null,
  viewerTitle,
  variant = "slot",
}: {
  slug: string;
  personId?: number;
  unionId?: number;
  actKind: "birth" | "death" | "marriage";
  label?: string;
  value: string | null | undefined;
  isIgnored: boolean;
  /** Version de la copie locale de l'image (null : pas encore téléchargée). */
  localVersion?: number | null;
  /** Titre de la visionneuse, par exemple « Acte de naissance · Jean TUAL ». */
  viewerTitle?: string;
  /** « cell » : cellule de tableau sans cadre ni intitulé (la colonne le porte). */
  variant?: "slot" | "cell";
}) {
  const cell = variant === "cell";
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [optimisticIgnored, setOptimisticIgnored] = useState(isIgnored);
  const [lastIgnored, setLastIgnored] = useState(isIgnored);
  const [reason, setReason] = useState<string>(COMMON_REASONS[0].value);
  const [precision, setPrecision] = useState("");

  if (isIgnored !== lastIgnored) {
    setLastIgnored(isIgnored);
    setOptimisticIgnored(isIgnored);
  }

  const isLink = Boolean(value?.startsWith("http"));
  const hasLocalCopy = localVersion !== null;
  // La version dans l'adresse : une nouvelle copie remplace aussitôt l'ancienne, cache compris.
  const localImageUrl = personId
    ? `/api/actes/person_${personId}_${actKind}.jpg?v=${localVersion}`
    : unionId
      ? `/api/actes/union_${unionId}_marriage.jpg?v=${localVersion}`
      : null;
  const showViewer = hasLocalCopy && !!localImageUrl && !editingUrl && !optimisticIgnored && !downloading;

  const target: InlineTarget =
    actKind === "marriage" && unionId
      ? { kind: "union", unionId, field: "source" }
      : { kind: "person", personId: personId!, field: actKind === "birth" ? "birth_source" : "death_source" };

  const ids = { slug, personId, unionId, actKind };

  const download = (url = value) => {
    if (!url?.startsWith("http")) return;
    setDownloading(true);
    startTransition(async () => {
      try {
        const res = await downloadActAction(toFormData({ ...ids, url }));
        if (res.ok) toast.success("Image de l’acte téléchargée", "Elle reste consultable même si le site d’archives change.");
        else toast.error("Téléchargement impossible", res.error);
      } catch (err) {
        toast.error("Téléchargement impossible", errorMessage(err));
      } finally {
        setDownloading(false);
      }
    });
  };

  // Nouveau lien enregistré : on récupère aussitôt l'image correspondante.
  const onLinkSaved = (saved: string) => {
    setEditingUrl(false);
    download(saved);
  };

  const ignore = () => {
    const chosen = (precision.trim() || reason).trim();
    setIgnoreOpen(false);
    setOptimisticIgnored(true);
    startTransition(async () => {
      try {
        await toggleActIgnoredAction(
          toFormData({
            ...ids,
            ignored: 1,
            reason: chosen && chosen !== "Non mentionné / Sans motif particulier" ? chosen : null,
          }),
        );
        toast.success("Acte dispensé", "Il ne compte plus dans la complétion de la fiche.");
      } catch (err) {
        setOptimisticIgnored(isIgnored);
        toast.error("Modification impossible", errorMessage(err));
      }
    });
  };

  const restore = () => {
    setOptimisticIgnored(false);
    const wasReason =
      value &&
      (COMMON_REASONS.some((r) => value.includes(r.value)) ||
        value.startsWith("Introuvable") ||
        value.startsWith("Inaccessible") ||
        value.startsWith("Archives détruites"));
    startTransition(async () => {
      try {
        await toggleActIgnoredAction(toFormData({ ...ids, ignored: 0, reason: wasReason ? "clear" : null }));
        toast.success("Acte de nouveau requis");
      } catch (err) {
        setOptimisticIgnored(isIgnored);
        toast.error("Modification impossible", errorMessage(err));
      }
    });
  };

  const filled = Boolean(value?.trim()) || (hasLocalCopy && !!localImageUrl);

  const menu = (
    <Menu
      align="end"
      panelClassName="w-60"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Actions sur l’${label.toLowerCase()}`}
          className={`${cell ? "size-7" : "-mr-1.5 -mt-1 size-6"} flex items-center justify-center rounded-md text-fg-subtle transition-[opacity,background-color] hover:bg-surface-2 hover:text-fg ${
            props.open ? "bg-surface-2 opacity-100" : "opacity-60 group-hover/slot:opacity-100"
          }`}
        >
          {pending ? <Spinner size={12} /> : <IconMore size={14} />}
        </button>
      )}
    >
      {isLink && !optimisticIgnored && (
        <MenuItem icon={<IconDownload size={14} />} onSelect={() => download()} disabled={downloading}>
          {hasLocalCopy ? "Télécharger de nouveau l’image" : "Télécharger l’image de l’acte"}
        </MenuItem>
      )}
      {isLink && (
        <>
          <MenuItem
            icon={<IconCopy size={14} />}
            onSelect={() => {
              navigator.clipboard.writeText(value!);
              toast.success("Lien copié");
            }}
          >
            Copier le lien
          </MenuItem>
          <MenuItem icon={<IconExternalLink size={14} />} onSelect={() => window.open(value!, "_blank", "noopener")}>
            Ouvrir sur le site d’archives
          </MenuItem>
        </>
      )}
      {!optimisticIgnored && filled && (
        <MenuItem icon={<IconPencil size={14} />} onSelect={() => setEditingUrl(true)}>
          Modifier le lien ou la cote
        </MenuItem>
      )}
      {(isLink || filled) && <MenuSeparator />}
      {optimisticIgnored ? (
        <MenuItem icon={<IconUndo size={14} />} onSelect={restore}>
          Exiger de nouveau cet acte
        </MenuItem>
      ) : (
        <MenuItem icon={<IconBan size={14} />} onSelect={() => setIgnoreOpen(true)}>
          Dispenser cet acte
        </MenuItem>
      )}
    </Menu>
  );

  const content = (
    <div className="flex min-w-0 flex-1 flex-col text-sm">
      {optimisticIgnored ? (
        <button
          type="button"
          onClick={restore}
          title="Cliquer pour exiger de nouveau cet acte"
          className={`group/ign flex min-w-0 flex-1 flex-col items-start text-left ${
            cell ? "-mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2" : ""
          }`}
        >
          <span className="flex max-w-full items-center gap-1.5 text-fg-muted">
            <IconBan size={13} className="shrink-0" />
            <span className="truncate">{value?.trim() ? sourceLabel(value) : "Introuvable ou inaccessible"}</span>
          </span>
          <span className="text-2xs text-fg-subtle group-hover/ign:text-fg-muted">Dispensé · ne compte pas</span>
        </button>
      ) : downloading ? (
        <div className={`flex min-w-0 items-center gap-2 text-xs text-fg-muted ${cell ? "py-1.5" : ""}`}>
          <Spinner size={12} />
          <span className="truncate">Téléchargement de l’acte…</span>
        </div>
      ) : showViewer ? (
        <div className={`flex min-w-0 items-center gap-2 ${cell ? "py-0.5" : ""}`}>
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className={buttonClass("secondary", "", "sm")}
            title="Ouvrir la visionneuse : zoom, filtres, transcription"
          >
            <IconImage size={13} />
            Voir l’acte
          </button>
          {isLink && <span className="truncate text-2xs text-fg-subtle">{sourceLabel(value)}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Inline
              slug={slug}
              target={target}
              value={value}
              placeholder="Lien ou cote…"
              variant="source"
              label={label}
              fill={!cell}
              cell={cell}
              onSaved={onLinkSaved}
            />
          </div>
          {editingUrl && (
            <button type="button" onClick={() => setEditingUrl(false)} className={buttonClass("secondary", "", "xs")}>
              OK
            </button>
          )}
        </div>
      )}
    </div>

  );

  const overlays = (
    <>
      <Dialog
        open={ignoreOpen}
        onClose={() => setIgnoreOpen(false)}
        size="md"
        title="Dispenser cet acte"
        description="L’acte ne sera plus exigé : la fiche pourra atteindre 100 % malgré son absence. Vous pourrez revenir sur ce choix."
        footer={
          <>
            <button type="button" onClick={() => setIgnoreOpen(false)} className={buttonClass("secondary")}>
              Annuler
            </button>
            <button type="button" onClick={ignore} className={buttonClass("primary")}>
              Dispenser l’acte
            </button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="label">Motif</legend>
          {COMMON_REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                reason === r.value ? "border-fg/50 bg-surface-2" : "border-border hover:bg-surface-2/60"
              }`}
            >
              <input
                type="radio"
                name="reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-0.5 accent-[var(--fg)]"
              />
              <span>
                <span className="block text-ui font-medium">{r.value}</span>
                <span className="block text-xs text-fg-subtle">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="mt-4 block">
          <span className="label">Précision ou cote (facultatif)</span>
          <input
            value={precision}
            onChange={(e) => setPrecision(e.target.value)}
            placeholder="Ex. Registres de Paris brûlés en 1871, lacune 1702-1715…"
            className="field"
          />
        </label>
      </Dialog>

      {viewerOpen && localImageUrl && (
        <ActViewerModal
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          imageUrl={localImageUrl}
          title={viewerTitle ?? label}
          originalUrl={value}
          downloadFilename={`acte_${slug}_${actKind}_${personId ?? unionId}.jpg`}
          slug={slug}
          personId={personId}
          unionId={unionId}
          actKind={actKind}
        />
      )}
    </>
  );

  if (cell) {
    return (
      <div className="group/slot flex min-w-0 items-start gap-1">
        {content}
        <div className="shrink-0 pt-0.5">{menu}</div>
        {overlays}
      </div>
    );
  }

  return (
    <div className={`slot group/slot ${optimisticIgnored ? "slot-dispensed" : filled ? "" : "slot-empty"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="slot-label">{label}</span>
        {menu}
      </div>
      {content}
      {overlays}
    </div>
  );
}
