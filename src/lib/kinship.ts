import type { Person, PersonRef } from "./types";

export type KinshipResult = {
  personA: PersonRef;
  personB: PersonRef;
  type: "same" | "direct" | "collateral" | "alliance" | "none";
  relationName: string;
  details: string;
  civilDegree?: number;
  canonicalDegree?: string;
  commonAncestors: PersonRef[];
  pathA: PersonRef[];
  pathB: PersonRef[];
};

type AncestorNode = {
  distance: number;
  path: number[]; // Du sujet jusqu'à l'ancêtre [sujetId, ..., ancetreId]
};

function toRef(p: Person): PersonRef {
  return {
    id: p.id,
    displayName: p.displayName,
    status: p.status,
    kinship: p.kinship,
    birth_year: p.birth_year,
    death_year: p.death_year,
    sex: p.sex,
  };
}

/**
 * Explore tous les ancêtres d'une personne avec leur distance générationnelle et le chemin.
 */
function getAncestorsMap(
  startId: number,
  byId: Map<number, Person>,
): Map<number, AncestorNode> {
  const map = new Map<number, AncestorNode>();
  map.set(startId, { distance: 0, path: [startId] });

  const queue: number[] = [startId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = map.get(currentId)!;
    const currentPerson = byId.get(currentId);
    if (!currentPerson) continue;

    for (const parentRef of currentPerson.parents) {
      const parentId = parentRef.id;
      if (!map.has(parentId)) {
        map.set(parentId, {
          distance: currentNode.distance + 1,
          path: [...currentNode.path, parentId],
        });
        queue.push(parentId);
      }
    }
  }

  return map;
}

const DIRECT_ASCENDANT_LABELS: Record<number, { M: string; F: string; neutral: string }> = {
  1: { M: "Père", F: "Mère", neutral: "Parent" },
  2: { M: "Grand-père", F: "Grand-mère", neutral: "Grand-parent" },
  3: { M: "Arrière-grand-père", F: "Arrière-grand-mère", neutral: "Arrière-grand-parent" },
  4: { M: "Arrière-arrière-grand-père", F: "Arrière-arrière-grand-mère", neutral: "Arrière-arrière-grand-parent" },
};

const DIRECT_DESCENDANT_LABELS: Record<number, { M: string; F: string; neutral: string }> = {
  1: { M: "Fils", F: "Fille", neutral: "Enfant" },
  2: { M: "Petit-fils", F: "Petite-fille", neutral: "Petit-enfant" },
  3: { M: "Arrière-petit-fils", F: "Arrière-petite-fille", neutral: "Arrière-petit-enfant" },
  4: { M: "Arrière-arrière-petit-fils", F: "Arrière-arrière-petite-fille", neutral: "Arrière-arrière-petit-enfant" },
};

/**
 * Calcule le lien de parenté exact entre deux personnes d'un profil.
 */
export function computeKinship(
  idA: number,
  idB: number,
  persons: Person[],
): KinshipResult | null {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const pA = byId.get(idA);
  const pB = byId.get(idB);

  if (!pA || !pB) return null;

  const refA = toRef(pA);
  const refB = toRef(pB);

  // Cas 1 : Même personne
  if (idA === idB) {
    return {
      personA: refA,
      personB: refB,
      type: "same",
      relationName: "Même personne",
      details: "Il s'agit de la même fiche généalogique.",
      commonAncestors: [refA],
      pathA: [refA],
      pathB: [refB],
    };
  }

  // Cas 2 : Conjoints directs (union)
  const isDirectSpouse = pA.unions.some((u) => u.spouse?.id === idB);
  if (isDirectSpouse) {
    const relationName = pB.sex === "M" ? "Époux" : pB.sex === "F" ? "Épouse" : "Conjoint";
    return {
      personA: refA,
      personB: refB,
      type: "alliance",
      relationName,
      details: `${pB.displayName} est le conjoint de ${pA.displayName}.`,
      civilDegree: 1,
      commonAncestors: [],
      pathA: [refA],
      pathB: [refB],
    };
  }

  // Recherche par ancêtres communs
  const ancestorsA = getAncestorsMap(idA, byId);
  const ancestorsB = getAncestorsMap(idB, byId);

  // Trouver l'intersection
  const commonIds: number[] = [];
  for (const aId of ancestorsA.keys()) {
    if (ancestorsB.has(aId)) {
      commonIds.push(aId);
    }
  }

  if (commonIds.length === 0) {
    return {
      personA: refA,
      personB: refB,
      type: "none",
      relationName: "Aucun lien de sang trouvé",
      details: `Aucun ancêtre commun n'a été trouvé entre ${pA.displayName} et ${pB.displayName} dans l'état actuel de l'arbre.`,
      commonAncestors: [],
      pathA: [refA],
      pathB: [refB],
    };
  }

  // Trier les ancêtres communs par distance totale (Plus proche ancêtre commun MRCA en tête)
  commonIds.sort((x, y) => {
    const distTotalX = ancestorsA.get(x)!.distance + ancestorsB.get(x)!.distance;
    const distTotalY = ancestorsA.get(y)!.distance + ancestorsB.get(y)!.distance;
    return distTotalX - distTotalY;
  });

  const bestDistTotal =
    ancestorsA.get(commonIds[0])!.distance + ancestorsB.get(commonIds[0])!.distance;

  // Récupérer tous les ancêtres communs à cette distance minimale (souvent le père ET la mère)
  const mrcaIds = commonIds.filter(
    (id) =>
      ancestorsA.get(id)!.distance + ancestorsB.get(id)!.distance === bestDistTotal,
  );

  const mrcaNodesA = ancestorsA.get(mrcaIds[0])!;
  const mrcaNodesB = ancestorsB.get(mrcaIds[0])!;

  const distA = mrcaNodesA.distance;
  const distB = mrcaNodesB.distance;
  const civilDegree = distA + distB;

  const commonAncestors = mrcaIds
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p)
    .map(toRef);

  const pathA = mrcaNodesA.path
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p)
    .map(toRef);

  const pathB = mrcaNodesB.path
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p)
    .map(toRef);

  // Qualification du lien
  // 1. Ligne directe ascendante (B est ancêtre de A)
  if (distB === 0 && distA > 0) {
    const label =
      DIRECT_ASCENDANT_LABELS[distA]?.[pB.sex ?? "neutral"] ??
      `Ancêtre direct (${distA}e génération)`;
    return {
      personA: refA,
      personB: refB,
      type: "direct",
      relationName: label,
      details: `${pB.displayName} est le ${label.toLowerCase()} de ${pA.displayName} (${distA} génération${distA > 1 ? "s" : ""}).`,
      civilDegree,
      canonicalDegree: `${distA}e degré`,
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 2. Ligne directe descendante (B est descendant de A)
  if (distA === 0 && distB > 0) {
    const label =
      DIRECT_DESCENDANT_LABELS[distB]?.[pB.sex ?? "neutral"] ??
      `Descendant direct (${distB}e génération)`;
    return {
      personA: refA,
      personB: refB,
      type: "direct",
      relationName: label,
      details: `${pB.displayName} est le ${label.toLowerCase()} de ${pA.displayName}.`,
      civilDegree,
      canonicalDegree: `${distB}e degré`,
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 3. Frères et Sœurs (distA = 1, distB = 1)
  if (distA === 1 && distB === 1) {
    const isFull = mrcaIds.length >= 2;
    const isBrother = pB.sex === "M";
    const isSister = pB.sex === "F";
    const base = isBrother ? "Frère" : isSister ? "Sœur" : "Fratrie";
    const relationName = isFull ? `${base} germain(e)` : `Demi-${base.toLowerCase()}`;
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pB.displayName} est le/la ${relationName.toLowerCase()} de ${pA.displayName} (parents communs : ${commonAncestors.map((c) => c.displayName).join(" & ")}).`,
      civilDegree: 2,
      canonicalDegree: "1er degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 4. Oncle / Tante et Neveu / Nièce
  if (distA === 2 && distB === 1) {
    const relationName =
      pB.sex === "M" ? "Oncle" : pB.sex === "F" ? "Tante" : "Oncle/Tante";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pB.displayName} est le/la ${relationName.toLowerCase()} de ${pA.displayName}.`,
      civilDegree: 3,
      canonicalDegree: "Du 1er au 2e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  if (distA === 1 && distB === 2) {
    const relationName =
      pB.sex === "M" ? "Neveu" : pB.sex === "F" ? "Nièce" : "Neveu/Nièce";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pB.displayName} est le/la ${relationName.toLowerCase()} de ${pA.displayName}.`,
      civilDegree: 3,
      canonicalDegree: "Du 1er au 2e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 5. Grand-oncle / Grand-tante (distA = 3, distB = 1)
  if (distA === 3 && distB === 1) {
    const relationName =
      pB.sex === "M" ? "Grand-oncle" : pB.sex === "F" ? "Grand-tante" : "Grand-oncle/tante";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pB.displayName} est le/la ${relationName.toLowerCase()} de ${pA.displayName}.`,
      civilDegree: 4,
      canonicalDegree: "Du 1er au 3e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  if (distA === 1 && distB === 3) {
    const relationName =
      pB.sex === "M" ? "Petit-neveu" : pB.sex === "F" ? "Petite-nièce" : "Petit-neveu/nièce";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pB.displayName} est le/la ${relationName.toLowerCase()} de ${pA.displayName}.`,
      civilDegree: 4,
      canonicalDegree: "Du 1er au 3e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 6. Cousins germains (distA = 2, distB = 2)
  if (distA === 2 && distB === 2) {
    const relationName =
      pB.sex === "M" ? "Cousin germain" : pB.sex === "F" ? "Cousine germaine" : "Cousins germains";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pA.displayName} et ${pB.displayName} sont ${relationName.toLowerCase()}s (grands-parents communs : ${commonAncestors.map((c) => c.displayName).join(" & ")}).`,
      civilDegree: 4,
      canonicalDegree: "2e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 7. Cousins issus de germains (distA = 3, distB = 3)
  if (distA === 3 && distB === 3) {
    const relationName = "Cousins issus de germains (au 2e degré)";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pA.displayName} et ${pB.displayName} sont cousins issus de germains (arrière-grands-parents communs : ${commonAncestors.map((c) => c.displayName).join(" & ")}).`,
      civilDegree: 6,
      canonicalDegree: "3e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 8. Cousins issus d'issus de germains (distA = 4, distB = 4)
  if (distA === 4 && distB === 4) {
    const relationName = "Cousins au 3e degré";
    return {
      personA: refA,
      personB: refB,
      type: "collateral",
      relationName,
      details: `${pA.displayName} et ${pB.displayName} sont cousins au 3e degré civil (4 générations d'écart aux ancêtres communs).`,
      civilDegree: 8,
      canonicalDegree: "4e degré",
      commonAncestors,
      pathA,
      pathB,
    };
  }

  // 9. Collatéraux à générations décalées (oncle à la mode de Bretagne, etc.)
  const minG = Math.min(distA, distB);
  const maxG = Math.max(distA, distB);
  const diffG = maxG - minG;

  let relationName = `Cousins éloignés (${civilDegree}e degré civil)`;
  if (minG === 2 && diffG === 1) {
    relationName =
      pB.sex === "M"
        ? "Oncle à la mode de Bretagne"
        : pB.sex === "F"
          ? "Tante à la mode de Bretagne"
          : "Cousin germain éloigné d'une génération";
  }

  return {
    personA: refA,
    personB: refB,
    type: "collateral",
    relationName,
    details: `${pA.displayName} et ${pB.displayName} sont apparentés via ${commonAncestors.map((c) => c.displayName).join(" & ")} (${civilDegree}e degré civil).`,
    civilDegree,
    canonicalDegree: `Du ${minG}e au ${maxG}e degré`,
    commonAncestors,
    pathA,
    pathB,
  };
}
