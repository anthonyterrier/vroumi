import "server-only";
import { aiComplete, AI_ENABLED } from "@/lib/ai-client";
import {
  InspectionExtractionSchema,
  type InspectionExtraction,
} from "@/lib/technical-inspection-fields";

/** L'analyse IA n'est disponible que si un fournisseur (local ou Claude) existe. */
export const INSPECTION_AI_ENABLED = AI_ENABLED;

const PROMPT = `Tu analyses le COMPTE RENDU d'un CONTRÔLE TECHNIQUE automobile français (procès-verbal). Extrait les informations et réponds UNIQUEMENT avec un objet JSON (pas de texte, pas de markdown, pas de \`\`\`) de la forme :
{
  "date": "AAAA-MM-JJ" ou null,                     // date du contrôle
  "result": "FAVORABLE" | "CONTRE_VISITE" | "DEFAVORABLE" | null,
  "mileage": entier ou null,                          // kilométrage relevé
  "center": "nom du centre" ou null,
  "nextDueDate": "AAAA-MM-JJ" ou null,                // prochaine échéance / limite de contre-visite
  "defects": [
    { "severity": "MINEURE" | "MAJEURE" | "CRITIQUE" | null, "code": "5.2.3.a" ou null, "description": "libellé de la défaillance" }
  ]
}
Règles :
- "result" : FAVORABLE si aucune défaillance majeure ni critique ; CONTRE_VISITE s'il y a des défaillances MAJEURES (contre-visite requise) ; DEFAVORABLE s'il y a des défaillances CRITIQUES.
- "defects" : liste CHAQUE défaillance relevée avec sa gravité (mineure / majeure / critique), son code s'il est indiqué, et sa description exacte. N'inclus pas les points conformes.
- N'invente aucune valeur ; mets null en cas de doute. Réponds en français.`;

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

/**
 * Extrait les informations d'un compte rendu de contrôle technique (image ou
 * PDF) : date, résultat, kilométrage, centre, échéance et liste des
 * défaillances. Lève si l'IA n'est pas configurée.
 */
export async function extractInspection(
  file: Buffer,
  mimeType: string
): Promise<InspectionExtraction> {
  if (!INSPECTION_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }

  const text = await aiComplete({
    prompt: PROMPT,
    files: [{ buffer: file, mimeType }],
    maxTokens: 4096,
  });

  const parsed = extractJsonObject(text);
  const result = InspectionExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return {
      date: null,
      result: null,
      mileage: null,
      center: null,
      nextDueDate: null,
      defects: [],
    };
  }
  // Limite le nombre de défaillances par sécurité.
  return { ...result.data, defects: result.data.defects.slice(0, 40) };
}
