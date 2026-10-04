"use client";

import { motion } from "motion/react";
import { IconDelete } from "../Icons";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "000" | "," | "back";

/** Teclado numérico propio (evita el teclado del sistema para el monto). */
export function Keypad({ decimals, onKey }: { decimals: boolean; onKey: (k: KeypadKey) => void }) {
  const keys: KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimals ? "," : "000", "0", "back"];
  return (
    <div className="grid grid-cols-3 gap-1.5 px-3">
      {keys.map((k) => (
        <motion.button
          key={k}
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          onClick={() => onKey(k)}
          aria-label={k === "back" ? "Borrar" : k === "," ? "Coma decimal" : k}
          className="tnum flex h-[52px] items-center justify-center rounded-[14px] text-[26px] font-medium text-label transition-colors duration-150 active:bg-fill"
        >
          {k === "back" ? <IconDelete className="size-[26px]" /> : k}
        </motion.button>
      ))}
    </div>
  );
}
