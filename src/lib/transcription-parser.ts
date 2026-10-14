export interface BoundingBox {
  ymin: number; // 0 à 1000
  xmin: number; // 0 à 1000
  ymax: number; // 0 à 1000
  xmax: number; // 0 à 1000
}

export interface FieldSource {
  text?: string;       // Extrait textuel exact dans l'acte
  box?: BoundingBox;   // Bounding box approximative normalisée (0-1000)
}

export interface IndividualExtraction {
  given_names?: string;
  surname?: string;
  sex?: "M" | "F" | null;
  occupation?: string;
  age?: string;
  birth_date_raw?: string;
  birth_place?: string;
  death_date_raw?: string;
  death_place?: string;
  residence?: string;
  is_deceased?: boolean;
  father_given_names?: string;
  father_surname?: string;
  father_occupation?: string;
  father_is_deceased?: boolean;
  father_death_date_raw?: string;
  father_death_place?: string;
  father_birth_date_raw?: string;
  father_birth_place?: string;
  mother_given_names?: string;
  mother_surname?: string;
  mother_occupation?: string;
  mother_is_deceased?: boolean;
  mother_death_date_raw?: string;
  mother_death_place?: string;
  mother_birth_date_raw?: string;
  mother_birth_place?: string;
}

export interface ExtractedActData {
  act_type?: "birth" | "death" | "marriage" | "other";

  // Événement principal de l'acte
  event_date?: string;
  event_place?: string;

  // Sujet principal (actes individuels : naissance, décès, ou personne 1)
  given_names?: string;
  surname?: string;
  sex?: "M" | "F" | null;
  occupation?: string;
  age?: string;
  birth_date_raw?: string;
  birth_place?: string;
  death_date_raw?: string;
  death_place?: string;
  residence?: string;

  // Père (du sujet ou de l'époux)
  father_given_names?: string;
  father_surname?: string;
  father_occupation?: string;
  father_age?: string;
  father_is_deceased?: boolean;
  father_death_date_raw?: string;
  father_death_place?: string;
  father_birth_date_raw?: string;
  father_birth_place?: string;

  // Mère (du sujet ou de l'époux)
  mother_given_names?: string;
  mother_surname?: string;
  mother_occupation?: string;
  mother_age?: string;
  mother_is_deceased?: boolean;
  mother_death_date_raw?: string;
  mother_death_place?: string;
  mother_birth_date_raw?: string;
  mother_birth_place?: string;

  // Conjoint & Mariage (ou Époux / Épouse)
  spouse_given_names?: string;
  spouse_surname?: string;
  spouse_occupation?: string;
  spouse_age?: string;
  spouse_residence?: string;
  spouse_birth_date_raw?: string;
  spouse_birth_place?: string;
  marriage_date_raw?: string;
  marriage_place?: string;

  // Parents du conjoint (très important pour les mariages)
  spouse_father_given_names?: string;
  spouse_father_surname?: string;
  spouse_father_occupation?: string;
  spouse_father_is_deceased?: boolean;
  spouse_father_death_date_raw?: string;
  spouse_father_death_place?: string;

  spouse_mother_given_names?: string;
  spouse_mother_surname?: string;
  spouse_mother_occupation?: string;
  spouse_mother_is_deceased?: boolean;
  spouse_mother_death_date_raw?: string;
  spouse_mother_death_place?: string;

  // Structure dédiée pour les mariages avec 2 individus complets
  groom?: IndividualExtraction;
  bride?: IndividualExtraction;

  // Mentions marginales
  marginal_marriage_date?: string;
  marginal_marriage_place?: string;
  marginal_marriage_spouse?: string;
  marginal_death_date?: string;
  marginal_death_place?: string;

  // Citations textuelles et localisations pour le survol interactif
  sources?: Record<string, FieldSource>;
}

/**
 * Nettoie une chaîne de caractères en retirant les crochets superflus et tirets de tête.
 */
function stripField(s?: string | null): string | undefined {
  if (!s) return undefined;
  const t = s
    .replace(/^\[+|\]+$/g, "")
    .replace(/^[-–—*\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const lower = t.toLowerCase();
  return t.length && !lower.includes("non mentionné") && !lower.includes("inconnu") && !lower.includes("s/o") && !lower.includes("néant")
    ? t
    : undefined;
}

export function uppercaseSurname(s?: string | null): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  return t.length ? t.toLocaleUpperCase("fr") : undefined;
}

/**
 * Découpe un nom complet en prénoms et nom de famille (nom toujours en majuscules).
 */
export function splitFullName(full?: string): { given_names: string; surname: string } {
  if (!full) return { given_names: "", surname: "" };
  const clean = full.replace(/[,(].*$/, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length <= 1) return { given_names: clean, surname: "" };

  // Vérifier si un token est tout en majuscules (convention généalogique)
  const isUpper = (t: string) => {
    const letters = t.replace(/[^\p{L}]/gu, "");
    return letters.length > 1 && letters === letters.toLocaleUpperCase("fr");
  };
  const firstUpper = parts.findIndex(isUpper);
  if (firstUpper !== -1) {
    return {
      given_names: parts.slice(0, firstUpper).join(" "),
      surname: parts.slice(firstUpper).join(" ").toLocaleUpperCase("fr"),
    };
  }

  // Par défaut : dernier mot = nom de famille (en majuscules), reste = prénoms
  return {
    given_names: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1].toLocaleUpperCase("fr"),
  };
}

interface ParsedParent {
  given_names?: string;
  surname?: string;
  occupation?: string;
  is_deceased?: boolean;
  death_date_raw?: string;
  death_place?: string;
  birth_date_raw?: string;
  birth_place?: string;
}

const FRENCH_NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  "dix-sept": 17, "dix-huit": 18, "dix-neuf": 19,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, "soixante-dix": 70,
  "quatre-vingt": 80, "quatre-vingts": 80, "quatre-vingt-dix": 90, cent: 100,
};

export function parseFrenchWordsToNumber(input: string): number | null {
  const clean = input.toLowerCase().trim().replace(/\s+et\s+/g, "-").replace(/\s+/g, "-");
  if (FRENCH_NUMBER_WORDS[clean] !== undefined) return FRENCH_NUMBER_WORDS[clean];

  const parts = clean.split("-").filter(Boolean);
  if (parts.length === 2) {
    const tens = FRENCH_NUMBER_WORDS[parts[0]];
    const units = FRENCH_NUMBER_WORDS[parts[1]];
    if (tens !== undefined && units !== undefined) return tens + units;
  } else if (parts.length === 3 && parts[0] === "quatre" && parts[1].startsWith("vingt")) {
    const units = FRENCH_NUMBER_WORDS[parts[2]];
    if (units !== undefined) return 80 + units;
  }
  return null;
}

export function parseFrenchAge(text: string): number | null {
  const numMatch = text.match(/(?:âgé[e]?|age)\s+de\s+(\d{1,2})\s+ans/i);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (!isNaN(val) && val > 0 && val < 120) return val;
  }

  const wordMatch = text.match(/(?:âgé[e]?|age)\s+de\s+([a-zéèêë\s-]+?)\s+ans/i);
  if (wordMatch) {
    const num = parseFrenchWordsToNumber(wordMatch[1]);
    if (num && num > 0 && num < 120) return num;
  }
  return null;
}

/**
 * Analyse une mention ou ligne relative à un parent pour en extraire
 * les dates, lieux, professions et filiations même en texte libre.
 */
function parseParentBlock(
  rawText: string,
  defaultSurname?: string,
  referenceYear?: number
): ParsedParent {
  const result: ParsedParent = {};
  if (!rawText) return result;

  const text = rawText.replace(/^[-–—*\s]+/, "").trim();

  // 1. Statut décédé
  if (/\b(?:feu|feue|feus|défunt|défunte|défunts|décédé|décédée|décédés|mort|morte)\b/i.test(text)) {
    result.is_deceased = true;
  }

  // 2. Date de décès (ex: "décédé le 14 janvier 1740", "décédé avant 1742", "décédé le 14/01/1740", "mort le 5 mai 1735")
  const deathDateMatch = text.match(
    /(?:décédé[e]?|décédés|mort[e]?|décès)\s+(?:le\s+)?(\d{1,2}\s+[a-zéû]+\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|(?:vers|avant|après|en|environ)\s+\d{4}|\d{4})/i
  );
  if (deathDateMatch) {
    result.death_date_raw = deathDateMatch[1].trim();
    result.is_deceased = true;
  }

  // 3. Lieu de décès (ex: "décédé à Saint-Malo", "décédé en cette paroisse", "mort à Cancale")
  const deathPlaceMatch = text.match(
    /(?:décédé[e]?|décédés|mort[e]?)[^,.;()]*?\s+(?:[aà]\s+|en\s+)([A-ZÀ-ÖØ-ß][\w\s'-]+?|\bcette\s+paroisse\b)(?:[,\n;()]|\s+le\s+|\s+âgé|\s+né|\s+et\s+|$)/i
  );
  if (deathPlaceMatch) {
    const pl = deathPlaceMatch[1].trim();
    if (pl.toLowerCase() !== "cette paroisse" || !result.death_place) {
      result.death_place = pl;
    }
    result.is_deceased = true;
  }

  // 4. Date de naissance explicite (ex: "né le 14 mai 1710", "né vers 1680")
  const birthDateMatch = text.match(
    /(?:né[e]?|naissance)\s+(?:le\s+)?(\d{1,2}\s+[a-zéû]+\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|(?:vers|environ|en)\s+\d{4}|\d{4})/i
  );
  if (birthDateMatch) {
    result.birth_date_raw = birthDateMatch[1].trim();
  }

  // 5. Âge & Naissance calculée (ex: "âgé de 34 ans", "âgé de trente-deux ans")
  if (referenceYear && !result.birth_date_raw) {
    const age = parseFrenchAge(text);
    if (age && age > 0) {
      result.birth_date_raw = `vers ${referenceYear - age}`;
    }
  }

  // 6. Lieu de naissance (ex: "né à Pleurtuit", "originaire de Paramé", "natif de Rennes")
  const birthPlaceMatch = text.match(
    /(?:né[e]?|originaire|natif)\s+(?:[aà]\s+|de\s+)([A-ZÀ-ÖØ-ß][\w\s'-]+?)(?:[,\n;()]|\s+le\s+|\s+âgé|\s+décédé|\s+et\s+|$)/i
  );
  if (birthPlaceMatch) {
    result.birth_place = birthPlaceMatch[1].trim();
  }

  // 7. Profession
  const occMatch = text.match(
    /(?:profession|métier)\s*:\s*([^,.;\n]+)/i
  ) || text.match(
    /\b(laboureur|ménagère|cultivateur|journalier|marinier|marin|pêcheur|maçon|forgeron|tisserand|charpentier|cordonnier|serrurier|meunier|boulanger|commerçant|marchand|notaire|avocat|vicaire|recteur|curé|tailleur|domestique|servante|fileuse|lingère|couturière|propriétaire|rentier)\b/i
  );
  if (occMatch) {
    result.occupation = occMatch[1].trim();
  }

  // 8. Extraction du Nom et Prénoms
  let cleanName = text
    .replace(/\b(?:feu|feue|feus|défunt|défunte|défunts|sieur|damoiselle|dame|honorable\s+homme)\b/gi, "")
    .replace(/(?:décédé[e]?|décédés|mort[e]?)[^,.;()]*/gi, "")
    .replace(/(?:né[e]?|naissance|originaire|natif)[^,.;()]*/gi, "")
    .replace(/(?:âgé[e]?|age)\s+de\s+\d{1,2}\s+ans/gi, "")
    .replace(/(?:profession|métier)\s*:\s*[^,.;\n]+/gi, "")
    .replace(/[,.;()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (result.occupation) {
    cleanName = cleanName.replace(new RegExp(`\\b${result.occupation}\\b`, "gi"), "").trim();
  }

  if (cleanName) {
    const split = splitFullName(cleanName);
    result.given_names = split.given_names;
    result.surname = split.surname || defaultSurname;
  }

  return result;
}

/**
 * Extrait les données généalogiques d'une transcription.
 */
export function parseTranscription(text: string): ExtractedActData {
  if (!text) return {};

  const clean = text.trim();
  const data: ExtractedActData = {};

  // 1. Chercher un bloc JSON formalisé dans le texte
  const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    try {
      const p = JSON.parse(jsonMatch[1]);
      if (typeof p === "object" && p !== null) {
        // Support structure plate
        if (p.act_type) data.act_type = p.act_type;
        if (p.date_raw || p.event_date) data.event_date = p.date_raw || p.event_date;
        if (p.place || p.event_place) data.event_place = p.place || p.event_place;

        if (p.given_names) data.given_names = p.given_names;
        if (p.surname) data.surname = p.surname;
        if (p.occupation) data.occupation = p.occupation;
        if (p.age) data.age = p.age;
        if (p.residence) data.residence = p.residence;
        if (p.birth_date_raw || p.birth_date) data.birth_date_raw = p.birth_date_raw || p.birth_date;
        if (p.birth_place) data.birth_place = p.birth_place;
        if (p.death_date_raw || p.death_date) data.death_date_raw = p.death_date_raw || p.death_date;
        if (p.death_place) data.death_place = p.death_place;

        // Père (champs plats)
        if (p.father_given_names) data.father_given_names = p.father_given_names;
        if (p.father_surname) data.father_surname = p.father_surname;
        if (p.father_occupation) data.father_occupation = p.father_occupation;
        if (p.father_is_deceased !== undefined) data.father_is_deceased = Boolean(p.father_is_deceased);
        if (p.father_death_date_raw || p.father_death_date) data.father_death_date_raw = p.father_death_date_raw || p.father_death_date;
        if (p.father_death_place) data.father_death_place = p.father_death_place;
        if (p.father_birth_date_raw || p.father_birth_date) data.father_birth_date_raw = p.father_birth_date_raw || p.father_birth_date;
        if (p.father_birth_place) data.father_birth_place = p.father_birth_place;

        // Mère (champs plats)
        if (p.mother_given_names) data.mother_given_names = p.mother_given_names;
        if (p.mother_surname) data.mother_surname = p.mother_surname;
        if (p.mother_occupation) data.mother_occupation = p.mother_occupation;
        if (p.mother_is_deceased !== undefined) data.mother_is_deceased = Boolean(p.mother_is_deceased);
        if (p.mother_death_date_raw || p.mother_death_date) data.mother_death_date_raw = p.mother_death_date_raw || p.mother_death_date;
        if (p.mother_death_place) data.mother_death_place = p.mother_death_place;
        if (p.mother_birth_date_raw || p.mother_birth_date) data.mother_birth_date_raw = p.mother_birth_date_raw || p.mother_birth_date;
        if (p.mother_birth_place) data.mother_birth_place = p.mother_birth_place;

        // Conjoint
        if (p.spouse_given_names) data.spouse_given_names = p.spouse_given_names;
        if (p.spouse_surname) data.spouse_surname = p.spouse_surname;
        if (p.spouse_occupation) data.spouse_occupation = p.spouse_occupation;
        if (p.spouse_age) data.spouse_age = p.spouse_age;
        if (p.spouse_residence) data.spouse_residence = p.spouse_residence;
        if (p.spouse_birth_date_raw || p.spouse_birth_date) data.spouse_birth_date_raw = p.spouse_birth_date_raw || p.spouse_birth_date;
        if (p.spouse_birth_place) data.spouse_birth_place = p.spouse_birth_place;
        if (p.marriage_date_raw || p.marriage_date) data.marriage_date_raw = p.marriage_date_raw || p.marriage_date;
        if (p.marriage_place) data.marriage_place = p.marriage_place;

        // Parents du conjoint
        if (p.spouse_father_given_names) data.spouse_father_given_names = p.spouse_father_given_names;
        if (p.spouse_father_surname) data.spouse_father_surname = p.spouse_father_surname;
        if (p.spouse_father_occupation) data.spouse_father_occupation = p.spouse_father_occupation;
        if (p.spouse_father_is_deceased !== undefined) data.spouse_father_is_deceased = Boolean(p.spouse_father_is_deceased);
        if (p.spouse_father_death_date_raw) data.spouse_father_death_date_raw = p.spouse_father_death_date_raw;
        if (p.spouse_father_death_place) data.spouse_father_death_place = p.spouse_father_death_place;

        if (p.spouse_mother_given_names) data.spouse_mother_given_names = p.spouse_mother_given_names;
        if (p.spouse_mother_surname) data.spouse_mother_surname = p.spouse_mother_surname;
        if (p.spouse_mother_occupation) data.spouse_mother_occupation = p.spouse_mother_occupation;
        if (p.spouse_mother_is_deceased !== undefined) data.spouse_mother_is_deceased = Boolean(p.spouse_mother_is_deceased);
        if (p.spouse_mother_death_date_raw) data.spouse_mother_death_date_raw = p.spouse_mother_death_date_raw;
        if (p.spouse_mother_death_place) data.spouse_mother_death_place = p.spouse_mother_death_place;

        // Structure groom / bride
        if (p.groom && typeof p.groom === "object") {
          data.groom = p.groom;
          if (!data.given_names) data.given_names = p.groom.given_names;
          if (!data.surname) data.surname = p.groom.surname;
          if (!data.occupation) data.occupation = p.groom.occupation;
          if (!data.age) data.age = p.groom.age;
          if (!data.birth_date_raw) data.birth_date_raw = p.groom.birth_date_raw;
          if (!data.birth_place) data.birth_place = p.groom.birth_place;
          if (!data.father_given_names) data.father_given_names = p.groom.father_given_names;
          if (!data.father_surname) data.father_surname = p.groom.father_surname;
          if (!data.father_occupation) data.father_occupation = p.groom.father_occupation;
          if (data.father_is_deceased === undefined) data.father_is_deceased = p.groom.father_is_deceased;
          if (!data.father_death_date_raw) data.father_death_date_raw = p.groom.father_death_date_raw;
          if (!data.father_death_place) data.father_death_place = p.groom.father_death_place;
          if (!data.mother_given_names) data.mother_given_names = p.groom.mother_given_names;
          if (!data.mother_surname) data.mother_surname = p.groom.mother_surname;
          if (!data.mother_occupation) data.mother_occupation = p.groom.mother_occupation;
          if (data.mother_is_deceased === undefined) data.mother_is_deceased = p.groom.mother_is_deceased;
          if (!data.mother_death_date_raw) data.mother_death_date_raw = p.groom.mother_death_date_raw;
          if (!data.mother_death_place) data.mother_death_place = p.groom.mother_death_place;
        }

        if (p.bride && typeof p.bride === "object") {
          data.bride = p.bride;
          if (!data.spouse_given_names) data.spouse_given_names = p.bride.given_names;
          if (!data.spouse_surname) data.spouse_surname = p.bride.surname;
          if (!data.spouse_occupation) data.spouse_occupation = p.bride.occupation;
          if (!data.spouse_age) data.spouse_age = p.bride.age;
          if (!data.spouse_birth_date_raw) data.spouse_birth_date_raw = p.bride.birth_date_raw;
          if (!data.spouse_birth_place) data.spouse_birth_place = p.bride.birth_place;
          if (!data.spouse_father_given_names) data.spouse_father_given_names = p.bride.father_given_names;
          if (!data.spouse_father_surname) data.spouse_father_surname = p.bride.father_surname;
          if (!data.spouse_father_occupation) data.spouse_father_occupation = p.bride.father_occupation;
          if (data.spouse_father_is_deceased === undefined) data.spouse_father_is_deceased = p.bride.father_is_deceased;
          if (!data.spouse_father_death_date_raw) data.spouse_father_death_date_raw = p.bride.father_death_date_raw;
          if (!data.spouse_father_death_place) data.spouse_father_death_place = p.bride.father_death_place;
          if (!data.spouse_mother_given_names) data.spouse_mother_given_names = p.bride.mother_given_names;
          if (!data.spouse_mother_surname) data.spouse_mother_surname = p.bride.mother_surname;
          if (!data.spouse_mother_occupation) data.spouse_mother_occupation = p.bride.mother_occupation;
          if (data.spouse_mother_is_deceased === undefined) data.spouse_mother_is_deceased = p.bride.mother_is_deceased;
          if (!data.spouse_mother_death_date_raw) data.spouse_mother_death_date_raw = p.bride.mother_death_date_raw;
          if (!data.spouse_mother_death_place) data.spouse_mother_death_place = p.bride.mother_death_place;
        }

        // Support structure imbriquée (person, father, mother, spouse, marginal_mentions)
        if (p.person) {
          if (p.person.given_names) data.given_names = p.person.given_names;
          if (p.person.surname) data.surname = p.person.surname;
          if (p.person.occupation) data.occupation = p.person.occupation;
          if (p.person.age) data.age = p.person.age;
          if (p.person.birth_date) data.birth_date_raw = p.person.birth_date;
          if (p.person.birth_place) data.birth_place = p.person.birth_place;
          if (p.person.death_date) data.death_date_raw = p.person.death_date;
          if (p.person.death_place) data.death_place = p.person.death_place;
        }

        if (p.father) {
          if (p.father.given_names) data.father_given_names = p.father.given_names;
          if (p.father.surname) data.father_surname = p.father.surname;
          if (p.father.occupation) data.father_occupation = p.father.occupation;
          if (p.father.is_deceased !== undefined) data.father_is_deceased = Boolean(p.father.is_deceased);
          if (p.father.death_date || p.father.death_date_raw) data.father_death_date_raw = p.father.death_date || p.father.death_date_raw;
          if (p.father.death_place) data.father_death_place = p.father.death_place;
          if (p.father.birth_date || p.father.birth_date_raw || p.father.birth_date_or_year) data.father_birth_date_raw = p.father.birth_date || p.father.birth_date_raw || p.father.birth_date_or_year;
          if (p.father.birth_place) data.father_birth_place = p.father.birth_place;
        }

        if (p.mother) {
          if (p.mother.given_names) data.mother_given_names = p.mother.given_names;
          if (p.mother.surname) data.mother_surname = p.mother.surname;
          if (p.mother.occupation) data.mother_occupation = p.mother_occupation;
          if (p.mother.is_deceased !== undefined) data.mother_is_deceased = Boolean(p.mother.is_deceased);
          if (p.mother.death_date || p.mother.death_date_raw) data.mother_death_date_raw = p.mother.death_date || p.mother.death_date_raw;
          if (p.mother.death_place) data.mother_death_place = p.mother.death_place;
          if (p.mother.birth_date || p.mother.birth_date_raw || p.mother.birth_date_or_year) data.mother_birth_date_raw = p.mother.birth_date || p.mother.birth_date_raw || p.mother.birth_date_or_year;
          if (p.mother.birth_place) data.mother_birth_place = p.mother.birth_place;
        }

        if (p.spouse) {
          if (p.spouse.given_names) data.spouse_given_names = p.spouse.given_names;
          if (p.spouse.surname) data.spouse_surname = p.spouse.surname;
          if (p.spouse.marriage_date) data.marriage_date_raw = p.spouse.marriage_date;
          if (p.spouse.marriage_place) data.marriage_place = p.spouse.marriage_place;
        }

        if (p.marginal_mentions) {
          if (p.marginal_mentions.marriage_date) data.marginal_marriage_date = p.marginal_mentions.marriage_date;
          if (p.marginal_mentions.marriage_place) data.marginal_marriage_place = p.marginal_mentions.marriage_place;
          if (p.marginal_mentions.marriage_spouse) data.marginal_marriage_spouse = p.marginal_mentions.marriage_spouse;
          if (p.marginal_mentions.death_date) data.marginal_death_date = p.marginal_mentions.death_date;
          if (p.marginal_mentions.death_place) data.marginal_death_place = p.marginal_mentions.death_place;
        }

        // Sources et citations textuelles / bounding boxes
        if (p.sources && typeof p.sources === "object") {
          const normSources: Record<string, FieldSource> = {};
          for (const [k, v] of Object.entries(p.sources)) {
            if (v && typeof v === "object") {
              const srcObj = v as Record<string, unknown>;
              let box: BoundingBox | undefined = undefined;
              const rawBox = (srcObj.box || srcObj.box_2d) as unknown;
              if (Array.isArray(rawBox) && rawBox.length >= 4) {
                box = {
                  ymin: Number(rawBox[0]),
                  xmin: Number(rawBox[1]),
                  ymax: Number(rawBox[2]),
                  xmax: Number(rawBox[3]),
                };
              } else if (
                rawBox &&
                typeof rawBox === "object" &&
                "ymin" in rawBox &&
                "xmin" in rawBox
              ) {
                const b = rawBox as Record<string, unknown>;
                box = {
                  ymin: Number(b.ymin),
                  xmin: Number(b.xmin),
                  ymax: Number(b.ymax),
                  xmax: Number(b.xmax),
                };
              }
              normSources[k] = {
                text: typeof srcObj.text === "string" ? srcObj.text : undefined,
                box,
              };
            }
          }
          data.sources = normSources;
        }
      }
    } catch {
      // Ignorer erreur JSON
    }
  }

  // 2. Extraction Markdown par expressions régulières (complément / fallback)

  // Type d'acte
  if (!data.act_type) {
    const m = clean.match(/\*\*Type\s+d['’]acte\*\*\s*:\s*([^\n\r]+)/i);
    if (m) {
      const t = m[1].toLowerCase();
      if (t.includes("naiss") || t.includes("bapt")) data.act_type = "birth";
      else if (t.includes("décès") || t.includes("deces") || t.includes("sépult") || t.includes("sepult") || t.includes("mort")) data.act_type = "death";
      else if (t.includes("mariage") || t.includes("époux") || t.includes("epoux")) data.act_type = "marriage";
      else data.act_type = "other";
    }
  }

  // Date de l'acte
  if (!data.event_date) {
    const m = clean.match(/\*\*Date(?:[^*]*)\*\*\s*:\s*([^\n\r]+)/i);
    if (m) data.event_date = stripField(m[1]);
  }

  // Année de référence pour le calcul des âges
  let refYear: number | undefined;
  if (data.event_date) {
    const yMatch = data.event_date.match(/\b(1[5-9]\d\d|20\d\d)\b/);
    if (yMatch) refYear = parseInt(yMatch[1], 10);
  }

  // Lieu de l'acte
  if (!data.event_place) {
    const m = clean.match(/\*\*Lieu(?:[^*]*)\*\*\s*:\s*([^\n\r]+)/i);
    if (m) data.event_place = stripField(m[1]);
  }

  // Individu principal
  if (!data.given_names && !data.surname) {
    const m = clean.match(/\*\*Individu[^*]*\*\*\s*:\s*([^\n\r]+)/i);
    if (m) {
      const rawIndiv = stripField(m[1]);
      if (rawIndiv) {
        const split = splitFullName(rawIndiv);
        data.given_names = split.given_names;
        data.surname = split.surname;
      }
    }
  }

  // Filiation / Père
  const fatherLine = clean.match(/(?:père|p[èe]re)\s*:\s*([^\n\r]+)/i);
  if (fatherLine) {
    const rawF = stripField(fatherLine[1]);
    if (rawF) {
      const parsedF = parseParentBlock(rawF, data.surname, refYear);
      if (!data.father_given_names && parsedF.given_names) data.father_given_names = parsedF.given_names;
      if (!data.father_surname && parsedF.surname) data.father_surname = parsedF.surname;
      if (!data.father_occupation && parsedF.occupation) data.father_occupation = parsedF.occupation;
      if (data.father_is_deceased === undefined && parsedF.is_deceased !== undefined) data.father_is_deceased = parsedF.is_deceased;
      if (!data.father_death_date_raw && parsedF.death_date_raw) data.father_death_date_raw = parsedF.death_date_raw;
      if (!data.father_death_place && parsedF.death_place) data.father_death_place = parsedF.death_place;
      if (!data.father_birth_date_raw && parsedF.birth_date_raw) data.father_birth_date_raw = parsedF.birth_date_raw;
      if (!data.father_birth_place && parsedF.birth_place) data.father_birth_place = parsedF.birth_place;
    }
  } else {
    // Format alternatif: **Filiation / Parents** : François Dupont et Jeanne Martin
    const parentsLine = clean.match(/\*\*(?:Filiation|Parents)[^*]*\*\*\s*:\s*([^\n\r]+)/i);
    if (parentsLine) {
      const rawParents = stripField(parentsLine[1]);
      if (rawParents) {
        const splitAnd = rawParents.split(/\s+et\s+/i);
        if (splitAnd.length >= 2) {
          const parsedF = parseParentBlock(splitAnd[0], data.surname, refYear);
          if (!data.father_given_names && parsedF.given_names) data.father_given_names = parsedF.given_names;
          if (!data.father_surname && parsedF.surname) data.father_surname = parsedF.surname;
          if (!data.father_occupation && parsedF.occupation) data.father_occupation = parsedF.occupation;
          if (data.father_is_deceased === undefined && parsedF.is_deceased !== undefined) data.father_is_deceased = parsedF.is_deceased;
          if (!data.father_death_date_raw && parsedF.death_date_raw) data.father_death_date_raw = parsedF.death_date_raw;
          if (!data.father_death_place && parsedF.death_place) data.father_death_place = parsedF.death_place;

          const parsedM = parseParentBlock(splitAnd[1], undefined, refYear);
          if (!data.mother_given_names && parsedM.given_names) data.mother_given_names = parsedM.given_names;
          if (!data.mother_surname && parsedM.surname) data.mother_surname = parsedM.surname;
          if (!data.mother_occupation && parsedM.occupation) data.mother_occupation = parsedM.occupation;
          if (data.mother_is_deceased === undefined && parsedM.is_deceased !== undefined) data.mother_is_deceased = parsedM.is_deceased;
          if (!data.mother_death_date_raw && parsedM.death_date_raw) data.mother_death_date_raw = parsedM.death_date_raw;
          if (!data.mother_death_place && parsedM.death_place) data.mother_death_place = parsedM.death_place;
        }
      }
    }
  }

  // Mère
  const motherLine = clean.match(/(?:mère|m[èe]re)\s*:\s*([^\n\r]+)/i);
  if (motherLine) {
    const rawM = stripField(motherLine[1]);
    if (rawM) {
      const parsedM = parseParentBlock(rawM, undefined, refYear);
      if (!data.mother_given_names && parsedM.given_names) data.mother_given_names = parsedM.given_names;
      if (!data.mother_surname && parsedM.surname) data.mother_surname = parsedM.surname;
      if (!data.mother_occupation && parsedM.occupation) data.mother_occupation = parsedM.occupation;
      if (data.mother_is_deceased === undefined && parsedM.is_deceased !== undefined) data.mother_is_deceased = parsedM.is_deceased;
      if (!data.mother_death_date_raw && parsedM.death_date_raw) data.mother_death_date_raw = parsedM.death_date_raw;
      if (!data.mother_death_place && parsedM.death_place) data.mother_death_place = parsedM.death_place;
      if (!data.mother_birth_date_raw && parsedM.birth_date_raw) data.mother_birth_date_raw = parsedM.birth_date_raw;
      if (!data.mother_birth_place && parsedM.birth_place) data.mother_birth_place = parsedM.birth_place;
    }
  }

  // Déduction de l'année de naissance approximative des parents à partir de leur âge
  if (refYear) {
    if (!data.father_birth_date_raw) {
      if (data.father_age) {
        const a = parseFrenchAge(`âgé de ${data.father_age}`);
        if (a) data.father_birth_date_raw = `vers ${refYear - a}`;
      } else {
        const fatherAgeMatch =
          clean.match(/(?:père|déclarant|comparant)[^,.;()]*?âgé\s+de\s+([a-zéèêë\d\s-]+?)\s+ans/i) ||
          clean.match(/âgé\s+de\s+([a-zéèêë\d\s-]+?)\s+ans[^,.;()]*?(?:père|déclarant|comparant)/i);
        if (fatherAgeMatch) {
          const a = parseFrenchAge(`âgé de ${fatherAgeMatch[1]} ans`);
          if (a) data.father_birth_date_raw = `vers ${refYear - a}`;
        }
      }
    }

    if (!data.mother_birth_date_raw) {
      if (data.mother_age) {
        const a = parseFrenchAge(`âgée de ${data.mother_age}`);
        if (a) data.mother_birth_date_raw = `vers ${refYear - a}`;
      } else {
        const motherAgeMatch =
          clean.match(/(?:mère|épouse|conjointe)[^,.;()]*?âgée\s+de\s+([a-zéèêë\d\s-]+?)\s+ans/i) ||
          clean.match(/âgée\s+de\s+([a-zéèêë\d\s-]+?)\s+ans[^,.;()]*?(?:mère|épouse|conjointe)/i);
        if (motherAgeMatch) {
          const a = parseFrenchAge(`âgée de ${motherAgeMatch[1]} ans`);
          if (a) data.mother_birth_date_raw = `vers ${refYear - a}`;
        }
      }
    }
  }

  // Si une date ou lieu de décès est détecté pour un parent, le marquer automatiquement décédé
  if (data.father_death_date_raw || data.father_death_place) {
    data.father_is_deceased = true;
  }
  if (data.mother_death_date_raw || data.mother_death_place) {
    data.mother_is_deceased = true;
  }

  // Conjoint
  if (!data.spouse_given_names && !data.spouse_surname) {
    const spouseLine = clean.match(/\*\*Conjoint[^*]*\*\*\s*:\s*([^\n\r]+)/i);
    if (spouseLine) {
      const raw = stripField(spouseLine[1]);
      if (raw) {
        const split = splitFullName(raw);
        data.spouse_given_names = split.given_names;
        data.spouse_surname = split.surname;
      }
    }
  }

  // Mentions marginales dans le texte
  const margMatch = clean.match(/(?:mention(?:s)?\s+marginale(?:s)?)[^*]*:\s*([^\n\r]+)/i);
  if (margMatch) {
    const margText = margMatch[1];
    // Mariage en marge
    const marrMarg = margText.match(/mari[ée]\s+(?:le\s+)?(\d{1,2}\s+[a-zéû]+\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4})(?:\s+[aà]\s+([^,(]+))?(?:\s+avec\s+([^,.]+))?/i);
    if (marrMarg) {
      data.marginal_marriage_date = stripField(marrMarg[1]);
      if (marrMarg[2]) data.marginal_marriage_place = stripField(marrMarg[2]);
      if (marrMarg[3]) data.marginal_marriage_spouse = stripField(marrMarg[3]);
    }
    // Décès en marge
    const dthMarg = margText.match(/décéd[ée]\s+(?:le\s+)?(\d{1,2}\s+[a-zéû]+\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4})(?:\s+[aà]\s+([^,.]+))?/i);
    if (dthMarg) {
      data.marginal_death_date = stripField(dthMarg[1]);
      if (dthMarg[2]) data.marginal_death_place = stripField(dthMarg[2]);
    }
  }

  return {
    act_type: data.act_type,
    event_date: stripField(data.event_date),
    event_place: stripField(data.event_place),
    given_names: stripField(data.given_names),
    surname: uppercaseSurname(stripField(data.surname)),
    sex: data.sex,
    occupation: stripField(data.occupation),
    age: stripField(data.age),
    birth_date_raw: stripField(data.birth_date_raw || (data.act_type === "birth" ? data.event_date : undefined)),
    birth_place: stripField(data.birth_place || (data.act_type === "birth" ? data.event_place : undefined)),
    death_date_raw: stripField(data.death_date_raw || data.marginal_death_date || (data.act_type === "death" ? data.event_date : undefined)),
    death_place: stripField(data.death_place || data.marginal_death_place || (data.act_type === "death" ? data.event_place : undefined)),
    residence: stripField(data.residence),
    father_given_names: stripField(data.father_given_names),
    father_surname: uppercaseSurname(stripField(data.father_surname)),
    father_occupation: stripField(data.father_occupation),
    father_is_deceased: data.father_is_deceased,
    father_death_date_raw: stripField(data.father_death_date_raw),
    father_death_place: stripField(data.father_death_place),
    father_birth_date_raw: stripField(data.father_birth_date_raw),
    father_birth_place: stripField(data.father_birth_place),
    mother_given_names: stripField(data.mother_given_names),
    mother_surname: uppercaseSurname(stripField(data.mother_surname)),
    mother_occupation: stripField(data.mother_occupation),
    mother_is_deceased: data.mother_is_deceased,
    mother_death_date_raw: stripField(data.mother_death_date_raw),
    mother_death_place: stripField(data.mother_death_place),
    mother_birth_date_raw: stripField(data.mother_birth_date_raw),
    mother_birth_place: stripField(data.mother_birth_place),
    spouse_given_names: stripField(data.spouse_given_names || (data.marginal_marriage_spouse ? splitFullName(data.marginal_marriage_spouse).given_names : undefined)),
    spouse_surname: uppercaseSurname(stripField(data.spouse_surname || (data.marginal_marriage_spouse ? splitFullName(data.marginal_marriage_spouse).surname : undefined))),
    spouse_occupation: stripField(data.spouse_occupation),
    spouse_age: stripField(data.spouse_age),
    spouse_residence: stripField(data.spouse_residence),
    spouse_birth_date_raw: stripField(data.spouse_birth_date_raw),
    spouse_birth_place: stripField(data.spouse_birth_place),
    marriage_date_raw: stripField(data.marriage_date_raw || data.marginal_marriage_date || (data.act_type === "marriage" ? data.event_date : undefined)),
    marriage_place: stripField(data.marriage_place || data.marginal_marriage_place || (data.act_type === "marriage" ? data.event_place : undefined)),
    spouse_father_given_names: stripField(data.spouse_father_given_names),
    spouse_father_surname: uppercaseSurname(stripField(data.spouse_father_surname)),
    spouse_father_occupation: stripField(data.spouse_father_occupation),
    spouse_father_is_deceased: data.spouse_father_is_deceased,
    spouse_father_death_date_raw: stripField(data.spouse_father_death_date_raw),
    spouse_father_death_place: stripField(data.spouse_father_death_place),
    spouse_mother_given_names: stripField(data.spouse_mother_given_names),
    spouse_mother_surname: uppercaseSurname(stripField(data.spouse_mother_surname)),
    spouse_mother_occupation: stripField(data.spouse_mother_occupation),
    spouse_mother_is_deceased: data.spouse_mother_is_deceased,
    spouse_mother_death_date_raw: stripField(data.spouse_mother_death_date_raw),
    spouse_mother_death_place: stripField(data.spouse_mother_death_place),
    groom: data.groom,
    bride: data.bride,
    marginal_marriage_date: stripField(data.marginal_marriage_date),
    marginal_marriage_place: stripField(data.marginal_marriage_place),
    marginal_marriage_spouse: stripField(data.marginal_marriage_spouse),
    marginal_death_date: stripField(data.marginal_death_date),
    marginal_death_place: stripField(data.marginal_death_place),
    sources: data.sources,
  };
}

/**
 * Retire le bloc ```json ... ``` de la fin du texte pour l'affichage propre.
 */
export function cleanTranscriptionText(text: string): string {
  if (!text) return "";
  return text.replace(/### Données extraites\s*```(?:json)?[\s\S]*?```/i, "").trim();
}
