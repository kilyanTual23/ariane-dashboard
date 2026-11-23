import Anthropic from "@anthropic-ai/sdk";

/**
 * Transcription paléographique avec une clé Claude (« sk-ant-… »).
 * Même consigne et même image que pour les autres moteurs ; seul l'appel change.
 */

/**
 * Modèle utilisé : Haiku 5.5, le moins cher (environ 0,3 centime par acte).
 * Plus fiable sur les écritures difficiles, mais plus cher : "claude-sonnet-5-5" ou "claude-opus-5-5".
 */
export const CLAUDE_OCR_MODEL: string = "claude-haiku-5-5";

/** Modèles qui acceptent la relance automatique sur un autre modèle en cas de refus (pas Haiku). */
const SUPPORTS_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2"]);

export async function transcribeWithClaude(apiKey: string, prompt: string, jpegBase64: string): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  try {
    const response = await client.beta.messages.create({
      model: CLAUDE_OCR_MODEL,
      max_tokens: 16000,
      // Lire une écriture ancienne demande de la réflexion : effort élevé (le défaut est « medium »).
      output_config: { effort: "high" },
      // Si le modèle refuse une demande par excès de prudence, l'API la relance sur un autre modèle adapté.
      ...(SUPPORTS_FALLBACK.has(CLAUDE_OCR_MODEL)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude a refusé de transcrire cette image.");
    }
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
    if (!text) throw new Error("Claude n’a renvoyé aucun texte.");
    return text;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("Clé Claude invalide : vérifiez-la sur console.anthropic.com.");
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new Error("Cette clé Claude n’a pas accès au modèle utilisé.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("Limite d’utilisation Claude atteinte : réessayez dans un moment.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      // Solde insuffisant, image refusée…
      throw new Error(`Requête refusée par Claude : ${error.message}`);
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Erreur de l’API Claude (${error.status ?? "réseau"}) : ${error.message}`);
    }
    throw error;
  }
}
