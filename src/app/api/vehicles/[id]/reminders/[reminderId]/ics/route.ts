import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { buildIcsEvent } from "@/lib/ics";
import { REMINDER_KIND_LABELS } from "@/lib/labels";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  const { id, reminderId } = await params;
  const { vehicle } = await requireVehicle(id);

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, vehicleId: vehicle.id },
  });
  if (!reminder || !reminder.dueDate) {
    return new NextResponse("Rappel ou échéance introuvable", { status: 404 });
  }

  const ics = buildIcsEvent({
    uid: reminder.id,
    date: reminder.dueDate,
    title: `${vehicle.name} — ${reminder.label}`,
    description: [
      REMINDER_KIND_LABELS[reminder.kind],
      reminder.dueMileage ? `à ${reminder.dueMileage} km` : "",
      reminder.notes,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="rappel-${reminder.id}.ics"`,
    },
  });
}
