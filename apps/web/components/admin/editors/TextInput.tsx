"use client";
import React, { useState } from "react";

export default function TextInput({ value, onSave, placeholder }: { value?: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value ?? "");
  return (
    <input
      className="w-full rounded border px-2 py-1"
      placeholder={placeholder}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && onSave(v)}
    />
  );
}

