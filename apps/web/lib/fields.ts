export type ColumnLayoutState = {
  order: string[];
  hidden: Record<string, boolean>;
};

export function normalizeFieldKey(name: string): string {
  return name?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function getLinkedDisplay(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry) return "";
      if (typeof entry === "string") return entry;
      if (entry.displayName) return String(entry.displayName);
      if (entry.fields) {
        const fields = entry.fields as Record<string, any>;
        if (fields.Name) return String(fields.Name);
        if (fields["Full Name"]) return String(fields["Full Name"]);
        const firstString = Object.values(fields).find((v) => typeof v === "string");
        if (firstString) return String(firstString);
      }
      return entry.id || "";
    })
    .filter(Boolean);
}

export type AttachmentInfo = {
  name: string;
  url: string;
};

export function getAttachments(value: any): AttachmentInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry) return null;
      const url = typeof entry === "string" ? entry : entry.url;
      const name = typeof entry === "string" ? entry : entry.filename || entry.name;
      if (!url) return null;
      return { name: name || url, url };
    })
    .filter((item): item is AttachmentInfo => !!item);
}

export function mergeLayoutWithServerFields(
  serverOrder: string[],
  layout: ColumnLayoutState | null | undefined
): ColumnLayoutState {
  const uniqueServer = Array.from(new Set(serverOrder));
  const previousOrder = layout?.order ?? [];
  const nextOrder = previousOrder.filter((key) => uniqueServer.includes(key));
  for (const key of uniqueServer) {
    if (!nextOrder.includes(key)) nextOrder.push(key);
  }

  const hidden: Record<string, boolean> = {};
  for (const key of nextOrder) {
    hidden[key] = layout?.hidden?.[key] ?? false;
  }

  return { order: nextOrder, hidden };
}
