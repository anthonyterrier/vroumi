"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

export type LiveSeries = {
  key: string;
  label: string;
  unit: string;
  color: string;
};
export type LivePoint = { t: number } & Record<string, number | null>;

function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Courbe multi-séries des données OBD temps réel cochées par l'utilisateur. */
export function LiveObdChart({
  points,
  series,
}: {
  points: LivePoint[];
  series: LiveSeries[];
}) {
  if (series.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        Coche une ou plusieurs données ci-dessous pour les tracer.
      </p>
    );
  }
  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        Collecte des mesures en cours… (démarre les données temps réel)
      </p>
    );
  }

  const unitByLabel: Record<string, string> = {};
  series.forEach((s) => {
    unitByLabel[s.label] = s.unit;
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="t"
            tickFormatter={fmtTime}
            tick={{ fontSize: 10 }}
            minTickGap={40}
          />
          <YAxis tick={{ fontSize: 11 }} width={44} domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(t) => fmtTime(t as number)}
            formatter={(v: number, name: string) => [
              `${v} ${unitByLabel[name] ?? ""}`.trim(),
              name,
            ]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
