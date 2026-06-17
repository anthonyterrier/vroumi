// Intervalles d'entretien INDICATIFs (km / mois) par type. Ces valeurs sont des
// ordres de grandeur courants et NE remplacent PAS le carnet d'entretien du
// constructeur : reportez-vous toujours aux préconisations de votre véhicule.

export type Interval = { km?: number; months?: number };

export const MAINTENANCE_INTERVALS: Record<string, Interval> = {
  VIDANGE: { km: 15000, months: 12 },
  FILTRE_HUILE: { km: 15000, months: 12 },
  FILTRE_AIR: { km: 30000, months: 24 },
  FILTRE_HABITACLE: { km: 15000, months: 12 },
  FILTRE_CARBURANT: { km: 40000 },
  FREINS: { km: 40000 },
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

/** Calcule une échéance suggérée (date + km) à partir d'un type et d'un point de départ. */
export function suggestNextDue(
  type: string,
  fromDate: Date,
  fromMileage: number | null | undefined
): { nextDueDate: Date | null; nextDueMileage: number | null } {
  const interval = MAINTENANCE_INTERVALS[type];
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
