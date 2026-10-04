"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { deleteAction, markPaidAction, unmarkPaidAction } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/month";
import type { Currency, Income, MonthKey, ObligationMonth } from "@/lib/types";
import { useOpenEditor } from "../edit/EditorProvider";
import { IconChevronRight, IconRepeat } from "../Icons";
import { useToast } from "../Toast";
import { PaidCheck } from "../ui/PaidCheck";
import { SwipeRow } from "../ui/SwipeRow";

function useDelete() {
  const router = useRouter();
  const toast = useToast();
  return async (entity: "income" | "obligation" | "purchase" | "source" | "expense", id: string) => {
    try {
      await deleteAction(entity, id);
      router.refresh();
      toast({ message: "Eliminado" });
    } catch (e) {
      toast({ message: "No se pudo eliminar", tone: "error" });
      throw e;
    }
  };
}

export function ObligationRow({ item, month, base }: { item: ObligationMonth; month: MonthKey; base: Currency }) {
  const router = useRouter();
  const toast = useToast();
  const remove = useDelete();
  const openEditor = useOpenEditor();
  const [, startTransition] = useTransition();
  const [paid, setPaid] = useOptimistic(item.paid);
  const o = item.obligation;

  const toggle = () =>
    startTransition(async () => {
      const next = !paid;
      setPaid(next);
      try {
        if (next) await markPaidAction(o.id, month);
        else await unmarkPaidAction(o.id, month);
        router.refresh();
      } catch {
        toast({ message: "No se pudo actualizar", tone: "error" });
      }
    });

  return (
    <SwipeRow onDelete={() => remove("obligation", o.id)}>
      <div className="flex min-h-[60px] items-center pl-4">
        <PaidCheck paid={paid} onToggle={toggle} label={`${o.name} pagado`} />
        <button
          type="button"
          onClick={() => openEditor({ kind: "obligacion", item: o })}
          aria-label={`Editar ${o.name}`}
          className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors active:bg-fill-2"
        >
          <div className="min-w-0 flex-1">
            <div className={`truncate text-[17px] transition-colors duration-300 ${paid ? "text-label-2" : "text-label"}`}>
              {o.name}
            </div>
            {o.currency !== base && (
              <div className="tnum text-[13px] text-label-2">{formatMoney(o.amount, o.currency)}</div>
            )}
          </div>
          <div className={`tnum text-[17px] transition-colors duration-300 ${paid ? "text-label-2 line-through decoration-label-3" : ""}`}>
            {formatMoney(item.amountBase, base)}
          </div>
          <IconChevronRight className="size-4 shrink-0 text-label-3" />
        </button>
      </div>
    </SwipeRow>
  );
}

export function IncomeRow({
  income,
  amountBase,
  base,
}: {
  income: Income;
  amountBase: number;
  base: Currency;
}) {
  const remove = useDelete();
  const openEditor = useOpenEditor();
  return (
    <SwipeRow onDelete={() => remove("income", income.id)}>
      <button
        type="button"
        onClick={() => openEditor({ kind: "ingreso", item: income })}
        aria-label={`Editar ${income.description}`}
        className="flex min-h-[56px] w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors active:bg-fill-2"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px]">{income.description}</div>
          <div className="flex items-center gap-1 text-[13px] text-label-2">
            {income.recurring ? (
              <>
                <IconRepeat className="size-3.5" /> {income.endMonth ? `Cada mes, hasta ${formatMonth(income.endMonth)}` : "Cada mes"}
              </>
            ) : (
              "Solo este mes"
            )}
          </div>
        </div>
        <div className="tnum text-[17px] text-ios-green">+{formatMoney(amountBase, base)}</div>
        <IconChevronRight className="size-4 shrink-0 text-label-3" />
      </button>
    </SwipeRow>
  );
}

export { useDelete };
