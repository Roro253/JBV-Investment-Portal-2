"use client";
/* eslint-disable @next/next/no-img-element */
import React from "react";

type Attachment = { url?: string; filename?: string; thumbnails?: any };

export default function Attachments({ value }: { value?: Attachment[] | null }) {
  const arr = Array.isArray(value) ? value : [];
  if (arr.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {arr.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
          <img
            src={a.thumbnails?.small?.url || a.thumbnails?.large?.url || a.url}
            alt={a.filename || 'attachment'}
            className="h-12 w-12 object-cover rounded border"
          />
        </a>
      ))}
    </div>
  );
}

