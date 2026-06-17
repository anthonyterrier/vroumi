"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CostSlice = { label: string; amount: number };

const COLORS = ["#1f6f43", "#338dff", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

export function CostChart({ slices }: { slices: CostSlice[] }) {
  const data = slices.filter((s) => s.amount > 0);
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        Aucun coût enregistré pour le moment.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip
            formatter={(v: number) => [
              v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }),
              "Coût",
            ]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
