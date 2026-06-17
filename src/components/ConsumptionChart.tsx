"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export type ConsumptionPoint = { label: string; consumption: number };

export function ConsumptionChart({
  points,
  unitLabel = "L/100 km",
}: {
  points: ConsumptionPoint[];
  unitLabel?: string;
}) {
  if (points.length < 1) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        Saisissez au moins deux pleins complets avec compteur renseigné pour
        calculer la consommation.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis
            tick={{ fontSize: 11 }}
            width={40}
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)} ${unitLabel}`, "Consommation"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="consumption"
            stroke="#338dff"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
