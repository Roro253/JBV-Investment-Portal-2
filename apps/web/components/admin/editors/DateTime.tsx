"use client";
import React, { useMemo, useState } from "react";

function toLocalInputValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  // yyyy-MM-ddThh:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

export default function DateTime({ value, onSave }: { value?: string | null; onSave: (iso: string | null) => void }) {
  const [v, setV] = useState(toLocalInputValue(value));
  function toISO(local: string) {
    if (!local) return null;
    const d = new Date(local);
    return isNaN(+d) ? null : d.toISOString();
  }
  return (
    <input
      type="datetime-local"
      className="w-full rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(toISO(v))}
      onKeyDown={(e) => e.key === 'Enter' && onSave(toISO(v))}
    />
  );
}

