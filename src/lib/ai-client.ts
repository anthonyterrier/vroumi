import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { isAcceptedImageType, isPdf } from "@/lib/carte-grise-fields";

// --- Choix du fournisseur IA ------------------------------------------------
//
// Par défaut : Claude (Anthropic). Si LOCAL_AI_BASE_URL est renseigné dans le
// `.env`, les fonctions vision/texte appellent une IA locale compatible OpenAI
// (Ollama, LM Studio…) au lieu de Claude. Les fonctions de RECHERCHE WEB
// (base de connaissances, procédure de réinitialisation) restent sur Claude :
// aucune IA locale ne fournit l'outil de recherche web.
//
// Variables .env :
//   LOCAL_AI_BASE_URL   ex. http://192.168.1.50:11434/v1   (Ollama, avec /v1)
//   LOCAL_AI_MODEL      modèle VISION (scans photo)         ex. llama3.2-vision:11b
//   LOCAL_AI_TEXT_MODEL modèle TEXTE (optionnel, diag OBD)  ex. qwen2.5:14b
//   LOCAL_AI_API_KEY    optionnel (Ollama l'ignore)          défaut "ollama"

export const LOCAL_AI_BASE_URL = (process.env.LOCAL_AI_BASE_URL || "").replace(
  /\/+$/,
  ""
);
export const LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL || "";
const LOCAL_AI_TEXT_MODEL = process.env.LOCAL_AI_TEXT_MODEL || "";
const ANTHROPIC_ENABLED = !!process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-haiku-4-5";

/** IA locale utilisable (URL + modèle vision configurés). */
export const LOCAL_AI_ENABLED = !!LOCAL_AI_BASE_URL && !!LOCAL_AI_MODEL;

/** Fonctions vision/texte : dispo si IA locale OU clé Anthropic. */
export const AI_ENABLED = LOCAL_AI_ENABLED || ANTHROPIC_ENABLED;

/** Fonctions de recherche web : Claude uniquement. */
export const WEB_AI_ENABLED = ANTHROPIC_ENABLED;

export type AiFile = { buffer: Buffer; mimeType: string };
type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Complétion IA générique : un prompt + éventuellement des fichiers (images ou
 * PDF), renvoie le texte produit. Route vers l'IA locale si configurée, sinon
 * Claude.
 */
export async function aiComplete(opts: {
  prompt: string;
  files?: AiFile[];
  maxTokens?: number;
}): Promise<string> {
  const { prompt, files = [], maxTokens = 2048 } = opts;
  if (LOCAL_AI_ENABLED) return localComplete(prompt, files, maxTokens);
  if (ANTHROPIC_ENABLED) return anthropicComplete(prompt, files, maxTokens);
  throw new Error("Aucun fournisseur IA configuré (ni IA locale, ni clé Anthropic).");
}

async function anthropicComplete(
  prompt: string,
  files: AiFile[],
  maxTokens: number
): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = files.map((f) => {
    const data = f.buffer.toString("base64");
    return isPdf(f.mimeType)
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: isAcceptedImageType(f.mimeType)
              ? (f.mimeType as ImageMediaType)
              : "image/jpeg",
            data,
          },
        };
  });
  content.push({ type: "text", text: prompt });

  const client = new Anthropic();
  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// API compatible OpenAI (Ollama : POST {base}/chat/completions).
async function localComplete(
  prompt: string,
  files: AiFile[],
  maxTokens: number
): Promise<string> {
  if (files.some((f) => isPdf(f.mimeType))) {
    throw new Error(
      "Le modèle local ne lit pas les PDF : fournis une image (photo) ou repasse sur Claude."
    );
  }
  const hasImages = files.length > 0;
  // Modèle vision pour les images ; modèle texte dédié sinon (s'il existe).
  const model =
    hasImages || !LOCAL_AI_TEXT_MODEL ? LOCAL_AI_MODEL : LOCAL_AI_TEXT_MODEL;

  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const f of files) {
    const mt = isAcceptedImageType(f.mimeType) ? f.mimeType : "image/jpeg";
    content.push({
      type: "image_url",
      image_url: { url: `data:${mt};base64,${f.buffer.toString("base64")}` },
    });
  }

  const res = await fetch(`${LOCAL_AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LOCAL_AI_API_KEY || "ollama"}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
    // Un modèle local peut être lent (surtout en vision) : marge large.
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`IA locale (${res.status}) : ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}
