"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { VisibilityRule } from "./types";

export type ColumnLayout = {
  order: string[];
  hidden: string[];
};

export type ColumnDescriptor = {
  normalizedId: string;
  label: string;
};

type Props = {
  tableId: string;
  columns: ColumnDescriptor[];
  layout: ColumnLayout;
  onLayoutChange: (layout: ColumnLayout) => void;
  rules: Record<string, VisibilityRule>;
  onRuleChange: (
    normalizedId: string,
    visibility: { visibleToLP: boolean; visibleToPartners: boolean }
  ) => Promise<void>;
};

type SortableItemProps = {
  id: string;
  children: React.ReactNode;
};

function SortableItem({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border bg-white shadow-sm transition ${
        isDragging ? "ring-2 ring-blue-200" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="cursor-grab rounded border bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            {...listeners}
            {...attributes}
          >
            ≡
          </button>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function ColumnManager({
  tableId,
  columns,
  layout,
  onLayoutChange,
  rules,
  onRuleChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pendingRule, setPendingRule] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columnMap = useMemo(() => {
    const map = new Map<string, ColumnDescriptor>();
    for (const col of columns) map.set(col.normalizedId, col);
    return map;
  }, [columns]);

  const allColumnIds = useMemo(() => columns.map((col) => col.normalizedId), [columns]);

  const hiddenSet = useMemo(() => new Set(layout.hidden || []), [layout.hidden]);

  const orderedIds = useMemo(() => layout.order.filter((id) => columnMap.has(id)), [layout.order, columnMap]);

  useEffect(() => {
    if (!open) setPendingRule(null);
  }, [open]);

  const toggleVisibility = (id: string) => {
    const nextHidden = new Set(hiddenSet);
    if (nextHidden.has(id)) nextHidden.delete(id);
    else nextHidden.add(id);
    onLayoutChange({ order: layout.order, hidden: Array.from(nextHidden) });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!active?.id || !over?.id || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!layout.order.includes(activeId) || !layout.order.includes(overId)) return;
    const nextOrder = arrayMove(layout.order, layout.order.indexOf(activeId), layout.order.indexOf(overId));
    onLayoutChange({ order: nextOrder, hidden: layout.hidden });
  };

  const makeRuleKey = (normalizedId: string) => `${tableId}:${normalizedId}`;

  const handleToggleAll = (visible: boolean) => {
    const nextHidden = new Set(layout.hidden || []);
    if (visible) {
      for (const id of allColumnIds) nextHidden.delete(id);
    } else {
      for (const id of allColumnIds) nextHidden.add(id);
    }
    onLayoutChange({ order: layout.order, hidden: Array.from(nextHidden) });
  };

  const handleRuleToggle = async (normalizedId: string, which: "lp" | "partners", value: boolean) => {
    const key = makeRuleKey(normalizedId);
    const current = rules[key];
    const nextVisibility = {
      visibleToLP: which === "lp" ? value : current?.visibleToLP ?? true,
      visibleToPartners: which === "partners" ? value : current?.visibleToPartners ?? true,
    };
    try {
      setPendingRule(normalizedId);
      await onRuleChange(normalizedId, nextVisibility);
    } catch (e) {
      console.error(e);
      alert("Failed to update visibility rule. Please try again.");
    } finally {
      setPendingRule(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className="rounded-lg border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-blue-50"
        onClick={() => setOpen(true)}
      >
        Columns
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
              <div className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-slate-900">Manage Columns</h2>
                <p className="text-sm text-slate-500">Arrange local columns and adjust LP/Partner visibility.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => handleToggleAll(true)}
                  >
                    Check all
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => handleToggleAll(false)}
                  >
                    Uncheck all
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
              <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
                <div className="flex flex-1 flex-col overflow-hidden">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Admin layout</h3>
                  <div className="flex-1 space-y-3 overflow-auto pr-1">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                        {orderedIds.map((id) => {
                          const col = columnMap.get(id);
                          if (!col) return null;
                          return (
                            <SortableItem id={id} key={id}>
                              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={!hiddenSet.has(id)}
                                  onChange={() => toggleVisibility(id)}
                                />
                                {col.label}
                              </label>
                            </SortableItem>
                          );
                        })}
                        {orderedIds.length === 0 && (
                          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                            No fields available.
                          </div>
                        )}
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>

                <div className="flex flex-1 flex-col overflow-hidden">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">LP / Partner visibility</h3>
                  <div className="flex-1 space-y-3 overflow-auto pr-1">
                    {orderedIds.map((id) => {
                      const col = columnMap.get(id);
                      if (!col) return null;
                      const key = makeRuleKey(id);
                      const rule = rules[key];
                      const isSaving = pendingRule === id;
                      return (
                        <div key={id} className="rounded-2xl border bg-white p-3 shadow-sm">
                          <div className="text-sm font-medium text-slate-800">{col.label}</div>
                          <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rule ? !!rule.visibleToLP : true}
                                onChange={(e) => handleRuleToggle(id, "lp", e.target.checked)}
                                disabled={isSaving}
                              />
                              <span>Visible to LPs</span>
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rule ? !!rule.visibleToPartners : true}
                                onChange={(e) => handleRuleToggle(id, "partners", e.target.checked)}
                                disabled={isSaving}
                              />
                              <span>Visible to Partners</span>
                            </label>
                            {isSaving && <span className="text-xs text-blue-500">Saving…</span>}
                          </div>
                        </div>
                      );
                    })}
                    {orderedIds.length === 0 && (
                      <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                        No fields available.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

