import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";

/**
 * Sert une pièce jointe d'entretien (facture, photo, PDF). Accessible à tout
 * membre du véhicule : on vérifie que la pièce jointe appartient bien à un
 * entretien de ce véhicule.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attId: string }> }
) {
  const { id, attId } = await params;
  const { vehicle } = await requireVehicle(id);

  const attachment = await prisma.maintenanceAttachment.findFirst({
    where: { id: attId, maintenance: { vehicleId: vehicle.id } },
  });
  if (!attachment) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
