import { requireVehicle, getUserGarageIds } from "@/lib/vehicles";
import { getEffectiveVehiclePerms } from "@/lib/perms";
import { CARTE_GRISE_AI_ENABLED } from "@/lib/carte-grise";
import {
  parseStoredExtraction,
  CARTE_GRISE_FIELDS,
  formatFieldValue,
} from "@/lib/carte-grise-fields";
import { SERVICE_PLAN_AI_ENABLED } from "@/lib/service-plan";
import { parseServicePlan } from "@/lib/service-plan-fields";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { VehicleForm } from "@/components/VehicleForm";
import { CarteGrise } from "@/components/CarteGrise";
import { ServicePlan } from "@/components/ServicePlan";
import { VehicleManual } from "@/components/VehicleManual";
import { updateVehicle, deleteVehicle } from "@/app/(app)/vehicles/actions";
import {
  addServiceContact,
  deleteServiceContact,
  importStarterServices,
  shareVehicle,
  unshareVehicle,
} from "@/app/(app)/vehicles/[id]/actions";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, vehicle } = await requireVehicle(id);

  const [services, shares, garageIds, perms, registration, servicePlan, manual] =
    await Promise.all([
      prisma.serviceContact.findMany({
        where: { garageId: vehicle.garageId },
        orderBy: { name: "asc" },
      }),
      prisma.vehicleShare.findMany({ where: { vehicleId: vehicle.id } }),
      getUserGarageIds(user.id),
      getEffectiveVehiclePerms(user.id, vehicle.id),
      prisma.vehicleRegistration.findUnique({
        where: { vehicleId: vehicle.id },
        select: { updatedAt: true, extracted: true, mimeType: true },
      }),
      prisma.vehicleServicePlan.findUnique({
        where: { vehicleId: vehicle.id },
        select: { updatedAt: true, mimeType: true, intervals: true },
      }),
      prisma.vehicleManual.findUnique({
        where: { vehicleId: vehicle.id },
        select: { updatedAt: true, mimeType: true, url: true, title: true },
      }),
    ]);

  const planItems = parseServicePlan(servicePlan?.intervals);
  const planDocVersion =
    servicePlan?.mimeType != null ? servicePlan.updatedAt.getTime() : null;
  const manualFileVersion =
    manual?.mimeType != null ? manual.updatedAt.getTime() : null;
  const manualSearchQuery = `notice manuel utilisation ${[
    vehicle.make,
    vehicle.model,
    vehicle.year,
  ]
    .filter(Boolean)
    .join(" ")} pdf`;

  // Aperçu (dernière analyse) + données carte grise déjà enregistrées (hors
  // champs de base déjà présents dans le formulaire ci-dessus).
  const previewFields = parseStoredExtraction(registration?.extracted);
  const CORE_KEYS = new Set(["make", "model", "plate", "vin", "year", "fuelType"]);
  const vehicleRecord = vehicle as unknown as Record<string, unknown>;
  const storedInfo = CARTE_GRISE_FIELDS.filter(
    (f) => !CORE_KEYS.has(f.key)
  )
    .map((f) => ({
      label: f.label,
      value: formatFieldValue(f.key, vehicleRecord[f.key]),
    }))
    .filter((i) => i.value !== "—");

  // Garages de l'utilisateur (hors propriétaire) proposables au partage.
  const myGarages = await prisma.garage.findMany({
    where: { id: { in: garageIds } },
    orderBy: { name: "asc" },
  });
  const sharedGarageIds = new Set(shares.map((s) => s.garageId));
  const ownerGarage = await prisma.garage.findUnique({
    where: { id: vehicle.garageId },
    select: { name: true },
  });

  const updateAction = updateVehicle.bind(null, vehicle.id);
  const importAction = importStarterServices.bind(null, vehicle.id);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-xl font-bold">Profil du véhicule</h2>
        <div className="card">
          <VehicleForm action={updateAction} vehicle={vehicle} submitLabel="Enregistrer" />
        </div>
      </section>

      {perms.registrationView && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Carte grise</h2>
          <CarteGrise
            vehicleId={vehicle.id}
            imageVersion={registration ? registration.updatedAt.getTime() : null}
            mimeType={registration?.mimeType ?? null}
            aiEnabled={CARTE_GRISE_AI_ENABLED}
            canManage={perms.registrationManage}
            previewFields={previewFields}
            storedInfo={storedInfo}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-bold">Plan d&apos;entretien</h2>
        <ServicePlan
          vehicleId={vehicle.id}
          docVersion={planDocVersion}
          mimeType={servicePlan?.mimeType ?? null}
          aiEnabled={SERVICE_PLAN_AI_ENABLED}
          canManage={perms.vehiclesEdit}
          items={planItems}
          usageUnit={vehicle.usageUnit}
        />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Manuel / notice</h2>
        <VehicleManual
          vehicleId={vehicle.id}
          fileVersion={manualFileVersion}
          mimeType={manual?.mimeType ?? null}
          url={manual?.url ?? null}
          title={manual?.title ?? null}
          canManage={perms.vehiclesEdit}
          searchQuery={manualSearchQuery}
        />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-bold">Partage entre garages</h2>
        <p className="mb-3 text-sm text-gray-500">
          Rends ce véhicule accessible depuis plusieurs garages (ex. familial et
          exploitation). Les membres de ces garages le verront et pourront le suivre.
        </p>
        <div className="space-y-2">
          <div className="card flex items-center justify-between py-3">
            <span className="font-medium">{ownerGarage?.name ?? "Garage"}</span>
            <span className="badge border-brand-200 bg-brand-100 text-brand-800">
              Propriétaire
            </span>
          </div>
          {myGarages
            .filter((g) => g.id !== vehicle.garageId)
            .map((g) => {
              const shared = sharedGarageIds.has(g.id);
              return (
                <div key={g.id} className="card flex items-center justify-between py-3">
                  <span className="font-medium">{g.name}</span>
                  {shared ? (
                    <form action={unshareVehicle.bind(null, vehicle.id, g.id)}>
                      <SubmitButton
                        className="text-xs text-red-600 hover:underline"
                        pendingLabel="…"
                      >
                        Ne plus partager
                      </SubmitButton>
                    </form>
                  ) : (
                    <form action={shareVehicle.bind(null, vehicle.id, g.id)}>
                      <SubmitButton
                        className="text-xs text-brand-600 hover:underline"
                        pendingLabel="…"
                      >
                        Partager ici
                      </SubmitButton>
                    </form>
                  )}
                </div>
              );
            })}
          {myGarages.filter((g) => g.id !== vehicle.garageId).length === 0 && (
            <p className="card text-center text-sm text-gray-400">
              Tu n&apos;appartiens qu&apos;à un seul garage. Crée ou rejoins un
              autre garage (page Admin) pour pouvoir y partager ce véhicule.
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Garages & prestataires</h2>
          <Modal trigger="+ Garage" title="Ajouter un garage / prestataire">
            <form action={addServiceContact.bind(null, vehicle.id)} className="space-y-3">
              <div>
                <label className="label">Nom *</label>
                <input name="name" className="input" required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Enseigne</label>
                  <input name="brand" className="input" placeholder="Norauto…" />
                </div>
                <div>
                  <label className="label">Téléphone</label>
                  <input name="phone" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Adresse</label>
                <input name="address" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Code postal</label>
                  <input name="postalCode" className="input" />
                </div>
                <div>
                  <label className="label">Ville</label>
                  <input name="city" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <input name="notes" className="input" />
              </div>
              <SubmitButton className="btn-primary w-full">Ajouter</SubmitButton>
            </form>
          </Modal>
        </div>

        <div className="mt-3 space-y-2">
          {services.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-gray-500">
                Aucun garage enregistré. Importez une liste d&apos;enseignes
                courantes pour démarrer.
              </p>
              <form action={importAction}>
                <SubmitButton className="btn-secondary">
                  Importer les enseignes courantes
                </SubmitButton>
              </form>
            </div>
          ) : (
            services.map((s) => (
              <div key={s.id} className="card flex items-center gap-3 py-3">
                <div className="flex-1">
                  <p className="font-medium">
                    {s.brand ? `${s.brand} — ${s.name}` : s.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {[s.address, s.postalCode, s.city].filter(Boolean).join(" ")}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </p>
                </div>
                <form action={deleteServiceContact.bind(null, vehicle.id, s.id)}>
                  <DeleteButton confirmMessage="Supprimer ce garage du catalogue ?" />
                </form>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold text-red-600">Zone de danger</h2>
        <div className="card border-red-200">
          <p className="mb-3 text-sm text-gray-600">
            La suppression du véhicule efface définitivement tout son historique
            (entretiens, réparations, pleins, documents, rappels).
          </p>
          <form action={deleteVehicle.bind(null, vehicle.id)}>
            <DeleteButton
              label="Supprimer ce véhicule"
              confirmMessage="Supprimer définitivement ce véhicule et tout son historique ?"
              className="btn-danger"
            />
          </form>
        </div>
      </section>
    </div>
  );
}
