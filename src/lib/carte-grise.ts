import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ExtractionSchema,
  EMPTY_FIELDS,
  isAcceptedImageType,
  isPdf,
  type CarteGriseFields,
} from "@/lib/carte-grise-fields";

/** L'analyse IA n'est disponible que si une clé API Anthropic est configurée. */
export const CARTE_GRISE_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

// NB : on n'utilise PAS les "structured outputs" (output_config.format) — ils
// sont limités à 16 paramètres de type union/nullable, or on a 24 champs tous
// facultatifs. On demande donc un JSON libre et on le valide avec zod.
const PROMPT = `Tu analyses une carte grise française (certificat d'immatriculation), fournie en image ou en PDF.
Extrais les champs ci-dessous d'après leurs repères normalisés. Mets null pour tout champ illisible, absent ou incertain — n'invente jamais de valeur.
- make : marque (D.1), ex. "Renault".
- model : dénomination commerciale / modèle (D.3).
- vehicleType : type, variante, version (D.2).
- plate : numéro d'immatriculation (A), format "AA-123-BB".
- vin : numéro d'identification / VIN (E), 17 caractères.
- year : année de 1re mise en circulation (B), entier.
- firstRegistrationDate : date de 1re mise en circulation (B), au format AAAA-MM-JJ.
- registrationDate : date du certificat (I), au format AAAA-MM-JJ.
- fuelType : source d'énergie (P.3), normalisée : GASOLINE (essence/ES), DIESEL (GO/gazole), ELECTRIC (EL), HYBRID (hybride/HE/HH/EE/EH), LPG (GPL/GP/GN), OTHER.
- displacementCc : cylindrée (P.1) en cm³, entier.
- powerKw : puissance nette max (P.2) en kW, entier.
- fiscalPower : puissance administrative (P.6) en CV fiscaux, entier.
- seats : nombre de places assises (S.1), entier.
- co2 : émissions de CO2 (V.7) en g/km, entier.
- emissionClass : classe environnementale / norme Euro (V.9).
- massInService : masse en service / poids à vide (G) en kg, entier.
- maxLadenMass : masse en charge max admissible en service (F.2) en kg, entier.
- categoryEu : catégorie du véhicule CE (J).
- nationalType : genre national (J.1), ex. VP, CTTE.
- bodyworkCe : carrosserie CE (J.2).
- bodyworkNational : carrosserie, désignation nationale (J.3).
- typeApprovalNumber : numéro de réception par type (K).
- holderName : nom du titulaire (C.1).
- holderAddress : adresse du titulaire (C.3).

Réponds UNIQUEMENT avec un objet JSON valide contenant exactement ces clés (pas de texte, pas de balises markdown, pas de \`\`\`). Les entiers sans guillemets ; null sans guillemets.`;

/** Extrait le premier objet JSON d'un texte (tolère un éventuel habillage). */
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
 * Analyse une image ou un PDF de carte grise avec Claude (vision) et renvoie les
 * champs détectés. Lève si la clé API est absente.
 */
export async function extractCarteGrise(
  file: Buffer,
  mimeType: string
): Promise<CarteGriseFields> {
  if (!CARTE_GRISE_AI_ENABLED) {
    throw new Error("Analyse IA non configurée (clé API manquante).");
  }
  const data = file.toString("base64");

  // PDF → bloc "document" ; image → bloc "image". Le bloc est placé avant le
  // texte (recommandation API pour les documents).
  const sourceBlock: Anthropic.ContentBlockParam = isPdf(mimeType)
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

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [sourceBlock, { type: "text", text: PROMPT }],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJsonObject(text);
  if (parsed == null) return EMPTY_FIELDS;
  const result = ExtractionSchema.safeParse(parsed);
  return result.success ? result.data : EMPTY_FIELDS;
}
