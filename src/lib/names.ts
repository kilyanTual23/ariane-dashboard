import { COMPLETION_CRITERIA } from "./completion";

const FEMININE = new Set([
  "marie", "jeanne", "anne", "anna", "perrine", "perrinne", "françoise", "francoise",
  "victoire", "angélique", "angelique", "rosalie", "thérèse", "therese", "madeleine",
  "germaine", "odette", "simonne", "simone", "henriette", "berthe", "georgette",
  "blanche", "julie", "léonarde", "leonarde", "renée", "renee", "michelle", "sophie",
  "joséphine", "josephine", "adèle", "adele", "louise", "julienne", "angèle", "angele",
  "esther", "marguerite", "jacqueline", "yvonne", "suzanne", "denise", "claudine",
  "catherine", "élisabeth", "elisabeth", "geneviève", "genevieve", "bernadette",
  "thereze", "clémentine", "clementine", "olive", "mathurine", "guillemette", "gillette",
  "charlotte", "eugénie", "eugenie", "augustine", "célestine", "celestine", "alexandrine",
  "emmanuelle", "pascaline", "victorine", "léonie", "leonie", "florentine", "hippolyte",
  "aimée", "aimee", "désirée", "desiree", "maguy", "monique", "solange", "paulette",
  "rose", "hélène", "helene", "lucie", "alice", "aline", "fanny", "claire", "marianne",
  "élise", "elise", "genevieve", "léa", "lea", "camille",
]);

const MASCULINE = new Set([
  "jean", "pierre", "françois", "francois", "joseph", "julien", "louis", "michel",
  "rené", "rene", "andré", "andre", "auguste", "armand", "victor", "emmanuel",
  "guillaume", "mathurin", "nicolas", "vincent", "toussaint", "ambroise", "prosper",
  "raymond", "albert", "félix", "felix", "roger", "marcel", "bernard", "antoine",
  "gilles", "romain", "olivier", "yves", "alexandre", "charles", "henri", "eugène",
  "eugene", "théodore", "theodore", "edouard", "édouard", "paul", "jacques", "hyacinthe",
  "médard", "medard", "constant", "célestin", "celestin", "léon", "leon", "maurice",
  "georges", "gabriel", "denis", "robert", "roland", "daniel", "claude", "jules",
  "luc", "marc", "mathieu", "mathias", "etienne", "étienne", "bastien", "adrien",
]);

const PARTICLES = new Set(["de", "du", "des", "le", "la", "les", "d'", "l'"]);

/** Découpage « Prénoms NOM » tel qu'il est saisi en généalogie. */
export function splitName(full: string): { given_names: string; surname: string } {
  const clean = (full ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { given_names: "", surname: "" };

  const tokens = clean.split(" ");
  const isUpper = (t: string) => {
    const letters = t.replace(/[^\p{L}]/gu, "");
    return letters.length > 1 && letters === letters.toLocaleUpperCase("fr");
  };

  const firstUpper = tokens.findIndex(isUpper);
  if (firstUpper !== -1) {
    return {
      given_names: tokens.slice(0, firstUpper).join(" "),
      surname: tokens.slice(firstUpper).join(" "),
    };
  }

  // Si aucun mot n'est entièrement en majuscules (ex: saisie "Marie Gablin" ou "jean dupont")
  if (tokens.length === 1) {
    const lower = tokens[0].toLowerCase();
    if (FEMININE.has(lower) || MASCULINE.has(lower)) {
      return { given_names: tokens[0], surname: "" };
    }
    return { given_names: "", surname: tokens[0].toLocaleUpperCase("fr") };
  }

  // Si une particule précède le dernier mot (ex: "Le Baron", "de Rohan")
  let surnameStartIndex = tokens.length - 1;
  if (tokens.length >= 2 && PARTICLES.has(tokens[tokens.length - 2].toLowerCase())) {
    surnameStartIndex = tokens.length - 2;
  }

  const given = tokens.slice(0, surnameStartIndex).join(" ");
  const sur = tokens.slice(surnameStartIndex).join(" ").toLocaleUpperCase("fr");
  return { given_names: given, surname: sur };
}

/**
 * Sexe déduit du premier prénom (les actes anciens ne le notent pas).
 * Renvoie null dès qu'il y a un doute : c'est corrigeable dans la fiche.
 */
export function inferSex(givenNames: string): "M" | "F" | null {
  const first = (givenNames ?? "")
    .trim()
    .split(/[\s-]+/)[0]
    ?.toLowerCase();
  if (!first) return null;
  if (MASCULINE.has(first)) return "M";
  if (FEMININE.has(first)) return "F";
  return null;
}

export function monogram(given?: string | null, surname?: string | null): string {
  const first = (v?: string | null) => (v ?? "").match(/\p{L}/u)?.[0] ?? "";
  return (first(given) + first(surname)).toUpperCase() || "?";
}

/** « Billé, Bretagne, France » → « Billé ». */
export function shortPlace(place: string | null | undefined) {
  return place?.split(",")[0]?.trim() || null;
}

/** Première chose qui manque, en clair : « acte de naissance (+2) ». */
export function missingHint(missing: string[]) {
  if (!missing.length) return null;
  const first = missing[0].toLowerCase();
  return missing.length > 1 ? `${first} (+${missing.length - 1})` : first;
}

export function lifeSpan(
  p: {
    birthYear?: number | null;
    birthYearEstimated?: boolean;
    deathYear?: number | null;
    isLiving?: boolean;
  },
): string {
  const birth = p.birthYear ? `${p.birthYearEstimated ? "~" : ""}${p.birthYear}` : "?";
  if (p.isLiving) return `${birth} – vivant`;
  const death = p.deathYear ? String(p.deathYear) : "?";
  return `${birth} – ${death}`;
}

/** « Acte de naissance » → « Trouver l’acte de naissance » : une tâche se lit comme une action. */
export function taskTitleFor(criterion: string) {
  const lower = criterion.charAt(0).toLowerCase() + criterion.slice(1);
  const article = /^parents/.test(lower)
    ? "les "
    : /^[aeiouéèh]/.test(lower)
      ? "l’"
      : /^(date|identité)/.test(lower)
        ? "la "
        : "le ";
  return `Trouver ${article}${lower}`;
}

/**
 * Titre de tâche tel qu'on l'affiche : sans le nom de la personne (montré juste à
 * côté), et à l'infinitif quand il ne nomme qu'une case de la fiche
 * (« Acte de naissance — Jean TUAL » → « Trouver l’acte de naissance »).
 */
export function displayTaskTitle(title: string, personName?: string | null) {
  let t = title.trim();
  if (personName) {
    for (const sep of [" — ", " : ", " - "]) {
      if (t.endsWith(`${sep}${personName}`)) t = t.slice(0, -(sep.length + personName.length)).trim();
    }
  }
  return (COMPLETION_CRITERIA as readonly string[]).includes(t) ? taskTitleFor(t) : t;
}
