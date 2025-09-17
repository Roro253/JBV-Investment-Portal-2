"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ChartDatum {
  label: string;
  value: number;
}

interface ChartLineProps {
  data: ChartDatum[];
  valueFormatter: (value: number) => string;
  labelFormatter?: (label: string) => string;
  emptyMessage: ReactNode;
}

export function ChartLine({ data, valueFormatter, labelFormatter, emptyMessage }: ChartLineProps) {
  if (!data.length) {
    return <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
        <YAxis
          tickFormatter={(value) => valueFormatter(value as number).replace("$", "")}
          tick={{ fontSize: 12, fill: "#475569" }}
        />
        <Tooltip formatter={(value: number) => valueFormatter(value)} labelFormatter={labelFormatter} />
        <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
