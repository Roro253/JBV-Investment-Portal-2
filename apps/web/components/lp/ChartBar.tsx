"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ChartDatum {
  label: string;
  value: number;
}

interface ChartBarProps {
  data: ChartDatum[];
  valueFormatter: (value: number) => string;
  labelFormatter?: (label: string) => string;
  emptyMessage: ReactNode;
}

export function ChartBar({ data, valueFormatter, labelFormatter, emptyMessage }: ChartBarProps) {
  if (!data.length) {
    return <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
        <YAxis
          tickFormatter={(value) => valueFormatter(value as number).replace("$", "")}
          tick={{ fontSize: 12, fill: "#475569" }}
        />
        <Tooltip formatter={(value: number) => valueFormatter(value)} labelFormatter={labelFormatter} />
        <Bar dataKey="value" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
