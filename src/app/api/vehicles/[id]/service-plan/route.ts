import { NextResponse } from "next/server";
import { requireVehicle } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";

/** Sert le document source du plan d'entretien (accessible à tout membre du véhicule). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  const plan = await prisma.vehicleServicePlan.findUnique({
    where: { vehicleId: vehicle.id },
  });
  if (!plan?.data || !plan.mimeType) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(plan.data), {
    headers: {
      "Content-Type": plan.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
