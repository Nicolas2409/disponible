"use client";

import { AnimatePresence, motion } from "motion/react";
import { formatMoney } from "@/lib/money";

export function currencySymbol(currency: string) {
  return formatMoney(0, currency).replace(/[\d.,\s ]+/g, "").trim() || currency;
}

/** "1250000,5" → "1.250.000,5" */
export function groupAmount(raw: string) {
  const [int, dec] = raw.split(",");
  const grouped = (int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec !== undefined ? `${grouped},${dec}` : grouped;
}

/** Monto grande; cada carácter nuevo entra con un pequeño resorte. */
export function AmountDisplay({ raw, currency }: { raw: string; currency: string }) {
  const empty = raw === "";
  const text = groupAmount(raw);
  const chars = Array.from(text);
  const size = chars.length > 11 ? 40 : chars.length > 8 ? 48 : 58;

  return (
    <div
      className={`display tnum flex items-baseline justify-center font-bold whitespace-nowrap transition-[font-size] duration-200 ${
        empty ? "text-label-3" : "text-label"
      }`}
      style={{ fontSize: size, lineHeight: 1.1 }}
      aria-live="polite"
    >
      <span className="mr-1.5 text-[0.55em] font-semibold text-label-2">{currencySymbol(currency)}</span>
      <AnimatePresence initial={false} mode="popLayout">
        {chars.map((c, i) => (
          <motion.span
            key={`${i}-${c === "." ? "sep" : "c"}`}
            layout="position"
            initial={{ opacity: 0, y: 14, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="inline-block"
          >
            {c}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
