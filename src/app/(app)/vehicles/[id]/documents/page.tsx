import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import {
  addDocument,
  updateDocument,
  deleteDocument,
} from "@/app/(app)/vehicles/[id]/actions";
import {
  DOCUMENT_TYPE_LABELS,
  dueStatus,
  DUE_STATUS_STYLE,
} from "@/lib/labels";
import { formatDate, formatEuro } from "@/lib/format";
import type { Document } from "@prisma/client";

function DocumentFields({ d }: { d?: Document }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue={d?.type ?? "ASSURANCE"}>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Coût (€)</label>
          <input
            name="cost"
            type="number"
            step="any"
            className="input"
            defaultValue={d?.cost ?? ""}
          />
        </div>
      </div>
      <div>
        <label className="label">Précision</label>
        <input
          name="label"
          className="input"
          placeholder="ex. Tous risques"
          defaultValue={d?.label ?? ""}
        />
      </div>
      <div>
        <label className="label">Organisme / centre</label>
        <input
          name="provider"
          className="input"
          placeholder="ex. MAIF, Dekra…"
          defaultValue={d?.provider ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Émis le</label>
          <TodayDateInput name="issuedAt" iso={d?.issuedAt?.toISOString()} optional />
        </div>
        <div>
          <label className="label">Expire le</label>
          <TodayDateInput name="expiresAt" iso={d?.expiresAt?.toISOString()} optional />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={d?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [docs, mileage] = await Promise.all([
    prisma.document.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

  const addAction = addDocument.bind(null, vehicle.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Documents</h2>
        <Modal trigger="+ Document" title="Ajouter un document">
          <form action={addAction} className="space-y-3">
            <DocumentFields />
            <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
          </form>
        </Modal>
      </div>

      <div className="space-y-2">
        {docs.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucun document. Ajoutez l&apos;assurance, le contrôle technique, la
            carte grise… pour suivre leurs échéances.
          </p>
        )}
        {docs.map((d) => {
          const status = dueStatus(d.expiresAt, null, mileage);
          const style = DUE_STATUS_STYLE[status];
          return (
            <div key={d.id} className="card flex items-center gap-3 py-3">
              <span className="text-xl">📄</span>
              <div className="flex-1">
                <p className="font-medium">
                  {DOCUMENT_TYPE_LABELS[d.type]}
                  {d.label ? ` — ${d.label}` : ""}
                </p>
                <p className="text-xs text-gray-400">
                  {d.provider ? `${d.provider} · ` : ""}
                  {d.expiresAt
                    ? `Expire le ${formatDate(d.expiresAt)}`
                    : "Sans échéance"}
                </p>
                {d.notes && <p className="mt-1 text-sm text-gray-600">{d.notes}</p>}
              </div>
              {d.expiresAt && status !== "unknown" && (
                <span className={`badge ${style.className}`}>{style.label}</span>
              )}
              {d.cost != null && (
                <span className="text-sm font-semibold">{formatEuro(d.cost)}</span>
              )}
              {d.expiresAt && (
                <a
                  href={`/api/vehicles/${vehicle.id}/documents/${d.id}/ics`}
                  className="px-2 text-gray-400 hover:text-brand-600"
                  title="Ajouter au calendrier (.ics)"
                >
                  📅
                </a>
              )}
              <Modal
                trigger="✏️"
                title="Modifier le document"
                triggerClassName="px-2 text-gray-400 hover:text-brand-600"
              >
                <form
                  action={updateDocument.bind(null, vehicle.id, d.id)}
                  className="space-y-3"
                >
                  <DocumentFields d={d} />
                  <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
                </form>
              </Modal>
              <form action={deleteDocument.bind(null, vehicle.id, d.id)}>
                <DeleteButton confirmMessage="Supprimer ce document ?" />
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
