"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { searchArchivesAction } from "@/app/actions";
import { Dialog } from "@/components/Dialog";
import { IconAlert, IconCheck, IconExternalLink, IconLink, IconSearch, Spinner } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import type { ActKind, ArchiveRegister, ArchiveSearchResult } from "@/lib/archives/types";

/** Départements branchés (tenu à jour avec src/lib/archives/index.ts). */
const DEPTS = [
  { code: "19", name: "Corrèze", of: "de la Corrèze" },
  { code: "35", name: "Ille-et-Vilaine", of: "d’Ille-et-Vilaine" },
  { code: "53", name: "Mayenne", of: "de la Mayenne" },
  { code: "76", name: "Seine-Maritime", of: "de la Seine-Maritime" },
];

/** « Ille-et-Vilaine » → « d’Ille-et-Vilaine », « Corrèze » → « de la Corrèze ». */
const deptOf = (nameOrCode?: string | null) =>
  DEPTS.find((d) => d.name === nameOrCode || d.code === nameOrCode)?.of ?? "";

const KIND_LABEL: Record<ActKind, string> = { birth: "naissance", marriage: "mariage", death: "décès" };

/** Les registres utiles d'abord : le bon type d'acte, puis les autres, les tables à part. */
function rank(registers: ArchiveRegister[], kind: ActKind) {
  const span = (r: ArchiveRegister) => {
    const [a, b] = r.years.split("-").map(Number);
    return (b || a) - a;
  };
  const sorted = [...registers].sort(
    (a, b) =>
      Number(!a.kinds.includes(kind)) - Number(!b.kinds.includes(kind)) ||
      span(a) - span(b) ||
      (a.parish ?? "").localeCompare(b.parish ?? "", "fr"),
  );
  return { registers: sorted.filter((r) => !r.isTable), tables: sorted.filter((r) => r.isTable) };
}

export function ArchiveSearchDialog({
  open,
  onClose,
  actKind,
  place,
  year,
  onPickLink,
}: {
  open: boolean;
  onClose: () => void;
  actKind: ActKind;
  place?: string | null;
  year?: number | null;
  /** Lien de la page de l'acte, collé par l'utilisateur : la case l'enregistre et télécharge l'image. */
  onPickLink: (url: string) => void;
}) {
  const [commune, setCommune] = useState("");
  const [dept, setDept] = useState("");
  const [yearText, setYearText] = useState(year ? String(year) : "");
  const [result, setResult] = useState<ArchiveSearchResult | null>(null);
  const [link, setLink] = useState("");
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  const run = (over: { commune?: string; dept?: string; year?: string } = {}) => {
    const c = over.commune ?? commune;
    const d = over.dept ?? dept;
    const y = Number(over.year ?? yearText);
    startTransition(async () => {
      try {
        const res = await searchArchivesAction({ place: c ? null : place, commune: c || null, dept: d || null, year: y });
        setCommune(res.commune);
        if (res.dept) setDept(res.dept);
        setResult(res.result);
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : "La recherche a échoué." });
      }
    });
  };

  // À l'ouverture : recherche lancée d'emblée avec le lieu et l'année de la fiche.
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    if (place && year) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const deptName = DEPTS.find((d) => d.code === dept)?.name;
  const slow = dept === "35";
  const ranked = result?.ok ? rank(result.registers, actKind) : null;
  const validLink = /^https?:\/\/\S+$/.test(link.trim());

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      autoFocusField={false}
      title={`Chercher l’acte de ${KIND_LABEL[actKind]}`}
      description="Les registres numérisés de la commune pour l’année, sur le site des archives départementales. Ouvrez le bon registre, trouvez l’acte, puis collez ici le lien de la page."
      footer={
        <form
          className="flex w-full flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validLink) return;
            onPickLink(link.trim());
            setLink("");
            onClose();
          }}
        >
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Lien de la page de l’acte</span>
            <IconLink size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Coller le lien de la page de l’acte…"
              className="field pl-9"
              inputMode="url"
            />
          </label>
          <button type="submit" disabled={!validLink} className={buttonClass("primary")}>
            <IconCheck size={14} />
            Enregistrer le lien
          </button>
        </form>
      }
    >
      <form
        className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_11rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className="block">
          <span className="label">Commune</span>
          <input
            value={commune}
            onChange={(e) => setCommune(e.target.value)}
            placeholder={place?.split(",")[0] || "Commune de l’acte"}
            className="field"
          />
        </label>
        <label className="block">
          <span className="label">Année</span>
          <input
            value={yearText}
            onChange={(e) => setYearText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="1750"
            className="field num"
          />
        </label>
        <label className="block">
          <span className="label">Département</span>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="field">
            <option value="">Selon le lieu</option>
            {DEPTS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button type="submit" disabled={pending} className={buttonClass("secondary", "w-full justify-center")}>
            {pending ? <Spinner size={13} /> : <IconSearch size={14} />}
            Rechercher
          </button>
        </div>
      </form>

      <div className="mt-5 min-h-40">
        {pending ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-ui text-fg-muted">
            <Spinner size={18} />
            <p>Recherche sur le site des archives{deptName ? ` ${deptOf(deptName)}` : ""}…</p>
            {slow && <p className="text-xs text-fg-subtle">Ce site est lent : comptez une dizaine de secondes.</p>}
          </div>
        ) : !result ? (
          <p className="py-10 text-center text-ui text-fg-muted">
            {place ? "Indiquez l’année de l’acte pour lancer la recherche." : "Indiquez la commune et l’année de l’acte."}
          </p>
        ) : !result.ok ? (
          <div className="rounded-xl border border-border bg-surface-2/50 p-4">
            <p className="flex items-start gap-2 text-ui text-fg">
              <IconAlert size={15} className="mt-0.5 shrink-0 text-warn" />
              {result.error}
            </p>
            {result.suggestions && result.suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-fg-subtle">Vouliez-vous dire :</span>
                {result.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setCommune(s);
                      run({ commune: s });
                    }}
                    className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs text-fg-subtle">
              {result.commune} · <span className="num">{result.year}</span> · Archives{" "}
              {deptOf(result.dept)} ·{" "}
              <span className="num">{result.registers.length}</span> registre{result.registers.length > 1 ? "s" : ""}
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {ranked!.registers.map((r) => (
                <RegisterRow key={r.id + r.url} r={r} match={r.kinds.includes(actKind)} />
              ))}
            </ul>
            {ranked!.tables.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-xs font-medium text-fg-subtle">Tables (pour retrouver la date exacte)</p>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {ranked!.tables.map((r) => (
                    <RegisterRow key={r.id + r.url} r={r} match={r.kinds.includes(actKind)} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function RegisterRow({ r, match }: { r: ArchiveRegister; match: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ui">
          <span className="font-medium text-fg">{r.parish ?? r.commune}</span>
          <span className="text-fg-muted">{r.typeLabel}</span>
          {match && !r.isTable && (
            <span className="rounded-full bg-accent-soft px-2 py-px text-2xs font-medium text-accent-text">Correspond</span>
          )}
        </p>
        <p className="num mt-0.5 text-xs text-fg-subtle">
          {r.years}
          {r.cote ? ` · ${r.cote}` : ""}
          {r.pages ? ` · ${r.pages} vue${r.pages > 1 ? "s" : ""}` : ""}
        </p>
      </div>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass(match && !r.isTable ? "primary" : "secondary", "shrink-0", "sm")}
      >
        Ouvrir
        <IconExternalLink size={12} />
      </a>
    </li>
  );
}
