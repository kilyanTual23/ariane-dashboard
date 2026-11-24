import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { GoogleGenAI } from "@google/genai";
import { CLAUDE_OCR_MODEL, transcribeWithClaude } from "@/lib/ocr-claude";
import { getActStorageDir } from "@/lib/act-downloader";
import { canReadActFile } from "@/lib/access";
import { parseTranscription, cleanTranscriptionText } from "@/lib/transcription-parser";
import { buildPaleographyPrompt } from "@/lib/act-prompts";
import { PREFERRED_PRIORITY, getAvailableModelList, isDeprecatedModel } from "@/lib/gemini-models";

// Modèle ayant fonctionné récemment pour cibler directement le bon au premier essai
let lastSuccessfulGeminiModel = "gemini-3.8-flash";

type Crop = { x: number; y: number; width: number; height: number };

/** Zone découpée dans les limites de l'image, ou null si elle est trop petite. */
function clampCrop(crop: Crop, imgW: number, imgH: number) {
  const left = Math.max(0, Math.min(imgW - 10, Math.round(crop.x)));
  const top = Math.max(0, Math.min(imgH - 10, Math.round(crop.y)));
  const width = Math.min(imgW - left, Math.round(crop.width));
  const height = Math.min(imgH - top, Math.round(crop.height));
  return width > 15 && height > 15 ? { left, top, width, height } : null;
}

/**
 * Plusieurs zones d'un même acte (fin de la page de gauche, suite sur celle de droite) :
 * on les assemble en une seule image, dans l'ordre de lecture. Des bandes larges et basses
 * sont empilées l'une sous l'autre ; des colonnes hautes et étroites, mises côte à côte.
 */
async function stitchZones(parts: Buffer[]): Promise<Buffer> {
  const metas = await Promise.all(parts.map((b) => sharp(b).metadata()));
  const sizes = metas.map((m) => ({ w: m.width || 1, h: m.height || 1 }));
  const gap = 24;
  const tall = sizes.reduce((n, z) => n + z.h, 0) > sizes.reduce((n, z) => n + z.w, 0);
  let x = 0;
  let y = 0;
  const composite = parts.map((input, i) => {
    const pos = { input, left: x, top: y };
    if (tall) x += sizes[i].w + gap;
    else y += sizes[i].h + gap;
    return pos;
  });
  const width = tall ? x - gap : Math.max(...sizes.map((z) => z.w));
  const height = tall ? Math.max(...sizes.map((z) => z.h)) : y - gap;
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite(composite)
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageUrl,
      crop,
      crops,
      engine = "tesseract",
      apiKey: rawApiKey,
      language = "fra",
      actKind,
    } = body as {
      imageUrl?: string;
      crop?: Crop;
      /** Zones dans l'ordre de lecture (un acte à cheval sur deux pages). Remplace `crop`. */
      crops?: Crop[];
      engine?: "tesseract" | "ai" | "gemini";
      apiKey?: string;
      language?: string;
      actKind?: "birth" | "death" | "marriage";
    };

    if (!imageUrl) {
      return NextResponse.json({ error: "URL de l'image requise" }, { status: 400 });
    }

    const zones = (Array.isArray(crops) && crops.length ? crops : crop ? [crop] : [])
      .filter((c) => c && c.width > 15 && c.height > 15)
      .slice(0, 4);
    const paleographyPrompt =
      buildPaleographyPrompt(actKind) +
      (zones.length > 1
        ? `\n\nATTENTION : l'image assemble ${zones.length} morceaux d'un MÊME acte, séparés par une bande blanche (par exemple la fin de la page de gauche puis le début de la page de droite). Lis-les dans l'ordre (de haut en bas, ou de gauche à droite) et transcris-les comme un seul texte continu, sans signaler la coupure.`
        : "");

    // 1. Récupération du Buffer de l'image source
    let imageBuffer: Buffer;

    if (imageUrl.startsWith("/api/actes/")) {
      const filename = imageUrl.replace("/api/actes/", "").split("?")[0];
      if (!/^[a-zA-Z0-9_\-]+\.jpg$/.test(filename) || !(await canReadActFile(filename))) {
        return NextResponse.json({ error: "Fichier d'acte introuvable sur le serveur" }, { status: 404 });
      }
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
    if (zones.length) {
      const meta = await sharp(imageBuffer).metadata();
      const imgW = meta.width || 0;
      const imgH = meta.height || 0;
      const rects = zones.map((z) => clampCrop(z, imgW, imgH)).filter((r): r is NonNullable<typeof r> => !!r);
      const parts = await Promise.all(rects.map((r) => sharp(imageBuffer).extract(r).toBuffer()));
      if (parts.length === 1) processedBuffer = parts[0];
      else if (parts.length > 1) processedBuffer = await stitchZones(parts);
    }

    // 3. Moteur IA Paléographe (Gemini Vision / OpenAI / Groq)
    const apiKey = (
      rawApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      ""
    ).trim();

    if (engine === "gemini" || engine === "ai") {
      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              "Clé API manquante. Veuillez saisir une clé Google AI Studio, Claude ou OpenAI dans le panneau.",
          },
          { status: 400 },
        );
      }

      // Optimisation de l'image pour la vision par IA (1800px / q80 pour une transmission instantanée et netteté maximale)
      const aiBuffer = await sharp(processedBuffer)
        // Zones assemblées : image plus longue, on garde un peu plus de pixels pour que chaque morceau reste lisible.
        .resize(zones.length > 1 ? 2400 : 1800, zones.length > 1 ? 2400 : 1800, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const base64Image = aiBuffer.toString("base64");

      // A) Clé Claude (commence par "sk-ant-") : à tester avant OpenAI, dont les clés commencent aussi par "sk-".
      if (apiKey.startsWith("sk-ant-")) {
        try {
          const text = await transcribeWithClaude(apiKey, paleographyPrompt, base64Image);
          const extractedData = parseTranscription(text);
          const cleanText = cleanTranscriptionText(text);
          return NextResponse.json({ ok: true, engine: `claude (${CLAUDE_OCR_MODEL})`, text: cleanText, extractedData });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return NextResponse.json({ error: `Échec Claude : ${msg}` }, { status: 502 });
        }
      }

      // B) Clé OpenAI (commence par "sk-")
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

      // C) Clé Groq (commence par "gsk_")
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

      // D) Google Gemini via le SDK officiel @google/genai
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
            error: `Erreur API Gemini : ${msg}. Si votre compte Google a des restrictions régionales ou de quota, vous pouvez également utiliser une clé Claude (sk-ant-...), OpenAI (sk-...) ou Groq (gsk_...).`,
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
