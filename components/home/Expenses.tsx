"use client";

// "Gastos del mes" en Inicio: los 5 más recientes y un sheet con todos, agrupados por día.
// Tocar una fila abre el editor compartido; deslizar a la izquierda la elimina.
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { Currency, Expense } from "@/lib/types";
import { useOpenEditor } from "../edit/EditorProvider";
import { IconChevronRight } from "../Icons";
import { bogotaDateKey, dayHeading, expenseAccount, expenseTime, expenseWhen, todayKey } from "../format";
import { Sheet } from "../ui/Sheet";
import { SwipeRow } from "../ui/SwipeRow";
import { useDelete } from "./Rows";

export type ExpenseItem = { expense: Expense; amountBase: number };

const PREVIEW = 5;

export function ExpenseList({
  items,
  base,
  sourceNames,
  monthLabel,
}: {
  items: ExpenseItem[];
  base: Currency;
  sourceNames: Record<string, string>;
  /** "octubre" (para el título del sheet). */
  monthLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const openEditor = useOpenEditor();

  if (items.length === 0) {
    return (
      <p className="px-4 py-4 text-[15px] leading-5 text-label-2">
        Lo que pagas con débito o en efectivo se descuenta de tu disponible. Agrégalo con + (Gasto); las compras con
        débito que avisa el banco llegan solas.
      </p>
    );
  }

  const edit = (e: Expense) => {
    setOpen(false);
    openEditor({ kind: "gasto", item: e });
  };

  // Agrupado por día (los items ya vienen del más reciente al más antiguo).
  const today = todayKey();
  const days: { key: string; items: ExpenseItem[]; total: number }[] = [];
  for (const it of items) {
    const key = bogotaDateKey(it.expense.occurredAt ?? it.expense.createdAt);
    const last = days.at(-1);
    if (last && last.key === key) {
      last.items.push(it);
      last.total += it.amountBase;
    } else {
      days.push({ key, items: [it], total: it.amountBase });
    }
  }

  return (
    <>
      {items.slice(0, PREVIEW).map((it) => (
        <ExpenseRow
          key={it.expense.id}
          item={it}
          base={base}
          detail={[expenseWhen(it.expense), expenseAccount(it.expense, sourceNames)].filter(Boolean).join(" · ")}
          onEdit={() => edit(it.expense)}
        />
      ))}
      {items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 text-left text-[17px] text-ios-blue transition-colors active:bg-fill-2"
        >
          Ver todos ({items.length})
          <IconChevronRight className="size-4 shrink-0 text-label-3" />
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} label="Gastos del mes">
        <div data-sheet-handle className="flex shrink-0 items-center justify-between px-4 pb-2">
          <span className="min-w-[60px]" aria-hidden />
          <h2 className="truncate text-[17px] font-semibold">Gastos de {monthLabel}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 min-w-[60px] text-right text-[17px] font-semibold text-ios-blue"
          >
            Listo
          </button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),20px)]">
          {days.map((d, i) => (
            <section key={d.key} className={i === 0 ? "mt-2" : "mt-6"}>
              <div className="flex items-baseline justify-between px-4 pb-1.5">
                <h3 className="text-[13px] font-semibold text-label-2 uppercase">{dayHeading(d.key, today)}</h3>
                <span className="tnum text-[13px] text-label-2">{formatMoney(d.total, base)}</span>
              </div>
              <div className="group-list overflow-hidden rounded-[16px] bg-grouped-2">
                {d.items.map((it) => (
                  <ExpenseRow
                    key={it.expense.id}
                    item={it}
                    base={base}
                    detail={[expenseTime(it.expense), expenseAccount(it.expense, sourceNames)].filter(Boolean).join(" · ")}
                    onEdit={() => edit(it.expense)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function ExpenseRow({
  item,
  base,
  detail,
  onEdit,
}: {
  item: ExpenseItem;
  base: Currency;
  detail: string;
  onEdit: () => void;
}) {
  const remove = useDelete();
  const e = item.expense;
  return (
    <SwipeRow onDelete={() => remove("expense", e.id)}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${e.description}`}
        className="flex min-h-[56px] w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors active:bg-fill-2"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px]">{e.description}</div>
          {(detail || e.currency !== base) && (
            <div className="tnum truncate text-[13px] text-label-2">
              {[detail, e.currency !== base ? formatMoney(e.amount, e.currency) : ""].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div className="tnum shrink-0 text-[17px]">{formatMoney(item.amountBase, base)}</div>
        <IconChevronRight className="size-4 shrink-0 text-label-3" />
      </button>
    </SwipeRow>
  );
}
