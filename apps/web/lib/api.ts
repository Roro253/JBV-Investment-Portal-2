export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export type SaveBody = {
  tableIdOrName: string;
  recordId: string;
  fields: Record<string, any>;
  lastSeenModifiedTime?: number | null;
};

export async function fetchInitialData(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/data`);
  const json = await res.json();
  return json.records || json.data || [];
}

export async function saveRecord(body: SaveBody) {
  const res = await fetch(`${API_BASE}/api/record`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const latest = await res.json();
    const err = new Error('Conflict');
    (err as any).latest = latest;
    throw err;
  }
  if (!res.ok) throw new Error('Failed to save');
  return res.json();
}

export type VisibilityRule = { tableId: string; fieldId: string; visibleToLP: boolean; visibleToPartners: boolean; notes?: string };

export async function listVisibilityRules(): Promise<VisibilityRule[]> {
  const res = await fetch(`${API_BASE}/api/visibility/rules`);
  if (!res.ok) return [];
  return res.json();
}

export async function upsertVisibilityRule(rule: VisibilityRule): Promise<VisibilityRule> {
  const res = await fetch(`${API_BASE}/api/visibility/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error('Failed to upsert rule');
  return res.json();
}

