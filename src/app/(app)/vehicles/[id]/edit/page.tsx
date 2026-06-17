import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { VehicleForm } from "@/components/VehicleForm";
import { updateVehicle, deleteVehicle } from "@/app/(app)/vehicles/actions";
import {
  addServiceContact,
  deleteServiceContact,
  importStarterServices,
} from "@/app/(app)/vehicles/[id]/actions";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const services = await prisma.serviceContact.findMany({
    where: { garageId: vehicle.garageId },
    orderBy: { name: "asc" },
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
