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

export type MileagePoint = { t: number; label: string; mileage: number };

export function MileageChart({ points }: { points: MileagePoint[] }) {
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        Au moins deux relevés sont nécessaires pour tracer la courbe.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            width={48}
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toLocaleString("fr-FR")} km`, "Kilométrage"]}
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="mileage"
            stroke="#1f6f43"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
