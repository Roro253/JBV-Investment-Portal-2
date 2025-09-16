"use client";
import React, { useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export type Rule = {
  id?: string;
  tableId: string;
  fieldId: string;
  visibleToLP: boolean;
  visibleToPartners: boolean;
  notes?: string;
};

type Props = {
  tableId: string;
  rules: Record<string, Rule>;
  onChangeRules: (next: Record<string, Rule>) => void;
  fields?: string[]; // optional explicit field list
};

const DEFAULT_FIELDS = [
  "Partner Investment",
  "Partner",
  "Fund",
  "Commitment",
  "Current NAV",
  "Net MOIC",
  "Status",
  "Status (I)",
  "PRIMARY CONTACT",
  "Updated",
];

async function upsertRule(rule: Rule): Promise<Rule> {
  const res = await fetch(`${API_BASE}/api/visibility/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error("Failed to save rule");
  return res.json();
}

export default function VisibilityPanel({ tableId, rules, onChangeRules, fields }: Props) {
  const [open, setOpen] = useState(false);
  const allFields = useMemo(() => fields && fields.length ? fields : DEFAULT_FIELDS, [fields]);

  function keyFor(fieldId: string) { return `${tableId}:${fieldId}`; }
  function getRule(fieldId: string): Rule {
    const key = keyFor(fieldId);
    const existing = rules[key];
    return existing || { tableId, fieldId, visibleToLP: true, visibleToPartners: true } as Rule;
  }

  async function setToggle(fieldId: string, which: 'lp'|'partners', value: boolean) {
    const current = getRule(fieldId);
    const nextRule: Rule = {
      ...current,
      visibleToLP: which === 'lp' ? value : current.visibleToLP,
      visibleToPartners: which === 'partners' ? value : current.visibleToPartners,
    };
    const saved = await upsertRule(nextRule);
    const key = keyFor(fieldId);
    onChangeRules({ ...rules, [key]: saved });
  }

  return (
    <>
      <button
        className="rounded-lg border px-3 py-2 text-sm bg-white hover:bg-blue-50"
        onClick={() => setOpen(true)}
        title="Column Visibility"
      >
        Columns
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-[380px] bg-white border-l shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded bg-[#2563EB]" />
                <h2 className="text-sm font-semibold text-slate-800">Visibility · {tableId}</h2>
              </div>
              <button className="rounded border px-2 py-1 text-sm" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {allFields.map((f) => {
                const r = getRule(f);
                return (
                  <div key={f} className="rounded-2xl border p-3 shadow-sm">
                    <div className="font-medium text-slate-800 mb-2">{f}</div>
                    <div className="flex items-center gap-4 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={!!r.visibleToLP} onChange={(e) => setToggle(f, 'lp', e.target.checked)} />
                        <span>Visible to LP</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={!!r.visibleToPartners} onChange={(e) => setToggle(f, 'partners', e.target.checked)} />
                        <span>Visible to Partners</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
