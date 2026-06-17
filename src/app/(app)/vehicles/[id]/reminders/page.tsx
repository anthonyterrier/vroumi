import { requireVehicle, currentMileage } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { TodayDateInput } from "@/components/TodayDateInput";
import {
  addReminder,
  updateReminder,
  toggleReminder,
  deleteReminder,
} from "@/app/(app)/vehicles/[id]/actions";
import {
  REMINDER_KIND_LABELS,
  dueStatus,
  DUE_STATUS_STYLE,
  usageUnitLabel,
} from "@/lib/labels";
import { formatDate, formatUsage } from "@/lib/format";
import type { Reminder } from "@prisma/client";

function ReminderFields({ r, unit }: { r?: Reminder; unit: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Catégorie</label>
          <select name="kind" className="input" defaultValue={r?.kind ?? "MAINTENANCE"}>
            {Object.entries(REMINDER_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Échéance (date)</label>
          <TodayDateInput name="dueDate" iso={r?.dueDate?.toISOString()} optional />
        </div>
      </div>
      <div>
        <label className="label">Intitulé *</label>
        <input
          name="label"
          className="input"
          required
          placeholder="ex. Prochaine vidange"
          defaultValue={r?.label ?? ""}
          autoFocus={!r}
        />
      </div>
      <div>
        <label className="label">Échéance (compteur {usageUnitLabel(unit)})</label>
        <input
          name="dueMileage"
          type="number"
          className="input"
          defaultValue={r?.dueMileage ?? ""}
        />
      </div>
      <div>
        <label className="label">Notes</label>
        <input name="notes" className="input" defaultValue={r?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const [reminders, mileage] = await Promise.all([
    prisma.reminder.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: [{ done: "asc" }, { dueDate: "asc" }],
    }),
    currentMileage(vehicle.id, vehicle.initialMileage),
  ]);

  const addAction = addReminder.bind(null, vehicle.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Rappels</h2>
        <Modal trigger="+ Rappel" title="Ajouter un rappel">
          <form action={addAction} className="space-y-3">
            <ReminderFields unit={vehicle.usageUnit} />
            <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
          </form>
        </Modal>
      </div>

      <div className="space-y-2">
        {reminders.length === 0 && (
          <p className="card text-center text-sm text-gray-400">
            Aucun rappel. Programmez la prochaine vidange, le contrôle technique…
          </p>
        )}
        {reminders.map((r) => {
          const status = r.done ? "ok" : dueStatus(r.dueDate, r.dueMileage, mileage);
          const style = DUE_STATUS_STYLE[status];
          return (
            <div
              key={r.id}
              className={`card flex items-center gap-3 py-3 ${
                r.done ? "opacity-60" : ""
              }`}
            >
              <form action={toggleReminder.bind(null, vehicle.id, r.id, !r.done)}>
                <button
                  type="submit"
                  className="text-xl"
                  title={r.done ? "Marquer comme à faire" : "Marquer comme fait"}
                >
                  {r.done ? "✅" : "⬜"}
                </button>
              </form>
              <div className="flex-1">
                <p className={`font-medium ${r.done ? "line-through" : ""}`}>
                  {r.label}
                </p>
                <p className="text-xs text-gray-400">
                  {REMINDER_KIND_LABELS[r.kind]}
                  {r.dueDate ? ` · ${formatDate(r.dueDate)}` : ""}
                  {r.dueMileage ? ` · ${formatUsage(r.dueMileage, vehicle.usageUnit)}` : ""}
                </p>
                {r.notes && <p className="mt-1 text-sm text-gray-600">{r.notes}</p>}
              </div>
              {!r.done && status !== "unknown" && (
                <span className={`badge ${style.className}`}>{style.label}</span>
              )}
              {r.dueDate && (
                <a
                  href={`/api/vehicles/${vehicle.id}/reminders/${r.id}/ics`}
                  className="px-2 text-gray-400 hover:text-brand-600"
                  title="Ajouter au calendrier (.ics)"
                >
                  📅
                </a>
              )}
              <Modal
                trigger="✏️"
                title="Modifier le rappel"
                triggerClassName="px-2 text-gray-400 hover:text-brand-600"
              >
                <form
                  action={updateReminder.bind(null, vehicle.id, r.id)}
                  className="space-y-3"
                >
                  <ReminderFields r={r} unit={vehicle.usageUnit} />
                  <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
                </form>
              </Modal>
              <form action={deleteReminder.bind(null, vehicle.id, r.id)}>
                <DeleteButton confirmMessage="Supprimer ce rappel ?" />
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
