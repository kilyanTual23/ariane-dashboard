"use client";

import { useState } from "react";

import { IconDownload, IconExternalLink } from "@/components/icons";
import { Toggle } from "@/components/Toggle";
import { buttonClass } from "@/components/ui";

function Option({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-ui font-medium">{title}</span>
        <span className="block text-xs text-fg-subtle">{hint}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </label>
  );
}

/**
 * Export GEDCOM 5.5.1 calibré pour l'import Geneanet : dates en anglais
 * normalisé (19 NOV 1882, ABT 1810), numéros Sosa, sources et vie privée.
 */
export function GeneanetExportCard({ slug }: { slug: string }) {
  const [sosaOnly, setSosaOnly] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [protectLiving, setProtectLiving] = useState(true);

  const query = new URLSearchParams();
  if (sosaOnly) query.set("sosa", "1");
  if (!includeSources) query.set("sources", "0");
  if (!includeNotes) query.set("notes", "0");
  if (protectLiving) query.set("protect_living", "1");
  const qs = query.toString();
  const exportUrl = `/api/profils/${slug}/export/gedcom${qs ? `?${qs}` : ""}`;

  return (
    <div>
      <div className="-mt-3 divide-y divide-border">
        <Option
          title="Ancêtres directs uniquement"
          hint="Exclut les collatéraux et les branches sans filiation Sosa."
          checked={sosaOnly}
          onChange={setSosaOnly}
        />
        <Option
          title="Sources et liens d’archives"
          hint="Permaliens et transcriptions d’actes dans les balises SOUR."
          checked={includeSources}
          onChange={setIncludeSources}
        />
        <Option
          title="Notes de recherche"
          hint="Hypothèses et annotations biographiques."
          checked={includeNotes}
          onChange={setIncludeNotes}
        />
        <Option
          title="Masquer les personnes vivantes"
          hint="Anonymise leurs noms et ajoute la restriction RESN privacy (RGPD)."
          checked={protectLiving}
          onChange={setProtectLiving}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={exportUrl} className={buttonClass("primary")} download>
          <IconDownload size={14} />
          Télécharger le GEDCOM
        </a>
        <a
          href="https://my.geneanet.org/arbre/"
          target="_blank"
          rel="noreferrer"
          className={buttonClass("secondary")}
          title="Ouvrir la page d’import de Geneanet"
        >
          Import Geneanet
          <IconExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
