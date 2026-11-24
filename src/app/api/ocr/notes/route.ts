import { NextResponse, type NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

import { buildNotesPrompt } from "@/lib/act-prompts";
import { PREFERRED_PRIORITY, getAvailableModelList, isDeprecatedModel } from "@/lib/gemini-models";
import { CLAUDE_OCR_MODEL, transcribeWithClaude } from "@/lib/ocr-claude";
import { cleanTranscriptionText, parseTranscription } from "@/lib/transcription-parser";

/**
 * Remplissage intelligent sans transcription : l'utilisateur a lu l'acte et pris des notes,
 * l'IA les range dans les champs de la fiche. Pas d'image envoyée : seulement le texte des notes,
 * avec la même clé que la transcription (Claude, OpenAI, Groq ou Gemini).
 */
const MAX_NOTES = 8000;

async function openAiCompatible(url: string, model: string, apiKey: string, prompt: string, label: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Erreur ${label} (${res.status}) : ${await res.text()}`);
  const data = await res.json();
  return { text: String(data?.choices?.[0]?.message?.content ?? ""), engine: label.toLowerCase() };
}

async function withGemini(apiKey: string, prompt: string) {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000 } });
  const available = await getAvailableModelList(ai);
  const candidates = [...new Set([...PREFERRED_PRIORITY, ...available])].filter((m) => !isDeprecatedModel(m)).slice(0, 4);
  let lastError = "";
  for (const model of candidates) {
    try {
      const response = await ai.models.generateContent({ model, contents: [prompt] });
      const text = response.text?.trim();
      if (text) return { text, engine: `gemini (${model})` };
      lastError = `${model} a renvoyé une réponse vide`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (lastError.includes("API_KEY_INVALID") || lastError.includes("API key not valid")) {
        throw new Error("Clé API Gemini invalide. Vérifiez-la sur Google AI Studio.");
      }
    }
  }
  throw new Error(`Erreur API Gemini : ${lastError || "aucun modèle disponible"}`);
}

export async function POST(req: NextRequest) {
  try {
    const { notes, apiKey: rawApiKey, actKind } = (await req.json()) as {
      notes?: string;
      apiKey?: string;
      actKind?: "birth" | "death" | "marriage";
    };
    const text = (notes ?? "").trim();
    if (text.length < 5) {
      return NextResponse.json({ error: "Écrivez d’abord vos notes sur l’acte." }, { status: 400 });
    }
    if (text.length > MAX_NOTES) {
      return NextResponse.json(
        { error: `Notes trop longues (${text.length} caractères, ${MAX_NOTES} au plus) : gardez l’essentiel de l’acte.` },
        { status: 400 },
      );
    }

    const apiKey = (
      rawApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      ""
    ).trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Clé API manquante. Saisissez une clé Gemini, Claude, OpenAI ou Groq dans le panneau." },
        { status: 400 },
      );
    }

    const prompt = buildNotesPrompt(text, actKind);
    let result: { text: string; engine: string };
    if (apiKey.startsWith("sk-ant-")) {
      result = { text: await transcribeWithClaude(apiKey, prompt), engine: `claude (${CLAUDE_OCR_MODEL})` };
    } else if (apiKey.startsWith("sk-")) {
      result = await openAiCompatible("https://api.openai.com/v1/chat/completions", "gpt-4o-mini", apiKey, prompt, "OpenAI");
    } else if (apiKey.startsWith("gsk_")) {
      result = await openAiCompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        "llama-3.3-70b-versatile",
        apiKey,
        prompt,
        "Groq",
      );
    } else {
      result = await withGemini(apiKey, prompt);
    }

    if (!result.text.trim()) throw new Error("L’IA n’a renvoyé aucune réponse.");
    return NextResponse.json({
      ok: true,
      engine: result.engine,
      text: cleanTranscriptionText(result.text),
      extractedData: parseTranscription(result.text),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Notes API] Erreur:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
