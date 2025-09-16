"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ColumnLayoutState } from "@/lib/fields";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export type VisibilityRule = {
  id?: string;
  tableId: string;
  fieldId: string;
  visibleToLP: boolean;
  visibleToPartners: boolean;
  notes?: string;
};

export type ColumnManagerColumn = {
  key: string;
  label: string;
  fieldIds: string[];
};

type Props = {
  tableId: string;
  layout: ColumnLayoutState;
  onLayoutChange: (layout: ColumnLayoutState) => void;
  columns: ColumnManagerColumn[];
  rules: Record<string, VisibilityRule>;
  onChangeRules: (next: Record<string, VisibilityRule>) => void;
};

type PendingMap = Record<string, boolean>;

type VisibilityTarget = "lp" | "partners";

function SortableRow({
  column,
  visible,
  onToggle,
}: {
  column: ColumnManagerColumn;
  visible: boolean;
  onToggle: (columnKey: string, next: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.key });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab rounded border bg-white px-2 py-1 text-xs uppercase tracking-wide text-gray-500"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${column.label}`}
      >
        Drag
      </button>
      <div className="flex-1 text-sm font-medium text-slate-700">{column.label}</div>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => onToggle(column.key, e.target.checked)}
        />
        Visible
      </label>
    </div>
  );
}

export default function ColumnManager({
  tableId,
  layout,
  onLayoutChange,
  columns,
  rules,
  onChangeRules,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingMap>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columnsByKey = useMemo(() => {
    const map = new Map<string, ColumnManagerColumn>();
    for (const col of columns) map.set(col.key, col);
    return map;
  }, [columns]);

  const orderedKeys = useMemo(() => {
    const knownKeys = layout.order.filter((key) => columnsByKey.has(key));
    const extras = columns.filter((col) => !knownKeys.includes(col.key)).map((col) => col.key);
    return [...knownKeys, ...extras];
  }, [layout.order, columns, columnsByKey]);

  function handleToggleVisible(columnKey: string, next: boolean) {
    const hidden = { ...layout.hidden, [columnKey]: !next };
    onLayoutChange({ ...layout, hidden });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKeys.indexOf(String(active.id));
    const newIndex = orderedKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const nextOrder = arrayMove(orderedKeys, oldIndex, newIndex);
    onLayoutChange({ ...layout, order: nextOrder });
  }

  const visibilityItems = useMemo(() => {
    return orderedKeys
      .map((key) => {
        const column = columnsByKey.get(key);
        if (!column) return null;
        const primaryFieldId = column.fieldIds[0];
        const ruleKey = primaryFieldId ? `${tableId}:${primaryFieldId}` : null;
        const existing = ruleKey ? rules[ruleKey] : undefined;
        const defaults: VisibilityRule = {
          tableId,
          fieldId: primaryFieldId || column.label,
          visibleToLP: true,
          visibleToPartners: true,
        };
        return {
          column,
          ruleKey,
          rule: existing || defaults,
        };
      })
      .filter(Boolean) as { column: ColumnManagerColumn; ruleKey: string | null; rule: VisibilityRule }[];
  }, [orderedKeys, columnsByKey, rules, tableId]);

  async function toggleVisibilityRule(
    column: ColumnManagerColumn,
    target: VisibilityTarget,
    value: boolean
  ) {
    const fieldId = column.fieldIds[0];
    if (!fieldId) return;
    const ruleKey = `${tableId}:${fieldId}`;
    const existing = rules[ruleKey];
    const nextRule: VisibilityRule = {
      id: existing?.id,
      tableId,
      fieldId,
      visibleToLP: target === "lp" ? value : existing?.visibleToLP ?? true,
      visibleToPartners: target === "partners" ? value : existing?.visibleToPartners ?? true,
      notes: existing?.notes,
    };

    setPending((prev) => ({ ...prev, [ruleKey]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/visibility/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextRule),
      });
      if (!res.ok) throw new Error("Failed to save visibility rule");
      const saved: VisibilityRule = await res.json();
      onChangeRules({ ...rules, [ruleKey]: saved });
    } catch (err) {
      console.error("Failed to toggle visibility rule", err);
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[ruleKey];
        return next;
      });
    }
  }

  return (
    <>
      <button
        type="button"
        className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-blue-50"
        onClick={() => setOpen(true)}
      >
        Columns
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-[520px] flex-col border-l bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-[#2563EB]" aria-hidden />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Columns · {tableId}</h2>
                  <p className="text-xs text-slate-500">Control Admin layout & LP/Partner visibility</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs font-medium text-slate-600"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="flex flex-1 divide-x">
              <div className="flex w-1/2 flex-col p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Admin Layout
                </div>
                <div className="flex-1 space-y-3 overflow-auto pr-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
                      {orderedKeys.map((key) => {
                        const column = columnsByKey.get(key);
                        if (!column) return null;
                        const visible = !layout.hidden[key];
                        return (
                          <SortableRow
                            key={column.key}
                            column={column}
                            visible={visible}
                            onToggle={handleToggleVisible}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>

              <div className="flex w-1/2 flex-col p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  LP / Partner Visibility
                </div>
                <div className="flex-1 space-y-3 overflow-auto pl-2">
                  {visibilityItems.map(({ column, ruleKey, rule }) => {
                    const disabled = !column.fieldIds[0];
                    const busy = !!(ruleKey && pending[ruleKey]);
                    return (
                      <div
                        key={column.key}
                        className="rounded-xl border bg-white p-3 shadow-sm"
                      >
                        <div className="text-sm font-medium text-slate-800">{column.label}</div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={disabled || busy}
                              checked={!!rule.visibleToLP}
                              onChange={(e) => toggleVisibilityRule(column, "lp", e.target.checked)}
                            />
                            <span>Visible to LP</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={disabled || busy}
                              checked={!!rule.visibleToPartners}
                              onChange={(e) => toggleVisibilityRule(column, "partners", e.target.checked)}
                            />
                            <span>Visible to Partners</span>
                          </label>
                          {busy && <span className="text-blue-500">Saving…</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
