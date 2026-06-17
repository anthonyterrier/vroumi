import Link from "next/link";
import { requireVehicle } from "@/lib/vehicles";
import { VehicleTabs } from "@/components/VehicleTabs";

export default async function VehicleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { vehicle } = await requireVehicle(id);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="hover:text-gray-700">
          Mes véhicules
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-700">{vehicle.name}</span>
      </div>
      <VehicleTabs vehicleId={vehicle.id} />
      {children}
    </div>
  );
}
