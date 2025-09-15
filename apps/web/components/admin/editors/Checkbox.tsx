"use client";
import React from "react";

export default function Checkbox({ value, onSave }: { value?: boolean; onSave: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={!!value} onChange={(e) => onSave(e.target.checked)} />
      <span className="text-sm text-slate-700">{value ? 'Yes' : 'No'}</span>
    </label>
  );
}

