/**
 * Consignes envoyées à l'IA pour lire un acte : depuis l'image (transcription paléographique)
 * ou depuis les notes prises par l'utilisateur en lisant l'acte lui-même.
 * Les deux finissent par le même bloc JSON, lu par parseTranscription.
 */
type ActKind = "birth" | "death" | "marriage";

function kindGuidanceOf(actKind?: ActKind): string {
  let kindGuidance = "";
  if (actKind === "marriage") {
    kindGuidance = `
IMPORTANT : CET ACTE EST UN ACTE DE MARIAGE.
Il comporte obligatoirement DEUX individus principaux (l'Époux / Mari et l'Épouse / Femme), ainsi que leurs parents respectifs :
- Pour l'Époux : nom, prénoms, âge, profession, lieu d'origine ou paroisse, père (prénom, nom, statut vivant ou défunt/feu, date/lieu de décès si mentionnés), mère (prénom, nom de jeune fille, vivante ou feue).
- Pour l'Épouse : nom, prénoms, âge, profession, lieu d'origine, père (vivant ou défunt/feu), mère (vivante ou feue).
- Date et lieu de célébration du mariage.
Veille à renseigner distinctement le bloc "groom" (époux) et le bloc "bride" (épouse) dans le JSON.`;
  } else if (actKind === "death") {
    kindGuidance = `
IMPORTANT : CET ACTE EST UN ACTE DE DÉCÈS / SÉPULTURE.
Le sujet principal est la personne décédée :
- Date du décès ou de l'inhumation (souvent le lendemain).
- Âge déclaré au décès (ex: 60 ans) -> calcule rigoureusement l'année approximative de naissance dans birth_date_raw (ex: "vers 1682").
- Conjoint éventuel ("veuf/veuve de ...", ou "époux/épouse de ...").
- Parents mentionnés le cas échéant.`;
  } else if (actKind === "birth") {
    kindGuidance = `
IMPORTANT : CET ACTE EST UN ACTE DE NAISSANCE / BAPTÊME.
Le sujet principal est l'enfant né ou baptisé :
- Date de naissance et/ou de baptême.
- Filiation : père (nom, prénoms, profession) et mère (nom de jeune fille, prénoms).
- Mentions marginales ultérieures : surveille attentivement les annotations manuscrites en marge de la page (ex: mariage ultérieur, décès ultérieur avec date et lieu).`;
  }
  return kindGuidance;
}

const RULES = `RÈGLE ABSOLUE SUR LES NOMS : En généalogie française, les NOMS DE FAMILLE sont TOUJOURS écrits INTÉGRALEMENT EN MAJUSCULES (ex: DUPONT, MARTIN, LE GALL, DE LA HAYE, etc.) tant dans l'analyse que dans tous les champs du bloc JSON.

RÈGLE SUR LES ÂGES ET ANNÉES DE NAISSANCE ESTIMÉES :
Dans les actes de naissance, mariage ou décès, l'âge des personnes (père, mère, époux, épouse, défunt) est très souvent indiqué (ex: "âgé de trente-quatre ans", "âgée de 28 ans").
Dès qu'un âge est mentionné :
1. Renseigne le champ âge correspondant ("age", "father_age", "mother_age", "spouse_age").
2. Calcule systématiquement l'année de naissance approximative par rapport à l'année de l'acte sous la forme "vers YYYY" (ex: si l'acte est de 1884 et que le père a 34 ans -> father_birth_date_raw: "vers 1850") et place-la dans "father_birth_date_raw", "mother_birth_date_raw", etc.`;

const SOURCES_RULE = `RÈGLE OBLIGATOIRE SUR LES CITATIONS SOURCES (CONTEXTE LONG) :
Dans le bloc JSON "sources", pour chaque champ extrait (date, place, name, occupation, birth_date, death_date, father, father_birth_date, father_occupation, father_status, mother, mother_birth_date, mother_occupation, mother_status, spouse, spouse_father, spouse_mother, marriage_date, marriage_place) :
Fournis systématiquement dans "text" une phrase complète ou une proposition longue (15 à 30 mots) tirée directement et fidèlement de la transcription avec son contexte environnant (ex: "a comparu Pierre DUPONT, âgé de trente-quatre ans, profession de cultivateur, demeurant au bourg, lequel nous a présenté un enfant", "fils légitime et naturel de défunt Jean MARTIN en son vivant journalier et de vivante Marie LE GALL sa veuve"). Le contexte doit être suffisamment complet pour comprendre d'où vient l'information sans ambiguïté.`;

const JSON_BLOCK = `### Données extraites
\`\`\`json
{
  "act_type": "birth | death | marriage | other",
  "event_date": "date principale de l'événement (ex: 14 février 1742)",
  "event_place": "lieu ou paroisse principal (ex: Saint-Malo)",
  
  "given_names": "prénom(s) du sujet (ou époux si mariage)",
  "surname": "nom de famille du sujet (ou époux si mariage)",
  "occupation": "métier",
  "age": "âge si mentionné (ex: 25 ans)",
  "residence": "paroisse ou lieu de résidence",
  "birth_date_raw": "date de naissance si mentionnée ou calculée (ex: vers 1715)",
  "birth_place": "lieu de naissance si mentionné",
  "death_date_raw": "date de décès si mentionnée",
  "death_place": "lieu de décès si mentionné",

  "father_given_names": "prénom du père",
  "father_surname": "nom du père",
  "father_occupation": "métier du père",
  "father_age": "âge du père si mentionné (ex: 34 ans)",
  "father_birth_date_raw": "date ou année de naissance calculée du père (ex: vers 1850 si l'acte est de 1884 et père 34 ans)",
  "father_birth_place": "lieu de naissance ou origine du père si mentionné",
  "father_is_deceased": true | false,
  "father_death_date_raw": "date de décès du père si précisée (ex: décédé le 3 mai 1740)",
  "father_death_place": "lieu de décès du père si précisé",

  "mother_given_names": "prénom de la mère",
  "mother_surname": "nom de jeune fille de la mère",
  "mother_occupation": "métier de la mère",
  "mother_age": "âge de la mère si mentionné (ex: 28 ans)",
  "mother_birth_date_raw": "date ou année de naissance calculée de la mère (ex: vers 1856 si l'acte est de 1884 et mère 28 ans)",
  "mother_birth_place": "lieu de naissance ou origine de la mère si mentionné",
  "mother_is_deceased": true | false,
  "mother_death_date_raw": "date de décès de la mère si précisée",
  "mother_death_place": "lieu de décès de la mère si précisé",

  "spouse_given_names": "prénom du conjoint (ou épouse si mariage)",
  "spouse_surname": "nom du conjoint (ou épouse si mariage)",
  "spouse_occupation": "métier du conjoint",
  "spouse_age": "âge du conjoint",
  "spouse_residence": "résidence du conjoint",
  "spouse_birth_date_raw": "date ou année de naissance calculée du conjoint",
  "spouse_birth_place": "lieu d'origine du conjoint",
  "marriage_date_raw": "date du mariage",
  "marriage_place": "lieu du mariage",

  "spouse_father_given_names": "prénom du père de l'épouse",
  "spouse_father_surname": "nom du père de l'épouse",
  "spouse_father_occupation": "métier du père de l'épouse",
  "spouse_father_is_deceased": true | false,
  "spouse_father_death_date_raw": "date de décès du père de l'épouse",
  "spouse_father_death_place": "lieu de décès du père de l'épouse",

  "spouse_mother_given_names": "prénom de la mère de l'épouse",
  "spouse_mother_surname": "nom de jeune fille de la mère de l'épouse",
  "spouse_mother_occupation": "métier de la mère de l'épouse",
  "spouse_mother_is_deceased": true | false,
  "spouse_mother_death_date_raw": "date de décès de la mère de l'épouse",
  "spouse_mother_death_place": "lieu de décès de la mère de l'épouse",

  "marginal_marriage_date": "date de mariage inscrite en marge",
  "marginal_marriage_place": "lieu de mariage en marge",
  "marginal_marriage_spouse": "conjoint en marge",
  "marginal_death_date": "date de décès inscrite en marge",
  "marginal_death_place": "lieu de décès en marge",

  "sources": {
    "date": { "text": "phrase complète contenant la date avec son contexte" },
    "place": { "text": "phrase complète mentionnant le lieu ou la paroisse" },
    "name": { "text": "phrase entière nommant le sujet de l'acte" },
    "father": { "text": "phrase entière citant le père, sa profession et son statut" },
    "mother": { "text": "phrase entière citant la mère, sa profession et son statut" },
    "spouse": { "text": "phrase entière citant le conjoint" },
    "spouse_father": { "text": "phrase entière citant le père du conjoint" },
    "spouse_mother": { "text": "phrase entière citant la mère du conjoint" }
  }
}
\`\`\``;

/** Prompt paléographique spécialisé selon la nature attendue de l'acte (naissance, mariage, décès). */
export function buildPaleographyPrompt(actKind?: ActKind): string {
  const kindGuidance = kindGuidanceOf(actKind);
  return `Tu es un paléographe et généalogiste expert des archives françaises (XVIe au XXe siècle).
Transcris fidèlement et exhaustivement le texte manuscrit de cet acte en français.
Conserve les formulations de l'époque et développe les abréviations évidentes entre crochets (ex: baptiz[atus] fuit, par[rain], etc.).
${kindGuidance}

Réponds rigoureusement selon la structure suivante :

### Transcription intégrale
[Le texte complet transcrit avec précision, respectant la ponctuation et le découpage ligne par ligne]

### Analyse généalogique
- **Type d'acte** : [Naissance / Baptême, Mariage, Décès / Sépulture, etc.]
- **Date de l'acte** : [Jour, mois, année de l'acte]
- **Lieu / Paroisse** : [Commune, paroisse où l'acte est dressé]
- **Individu(s) principal(aux)** : [Noms, prénoms, âge, date et lieu de naissance le cas échéant, profession]
- **Père** : [Noms, prénoms, profession, statut vivant ou décédé/feu, date de décès si précisée (ex: décédé le 12 mai 1740), lieu de décès si précisé]
- **Mère** : [Nom de jeune fille, prénoms, profession, statut vivante ou décédée/feue, date/lieu de décès si précisés]
- **Conjoint / Mariage** : [Noms, prénoms du conjoint, date et lieu de mariage si indiqués]
- **Mentions marginales** : [Mariage ou décès ultérieurs inscrits en marge avec date et lieu, le cas échéant]

${RULES}

${SOURCES_RULE}

${JSON_BLOCK}`;
}

/**
 * Remplissage à partir de notes : l'utilisateur a lu l'acte et noté ce qu'il y voit, souvent
 * en style télégraphique (« bapt. 12/03/1742, Jean f. de Pierre MARTIN laboureur et Marie LE GALL »).
 * L'IA ne lit pas l'image : elle range ces notes dans les champs, sans rien inventer.
 */
export function buildNotesPrompt(notes: string, actKind?: ActKind): string {
  const kindGuidance = kindGuidanceOf(actKind);
  return `Tu es un généalogiste expert des archives françaises (XVIe au XXe siècle).
Un utilisateur a lu lui-même un acte d'état civil ou un registre paroissial et a pris les notes ci-dessous.
Elles peuvent être abrégées, télégraphiques, dans le désordre, avec des abréviations de généalogiste
(b./bapt. = baptême, n. = naissance, ° = né, x = mariage, + ou † = décès, s. = sépulture, f. = fils, fille de,
p. = père ou parrain selon le contexte, m. = mère ou marraine, ca/v. = vers, dt = demeurant, lab. = laboureur…).
Ta tâche : en déduire les informations généalogiques et remplir les champs ci-dessous.
${kindGuidance}

RÈGLES SUR LES NOTES :
- N'invente RIEN : un champ absent des notes reste vide ("") ou false. Ne déduis que ce qui découle directement des notes (par exemple une année de naissance « vers » à partir d'un âge).
- Les parrain et marraine, témoins et officiers ne sont ni le père, ni la mère, ni le conjoint.
- Si une date est écrite en chiffres (12/03/1742), réécris-la en toutes lettres (12 mars 1742).
- Si un mot reste incertain dans les notes (point d'interrogation, « illisible »), garde-le tel quel avec le « ? ».
- Les notes peuvent contenir des informations venues d'autres actes ou de recherches (ex. « père † 12/05/1790 à Dinan », « mère décédée en 1801 »). Reporte-les AUSSI, même si elles sont postérieures à l'acte :
  décès du père → "father_death_date_raw" / "father_death_place" et "father_is_deceased": true ;
  décès de la mère → "mother_death_date_raw" / "mother_death_place" et "mother_is_deceased": true ;
  décès des parents du conjoint (ou de l'épouse) → "spouse_father_death_date_raw" / "spouse_father_death_place", "spouse_mother_death_date_raw" / "spouse_mother_death_place", avec le "…_is_deceased": true correspondant.
  Une date de naissance ou de décès notée pour une personne va dans SES champs, jamais dans ceux du sujet.

${RULES}
RÈGLE SUR LES CITATIONS SOURCES :
Dans le bloc JSON "sources", pour chaque champ rempli, place dans "text" le passage EXACT des notes d'où vient l'information (copié tel quel, sans le reformuler), pour que l'utilisateur retrouve sa note.

Réponds rigoureusement selon la structure suivante :

### Analyse généalogique
- **Type d'acte** : […]
- **Date de l'acte** : […]
- **Lieu / Paroisse** : […]
- **Individu(s) principal(aux)** : […]
- **Père** : […]
- **Mère** : […]
- **Conjoint / Mariage** : […]
- **Mentions marginales** : […]
(N'écris que les lignes pour lesquelles les notes donnent quelque chose.)

${JSON_BLOCK}

Notes de l'utilisateur :
"""
${notes}
"""`;
}
