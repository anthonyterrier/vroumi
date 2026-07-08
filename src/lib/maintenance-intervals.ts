// Intervalles d'entretien INDICATIFs (km / mois) par type. Ces valeurs sont des
// ordres de grandeur courants et NE remplacent PAS le carnet d'entretien du
// constructeur : reportez-vous toujours aux préconisations de votre véhicule.

import type { ServicePlanItem } from "@/lib/service-plan-fields";

export type Interval = { km?: number; months?: number };

// Valeurs de base (véhicule essence). Adaptées ensuite selon le carburant via
// intervalsForVehicle().
export const MAINTENANCE_INTERVALS: Record<string, Interval> = {
  VIDANGE: { km: 15000, months: 12 },
  FILTRE_HUILE: { km: 15000, months: 12 },
  FILTRE_AIR: { km: 30000, months: 24 },
  FILTRE_HABITACLE: { km: 15000, months: 12 },
  FILTRE_CARBURANT: { km: 40000 },
  FREINS: { km: 40000 }, // plaquettes ~30 000 / disques ~60 000 — valeur moyenne
  LIQUIDE_DE_FREIN: { months: 24 }, // purge ~tous les 2 ans
  PNEUS: { km: 40000 },
  COURROIE_DISTRIBUTION: { km: 120000, months: 120 },
  COURROIE_ACCESSOIRE: { km: 90000 },
  BOUGIES: { km: 60000 },
  BATTERIE: { months: 60 },
  AMORTISSEURS: { km: 80000 },
  CLIMATISATION: { months: 24 },
  LIQUIDE_REFROIDISSEMENT: { km: 90000, months: 48 },
  ESSUIE_GLACE: { months: 12 },
  REVISION: { km: 15000, months: 12 },
};

export const MAINTENANCE_DISCLAIMER =
  "Valeurs indicatives — référez-vous toujours au carnet d'entretien du constructeur.";

/**
 * Intervalles adaptés au carburant du véhicule. Faute de base de données par
 * marque/modèle (les schémas constructeurs ne sont pas librement accessibles —
 * voir les API commerciales type Vehicle Databases / Edmunds / CarMD), on ajuste
 * de façon déterministe selon l'énergie, ce qui couvre l'essentiel des écarts.
 */
export function intervalsForVehicle(
  fuelType?: string | null
): Record<string, Interval> {
  const base = { ...MAINTENANCE_INTERVALS };

  switch (fuelType) {
    case "ELECTRIC": {
      // Pas de moteur thermique : on retire les entretiens associés.
      for (const k of [
        "VIDANGE",
        "FILTRE_HUILE",
        "FILTRE_AIR",
        "FILTRE_CARBURANT",
        "BOUGIES",
        "COURROIE_DISTRIBUTION",
        "COURROIE_ACCESSOIRE",
        "LIQUIDE_REFROIDISSEMENT",
      ]) {
        delete base[k];
      }
      base.FREINS = { km: 80000 }; // freinage régénératif → usure plus lente
      base.REVISION = { km: 30000, months: 24 };
      return base;
    }
    case "HYBRID": {
      base.FREINS = { km: 70000 }; // récupération d'énergie → freins moins sollicités
      return base;
    }
    case "DIESEL": {
      base.VIDANGE = { km: 20000, months: 12 };
      base.FILTRE_HUILE = { km: 20000, months: 12 };
      return base;
    }
    default:
      return base; // essence / GPL / autre
  }
}

/** Libellé lisible d'un intervalle : "tous les 15 000 km ou 12 mois". */
export function formatInterval(i: Interval, unit?: string | null): string {
  const u = unit === "HOURS" ? "h" : "km";
  const parts: string[] = [];
  if (i.km) parts.push(`${i.km.toLocaleString("fr-FR")} ${u}`);
  if (i.months) {
    parts.push(
      i.months % 12 === 0
        ? `${i.months / 12} an${i.months / 12 > 1 ? "s" : ""}`
        : `${i.months} mois`
    );
  }
  return parts.length ? `tous les ${parts.join(" ou ")}` : "selon l'usage";
}

/**
 * Calcule une échéance suggérée (date + km) à partir d'un type, d'un point de
 * départ et du carburant du véhicule (intervalles adaptés).
 */
export function suggestNextDue(
  type: string,
  fromDate: Date,
  fromMileage: number | null | undefined,
  fuelType?: string | null
): { nextDueDate: Date | null; nextDueMileage: number | null } {
  const interval = intervalsForVehicle(fuelType)[type];
  if (!interval) return { nextDueDate: null, nextDueMileage: null };

  let nextDueDate: Date | null = null;
  if (interval.months) {
    const d = new Date(fromDate);
    d.setMonth(d.getMonth() + interval.months);
    nextDueDate = d;
  }

  let nextDueMileage: number | null = null;
  if (interval.km && fromMileage != null) {
    nextDueMileage = fromMileage + interval.km;
  }

  return { nextDueDate, nextDueMileage };
}

// Mots-clés pour rattacher une ligne du carnet (libellé libre) à un type
// d'entretien. Permet d'utiliser les intervalles du plan constructeur.
const PLAN_KEYWORDS: Record<string, string[]> = {
  VIDANGE: ["vidange", "huile moteur"],
  FILTRE_HUILE: ["filtre à huile", "filtre huile"],
  FILTRE_AIR: ["filtre à air", "filtre air"],
  FILTRE_HABITACLE: ["habitacle", "pollen"],
  FILTRE_CARBURANT: ["filtre à carburant", "filtre carburant", "gasoil", "gazole"],
  FREINS: ["frein", "plaquette", "disque"],
  LIQUIDE_DE_FREIN: ["liquide de frein"],
  PNEUS: ["pneu", "pneumatique"],
  COURROIE_DISTRIBUTION: ["distribution"],
  COURROIE_ACCESSOIRE: ["accessoire"],
  BOUGIES: ["bougie"],
  BATTERIE: ["batterie"],
  AMORTISSEURS: ["amortisseur", "suspension"],
  CLIMATISATION: ["clim"],
  LIQUIDE_REFROIDISSEMENT: ["refroidissement"],
  ESSUIE_GLACE: ["essuie", "balai"],
  REVISION: ["révision", "revision", "entretien périodique"],
};

/** Cherche l'intervalle correspondant à un type dans le plan (carnet), ou null. */
function planIntervalForType(
  type: string,
  plan: ServicePlanItem[]
): Interval | null {
  const kws = PLAN_KEYWORDS[type];
  if (!kws || plan.length === 0) return null;
  for (const item of plan) {
    const label = item.label.toLowerCase();
    if (kws.some((k) => label.includes(k))) {
      return {
        km: item.km ?? undefined,
        months: item.months ?? undefined,
      };
    }
  }
  return null;
}

/**
 * Échéance suggérée en privilégiant le carnet constructeur (plan d'entretien)
 * s'il contient une ligne correspondant au type ; sinon repli sur les
 * intervalles génériques adaptés au carburant.
 */
export function suggestNextDueFromPlan(
  type: string,
  plan: ServicePlanItem[],
  fromDate: Date,
  fromMileage: number | null | undefined,
  fuelType?: string | null
): {
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  source: "plan" | "generic" | "none";
} {
  const planInterval = planIntervalForType(type, plan);
  const interval = planInterval ?? intervalsForVehicle(fuelType)[type];
  if (!interval) return { nextDueDate: null, nextDueMileage: null, source: "none" };

  let nextDueDate: Date | null = null;
  if (interval.months) {
    const d = new Date(fromDate);
    d.setMonth(d.getMonth() + interval.months);
    nextDueDate = d;
  }
  let nextDueMileage: number | null = null;
  if (interval.km && fromMileage != null) {
    nextDueMileage = fromMileage + interval.km;
  }
  return {
    nextDueDate,
    nextDueMileage,
    source: planInterval ? "plan" : "generic",
  };
}
