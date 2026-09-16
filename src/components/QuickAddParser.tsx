"use client";

import { useMemo, useState } from "react";

import { smartCreatePersonAction } from "@/app/actions";
import { monogram } from "@/components/PersonCard";
import { PlaceField } from "@/components/PlaceField";
import { buttonClass } from "@/components/ui";
import { parseGenealogyText } from "@/lib/nlp-genealogy";

const EXAMPLES = [
  {
    label: "Kilyan & Julie (Mariage)",
    text: "Kilyan TUAL né le 23 octobre 2004 à Fougères, marié à julie robert née le 22 mai 2005 à Angers",
  },
  {
    label: "Jean-Marie (Dates, Lieu & Métier)",
    text: "Jean-Marie DUPONT né vers 1862 à Rennes, décédé le 14 janvier 1920 à Nantes, cultivateur, marié le 12 septembre 1888 à Vannes avec Marie LE GALL",
  },
  {
    label: "Pierre (Filiation parents)",
    text: "Pierre TUAL né en 1820 à Billé, fils de Julien TUAL et Jeanne LECOQ",
  },
];

export function QuickAddParser({
  slug,
  profileId,
  places = [],
}: {
  slug: string;
  profileId: number;
  places?: string[];
}) {
  const [text, setText] = useState("");
  const [primaryBirthPlace, setPrimaryBirthPlace] = useState<string | null>(null);
  const [primaryDeathPlace, setPrimaryDeathPlace] = useState<string | null>(null);
  const [spouseBirthPlace, setSpouseBirthPlace] = useState<string | null>(null);
  const [marriagePlace, setMarriagePlace] = useState<string | null>(null);
  const [isLiving, setIsLiving] = useState<boolean | null>(null);
  const [isUnmarried, setIsUnmarried] = useState<boolean | null>(null);

  const parsed = useMemo(() => {
    return parseGenealogyText(text);
  }, [text]);

  const effectiveIsLiving = isLiving !== null
    ? isLiving
    : (parsed.primary.deathDateRaw || parsed.primary.deathPlace ? false : (parsed.primary.birthYear && parsed.primary.birthYear >= 1925 ? true : false));

  const effectiveIsUnmarried = isUnmarried !== null
    ? isUnmarried
    : (parsed.spouse || parsed.marriage ? false : false);

  const hasContent = text.trim().length > 0;
  const hasValidPerson = Boolean(
    parsed.primary.fullName && (parsed.primary.givenNames || parsed.primary.surname),
  );

  const totalCardsCount = 1 + (parsed.spouse ? 1 : 0) + (parsed.parents?.father ? 1 : 0) + (parsed.parents?.mother ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <form action={smartCreatePersonAction} className="flex flex-col gap-5">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="profileId" value={profileId} />
        <input type="hidden" name="text" value={text} />
        <input type="hidden" name="primary_is_living" value={effectiveIsLiving ? "1" : "0"} />
        <input type="hidden" name="primary_is_unmarried" value={effectiveIsUnmarried ? "1" : "0"} />
        <input
          type="hidden"
          name="primary_birth_place"
          value={primaryBirthPlace ?? parsed.primary.birthPlace ?? ""}
        />
        <input
          type="hidden"
          name="primary_death_place"
          value={primaryDeathPlace ?? parsed.primary.deathPlace ?? ""}
        />
        <input
          type="hidden"
          name="spouse_birth_place"
          value={spouseBirthPlace ?? parsed.spouse?.birthPlace ?? ""}
        />
        <input
          type="hidden"
          name="marriage_place"
          value={marriagePlace ?? parsed.marriage?.place ?? ""}
        />

        {/* Zone de saisie intelligente */}
        <div className="flex flex-col gap-2">
          <label htmlFor="genealogy-text-input" className="text-sm font-medium text-fg">
            Décrivez la personne et ses liens en français libre :
          </label>
          <div className="relative">
            <textarea
              id="genealogy-text-input"
              rows={3}
              className="field min-h-24 w-full p-3.5 text-base leading-relaxed shadow-soft focus:shadow-card"
              placeholder="Ex. Kilyan TUAL né le 23 octobre 2004 à Fougères, marié à Julie ROBERT née le 22 mai 2005 à Angers…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {text && (
              <button
                type="button"
                onClick={() => setText("")}
                className="absolute right-3 top-3 rounded-lg p-1 text-xs text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                title="Effacer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Boutons d'exemples rapides */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-fg-subtle">Exemples :</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setText(ex.text)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-fg-muted transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-fg"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aperçu en direct des informations extraites */}
        {hasContent && (
          <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <span className="eyebrow">Aperçu en direct de l'interprétation</span>
              <span className="num text-xs text-fg-subtle">
                {totalCardsCount} fiche{totalCardsCount > 1 ? "s" : ""} à créer
              </span>
            </div>

            {/* Fiche Principale */}
            <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface-2/40 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-fg-muted">
                  {monogram(parsed.primary.givenNames, parsed.primary.surname)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-fg">
                      {parsed.primary.fullName || "En attente du nom…"}
                    </span>
                    {parsed.primary.sex && (
                      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                        {parsed.primary.sex === "M" ? "♂ Homme" : "♀ Femme"}
                      </span>
                    )}
                    {parsed.primary.occupation && (
                      <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-fg-muted">
                        💼 {parsed.primary.occupation}
                      </span>
                    )}
                  </div>

                  {/* Options vivante / célibataire */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setIsLiving(!effectiveIsLiving)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        effectiveIsLiving
                          ? "border-ok/40 bg-ok/15 font-medium text-ok"
                          : "border-border bg-surface text-fg-subtle hover:text-fg"
                      }`}
                    >
                      <span>{effectiveIsLiving ? "✓ 💚 Personne vivante" : "✝ Décédé(e)"}</span>
                    </button>

                    {!parsed.spouse && (
                      <button
                        type="button"
                        onClick={() => setIsUnmarried(!effectiveIsUnmarried)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                          effectiveIsUnmarried
                            ? "border-border-strong bg-surface-3 font-medium text-fg"
                            : "border-border bg-surface text-fg-subtle hover:text-fg"
                        }`}
                      >
                        <span>{effectiveIsUnmarried ? "✓ 👤 Célibataire" : "💍 Mariage à chercher"}</span>
                      </button>
                    )}
                  </div>

                  {/* Naissance & Décès */}
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-2.5 text-xs">
                      <span className="font-medium text-fg-subtle">Naissance</span>
                      <span className="text-fg">
                        {parsed.primary.birthDateRaw ? `📅 ${parsed.primary.birthDateRaw}` : "Date non précisée"}
                      </span>
                      {parsed.primary.birthPlace ? (
                        <div className="mt-1">
                          <span className="text-[11px] text-fg-subtle">Commune :</span>
                          <PlaceField
                            name="_preview_p_birth"
                            places={places}
                            defaultValue={parsed.primary.birthPlace}
                            className="field mt-0.5 py-1 text-xs"
                            onChange={(p) => setPrimaryBirthPlace(p)}
                          />
                        </div>
                      ) : (
                        <span className="text-fg-subtle italic">Lieu non précisé</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-2.5 text-xs">
                      <span className="font-medium text-fg-subtle">Décès</span>
                      <span className="text-fg">
                        {parsed.primary.deathDateRaw ? `✝ ${parsed.primary.deathDateRaw}` : "Non mentionné"}
                      </span>
                      {parsed.primary.deathPlace ? (
                        <div className="mt-1">
                          <span className="text-[11px] text-fg-subtle">Commune :</span>
                          <PlaceField
                            name="_preview_p_death"
                            places={places}
                            defaultValue={parsed.primary.deathPlace}
                            className="field mt-0.5 py-1 text-xs"
                            onChange={(p) => setPrimaryDeathPlace(p)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Conjoint & Union détectés */}
            {parsed.spouse && (
              <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface-2/40 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">💍 Union & Conjoint(e) détecté(e)</span>
                  {parsed.marriage?.dateRaw && (
                    <span className="text-xs text-fg-subtle">
                      mariés le {parsed.marriage.dateRaw}
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-fg-muted">
                    {monogram(parsed.spouse.givenNames, parsed.spouse.surname)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{parsed.spouse.fullName}</span>
                      {parsed.spouse.sex && (
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                          {parsed.spouse.sex === "M" ? "♂ Homme" : "♀ Femme"}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {parsed.spouse.birthDateRaw && (
                        <span>📅 Né(e) {parsed.spouse.birthDateRaw}</span>
                      )}
                      {parsed.spouse.birthPlace && (
                        <div className="w-64">
                          <PlaceField
                            name="_preview_spouse_birth"
                            places={places}
                            defaultValue={parsed.spouse.birthPlace}
                            className="field py-1 text-xs"
                            onChange={(p) => setSpouseBirthPlace(p)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Parents détectés */}
            {parsed.parents && (parsed.parents.father || parsed.parents.mother) && (
              <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-surface-2/40 p-4 text-xs">
                <span className="font-medium text-fg">👨‍👩‍👧 Parents rattachés détectés :</span>
                <div className="flex flex-wrap gap-2">
                  {parsed.parents.father && (
                    <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-fg">
                      ♂ Père : <span className="font-medium">{parsed.parents.father.fullName}</span>
                    </span>
                  )}
                  {parsed.parents.mother && (
                    <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-fg">
                      ♀ Mère : <span className="font-medium">{parsed.parents.mother.fullName}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bouton de validation */}
        <div>
          <button
            type="submit"
            disabled={!hasValidPerson}
            className={`${buttonClass("primary", "px-6 py-2.5 text-sm")} ${
              !hasValidPerson ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {hasValidPerson
              ? `Créer la fiche${totalCardsCount > 1 ? ` et ses ${totalCardsCount - 1} rattachement(s)` : ""} →`
              : "Saisissez un nom pour créer la fiche"}
          </button>
        </div>
      </form>
    </div>
  );
}

