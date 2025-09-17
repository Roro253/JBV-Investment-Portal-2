import type { ReactNode } from "react";

import type { ExpandedRecord } from "@/lib/airtable";

interface HoldingsTableProps {
  records: ExpandedRecord[];
  columnKeys: string[];
  renderValue: (key: string, value: any) => ReactNode;
}

function isLinkedValue(value: any) {
  return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object" && "displayName" in value[0];
}

export function HoldingsTable({ records, columnKeys, renderValue }: HoldingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-100/80">
          <tr>
            {columnKeys.map((key) => (
              <th
                key={key}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {records.map((record) => {
            const fields = record.fields || {};
            return (
              <tr key={record.id} className="hover:bg-blue-50/40">
                {columnKeys.map((key) => {
                  const value = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : undefined;
                  const content = renderValue(key, value);

                  if (isLinkedValue(value)) {
                    return (
                      <td key={key} className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                        <div className="flex flex-wrap gap-2">
                          {(value as any[]).map((item: any) => (
                            <span
                              key={item.id || item.displayName || item.name}
                              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                            >
                              {item.displayName || item.name || item.id}
                            </span>
                          ))}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={key} className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                      <span>{content}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
