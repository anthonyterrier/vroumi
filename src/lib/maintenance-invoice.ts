import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  InvoiceExtractionSchema,
  type InvoiceExtraction,
} from "@/lib/maintenance-invoice-fields";
import { MAINTENANCE_TYPE_LABELS } from "@/lib/labels";
import { isAcceptedImageType, isPdf } from "@/lib/carte-grise-fields";

/** L'analyse IA n'est disponible que si une clé API Anthropic est configurée. */
export const INVOICE_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

// Liste des types acceptés (clé = valeur d'enum, + libellé) pour guider l'IA.
const TYPE_LIST = Object.entries(MAINTENANCE_TYPE_LABELS)
  .map(([k, v]) => `- ${k} : ${v}`)
  .join("\n");

const PROMPT = `Tu analyses une FACTURE ou un DEVIS d'ENTRETIEN automobile (garage). Extrait les informations et réponds UNIQUEMENT avec un objet JSON (pas de texte, pas de markdown, pas de \`\`\`) :
{
  "date": "AAAA-MM-JJ" ou null,        // date de l'intervention / de la facture
  "mileage": entier ou null,            // kilométrage relevé
  "cost": nombre ou null,               // montant TTC total
  "serviceName": "nom du garage" ou null,
  "title": "résumé court des opérations" ou null,
  "types": ["VIDANGE", "FILTRE_HUILE", ...]  // opérations réalisées (voir liste)
}
Pour "types", choisis UNIQUEMENT parmi ces valeurs (le code exact, pas le libellé) selon les opérations facturées :
${TYPE_LIST}
Règles : liste dans "types" toutes les opérations d'entretien détectées sur la facture. Si une prestation ne correspond à aucun type, utilise "AUTRE". N'invente aucune valeur ; mets null si l'info est absente. Réponds en français.`;

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toBlock(file: Buffer, mimeType: string): Anthropic.ContentBlockParam {
  const data = file.toString("base64");
  return isPdf(mimeType)
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: isAcceptedImageType(mimeType)
            ? (mimeType as ImageMediaType)
            : "image/jpeg",
          data,
        },
      };
}

/**
 * Extrait les informations d'une facture d'entretien (image ou PDF) : date,
 * kilométrage, coût, garage, types d'opérations. Lève si la clé API est absente.
 */
export async function extractMaintenanceInvoice(
  file: Buffer,
  mimeType: string
): Promise<InvoiceExtraction> {
  if (!INVOICE_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [toBlock(file, mimeType), { type: "text", text: PROMPT }],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJsonObject(text);
  const result = InvoiceExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return {
      date: null,
      mileage: null,
      cost: null,
      serviceName: null,
      title: null,
      types: [],
    };
  }
  // Ne garde que les types valides (clés d'enum connues).
  const validTypes = result.data.types.filter(
    (t) => t in MAINTENANCE_TYPE_LABELS
  );
  return { ...result.data, types: validTypes };
}
