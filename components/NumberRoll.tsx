"use client";

import { AnimatePresence, motion } from "motion/react";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/types";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const CELL = 1.1; // em

/**
 * Número tipo "odómetro": cada dígito es una columna 0–9 que se desliza con resorte.
 * Las posiciones se indexan desde la derecha para que unidades, miles, etc. conserven identidad.
 */
export function NumberRoll({
  value,
  currency,
  className,
}: {
  value: number;
  currency: Currency;
  className?: string;
}) {
  const text = formatMoney(value, currency);
  const chars = Array.from(text);
  const n = chars.length;

  return (
    <span className={`tnum inline-flex items-start whitespace-nowrap ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      <AnimatePresence initial={false} mode="popLayout">
        {chars.map((ch, i) => {
          const pos = n - i; // 1 = carácter más a la derecha
          const isDigit = ch >= "0" && ch <= "9";
          return (
            <motion.span
              key={`${isDigit ? "d" : "s"}-${pos}`}
              layout="position"
              initial={{ opacity: 0, y: "-0.3em" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "0.3em" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="inline-block"
              aria-hidden
            >
              {isDigit ? <Digit d={Number(ch)} pos={pos} /> : <span className="inline-block" style={{ lineHeight: `${CELL}em`, whiteSpace: "pre" }}>{ch}</span>}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

function Digit({ d, pos }: { d: number; pos: number }) {
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: `${CELL}em` }}>
      <motion.span
        className="block"
        initial={{ y: 0 }}
        animate={{ y: `${-d * CELL}em` }}
        transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.9, delay: Math.min(pos, 10) * 0.025 }}
      >
        {DIGITS.map((x) => (
          <span key={x} className="block text-center" style={{ height: `${CELL}em`, lineHeight: `${CELL}em` }}>
            {x}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
