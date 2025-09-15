"use client";
import React, { useState } from "react";

export default function NumberInput({ value, onSave, placeholder }: { value?: number | null; onSave: (v: number | null) => void; placeholder?: string }) {
  const [v, setV] = useState(value ?? "");
  function normalize(x: any) { return x === "" ? null : Number(x); }
  return (
    <input
      type="number"
      className="w-full rounded border px-2 py-1"
      placeholder={placeholder}
      value={v as any}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(normalize(v))}
      onKeyDown={(e) => e.key === 'Enter' && onSave(normalize(v))}
    />
  );
}

