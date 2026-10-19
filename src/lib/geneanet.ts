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
  if (params.sexe) {
    sp.set("sexe", params.sexe);
  }

  // Individu principal
  const nom = (params.nom || "").trim();
  const prenom = (params.prenom || "").trim();

  if (nom) sp.set("nom", nom);
  if (prenom) {
    sp.set("prenom", prenom);
    if (params.prenomOperateur) sp.set("prenom_operateur", params.prenomOperateur);
  }

  // Profession
  const profession = (params.profession || "").trim();
  if (profession) {
    sp.set("profession", profession);
    sp.set("profession_operateur", "and");
  }

  // Conjoint
  const nomConjoint = (params.nomConjoint || "").trim();
  const prenomConjoint = (params.prenomConjoint || "").trim();
  if (nomConjoint || prenomConjoint) {
    if (nomConjoint) sp.set("nom_conjoint", nomConjoint);
    if (prenomConjoint) {
      sp.set("prenom_conjoint", prenomConjoint);
      sp.set("prenom_conjoint_operateur", "and");
    }
  }

  // Lieu : Geneanet attend place__0__
  const place = (params.place || "").trim();
  if (place) {
    sp.set("place__0__", place);
    if (params.zonegeo?.trim()) {
      sp.set("zonegeo__0__", params.zonegeo.trim());
    }
  }

  // Période / Années
  if (params.exactYear) {
    sp.set("type_periode", "exact");
    sp.set("exact_year", String(params.exactYear).trim());
  } else if (params.from || params.to) {
    sp.set("type_periode", "between");
    if (params.from) sp.set("from", String(params.from).trim());
    if (params.to) sp.set("to", String(params.to).trim());
  }

  // Parents
  const nomPere = (params.nomPere || "").trim();
  const prenomPere = (params.prenomPere || "").trim();
  const nomMere = (params.nomMere || "").trim();
  const prenomMere = (params.prenomMere || "").trim();

  const hasParents = Boolean(nomPere || prenomPere || nomMere || prenomMere);
  if (hasParents) {
    sp.set("with_parents", "1");
    if (nomPere) sp.set("nom_pere", nomPere);
    if (prenomPere) {
      sp.set("prenom_pere", prenomPere);
      sp.set("prenom_pere_operateur", "and");
    }
    if (nomMere) sp.set("nom_mere", nomMere);
    if (prenomMere) {
      sp.set("prenom_mere", prenomMere);
      sp.set("prenom_mere_operateur", "and");
    }
  }

  sp.set("go", "1");

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

