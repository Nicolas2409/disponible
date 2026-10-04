"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { markPaidAction, unmarkPaidAction } from "@/app/actions";
import { IconCheck } from "../Icons";
import { spring } from "../motion";
import { useToast } from "../Toast";

export function PaidToggle({
  targetId,
  month,
  paid: paidProp,
  monthLabel,
  disabled,
}: {
  targetId: string;
  month: string;
  paid: boolean;
  monthLabel: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [paid, setPaid] = useOptimistic(paidProp);

  const toggle = () =>
    startTransition(async () => {
      const next = !paid;
      setPaid(next);
      try {
        if (next) await markPaidAction(targetId, month);
        else await unmarkPaidAction(targetId, month);
        router.refresh();
        if (next) toast({ message: "Marcado como pagado" });
      } catch {
        toast({ message: "No se pudo actualizar", tone: "error" });
      }
    });

  if (disabled && !paid) {
    return (
      <p className="rounded-[16px] bg-grouped-2 px-4 py-3.5 text-center text-[15px] text-label-2">
        Nada por pagar en {monthLabel}
      </p>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      aria-pressed={paid}
      className={`relative flex h-[54px] w-full items-center justify-center gap-2 overflow-hidden rounded-full text-[17px] font-semibold transition-colors duration-300 ${
        paid ? "bg-ios-green/15 text-ios-green" : "bg-ios-blue text-white"
      }`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={paid ? "paid" : "unpaid"}
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={spring}
          className="flex items-center gap-2"
        >
          {paid ? (
            <>
              <IconCheck className="size-5" /> Pagado en {monthLabel.split(" ")[0]}
            </>
          ) : (
            <>Marcar como pagado</>
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
