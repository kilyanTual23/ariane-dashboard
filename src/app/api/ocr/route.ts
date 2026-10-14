import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { GoogleGenAI } from "@google/genai";
import { getActStorageDir } from "@/lib/act-downloader";
import { parseTranscription, cleanTranscriptionText } from "@/lib/transcription-parser";

/**
 * Construit un prompt paléographique spécialisé selon la nature attendue de l'acte (naissance, mariage, décès).
 */
function buildPaleographyPrompt(actKind?: "birth" | "death" | "marriage"): string {
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

RÈGLE ABSOLUE SUR LES NOMS : En généalogie française, les NOMS DE FAMILLE sont TOUJOURS écrits INTÉGRALEMENT EN MAJUSCULES (ex: DUPONT, MARTIN, LE GALL, DE LA HAYE, etc.) tant dans l'analyse que dans tous les champs du bloc JSON.

RÈGLE OBLIGATOIRE SUR LES SOURCES ET COORDONNÉES DANS L'IMAGE :
Dans le bloc JSON "sources", pour chaque champ extrait (date, place, name, occupation, father, mother, spouse, spouse_father, spouse_mother), fournis systématiquement :
1. "text" : la citation textuelle exacte de quelques mots telle qu'elle est écrite dans l'acte original (ex: "le quatorze février mil sept cent", "fils de deffunt pierre dupont").
2. "box_2d" : les coordonnées de la ligne ou des mots dans l'image sous la forme [ymin, xmin, ymax, xmax] normalisées entre 0 et 1000 (ex: [210, 80, 245, 590]).

### Données extraites
\`\`\`json
{
  "act_type": "birth | death | marriage | other",
  "event_date": "date principale de l'événement (ex: 14 février 1742)",
  "event_place": "lieu ou paroisse principal (ex: Saint-Malo)",
  
  "given_names": "prénom(s) du sujet (ou époux si mariage)",
  "surname": "nom de famille du sujet (ou époux si mariage)",
  "occupation": "métier",
  "age": "âge si mentionné",
  "residence": "paroisse ou lieu de résidence",
  "birth_date_raw": "date de naissance si mentionnée ou calculée (ex: vers 1715)",
  "birth_place": "lieu de naissance si mentionné",
  "death_date_raw": "date de décès si mentionnée",
  "death_place": "lieu de décès si mentionné",

  "father_given_names": "prénom du père",
  "father_surname": "nom du père",
  "father_occupation": "métier du père",
  "father_is_deceased": true | false,
  "father_death_date_raw": "date de décès du père si précisée (ex: décédé le 3 mai 1740)",
  "father_death_place": "lieu de décès du père si précisé",

  "mother_given_names": "prénom de la mère",
  "mother_surname": "nom de jeune fille de la mère",
  "mother_occupation": "métier de la mère",
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
    "date": { "text": "citation exacte de la date", "box_2d": [120, 60, 150, 750] },
    "place": { "text": "citation exacte du lieu", "box_2d": [155, 120, 185, 480] },
    "name": { "text": "nom et prénom du sujet dans l'acte", "box_2d": [210, 80, 240, 520] },
    "father": { "text": "mention exacte du père", "box_2d": [280, 70, 310, 620] },
    "mother": { "text": "mention exacte de la mère", "box_2d": [320, 70, 350, 620] },
    "spouse": { "text": "mention exacte du conjoint", "box_2d": [380, 80, 410, 590] },
    "spouse_father": { "text": "mention du père du conjoint", "box_2d": [440, 70, 470, 620] },
    "spouse_mother": { "text": "mention de la mère du conjoint", "box_2d": [480, 70, 510, 620] }
  }
}
\`\`\``;
}

// Liste des modèles Gemini recommandés dans l'ordre de priorité
const PREFERRED_PRIORITY = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview",
];

// Modèles dépréciés par Google à exclure formellement pour éviter les erreurs 404
const DEPRECATED_MODELS = new Set([
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.0-pro",
  "gemini-pro",
]);

function isDeprecatedModel(modelName: string): boolean {
  if (DEPRECATED_MODELS.has(modelName)) return true;
  if (
    modelName.includes("1.5") ||
    modelName.includes("2.5") ||
    modelName.includes("2.0") ||
    modelName.includes("-exp")
  ) {
    return true;
  }
  return false;
}

// Modèle ayant fonctionné récemment pour cibler directement le bon au premier essai
let lastSuccessfulGeminiModel = "gemini-3.8-flash";
let cachedModelNames: string[] | null = null;
let lastModelCheck = 0;

async function getAvailableModelList(ai: GoogleGenAI): Promise<string[]> {
  const now = Date.now();
  if (cachedModelNames && cachedModelNames.length > 0 && now - lastModelCheck < 1800000) {
    return cachedModelNames;
  }

  try {
    const list: string[] = [];
    const modelPager = await ai.models.list();
    for await (const m of modelPager) {
      if (m.name) {
        const clean = m.name.replace(/^models\//, "");
        if ((clean.includes("gemini") || clean.includes("flash")) && !isDeprecatedModel(clean)) {
          list.push(clean);
        }
      }
    }
    if (list.length > 0) {
      cachedModelNames = list;
      lastModelCheck = now;
      console.log("[Gemini] Modèles actifs et non-dépréciés disponibles :", list);
      return list;
    }
  } catch (e) {
    console.warn("[Gemini] Impossible de lister les modèles :", e);
  }

  return [...PREFERRED_PRIORITY];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageUrl,
      crop,
      engine = "tesseract",
      apiKey: rawApiKey,
      language = "fra",
      actKind,
    } = body as {
      imageUrl?: string;
      crop?: { x: number; y: number; width: number; height: number };
      engine?: "tesseract" | "ai" | "gemini";
      apiKey?: string;
      language?: string;
      actKind?: "birth" | "death" | "marriage";
    };

    if (!imageUrl) {
      return NextResponse.json({ error: "URL de l'image requise" }, { status: 400 });
    }

    const paleographyPrompt = buildPaleographyPrompt(actKind);

    // 1. Récupération du Buffer de l'image source
    let imageBuffer: Buffer;

    if (imageUrl.startsWith("/api/actes/")) {
      const filename = imageUrl.replace("/api/actes/", "").split("?")[0];
      const filePath = path.join(getActStorageDir(), filename);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { error: "Fichier d'acte introuvable sur le serveur" },
          { status: 404 },
        );
      }
      imageBuffer = fs.readFileSync(filePath);
    } else if (imageUrl.startsWith("data:image/")) {
      const base64Data = imageUrl.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
    } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Impossible de charger l'image (${res.status})` },
          { status: 400 },
        );
      }
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      return NextResponse.json({ error: "Format d'image non supporté" }, { status: 400 });
    }

    // 2. Découpe éventuelle de la zone sélectionnée (Crop)
    let processedBuffer = imageBuffer;
    if (crop && crop.width > 15 && crop.height > 15) {
      const meta = await sharp(imageBuffer).metadata();
      const imgW = meta.width || 0;
      const imgH = meta.height || 0;

      const left = Math.max(0, Math.min(imgW - 10, Math.round(crop.x)));
      const top = Math.max(0, Math.min(imgH - 10, Math.round(crop.y)));
      const width = Math.min(imgW - left, Math.round(crop.width));
      const height = Math.min(imgH - top, Math.round(crop.height));

      if (width > 15 && height > 15) {
        processedBuffer = await sharp(imageBuffer)
          .extract({ left, top, width, height })
          .toBuffer();
      }
    }

    // 3. Moteur IA Paléographe (Gemini Vision / OpenAI / Groq)
    const apiKey = (rawApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "").trim();

    if (engine === "gemini" || engine === "ai") {
      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              "Clé API manquante. Veuillez saisir une clé Google AI Studio (ou OpenAI) dans le panneau.",
          },
          { status: 400 },
        );
      }

      // Optimisation de l'image pour la vision par IA (1800px / q80 pour une transmission instantanée et netteté maximale)
      const aiBuffer = await sharp(processedBuffer)
        .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const base64Image = aiBuffer.toString("base64");

      // A) Clé OpenAI (commence par "sk-")
      if (apiKey.startsWith("sk-")) {
        try {
          const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: paleographyPrompt },
                    {
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${base64Image}` },
                    },
                  ],
                },
              ],
            }),
          });

          if (!oaiRes.ok) {
            const err = await oaiRes.text();
            return NextResponse.json(
              { error: `Erreur OpenAI (${oaiRes.status}) : ${err}` },
              { status: 502 },
            );
          }

          const oaiData = await oaiRes.json();
          const text = oaiData?.choices?.[0]?.message?.content || "";
          const extractedData = parseTranscription(text);
          const cleanText = cleanTranscriptionText(text);
          return NextResponse.json({ ok: true, engine: "openai", text: cleanText, extractedData });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return NextResponse.json({ error: `Échec OpenAI : ${msg}` }, { status: 502 });
        }
      }

      // B) Clé Groq (commence par "gsk_")
      if (apiKey.startsWith("gsk_")) {
        try {
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.2-11b-vision-preview",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: paleographyPrompt },
                    {
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${base64Image}` },
                    },
                  ],
                },
              ],
            }),
          });

          if (!groqRes.ok) {
            const err = await groqRes.text();
            return NextResponse.json(
              { error: `Erreur Groq (${groqRes.status}) : ${err}` },
              { status: 502 },
            );
          }

          const groqData = await groqRes.json();
          const text = groqData?.choices?.[0]?.message?.content || "";
          const extractedData = parseTranscription(text);
          const cleanText = cleanTranscriptionText(text);
          return NextResponse.json({ ok: true, engine: "groq", text: cleanText, extractedData });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return NextResponse.json({ error: `Échec Groq : ${msg}` }, { status: 502 });
        }
      }

      // C) Google Gemini via le SDK officiel @google/genai
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { timeout: 35000 },
        });

        const available = await getAvailableModelList(ai);

        // Construction de la liste ordonnée des modèles à essayer
        const candidateModels: string[] = [];

        // 1. D'abord le modèle qui a réussi récemment (s'il n'est pas déprécié)
        if (lastSuccessfulGeminiModel && !isDeprecatedModel(lastSuccessfulGeminiModel)) {
          candidateModels.push(lastSuccessfulGeminiModel);
        }

        // 2. Ensuite les modèles prioritaires recommandés par Google
        for (const pref of PREFERRED_PRIORITY) {
          if (!candidateModels.includes(pref) && !isDeprecatedModel(pref)) {
            candidateModels.push(pref);
          }
        }

        // 3. Enfin les autres modèles renvoyés par l'API s'ils ne sont pas dépréciés
        for (const m of available) {
          if (!candidateModels.includes(m) && !isDeprecatedModel(m)) {
            candidateModels.push(m);
          }
        }

        let textResult = "";
        let targetModel = candidateModels[0] || "gemini-3.1-pro-preview";
        let lastErrorMsg = "";

        // Essayer jusqu'à 5 modèles candidats
        const MAX_ATTEMPTS = Math.min(candidateModels.length, 5);
        for (let i = 0; i < candidateModels.length && i < MAX_ATTEMPTS; i++) {
          const currentModel = candidateModels[i];
          try {
            console.log(`[Gemini] Tentative transcription avec : ${currentModel}`);
            const response = await ai.models.generateContent({
              model: currentModel,
              contents: [
                paleographyPrompt,
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image,
                  },
                },
              ],
            });

            let extracted = response.text?.trim() || "";
            if (!extracted && response.candidates?.[0]?.content?.parts) {
              extracted = response.candidates[0].content.parts
                .map((p) => p.text)
                .filter(Boolean)
                .join("\n")
                .trim();
            }

            if (extracted) {
              textResult = extracted;
              targetModel = currentModel;
              lastSuccessfulGeminiModel = currentModel;
              console.log(`[Gemini] Transcription réussie avec : ${currentModel}`);
              break;
            }

            throw new Error(`Modèle ${currentModel} a retourné une réponse vide.`);
          } catch (modelErr: unknown) {
            const errStr = modelErr instanceof Error ? modelErr.message : String(modelErr);
            lastErrorMsg = errStr;
            console.warn(`[Gemini] Essai sur ${currentModel} échoué :`, errStr);

            // Arrêt immédiat si la clé API est explicitement rejetée
            if (errStr.includes("API_KEY_INVALID") || errStr.includes("API key not valid")) {
              return NextResponse.json(
                { error: "Clé API Gemini invalide. Veuillez vérifier votre clé sur Google AI Studio." },
                { status: 401 },
              );
            }

            // Si Google suggère expressément un modèle de remplacement dans l'erreur
            const suggestion = errStr.match(/use models\/([a-zA-Z0-9._-]+)/i);
            if (suggestion && suggestion[1]) {
              const suggested = suggestion[1];
              console.log(`[Gemini] Google recommande expressément le modèle : ${suggested}`);
              lastSuccessfulGeminiModel = suggested;
              if (!candidateModels.slice(i + 1).includes(suggested)) {
                candidateModels.splice(i + 1, 0, suggested);
              }
            }

            // Si 503 (haute demande temporaire), ré-essayer le même modèle après 1.5s
            if (
              errStr.includes("503") ||
              errStr.includes("UNAVAILABLE") ||
              errStr.includes("high demand") ||
              errStr.includes("spikes in demand")
            ) {
              console.warn(`[Gemini] Pic de charge temporaire (503) sur ${currentModel}. Pause de 1.5s et nouvelle tentative sur ce même modèle...`);
              await new Promise((r) => setTimeout(r, 1500));
              try {
                const retry503 = await ai.models.generateContent({
                  model: currentModel,
                  contents: [
                    paleographyPrompt,
                    { inlineData: { mimeType: "image/jpeg", data: base64Image } },
                  ],
                });
                let extracted503 = retry503.text?.trim() || "";
                if (!extracted503 && retry503.candidates?.[0]?.content?.parts) {
                  extracted503 = retry503.candidates[0].content.parts
                    .map((p) => p.text)
                    .filter(Boolean)
                    .join("\n")
                    .trim();
                }
                if (extracted503) {
                  textResult = extracted503;
                  targetModel = currentModel;
                  lastSuccessfulGeminiModel = currentModel;
                  console.log(`[Gemini] Seconde tentative réussie sur : ${currentModel}`);
                  break;
                }
              } catch {
                console.warn(`[Gemini] Seconde tentative 503 échouée sur ${currentModel}, passage au modèle suivant.`);
              }
            }
          }
        }

        if (textResult) {
          const extractedData = parseTranscription(textResult);
          const cleanText = cleanTranscriptionText(textResult);
          return NextResponse.json({
            ok: true,
            engine: `gemini (${targetModel})`,
            text: cleanText,
            extractedData,
          });
        }

        throw new Error(lastErrorMsg || "Aucun texte retourné par Gemini.");
      } catch (geminiErr: unknown) {
        const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        console.error("[Gemini API Error]:", msg);
        return NextResponse.json(
          {
            error: `Erreur API Gemini : ${msg}. Si votre compte Google a des restrictions régionales ou de quota, vous pouvez également utiliser une clé gratuite Groq (gsk_...) ou OpenAI (sk-...).`,
          },
          { status: 502 },
        );
      }
    }

    // 4. Moteur Tesseract.js (Local et hors-ligne)
    const enhancedBuffer = await sharp(processedBuffer)
      .grayscale()
      .normalise()
      .sharpen()
      .jpeg({ quality: 90 })
      .toBuffer();

    const result = await Tesseract.recognize(enhancedBuffer, language || "fra");
    const tesseractText = result.data.text.trim();

    return NextResponse.json({
      ok: true,
      engine: "tesseract",
      text: tesseractText,
      extractedData: parseTranscription(tesseractText),
      confidence: Math.round(result.data.confidence),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[OCR API] Erreur:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
