export type LinkedRecord = {
  id: string;
  fields: Record<string, any>;
  displayName: any;
};

export type ExpandedRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

export function normalizeFieldKey(name: string) {
  return (name || "").trim().toLowerCase();
}
