import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ObdDiagnosisSchema,
  type ObdDiagnosis,
  type ObdSnapshot,
} from "@/lib/obd-diagnosis-fields";

/** L'aide au diagnostic IA n'est dispo que si une clé API Anthropic existe. */
export const OBD_AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

type VehicleInfo = {
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  fuelType: string;
  mileage: number | null;
};

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
 * Demande à Claude une aide au diagnostic à partir des codes défaut et des
 * valeurs relevées. Renvoie une analyse structurée (causes probables, tests).
 */
export async function runObdDiagnosis(
  vehicle: VehicleInfo,
  snap: ObdSnapshot,
  knowledgeContext?: string | null
): Promise<ObdDiagnosis> {
  if (!OBD_AI_ENABLED) {
    throw new Error("Aide au diagnostic IA non configurée (clé API manquante).");
  }

  const codesTxt = snap.codes.length
    ? snap.codes
        .map(
          (c) => `- ${c.code}${c.pending ? " (en attente)" : ""} : ${c.description}`
        )
        .join("\n")
    : "Aucun code défaut.";
  const liveTxt = snap.live.length
    ? snap.live.map((v) => `- ${v.label} : ${v.value} ${v.unit}`).join("\n")
    : "Non relevées.";
  const freezeTxt = snap.freeze.length
    ? snap.freeze.map((v) => `- ${v.label} : ${v.value} ${v.unit}`).join("\n")
    : "Aucun.";
  const monitorsTxt = snap.monitors.length
    ? snap.monitors
        .map((m) => `- ${m.label} : ${m.complete ? "prêt" : "non prêt"}`)
        .join("\n")
    : "Non disponibles.";

  const vehicleTxt = [
    vehicle.make,
    vehicle.model,
    vehicle.year ? String(vehicle.year) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = `Tu es un mécanicien automobile expérimenté. À partir des données OBD-II ci-dessous, aide au diagnostic.

VÉHICULE : ${vehicleTxt || vehicle.name} — carburant ${vehicle.fuelType}${
    vehicle.mileage != null ? ` — ~${vehicle.mileage} km` : ""
  }
PROTOCOLE : ${snap.protocol ?? "inconnu"}
VOYANT MOTEUR : ${snap.milOn ? "allumé" : "éteint"}${
    snap.voltage != null ? ` — tension ${snap.voltage} V` : ""
  }

CODES DÉFAUT :
${codesTxt}

DONNÉES TEMPS RÉEL :
${liveTxt}

FREEZE FRAME (au moment du défaut) :
${freezeTxt}

PRÉPARATION CONTRÔLE TECHNIQUE (monitors) :
${monitorsTxt}
${
  knowledgeContext
    ? `\nBASE DE CONNAISSANCES DU MODÈLE (pannes fréquentes déjà recensées — à prendre en compte pour hiérarchiser les causes) :\n${knowledgeContext}\n`
    : ""
}
Réponds UNIQUEMENT avec un objet JSON (pas de texte autour, pas de markdown) :
{
  "summary": "synthèse en 1-2 phrases",
  "severity": "info" | "attention" | "urgent",
  "causes": [
    { "title": "cause probable", "likelihood": "élevée" | "moyenne" | "faible", "checks": ["test/vérification concrète", ...] }
  ],
  "advice": "conseils et prochaines étapes"
}
Croise les codes ET les valeurs (ex. corrections de richesse, sondes O2, températures) pour hiérarchiser les causes. Sois concret et pédagogue, en français. Rappelle si nécessaire que c'est indicatif et ne remplace pas un diagnostic professionnel.`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = extractJsonObject(text);
  const result = ObdDiagnosisSchema.safeParse(parsed);
  if (!result.success) {
    return {
      summary: text.slice(0, 500) || "Analyse indisponible.",
      severity: "info",
      causes: [],
      advice: "",
    };
  }
  return result.data;
}
