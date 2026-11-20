/**
 * Les deux parents d'une personne, dans l'ordre d'affichage et de numérotation Sosa.
 *
 * - Couple homme-femme : le père d'abord (Sosa 2n), la mère ensuite (2n+1).
 * - Deux parents de même sexe (ou de sexe inconnu) : tous deux, dans l'ordre de création des fiches.
 * - Parent seul : une mère reste à la place de la mère (2n+1), sinon première place.
 *
 * Les éventuels parents au-delà de deux sont renvoyés à part.
 */
export function orderParents<T extends { id: number; sex: "M" | "F" | string | null }>(
  parents: T[],
): { first: T | null; second: T | null; others: T[] } {
  if (parents.length === 0) return { first: null, second: null, others: [] };
  if (parents.length === 1) {
    const [only] = parents;
    return only.sex === "F" ? { first: null, second: only, others: [] } : { first: only, second: null, others: [] };
  }
  // Homme, sexe inconnu, femme ; à égalité, la fiche créée la première (même ordre partout).
  const rank = (p: T) => (p.sex === "M" ? 0 : p.sex === "F" ? 2 : 1);
  const [first, second, ...others] = [...parents].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  return { first, second, others };
}

/** Intitulé d'un parent selon son propre sexe. */
export function parentLabel(sex: string | null | undefined): string {
  return sex === "M" ? "Père" : sex === "F" ? "Mère" : "Parent";
}
