import type { GoogleGenAI } from "@google/genai";

/** Choix des modèles Gemini : partagé par la transcription d’image et l’analyse des notes. */
// Liste des modèles Gemini recommandés dans l'ordre de priorité
export const PREFERRED_PRIORITY = [
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

export function isDeprecatedModel(modelName: string): boolean {
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

let cachedModelNames: string[] | null = null;
let lastModelCheck = 0;

export async function getAvailableModelList(ai: GoogleGenAI): Promise<string[]> {
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
