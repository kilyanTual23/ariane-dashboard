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
  if (firstUpper === -1) return { given_names: clean, surname: "" };

  return {
    given_names: tokens.slice(0, firstUpper).join(" "),
    surname: tokens.slice(firstUpper).join(" "),
  };
}

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
]);

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
