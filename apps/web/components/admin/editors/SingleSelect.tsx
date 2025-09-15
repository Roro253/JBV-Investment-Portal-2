"use client";
import React, { useState } from "react";

type Option = { value: string; label?: string };

export default function SingleSelect({ value, options, onSave, allowFreeText = true }: { value?: string | null; options?: Option[]; onSave: (v: string | null) => void; allowFreeText?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");

  if (!editing && options && options.length > 0 && !allowFreeText) {
    return (
      <select className="w-full rounded border px-2 py-1" value={v} onChange={(e) => { setV(e.target.value); onSave(e.target.value); }}>
        <option value=""></option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
      </select>
    );
  }

  // free text input (fallback)
  return (
    <input
      className="w-full rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v === "" ? null : v)}
      onKeyDown={(e) => e.key === 'Enter' && onSave(v === "" ? null : v)}
      onFocus={() => setEditing(true)}
    />
  );
}

