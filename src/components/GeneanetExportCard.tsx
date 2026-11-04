"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function GeneanetExportCard({ slug }: { slug: string }) {
  const [sosaOnly, setSosaOnly] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [protectLiving, setProtectLiving] = useState(false);

  const queryParams = new URLSearchParams();
  if (sosaOnly) queryParams.set("sosa", "1");
  if (!includeSources) queryParams.set("sources", "0");
  if (!includeNotes) queryParams.set("notes", "0");
  if (protectLiving) queryParams.set("protect_living", "1");

  const queryString = queryParams.toString();
  const exportUrl = `/api/profils/${slug}/export/gedcom${queryString ? `?${queryString}` : ""}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Générez un fichier <strong>GEDCOM 5.5.1</strong> spécialement calibré pour l&apos;import Geneanet :
        dates normalisées en anglais standard (<code>19 NOV 1882</code>, <code>ABT 1810</code>), numéros SOSA préservés,
        sources/permaliens et protection de la vie privée.
      </p>

      {/* Options de configuration de l'export */}
      <div className="grid gap-2.5 rounded-lg border border-border bg-surface-2/60 p-3.5 text-xs text-fg sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={sosaOnly}
            onChange={(e) => setSosaOnly(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <div>
            <span className="font-medium">Ascendants directs uniquement (SOSA)</span>
            <p className="text-[11px] text-fg-subtle">
              Exclut les collatéraux et les branches sans filiation directe.
            </p>
          </div>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={includeSources}
            onChange={(e) => setIncludeSources(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <div>
            <span className="font-medium">Inclure les sources et permaliens</span>
            <p className="text-[11px] text-fg-subtle">
              Transcriptions d&apos;actes et liens d&apos;archives dans les balises SOUR.
            </p>
          </div>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(e) => setIncludeNotes(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <div>
            <span className="font-medium">Inclure les notes</span>
            <p className="text-[11px] text-fg-subtle">
              Notes de recherche et annotations biographiques.
            </p>
          </div>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={protectLiving}
            onChange={(e) => setProtectLiving(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <div>
            <span className="font-medium">Masquer les personnes vivantes (RGPD)</span>
            <p className="text-[11px] text-fg-subtle">
              Anonymise les noms et applique le tag <code>RESN privacy</code>.
            </p>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <a
          href={exportUrl}
          className={buttonClass("primary")}
          download
        >
          <span>📥</span>
          <span>Télécharger le GEDCOM (.ged)</span>
        </a>

        <a
          href="https://my.geneanet.org/arbre/"
          target="_blank"
          rel="noreferrer"
          className={buttonClass("ghost")}
          title="Ouvrir la page d'import Geneanet dans un nouvel onglet"
        >
          <span>Ouvrir l&apos;import Geneanet ↗</span>
        </a>
      </div>
    </div>
  );
}

