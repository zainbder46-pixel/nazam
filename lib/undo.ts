"use client";

/** سجل التراجع: كل إجراء مهم يضيف خطوة ترجعه، و«تراجع» أو Ctrl+Z يرجع آخر خطوة */
export type Celebration = { title: string; recurring: boolean; next: string | null; x?: number; y?: number };
type UndoItem = { label: string; run: () => Promise<void> };

const stack: UndoItem[] = [];

export function pushUndo(label: string, run: () => Promise<void>, celebrate?: Celebration) {
  stack.push({ label, run });
  if (stack.length > 20) stack.shift();
  window.dispatchEvent(new CustomEvent("nz:action", { detail: { label, celebrate } }));
}

export const canUndo = () => stack.length > 0;

export async function undoLast() {
  const item = stack.pop();
  if (!item) return false;
  await item.run();
  window.dispatchEvent(new CustomEvent("nz:undone", { detail: { label: item.label } }));
  refresh();
  return true;
}

/** يطلب من الصفحات تعيد تحميل المهام والقوائم */
export const refresh = () => window.dispatchEvent(new CustomEvent("nz:refresh"));
