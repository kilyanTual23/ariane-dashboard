"use client";

import { useState, type ReactNode } from "react";

import { Dialog } from "@/components/Dialog";
import { IconExternalLink } from "@/components/icons";
import { Toggle } from "@/components/Toggle";
import { buttonClass } from "@/components/ui";
import {
  buildGeneanetSearchUrl,
  extractCommune,
  extractNamesFromRef,
  type GeneanetSearchParams,
} from "@/lib/geneanet";
import type { Person } from "@/lib/types";

type Preset = "wide" | "standard" | "precise";

/** Une ligne de critère : interrupteur, intitulé, puis les champs à préciser. */
function Criterion({
  label,
  hint,
  on,
  onToggle,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`grid gap-2 py-3 sm:grid-cols-[11rem_1fr] sm:items-center ${disabled ? "opacity-50" : ""}`}>
      <label className="flex items-center gap-2.5 text-ui">
        <Toggle checked={on} onChange={onToggle} label={label} />
        <span>
          <span className="block font-medium">{label}</span>
          {hint && <span className="block text-2xs text-fg-subtle">{hint}</span>}
        </span>
      </label>
      <div className={`flex min-w-0 gap-2 transition-opacity ${on ? "" : "pointer-events-none opacity-40"}`}>{children}</div>
    </div>
  );
}

/**
 * Recherche Geneanet préremplie avec ce que la fiche sait déjà ; chaque
 * critère s'active ou se retire d'un geste avant d'ouvrir la recherche.
 */
export function GeneanetSearchModal({
  person,
  isOpen,
  onClose,
}: {
  person: Person;
  isOpen: boolean;
  onClose: () => void;
}) {
  const fatherRef = person.parents.find((p) => p.sex === "M");
  const motherRef = person.parents.find((p) => p.sex === "F");
  const fatherNames = extractNamesFromRef(fatherRef);
  const motherNames = extractNamesFromRef(motherRef);
  const firstSpouse = person.unions.find((u) => u.spouse)?.spouse || null;
  const spouseNames = extractNamesFromRef(firstSpouse);
  const defaultPlace = extractCommune(person.birth_place) || extractCommune(person.death_place) || "";
  const defaultFrom = person.birth_year ? Math.max(1000, person.birth_year - 5) : "";
  const defaultTo = person.death_year ? person.death_year + 5 : person.birth_year ? person.birth_year + 80 : "";

  const [preset, setPreset] = useState<Preset>("wide");
  const [useSurname, setUseSurname] = useState(true);
  const [surname, setSurname] = useState(person.surname || "");
  const [useGivenNames, setUseGivenNames] = useState(true);
  const [givenNames, setGivenNames] = useState(person.given_names || "");
  const [prenomOperateur, setPrenomOperateur] = useState<"or" | "and">("or");
  const [useSex, setUseSex] = useState(false);
  const [sexe, setSexe] = useState<"H" | "F" | "">(person.sex === "M" ? "H" : person.sex === "F" ? "F" : "");
  const [useSpouse, setUseSpouse] = useState(false);
  const [spouseSurname, setSpouseSurname] = useState(spouseNames.surname);
  const [spouseGivenNames, setSpouseGivenNames] = useState(spouseNames.given_names);
  const [useFather, setUseFather] = useState(false);
  const [fatherSurname, setFatherSurname] = useState(fatherNames.surname);
  const [fatherGivenNames, setFatherGivenNames] = useState(fatherNames.given_names);
  const [useMother, setUseMother] = useState(false);
  const [motherSurname, setMotherSurname] = useState(motherNames.surname);
  const [motherGivenNames, setMotherGivenNames] = useState(motherNames.given_names);
  const [usePlace, setUsePlace] = useState(false);
  const [place, setPlace] = useState(defaultPlace);
  const [usePeriod, setUsePeriod] = useState(false);
  const [fromYear, setFromYear] = useState<string | number>(defaultFrom);
  const [toYear, setToYear] = useState<string | number>(defaultTo);
  const [useOccupation, setUseOccupation] = useState(false);
  const [occupation, setOccupation] = useState(person.occupation || "");

  const params: GeneanetSearchParams = {
    nom: useSurname ? surname : "",
    prenom: useGivenNames ? givenNames : "",
    prenomOperateur,
    sexe: useSex ? sexe : "",
    nomConjoint: useSpouse ? spouseSurname : "",
    prenomConjoint: useSpouse ? spouseGivenNames : "",
    nomPere: useFather ? fatherSurname : "",
    prenomPere: useFather ? fatherGivenNames : "",
    nomMere: useMother ? motherSurname : "",
    prenomMere: useMother ? motherGivenNames : "",
    place: usePlace ? place : "",
    from: usePeriod ? fromYear : "",
    to: usePeriod ? toYear : "",
    profession: useOccupation ? occupation : "",
  };
  const url = buildGeneanetSearchUrl(params);
  const activeCount = [useSurname, useGivenNames, useSex, useSpouse, useFather, useMother, usePlace, usePeriod, useOccupation].filter(Boolean).length;

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setUseSurname(true);
    setUseGivenNames(true);
    setPrenomOperateur(p === "precise" ? "and" : "or");
    setUseSex(p === "precise" && Boolean(sexe));
    setUseSpouse(p !== "wide" && Boolean(firstSpouse));
    setUseFather(p === "precise" && Boolean(fatherRef));
    setUseMother(p === "precise" && Boolean(motherRef));
    setUsePlace(p !== "wide" && Boolean(defaultPlace));
    setUsePeriod(p !== "wide" && Boolean(defaultFrom || defaultTo));
    setUseOccupation(p === "precise" && Boolean(person.occupation));
  };

  const presets: [Preset, string][] = [
    ["wide", "Large"],
    ["standard", "Standard"],
    ["precise", "Précise"],
  ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="Rechercher sur Geneanet"
      description={`Critères préremplis depuis la fiche de ${person.displayName}.`}
      footer={
        <>
          <span className="mr-auto text-xs text-fg-subtle">
            <span className="num">{activeCount}</span> critère{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}
          </span>
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Fermer
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClose} className={buttonClass("primary")}>
            Lancer la recherche
            <IconExternalLink size={14} />
          </a>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-fg-muted">Précision</span>
        <div className="flex h-8 rounded-lg border border-border bg-surface-2/70 p-0.5" role="radiogroup" aria-label="Précision de la recherche">
          {presets.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={preset === key}
              onClick={() => applyPreset(key)}
              className={`rounded-md px-3 text-xs transition-colors ${
                preset === key ? "bg-surface font-medium text-fg shadow-xs" : "text-fg-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 divide-y divide-border">
        <Criterion label="Nom" on={useSurname} onToggle={setUseSurname}>
          <input className="field" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="DUPONT" />
        </Criterion>
        <Criterion label="Prénoms" on={useGivenNames} onToggle={setUseGivenNames}>
          <input className="field" value={givenNames} onChange={(e) => setGivenNames(e.target.value)} placeholder="Jean Marie" />
          <select
            className="field w-40 shrink-0"
            value={prenomOperateur}
            onChange={(e) => setPrenomOperateur(e.target.value as "or" | "and")}
            aria-label="Prénoms multiples"
          >
            <option value="or">L’un d’eux</option>
            <option value="and">Tous</option>
          </select>
        </Criterion>
        <Criterion label="Sexe" on={useSex} onToggle={setUseSex}>
          <select className="field w-40" value={sexe} onChange={(e) => setSexe(e.target.value as "H" | "F")}>
            <option value="H">Homme</option>
            <option value="F">Femme</option>
          </select>
        </Criterion>
        <Criterion label="Conjoint" hint={firstSpouse ? undefined : "Absent de la fiche"} on={useSpouse} onToggle={setUseSpouse}>
          <input className="field" value={spouseSurname} onChange={(e) => setSpouseSurname(e.target.value)} placeholder="Nom" />
          <input className="field" value={spouseGivenNames} onChange={(e) => setSpouseGivenNames(e.target.value)} placeholder="Prénom" />
        </Criterion>
        <Criterion label="Père" hint={fatherRef ? undefined : "Absent de la fiche"} on={useFather} onToggle={setUseFather}>
          <input className="field" value={fatherSurname} onChange={(e) => setFatherSurname(e.target.value)} placeholder="Nom" />
          <input className="field" value={fatherGivenNames} onChange={(e) => setFatherGivenNames(e.target.value)} placeholder="Prénom" />
        </Criterion>
        <Criterion label="Mère" hint={motherRef ? undefined : "Absente de la fiche"} on={useMother} onToggle={setUseMother}>
          <input className="field" value={motherSurname} onChange={(e) => setMotherSurname(e.target.value)} placeholder="Nom" />
          <input className="field" value={motherGivenNames} onChange={(e) => setMotherGivenNames(e.target.value)} placeholder="Prénom" />
        </Criterion>
        <Criterion label="Commune" on={usePlace} onToggle={setUsePlace}>
          <input className="field" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Rennes" />
        </Criterion>
        <Criterion label="Période" on={usePeriod} onToggle={setUsePeriod}>
          <input className="field num" type="number" value={fromYear} onChange={(e) => setFromYear(e.target.value)} placeholder="De" aria-label="De l’année" />
          <input className="field num" type="number" value={toYear} onChange={(e) => setToYear(e.target.value)} placeholder="À" aria-label="À l’année" />
        </Criterion>
        <Criterion label="Profession" on={useOccupation} onToggle={setUseOccupation}>
          <input className="field" value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Cultivateur" />
        </Criterion>
      </div>
    </Dialog>
  );
}
