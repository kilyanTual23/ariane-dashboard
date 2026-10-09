import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { GoogleGenAI } from "@google/genai";
import { getActStorageDir } from "@/lib/act-downloader";
import { parseTranscription, cleanTranscriptionText } from "@/lib/transcription-parser";

const PALEOGRAPHY_PROMPT = `Tu es un paléographe et généalogiste expert des archives françaises (XVIe au XXe siècle).
Transcris fidèlement et exhaustivement le texte manuscrit de cet acte en français.
Conserve les formulations de l'époque et développe les abréviations évidentes entre crochets (ex: baptiz[atus] fuit, par[rain], etc.).

Réponds rigoureusement selon la structure suivante :

### Transcription intégrale
[Le texte complet transcrit avec précision, respectant la ponctuation et le découpage ligne par ligne]

### Analyse généalogique
- **Type d'acte** : [Naissance / Baptême, Mariage, Décès / Sépulture, etc.]
- **Date de l'acte** : [Jour, mois, année de l'acte]
- **Lieu / Paroisse** : [Commune, paroisse où l'acte est dressé]
- **Individu(s) principal(aux)** : [Noms, prénoms, âge, date et lieu de naissance le cas échéant, profession]
- **Père** : [Noms, prénoms, profession, statut vivant ou décédé/feu, date de décès si précisée (ex: décédé le 12 mai 1740), lieu de décès si précisé (ex: à Saint-Malo), date/lieu de naissance ou âge le cas échéant]
- **Mère** : [Nom de jeune fille, prénoms, profession, statut vivante ou décédée/feue, date de décès si précisée, lieu de décès si précisé, date/lieu de naissance ou âge le cas échéant]
- **Conjoint / Mariage** : [Noms, prénoms du conjoint, date et lieu de mariage si indiqués]
- **Mentions marginales** : [Mariage ou décès ultérieurs inscrits en marge avec date et lieu, le cas échéant]

RÈGLE ABSOLUE SUR LES NOMS : En généalogie française, les NOMS DE FAMILLE sont TOUJOURS écrits INTÉGRALEMENT EN MAJUSCULES (ex: DUPONT, MARTIN, LE GALL, DE LA HAYE, etc.) tant dans l'analyse que dans tous les champs du bloc JSON (surname, father_surname, mother_surname, spouse_surname).

TRÈS IMPORTANT POUR LES PARENTS : Détecte systématiquement si les parents sont indiqués comme défunts ('feu', 'feue', 'défunt', 'décédé'). Repère avec précision toute date ou tout lieu de décès des parents (très fréquent dans les actes de mariage : 'fils de feu X décédé à Y le Z'), ainsi que leur âge ou date/lieu d'origine. Remplis rigoureusement les champs du bloc JSON ci-dessous :

### Données extraites
\`\`\`json
{
  "act_type": "birth | death | marriage | other",
  "event_date": "date principale de l'événement (ex: 14 février 1742)",
  "event_place": "lieu ou paroisse principal (ex: Saint-Malo)",
  "given_names": "prénom(s) du sujet",
  "surname": "nom de famille du sujet",
  "occupation": "métier du sujet",
  "age": "âge du sujet si mentionné",
  "birth_date_raw": "date de naissance si mentionnée ou calculée",
  "birth_place": "lieu de naissance si mentionné",
  "death_date_raw": "date de décès si mentionnée",
  "death_place": "lieu de décès si mentionné",
  "father_given_names": "prénom du père",
  "father_surname": "nom du père",
  "father_occupation": "métier du père",
  "father_is_deceased": true | false,
  "father_death_date_raw": "date de décès du père si précisée (ex: décédé le 3 mai 1770)",
  "father_death_place": "lieu de décès du père si précisé",
  "father_birth_date_raw": "date ou année de naissance du père si mentionnée ou déduite de son âge",
  "father_birth_place": "lieu de naissance du père si précisé",
  "mother_given_names": "prénom de la mère",
  "mother_surname": "nom de jeune fille de la mère",
  "mother_occupation": "métier de la mère",
  "mother_is_deceased": true | false,
  "mother_death_date_raw": "date de décès de la mère si précisée",
  "mother_death_place": "lieu de décès de la mère si précisé",
  "mother_birth_date_raw": "date ou année de naissance de la mère si mentionnée ou déduite de son âge",
  "mother_birth_place": "lieu de naissance de la mère si précisé",
  "spouse_given_names": "prénom du conjoint",
  "spouse_surname": "nom du conjoint",
  "spouse_occupation": "métier du conjoint",
  "marriage_date_raw": "date du mariage si acte de mariage ou mention marginale",
  "marriage_place": "lieu du mariage",
  "marginal_marriage_date": "date de mariage inscrite en mention marginale",
  "marginal_marriage_place": "lieu de mariage en marge",
  "marginal_marriage_spouse": "conjoint en marge",
  "marginal_death_date": "date de décès inscrite en mention marginale",
  "marginal_death_place": "lieu de décès en marge"
}
\`\`\``;

// Liste des modèles Gemini recommandés dans l'ordre de priorité
// gemini-3.8-flash est le modèle moderne le plus rapide et le plus stable.
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
    } = body as {
      imageUrl?: string;
      crop?: { x: number; y: number; width: number; height: number };
      engine?: "tesseract" | "ai" | "gemini";
      apiKey?: string;
      language?: string;
    };

    if (!imageUrl) {
      return NextResponse.json({ error: "URL de l'image requise" }, { status: 400 });
    }

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
                    { type: "text", text: PALEOGRAPHY_PROMPT },
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
                    { type: "text", text: PALEOGRAPHY_PROMPT },
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
                PALEOGRAPHY_PROMPT,
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

            // Si 503 (haute demande temporaire), ré-essayer le même modèle après 1.5s car les pics durent ~1 seconde
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
                    PALEOGRAPHY_PROMPT,
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
              } catch (retryErr) {
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
