"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { updateSettingsAction } from "@/app/actions";
import type { Settings } from "@/lib/types";
import { IconCheck } from "../Icons";
import { springSnappy } from "../motion";
import { useToast } from "../Toast";

const NAMES: Record<string, string> = {
  COP: "Peso colombiano",
  USD: "Dólar estadounidense",
  EUR: "Euro",
  MXN: "Peso mexicano",
};

export function CurrencyPicker({ settings }: { settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [base, setBase] = useOptimistic(settings.baseCurrency);
  const options = Array.from(new Set([...settings.currencies, "COP", "USD", "EUR"]));

  const pick = (c: string) => {
    if (c === base) return;
    startTransition(async () => {
      setBase(c);
      try {
        await updateSettingsAction({
          baseCurrency: c,
          currencies: Array.from(new Set([c, ...settings.currencies])),
        });
        router.refresh();
      } catch {
        toast({ message: "No se pudo cambiar la moneda", tone: "error" });
      }
    });
  };

  return (
    <>
      {options.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === base}
          onClick={() => pick(c)}
          className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-fill-2"
        >
          <span className="tnum w-11 text-[15px] font-semibold text-label-2">{c}</span>
          <span className="flex-1 text-[17px]">{NAMES[c] ?? c}</span>
          <AnimatePresence initial={false}>
            {c === base && (
              <motion.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={springSnappy}
                className="text-ios-blue"
              >
                <IconCheck className="size-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      ))}
    </>
  );
}
