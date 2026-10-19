"use client";

import { useState, useId, useEffect } from "react";
import type { Person } from "@/lib/types";
import {
  buildGeneanetSearchUrl,
  extractNamesFromRef,
  extractCommune,
  type GeneanetSearchParams,
} from "@/lib/geneanet";

interface GeneanetSearchModalProps {
  person: Person;
  isOpen: boolean;
  onClose: () => void;
}

export function GeneanetSearchModal({
  person,
  isOpen,
  onClose,
}: GeneanetSearchModalProps) {
  // Détection des parents
  const fatherRef = person.parents.find((p) => p.sex === "M");
  const motherRef = person.parents.find((p) => p.sex === "F");
  const fatherNames = extractNamesFromRef(fatherRef);
  const motherNames = extractNamesFromRef(motherRef);

  // Détection du premier conjoint
  const firstSpouse = person.unions.find((u) => u.spouse)?.spouse || null;
  const spouseNames = extractNamesFromRef(firstSpouse);

  // Détection des lieux
  const birthCommune = extractCommune(person.birth_place);
  const deathCommune = extractCommune(person.death_place);
  const defaultPlace = birthCommune || deathCommune || "";

  // Détection des années
  const birthYear = person.birth_year;
  const deathYear = person.death_year;
  const defaultFrom = birthYear ? Math.max(1000, birthYear - 5) : "";
  const defaultTo = deathYear
    ? deathYear + 5
    : birthYear
      ? birthYear + 80
      : "";

  // États pour les filtres activables : de base UNIQUEMENT Nom + Prénoms cochés
  const [useSurname, setUseSurname] = useState(true);
  const [surname, setSurname] = useState(person.surname || "");

  const [useGivenNames, setUseGivenNames] = useState(true);
  const [givenNames, setGivenNames] = useState(person.given_names || "");
  const [prenomOperateur, setPrenomOperateur] = useState<"or" | "and">("or");

  const [useSex, setUseSex] = useState(false);
  const [sexe, setSexe] = useState<"H" | "F" | "">(
    person.sex === "M" ? "H" : person.sex === "F" ? "F" : ""
  );

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

  // Réinitialiser les champs quand la personne change
  useEffect(() => {
    if (isOpen) {
      setUseSurname(true);
      setSurname(person.surname || "");
      setUseGivenNames(true);
      setGivenNames(person.given_names || "");
      setPrenomOperateur("or");
      setUseSex(false);
      setSexe(person.sex === "M" ? "H" : person.sex === "F" ? "F" : "");
      setUseSpouse(false);
      setSpouseSurname(spouseNames.surname);
      setSpouseGivenNames(spouseNames.given_names);
      setUseFather(false);
      setFatherSurname(fatherNames.surname);
      setFatherGivenNames(fatherNames.given_names);
      setUseMother(false);
      setMotherSurname(motherNames.surname);
      setMotherGivenNames(motherNames.given_names);
      setUsePlace(false);
      setPlace(defaultPlace);
      setUsePeriod(false);
      setFromYear(defaultFrom);
      setToYear(defaultTo);
      setUseOccupation(false);
      setOccupation(person.occupation || "");
    }
  }, [isOpen, person.id]);

  if (!isOpen) return null;

  // Calcul dynamique de l'URL finale
  const searchParams: GeneanetSearchParams = {
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

  const currentSearchUrl = buildGeneanetSearchUrl(searchParams);

  // Presets rapides
  const applyPreset = (preset: "wide" | "standard" | "precise") => {
    if (preset === "wide") {
      setUseSurname(true);
      setUseGivenNames(true);
      setPrenomOperateur("or");
      setUseSex(false);
      setUseSpouse(false);
      setUseFather(false);
      setUseMother(false);
      setUsePlace(false);
      setUsePeriod(false);
      setUseOccupation(false);
    } else if (preset === "standard") {
      setUseSurname(true);
      setUseGivenNames(true);
      setPrenomOperateur("or");
      setUseSex(false);
      setUseSpouse(Boolean(firstSpouse));
      setUseFather(false);
      setUseMother(false);
      setUsePlace(Boolean(defaultPlace));
      setUsePeriod(Boolean(defaultFrom || defaultTo));
      setUseOccupation(false);
    } else if (preset === "precise") {
      setUseSurname(true);
      setUseGivenNames(true);
      setPrenomOperateur("and");
      setUseSex(Boolean(sexe));
      setUseSpouse(Boolean(firstSpouse));
      setUseFather(Boolean(fatherRef));
      setUseMother(Boolean(motherRef));
      setUsePlace(Boolean(defaultPlace));
      setUsePeriod(Boolean(defaultFrom || defaultTo));
      setUseOccupation(Boolean(person.occupation));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-border bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-surface-2 border border-border text-fg font-semibold text-sm">
              G
            </span>
            <div>
              <h3 className="text-base font-semibold text-fg">Recherche Geneanet</h3>
              <p className="text-xs text-fg-muted">
                Personnalisez les critères de recherche pour {person.displayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Presets rapides */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border/60 bg-surface-2/20 text-xs">
          <span className="text-fg-subtle font-medium">Niveau de filtrage :</span>
          <button
            type="button"
            onClick={() => applyPreset("wide")}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-fg-muted hover:text-fg hover:border-border-strong transition-colors cursor-pointer"
          >
            Large (Nom + Prénom)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("standard")}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-fg-muted hover:text-fg hover:border-border-strong transition-colors cursor-pointer"
          >
            Standard (+ Conjoint & Lieu)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("precise")}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-fg-muted hover:text-fg hover:border-border-strong transition-colors cursor-pointer"
          >
            Précis (+ Parents & Période)
          </button>
        </div>

        {/* Formulaire des critères scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* 1. Identité principale */}
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-fg uppercase tracking-wider">
              1. Identité de la personne
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={useSurname}
                    onChange={(e) => setUseSurname(e.target.checked)}
                    className="accent-fg rounded size-3.5"
                  />
                  <span>Nom de famille</span>
                </label>
                <input
                  type="text"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  disabled={!useSurname}
                  placeholder="Ex: DUPONT"
                  className="field text-xs disabled:opacity-40"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-fg">
                    <input
                      type="checkbox"
                      checked={useGivenNames}
                      onChange={(e) => setUseGivenNames(e.target.checked)}
                      className="accent-fg rounded size-3.5"
                    />
                    <span>Prénom(s)</span>
                  </label>
                  {useGivenNames && (
                    <select
                      value={prenomOperateur}
                      onChange={(e) => setPrenomOperateur(e.target.value as "or" | "and")}
                      className="text-[11px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-fg-muted"
                      title="Opérateur pour prénoms multiples"
                    >
                      <option value="or">Un des prénoms (OR)</option>
                      <option value="and">Tous les prénoms (AND)</option>
                    </select>
                  )}
                </div>
                <input
                  type="text"
                  value={givenNames}
                  onChange={(e) => setGivenNames(e.target.value)}
                  disabled={!useGivenNames}
                  placeholder="Ex: Jean Marie"
                  className="field text-xs disabled:opacity-40"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1 border-t border-border/40">
              <label className="flex items-center gap-2 cursor-pointer text-fg font-medium">
                <input
                  type="checkbox"
                  checked={useSex}
                  onChange={(e) => setUseSex(e.target.checked)}
                  className="accent-fg rounded size-3.5"
                />
                <span>Restreindre par sexe</span>
              </label>
              {useSex && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="geneanet_sex"
                      value="H"
                      checked={sexe === "H"}
                      onChange={() => setSexe("H")}
                      className="accent-fg"
                    />
                    <span>Homme</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="geneanet_sex"
                      value="F"
                      checked={sexe === "F"}
                      onChange={() => setSexe("F")}
                      className="accent-fg"
                    />
                    <span>Femme</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* 2. Conjoint & Union */}
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-fg uppercase tracking-wider text-xs">
                <input
                  type="checkbox"
                  checked={useSpouse}
                  onChange={(e) => setUseSpouse(e.target.checked)}
                  className="accent-fg rounded size-3.5"
                />
                <span>2. Conjoint(e)</span>
              </label>
              {!firstSpouse && (
                <span className="text-[11px] text-fg-subtle italic">Non renseigné sur la fiche</span>
              )}
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${!useSpouse ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex flex-col gap-1">
                <span className="text-fg-subtle text-[11px]">Nom du conjoint</span>
                <input
                  type="text"
                  value={spouseSurname}
                  onChange={(e) => setSpouseSurname(e.target.value)}
                  placeholder="Ex: MARTIN"
                  className="field text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-fg-subtle text-[11px]">Prénom du conjoint</span>
                <input
                  type="text"
                  value={spouseGivenNames}
                  onChange={(e) => setSpouseGivenNames(e.target.value)}
                  placeholder="Ex: Marie"
                  className="field text-xs"
                />
              </div>
            </div>
          </div>

          {/* 3. Parents */}
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-fg uppercase tracking-wider">
              3. Parents (Filiation)
            </span>

            {/* Père */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-fg">
                <input
                  type="checkbox"
                  checked={useFather}
                  onChange={(e) => setUseFather(e.target.checked)}
                  className="accent-fg rounded size-3.5"
                />
                <span>Père</span>
              </label>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5 ${!useFather ? "opacity-40 pointer-events-none" : ""}`}>
                <input
                  type="text"
                  value={fatherSurname}
                  onChange={(e) => setFatherSurname(e.target.value)}
                  placeholder="Nom du père"
                  className="field text-xs"
                />
                <input
                  type="text"
                  value={fatherGivenNames}
                  onChange={(e) => setFatherGivenNames(e.target.value)}
                  placeholder="Prénom du père"
                  className="field text-xs"
                />
              </div>
            </div>

            {/* Mère */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-fg">
                <input
                  type="checkbox"
                  checked={useMother}
                  onChange={(e) => setUseMother(e.target.checked)}
                  className="accent-fg rounded size-3.5"
                />
                <span>Mère</span>
              </label>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5 ${!useMother ? "opacity-40 pointer-events-none" : ""}`}>
                <input
                  type="text"
                  value={motherSurname}
                  onChange={(e) => setMotherSurname(e.target.value)}
                  placeholder="Nom de la mère"
                  className="field text-xs"
                />
                <input
                  type="text"
                  value={motherGivenNames}
                  onChange={(e) => setMotherGivenNames(e.target.value)}
                  placeholder="Prénom de la mère"
                  className="field text-xs"
                />
              </div>
            </div>
          </div>

          {/* 4. Lieu & Période */}
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-fg uppercase tracking-wider">
              4. Lieu & Période
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Lieu */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={usePlace}
                    onChange={(e) => setUsePlace(e.target.checked)}
                    className="accent-fg rounded size-3.5"
                  />
                  <span>Commune / Lieu</span>
                </label>
                <input
                  type="text"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  disabled={!usePlace}
                  placeholder="Ex: Rennes"
                  className="field text-xs disabled:opacity-40"
                />
              </div>

              {/* Période */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={usePeriod}
                    onChange={(e) => setUsePeriod(e.target.checked)}
                    className="accent-fg rounded size-3.5"
                  />
                  <span>Période (années)</span>
                </label>
                <div className={`flex items-center gap-2 ${!usePeriod ? "opacity-40 pointer-events-none" : ""}`}>
                  <input
                    type="number"
                    value={fromYear}
                    onChange={(e) => setFromYear(e.target.value)}
                    placeholder="De (ex: 1800)"
                    className="field text-xs w-full"
                  />
                  <span className="text-fg-subtle">—</span>
                  <input
                    type="number"
                    value={toYear}
                    onChange={(e) => setToYear(e.target.value)}
                    placeholder="À (ex: 1880)"
                    className="field text-xs w-full"
                  />
                </div>
              </div>
            </div>

            {/* Profession */}
            <div className="flex items-center gap-3 pt-2 border-t border-border/40">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-fg shrink-0">
                <input
                  type="checkbox"
                  checked={useOccupation}
                  onChange={(e) => setUseOccupation(e.target.checked)}
                  className="accent-fg rounded size-3.5"
                />
                <span>Profession</span>
              </label>
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                disabled={!useOccupation}
                placeholder="Ex: Menuisier, Cultivateur..."
                className="field text-xs flex-1 disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        {/* Pied de modal avec actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-6 py-4 bg-surface-2/40">
          <div className="text-xs text-fg-subtle truncate max-w-sm">
            Ouvre les fonds d'archives et arbres sur Geneanet
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <a
              href={currentSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onClose()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent hover:opacity-90 text-accent-fg font-medium px-4 py-2 text-xs shadow-soft transition-all active:scale-[0.985] cursor-pointer"
            >
              <span>Lancer la recherche sur Geneanet</span>
              <span className="opacity-80">↗</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

