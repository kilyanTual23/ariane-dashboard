import { parseDateInput } from "./dates";
import { inferSex, splitName } from "./names";

export type ParsedGenealogyResult = {
  primary: {
    fullName: string;
    givenNames: string;
    surname: string;
    sex: "M" | "F" | null;
    birthDateRaw: string | null;
    birthYear: number | null;
    birthPlace: string | null;
    deathDateRaw: string | null;
    deathYear: number | null;
    deathPlace: string | null;
    occupation: string | null;
  };
  spouse: {
    fullName: string;
    givenNames: string;
    surname: string;
    sex: "M" | "F" | null;
    birthDateRaw: string | null;
    birthYear: number | null;
    birthPlace: string | null;
  } | null;
  marriage: {
    dateRaw: string | null;
    year: number | null;
    place: string | null;
  } | null;
  parents: {
    father: { fullName: string; givenNames: string; surname: string } | null;
    mother: { fullName: string; givenNames: string; surname: string } | null;
  } | null;
  rawText: string;
};

function clean(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

/** Formate un nom en convention généalogique française : « Prénom NOM » */
export function formatGenealogyName(raw: string, defaultSurname?: string): {
  fullName: string;
  givenNames: string;
  surname: string;
} {
  const trimmed = clean(raw).replace(/[,;:]+$/, "").trim();
  if (!trimmed) return { fullName: "", givenNames: "", surname: "" };

  const parsed = splitName(trimmed);
  if (parsed.surname) {
    // Il y avait déjà des majuscules sur le nom
    return {
      fullName: `${parsed.given_names} ${parsed.surname}`.trim(),
      givenNames: parsed.given_names,
      surname: parsed.surname,
    };
  }

  // Pas de majuscules détectées (ex: "julie robert" ou "kilyan tual")
  const words = trimmed.split(" ");
  if (words.length === 1) {
    const firstWord = words[0];
    const isLikelySurname = firstWord === firstWord.toUpperCase() && firstWord.length > 1;
    if (isLikelySurname) {
      return { fullName: firstWord, givenNames: "", surname: firstWord };
    }
    const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    if (defaultSurname) {
      return {
        fullName: `${capitalized} ${defaultSurname.toUpperCase()}`,
        givenNames: capitalized,
        surname: defaultSurname.toUpperCase(),
      };
    }
    return { fullName: capitalized, givenNames: capitalized, surname: "" };
  }

  // Plusieurs mots : le dernier est le nom de famille, les précédents sont les prénoms
  const given = words
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const sur = words[words.length - 1].toUpperCase();

  return {
    fullName: `${given} ${sur}`,
    givenNames: given,
    surname: sur,
  };
}

/**
 * Extrait les dates et lieux d'un segment de naissance ou décès.
 * Ex : "le 23 octobre 2004 à Fougères", "vers 1850 à Rennes (35)", "en 1902"
 */
function extractDateAndPlace(segment: string): {
  dateRaw: string | null;
  year: number | null;
  place: string | null;
} {
  let text = segment.trim();

  // Détection du lieu avec "à", "au", "aux", "en"
  let place: string | null = null;
  const placeMatch = text.match(/(?<!\p{L})(?:à|a|au|aux)\s+([A-Za-zÀ-ÖØ-öø-ÿ'-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'-]+)*(?:\s*\(\d{2,3}\))?)/iu);
  if (placeMatch) {
    place = clean(placeMatch[1]);
    text = text.replace(placeMatch[0], " ");
  }

  // Nettoyage de la date restante
  text = text
    .replace(/[,\.;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parsed = parseDateInput(text);
  return {
    dateRaw: parsed.canonical ?? (text ? text : null),
    year: parsed.year,
    place: place ? clean(place) : null,
  };
}

/**
 * Analyse une phrase ou un paragraphe de saisie libre et en extrait
 * les entités généalogiques structurées.
 */
export function parseGenealogyText(text: string): ParsedGenealogyResult {
  const raw = clean(text);
  if (!raw) {
    return {
      primary: {
        fullName: "",
        givenNames: "",
        surname: "",
        sex: null,
        birthDateRaw: null,
        birthYear: null,
        birthPlace: null,
        deathDateRaw: null,
        deathYear: null,
        deathPlace: null,
        occupation: null,
      },
      spouse: null,
      marriage: null,
      parents: null,
      rawText: text,
    };
  }

  // 1. Découpage en sections principales : Mariage et Parents
  let marriagePart = "";
  let parentsPart = "";
  let mainPart = raw;

  // Détection du segment mariage
  // Ne doit PAS matcher "Jean-Marie" (interdiction du tiret préalable)
  // Si "marie" n'a pas d'accent, il doit impérativement être suivi d'une préposition (à, avec, le, en) pour ne pas confondre avec le prénom Marie
  const marriageRegex = /(?<![\p{L}-])(?:mari[ée][ée]?s?|épous(?:e|é|er)|conjoint(?:e)?|x|(?:marie|mariee)\s+(?:à|a|avec|en|le\s|d'\s*|de\s*))(?!\p{L})\s*(?:à|a|avec|de)?\s*/iu;
  const marriageMatch = mainPart.match(marriageRegex);

  if (marriageMatch && marriageMatch.index !== undefined) {
    marriagePart = mainPart.slice(marriageMatch.index);
    mainPart = mainPart.slice(0, marriageMatch.index).trim();
  }

  // Détection du segment parents : "fils de ...", "fille de ...", "enfant de ..."
  const parentsRegex = /(?<!\p{L})(?:fils|fille|enfant)\s+de\s+/iu;
  const parentsMatch = mainPart.match(parentsRegex);

  if (parentsMatch && parentsMatch.index !== undefined) {
    parentsPart = mainPart.slice(parentsMatch.index);
    mainPart = mainPart.slice(0, parentsMatch.index).trim();
  } else if (marriagePart) {
    const pMatch = marriagePart.match(parentsRegex);
    if (pMatch && pMatch.index !== undefined) {
      parentsPart = marriagePart.slice(pMatch.index);
      marriagePart = marriagePart.slice(0, pMatch.index).trim();
    }
  }

  // 2. Détection du sexe principal
  let primarySex: "M" | "F" | null = null;
  const mainLower = mainPart.toLowerCase();
  if (/(?<!\p{L})(?:n[ée]e|n[ée][ée])(?!\p{L})/iu.test(mainPart)) primarySex = "F";
  else if (/(?<!\p{L})n[ée](?!\p{L})/iu.test(mainPart)) primarySex = "M";
  if (!primarySex && /(?<!\p{L})fille\s+de(?!\p{L})/iu.test(raw)) primarySex = "F";
  if (!primarySex && /(?<!\p{L})fils\s+de(?!\p{L})/iu.test(raw)) primarySex = "M";
  if (!primarySex && /(?<!\p{L})mari[ée]e(?!\p{L})/iu.test(raw)) primarySex = "F";
  if (!primarySex && /(?<!\p{L})mari[ée](?!\p{L})/iu.test(raw)) primarySex = "M";

  // 3. Découpage naissance / décès pour la personne principale
  const birthKeyword = /(?<!\p{L})(?:n[ée][ée]?|naissance|°)(?!\p{L})/iu;
  const deathKeyword = /(?<!\p{L})(?:d[ée]c[ée]d[ée][ée]?|mort[e]?|\+|d[ée]c[èe]s)(?!\p{L})/iu;

  let primaryNameStr = mainPart;
  let birthPart = "";
  let deathPart = "";
  let occupationStr: string | null = null;

  const birthMatch = mainPart.match(birthKeyword);
  const deathMatch = mainPart.match(deathKeyword);

  if (birthMatch && birthMatch.index !== undefined) {
    primaryNameStr = mainPart.slice(0, birthMatch.index);
    const remainder = mainPart.slice(birthMatch.index + birthMatch[0].length);

    const deathInRemainder = remainder.match(deathKeyword);
    if (deathInRemainder && deathInRemainder.index !== undefined) {
      birthPart = remainder.slice(0, deathInRemainder.index);
      deathPart = remainder.slice(deathInRemainder.index + deathInRemainder[0].length);
    } else {
      birthPart = remainder;
    }
  } else if (deathMatch && deathMatch.index !== undefined) {
    primaryNameStr = mainPart.slice(0, deathMatch.index);
    deathPart = mainPart.slice(deathMatch.index + deathMatch[0].length);
  }

  // Détection métier
  const occMatch = raw.match(/(?<!\p{L})(?:m[ée]tier|profession)\s*:\s*([A-Za-zÀ-ÿ\s'-]+?)(?:,|$)/iu);
  let matchedOccWord: string | null = null;
  if (occMatch) {
    occupationStr = clean(occMatch[1]);
  } else {
    const COMMON_OCCUPATIONS = [
      "cultivateur", "cultivatrice", "journalier", "journalière", "laboureur",
      "ménagère", "ménager", "menuisier", "charpentier", "forgeron", "tisserand",
      "cordonnier", "tailleur", "couturière", "domestique", "marin", "pêcheur",
      "meunier", "boulanger", "boucher", "maçon", "sabotier", "notaire", "avocat",
      "instituteur", "institutrice", "marchand", "commerçant", "clerc", "pharmacien",
      "ingénieur", "médecin", "étudiant", "étudiante"
    ];
    for (const occ of COMMON_OCCUPATIONS) {
      const reg = new RegExp(`(?<!\\p{L})${occ}(?!\\p{L})`, "iu");
      if (reg.test(raw)) {
        occupationStr = occ.charAt(0).toUpperCase() + occ.slice(1).toLowerCase();
        matchedOccWord = occ;
        break;
      }
    }
  }

  if (matchedOccWord) {
    birthPart = birthPart.replace(new RegExp(`(?<!\\p{L})${matchedOccWord}(?!\\p{L})`, "giu"), " ");
    deathPart = deathPart.replace(new RegExp(`(?<!\\p{L})${matchedOccWord}(?!\\p{L})`, "giu"), " ");
  }

  // Formatage du nom principal
  primaryNameStr = primaryNameStr.replace(/[,;:]+$/, "").trim();
  const primaryName = formatGenealogyName(primaryNameStr);
  if (!primarySex) primarySex = inferSex(primaryName.givenNames);

  // Extraction dates & lieux de la personne principale
  const birthInfo = birthPart ? extractDateAndPlace(birthPart) : { dateRaw: null, year: null, place: null };
  const deathInfo = deathPart ? extractDateAndPlace(deathPart) : { dateRaw: null, year: null, place: null };

  // 4. Analyse du mariage & du conjoint (marriagePart)
  let spouse: ParsedGenealogyResult["spouse"] = null;
  let marriage: ParsedGenealogyResult["marriage"] = null;

  if (marriagePart) {
    let mText = marriagePart;

    // Retirer le mot déclencheur initial (marié, époux, etc.)
    mText = mText.replace(/^(?:\s*(?:mari[eé][eé]?s?|épous(?:e|é|er)|conjoint(?:e)?|x)\s*)/iu, "");

    // Vérifier si une date ou lieu de mariage précède le nom du conjoint
    // ex: "le 23 octobre 1999 à Paris avec Julie ..."
    let mDateRaw: string | null = null;
    let mYear: number | null = null;
    let mPlace: string | null = null;

    const dateBeforeSpouse = mText.match(/^(?:le\s+)?([0-9]{1,2}\s+[a-zéû]+(?:\s+[0-9]{4})?|[0-9]{4})\s*(?:à|a|en)\s+([A-Za-zÀ-ÿ\s'-]+)\s+(?:avec|à|a)\s+/iu);
    if (dateBeforeSpouse) {
      const parsedMDate = parseDateInput(dateBeforeSpouse[1]);
      mDateRaw = parsedMDate.canonical ?? dateBeforeSpouse[1];
      mYear = parsedMDate.year;
      mPlace = clean(dateBeforeSpouse[2]);
      mText = mText.slice(dateBeforeSpouse[0].length);
    } else {
      // Retirer la préposition vers le conjoint : "à", "avec", "de"
      mText = mText.replace(/^(?:avec|à|a|de)\s+/iu, "");
    }

    // Le reste commence par le nom du conjoint, potentiellement suivi de sa naissance
    const spouseBirthMatch = mText.match(birthKeyword);
    let spouseNamePart = mText;
    let spouseBirthPart = "";

    if (spouseBirthMatch && spouseBirthMatch.index !== undefined) {
      spouseNamePart = mText.slice(0, spouseBirthMatch.index);
      spouseBirthPart = mText.slice(spouseBirthMatch.index + spouseBirthMatch[0].length);
    }

    // Nettoyer le nom du conjoint
    spouseNamePart = spouseNamePart.replace(/[,;:]+$/, "").trim();
    const spouseName = formatGenealogyName(spouseNamePart);

    let spouseSex: "M" | "F" | null = null;
    if (/(?<!\p{L})(?:n[ée]e|n[ée][ée])(?!\p{L})/iu.test(mText)) spouseSex = "F";
    else if (/(?<!\p{L})n[ée](?!\p{L})/iu.test(mText)) spouseSex = "M";
    if (!spouseSex && primarySex) spouseSex = primarySex === "M" ? "F" : "M";
    if (!spouseSex) spouseSex = inferSex(spouseName.givenNames);

    const spouseBirth = spouseBirthPart ? extractDateAndPlace(spouseBirthPart) : { dateRaw: null, year: null, place: null };

    if (spouseName.fullName) {
      spouse = {
        fullName: spouseName.fullName,
        givenNames: spouseName.givenNames,
        surname: spouseName.surname,
        sex: spouseSex,
        birthDateRaw: spouseBirth.dateRaw,
        birthYear: spouseBirth.year,
        birthPlace: spouseBirth.place,
      };
    }

    if (mDateRaw || mPlace || spouse) {
      marriage = {
        dateRaw: mDateRaw,
        year: mYear,
        place: mPlace,
      };
    }
  }

  // 5. Analyse des parents (parentsPart)
  let parents: ParsedGenealogyResult["parents"] = null;
  if (parentsPart) {
    let pText = parentsPart.replace(/^\s*(?:fils|fille|enfant)\s+de\s+/iu, "");
    const splitAnd = pText.split(/\s+(?:et\s+de|et|&)\s+/iu);
    if (splitAnd.length >= 2) {
      const fatherRaw = clean(splitAnd[0]);
      const motherRaw = clean(splitAnd[1]);
      const fatherName = formatGenealogyName(fatherRaw, primaryName.surname);
      const motherName = formatGenealogyName(motherRaw);
      parents = {
        father: fatherName.fullName ? { ...fatherName } : null,
        mother: motherName.fullName ? { ...motherName } : null,
      };
    } else if (splitAnd.length === 1 && clean(splitAnd[0])) {
      const singleName = formatGenealogyName(clean(splitAnd[0]), primaryName.surname);
      const sex = inferSex(singleName.givenNames);
      parents = {
        father: sex !== "F" ? singleName : null,
        mother: sex === "F" ? singleName : null,
      };
    }
  }

  return {
    primary: {
      fullName: primaryName.fullName,
      givenNames: primaryName.givenNames,
      surname: primaryName.surname,
      sex: primarySex,
      birthDateRaw: birthInfo.dateRaw,
      birthYear: birthInfo.year,
      birthPlace: birthInfo.place,
      deathDateRaw: deathInfo.dateRaw,
      deathYear: deathInfo.year,
      deathPlace: deathInfo.place,
      occupation: occupationStr,
    },
    spouse,
    marriage,
    parents,
    rawText: text,
  };
}
