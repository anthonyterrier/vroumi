import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";

/** Sert une page du plan d'entretien (accessible à tout membre du véhicule). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const { vehicle } = await requireVehicle(id);

  const doc = await prisma.vehicleServicePlanDoc.findFirst({
    where: { id: docId, vehicleId: vehicle.id },
  });
  if (!doc) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
