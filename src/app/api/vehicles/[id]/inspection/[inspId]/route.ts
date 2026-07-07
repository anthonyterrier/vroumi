import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";

/** Sert le compte rendu scanné d'un contrôle technique (membres du véhicule). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; inspId: string }> }
) {
  const { id, inspId } = await params;
  const { vehicle } = await requireVehicle(id);

  const inspection = await prisma.technicalInspection.findFirst({
    where: { id: inspId, vehicleId: vehicle.id },
  });
  if (!inspection || !inspection.data || !inspection.mimeType) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(inspection.data), {
    headers: {
      "Content-Type": inspection.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
