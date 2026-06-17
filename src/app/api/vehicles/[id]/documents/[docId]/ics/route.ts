import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";
import { buildIcsEvent } from "@/lib/ics";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const { vehicle } = await requireVehicle(id);

  const doc = await prisma.document.findFirst({
    where: { id: docId, vehicleId: vehicle.id },
  });
  if (!doc || !doc.expiresAt) {
    return new NextResponse("Document ou échéance introuvable", { status: 404 });
  }

  const label = `${DOCUMENT_TYPE_LABELS[doc.type]}${doc.label ? ` — ${doc.label}` : ""}`;
  const ics = buildIcsEvent({
    uid: doc.id,
    date: doc.expiresAt,
    title: `${vehicle.name} — ${label} à renouveler`,
    description: [doc.provider, doc.notes].filter(Boolean).join(" · "),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="echeance-${doc.id}.ics"`,
    },
  });
}
