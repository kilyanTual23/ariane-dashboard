import type { Person, PersonRef } from "./types";

export interface GeneanetSearchParams {
  nom?: string;
  prenom?: string;
  prenomOperateur?: "or" | "and";
  sexe?: "H" | "F" | "";
  profession?: string;
  nomConjoint?: string;
  prenomConjoint?: string;
  nomPere?: string;
  prenomPere?: string;
  nomMere?: string;
  prenomMere?: string;
  place?: string;
  zonegeo?: string;
  typePeriode?: "between" | "exact";
  from?: string | number;
  to?: string | number;
  exactYear?: string | number;
}

export function buildGeneanetSearchUrl(params: GeneanetSearchParams): string {
  const url = new URL("https://www.geneanet.org/fonds/individus/");
  const sp = url.searchParams;

  // Sexe (Geneanet utilise 'H' pour homme, 'F' pour femme)
  sp.set("sexe", params.sexe || "");

  // Individu principal
  sp.set("nom", (params.nom || "").trim());
  sp.set("ignore_each_patronyme", "");
  sp.set("prenom", (params.prenom || "").trim());
  sp.set("prenom_operateur", params.prenomOperateur || "or");
  sp.set("ignore_each_prenom", "");

  // Profession
  sp.set("profession", (params.profession || "").trim());
  sp.set("profession_operateur", "and");
  sp.set("ignore_each_profession", "");

  // Conjoint
  sp.set("nom_conjoint", (params.nomConjoint || "").trim());
  sp.set("ignore_each_patronyme_conjoint", "");
  sp.set("prenom_conjoint", (params.prenomConjoint || "").trim());
  sp.set("prenom_conjoint_operateur", "and");
  sp.set("ignore_each_prenom_conjoint", "");

  // Lieux (place__0__)
  sp.set("place__0__", (params.place || "").trim());
  sp.set("voisinage", "");
  sp.set("ignore_each_place", "");
  sp.set("zonegeo__0__", (params.zonegeo || "").trim());
  sp.set("country__0__", "");
  sp.set("region__0__", "");
  sp.set("subregion__0__", "");

  for (let i = 1; i <= 4; i++) {
    sp.set(`place__${i}__`, "");
    sp.set(`zonegeo__${i}__`, "");
    sp.set(`country__${i}__`, "");
    sp.set(`region__${i}__`, "");
    sp.set(`subregion__${i}__`, "");
  }

  // Période / Années
  if (params.exactYear) {
    sp.set("type_periode", "exact");
    sp.set("from", "");
    sp.set("to", "");
    sp.set("exact_day", "");
    sp.set("exact_month", "");
    sp.set("exact_year", String(params.exactYear).trim());
  } else if (params.from || params.to) {
    sp.set("type_periode", "between");
    sp.set("from", params.from ? String(params.from).trim() : "");
    sp.set("to", params.to ? String(params.to).trim() : "");
    sp.set("exact_day", "");
    sp.set("exact_month", "");
    sp.set("exact_year", "");
  } else {
    sp.set("type_periode", "between");
    sp.set("from", "");
    sp.set("to", "");
    sp.set("exact_day", "");
    sp.set("exact_month", "");
    sp.set("exact_year", "");
  }

  // Parents
  sp.set("nom_pere", (params.nomPere || "").trim());
  sp.set("ignore_each_patronyme_pere", "");
  sp.set("prenom_pere", (params.prenomPere || "").trim());
  sp.set("prenom_pere_operateur", "and");
  sp.set("ignore_each_prenom_pere", "");

  sp.set("nom_mere", (params.nomMere || "").trim());
  sp.set("ignore_each_patronyme_mere", "");
  sp.set("prenom_mere", (params.prenomMere || "").trim());
  sp.set("prenom_mere_operateur", "and");
  sp.set("ignore_each_prenom_mere", "");

  // with_parents = 1 si père ou mère renseignés, sinon 0
  const hasParents = Boolean(
    (params.nomPere || "").trim() ||
    (params.prenomPere || "").trim() ||
    (params.nomMere || "").trim() ||
    (params.prenomMere || "").trim()
  );
  sp.set("with_parents", hasParents ? "1" : "0");

  sp.set("go", "1");
  sp.set("size", "20");

  return url.toString();
}

/**
 * Découpe un nom complet (displayName) en prénoms et nom de famille si besoin.
 */
export function extractNamesFromRef(ref?: PersonRef | null): { given_names: string; surname: string } {
  if (!ref) return { given_names: "", surname: "" };
  const parts = ref.displayName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { given_names: "", surname: parts[0] || "" };
  }
  // Souvent en français / généalogie, le nom de famille est le dernier mot (ou en majuscules)
  const lastUpperIndex = parts.findIndex((p) => p === p.toUpperCase() && p.length > 1 && !/^\d+$/.test(p));
  if (lastUpperIndex !== -1) {
    const given = parts.slice(0, lastUpperIndex).join(" ");
    const sur = parts.slice(lastUpperIndex).join(" ");
    return { given_names: given, surname: sur };
  }
  const surname = parts[parts.length - 1];
  const given_names = parts.slice(0, -1).join(" ");
  return { given_names, surname };
}

/**
 * Extrait la commune principale d'une chaîne de lieu « Commune, Département/Région, Pays ».
 */
export function extractCommune(place?: string | null): string {
  if (!place) return "";
  const first = place.split(",")[0]?.trim() || "";
  // Retirer un éventuel code postal ou parenthèses ex: "Brest (29200)" -> "Brest"
  return first.replace(/\s*\(\d+\)/, "").trim();
}

