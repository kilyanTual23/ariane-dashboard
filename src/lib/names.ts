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
  const a = (given ?? "").trim()[0] ?? "";
  const b = (surname ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
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
  if (p.isLiving) return `${birth} (vivant)`;
  const death = p.deathYear ? String(p.deathYear) : p.birthYear ? "?" : "?";
  return `${birth} - ${death}`;
}
