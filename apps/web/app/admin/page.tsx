"use client";
import React, { useEffect, useMemo, useState } from "react";
import VisibilityPanel from "@/components/admin/VisibilityPanel";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const SSE_URL = `${API_BASE}/sse`;
const MAIN_TABLE = "Partner Investments";

// Simple format helpers (replace with lib/format.ts if you split)
const fmtCurrency = (n: any) => {
  const val = Number(n);
  if (!isFinite(val)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(val);
};
const fmtDate = (d: any) => {
  const dt = d ? new Date(d) : null;
  return dt && !isNaN(+dt) ? dt.toLocaleDateString() : "—";
};

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-white">{children}</span>;
}
function ChipList({ value }: { value: any[] }) {
  if (!Array.isArray(value) || value.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {value.map((v: any) => (
        <Badge key={v.id || v.displayName}>{v.displayName || v.fields?.Name || v.id}</Badge>
      ))}
    </div>
  );
}

// --- Inline editors (minimal examples; expand as needed) ---
function TextCell({ value, onSave }: { value: any; onSave: (val: string) => void }) {
  const [v, setV] = useState(value ?? "");
  return (
    <input
      className="w-full rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      onKeyDown={(e) => e.key === "Enter" && onSave(v)}
    />
  );
}

function NumberCell({ value, onSave }: { value: any; onSave: (val: number | null) => void }) {
  const [v, setV] = useState(value ?? "");
  return (
    <input
      type="number"
      className="w-full rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v === "" ? null : Number(v))}
      onKeyDown={(e) => e.key === "Enter" && onSave(v === "" ? null : Number(v))}
    />
  );
}

export default function AdminPage() {
  const [raw, setRaw] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [isLoading, setIsLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<"Admin" | "LP" | "Partner">("Admin");
  const [rules, setRules] = useState<Record<string, { visibleToLP: boolean; visibleToPartners: boolean }>>({});

  // Load visibility rules
  useEffect(() => {
    fetch(`${API_BASE}/api/visibility/rules`).then(async (r) => {
      const arr = await r.json();
      // normalize as map by fieldId (using field name as id in this UI)
      const map: Record<string, any> = {};
      for (const rule of arr || []) map[`${rule.tableId}:${rule.fieldId}`] = rule;
      setRules(map);
    }).catch(() => {});
  }, []);

  // initial data
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/data`);
        const json = await res.json();
        if (!active) return;
        setRaw(json.records || json.data || []);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // SSE live updates
  useEffect(() => {
    const es = new EventSource(SSE_URL);
    es.onopen = () => setStatus("Connected");
    es.onerror = () => setStatus("Reconnecting…");
    const handler = (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data); // { tableId, record }
        if (payload?.tableId !== MAIN_TABLE) return;
        setRaw((prev) => {
          const idx = prev.findIndex((r: any) => r.id === payload.record.id);
          if (idx === -1) return [payload.record, ...prev];
          const next = [...prev]; next[idx] = payload.record; return next;
        });
      } catch {}
    };
    es.addEventListener("airtable.update", handler);
    return () => { es.removeEventListener("airtable.update", handler as any); es.close(); };
  }, []);

  // Save helper: PUT /api/record
  async function saveField(record: any, fieldName: string, value: any) {
    const body = {
      tableIdOrName: MAIN_TABLE,
      recordId: record.id,
      fields: { [fieldName]: value },
      lastSeenModifiedTime: record._updatedTime || null,
    };
    const res = await fetch(`${API_BASE}/api/record`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 409) {
      alert("Conflict: this record was updated elsewhere. Refreshing row.");
      const fresh = await res.json();
      setRaw((prev) => prev.map((r) => (r.id === record.id ? fresh : r)));
      return;
    }
    const updated = await res.json();
    setRaw((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
  }

  // visibility gate: return false to hide a column in LP/Partner modes
  function isVisible(fieldName: string) {
    if (impersonation === "Admin") return true;
    const key = `${MAIN_TABLE}:${fieldName}`;
    const rule = rules[key];
    if (!rule) return true; // default visible
    return impersonation === "LP" ? !!rule.visibleToLP : !!rule.visibleToPartners;
  }

  // filter rows by search
  const rows = useMemo(() => {
    if (!query) return raw;
    const q = query.toLowerCase();
    return raw.filter((r: any) => {
      const f = r.fields || {};
      const hay = [
        f["Partner Investment"],
        Array.isArray(f["Partner"]) ? f["Partner"].map((x: any) => x.displayName).join(",") : "",
        Array.isArray(f["Fund"]) ? f["Fund"].map((x: any) => x.displayName).join(",") : "",
        f["Status"] || f["Status (I)"]
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [raw, query]);

  const columns = useMemo<ColumnDef<any>[]>(() => {
    const cols: ColumnDef<any>[] = [];

    if (isVisible("Partner Investment")) cols.push({
      header: "Investment",
      accessorFn: (r) => r?.fields?.["Partner Investment"] ?? "—",
      cell: (ctx) => (
        <TextCell
          value={ctx.getValue() as string}
          onSave={(val) => saveField(ctx.row.original, "Partner Investment", val)}
        />
      ),
    });

    if (isVisible("Partner")) cols.push({
      header: "Partner",
      accessorFn: (r) => r?.fields?.["Partner"],
      cell: (ctx) => <ChipList value={(ctx.getValue() as any[]) || []} />,
    });

    if (isVisible("Fund")) cols.push({
      header: "Fund",
      accessorFn: (r) => r?.fields?.["Fund"],
      cell: (ctx) => <ChipList value={(ctx.getValue() as any[]) || []} />,
    });

    if (isVisible("Commitment")) cols.push({
      header: "Commitment",
      accessorFn: (r) => r?.fields?.["Commitment"],
      cell: (ctx) => (
        <NumberCell
          value={ctx.getValue() as number}
          onSave={(val) => saveField(ctx.row.original, "Commitment", val)}
        />
      ),
    });

    if (isVisible("Current NAV")) cols.push({
      header: "Current NAV",
      accessorFn: (r) => r?.fields?.["Current NAV"],
      cell: (ctx) => <span>{fmtCurrency(ctx.getValue())}</span>,
    });

    if (isVisible("Status")) cols.push({
      header: "Status",
      accessorFn: (r) => r?.fields?.["Status"] ?? r?.fields?.["Status (I)"] ?? "—",
      cell: (ctx) => <TextCell value={ctx.getValue() as string} onSave={(val) => saveField(ctx.row.original, "Status", val)} />,
    });

    if (isVisible("PRIMARY CONTACT")) cols.push({
      header: "Primary Contact",
      accessorFn: (r) => r?.fields?.["PRIMARY CONTACT"],
      cell: (ctx) => <ChipList value={(ctx.getValue() as any[]) || []} />,
    });

    if (isVisible("Updated")) cols.push({
      header: "Updated",
      accessorFn: (r) => r?._updatedTime,
      cell: (ctx) => <span className="text-gray-500">{fmtDate(ctx.getValue())}</span>,
    });

    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impersonation, rules]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-[#2563EB]" />
            <h1 className="text-xl font-semibold">JBV Investment Platform</h1>
            <span className="text-gray-400">·</span>
            <span className="text-slate-600">Admin · Partner Investments</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <select
              className="rounded-lg border px-2 py-1"
              value={impersonation}
              onChange={(e) => setImpersonation(e.target.value as any)}
              title="Impersonation Preview"
            >
              <option>Admin</option>
              <option>LP</option>
              <option>Partner</option>
            </select>
            <span className="text-sm text-gray-500">SSE: {status}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex items-center gap-3">
          <input
            placeholder="Search partner, fund, status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full md:w-96 rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <span className="text-sm text-gray-500">{rows.length} records</span>
          <VisibilityPanel tableId={MAIN_TABLE} rules={rules} onChangeRules={setRules} />
        </div>

        <div className="overflow-hidden rounded-2xl border shadow-sm">
          <table className="w-full border-collapse">
            <thead className="bg-blue-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-3 py-2 text-left text-sm font-medium text-slate-700 border-b">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={table.getAllColumns().length} className="px-3 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={table.getAllColumns().length} className="px-3 py-10 text-center text-gray-400">No records</td></tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/40">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 text-sm border-b align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
