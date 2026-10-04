"use client";

import { AnimatePresence, motion } from "motion/react";
import { springSnappy } from "../motion";

/** Círculo de "pagado" estilo Recordatorios; el check se dibuja al marcar. */
export function PaidCheck({ paid, onToggle, label }: { paid: boolean; onToggle: () => void; label: string }) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={paid}
      aria-label={label}
      onClick={onToggle}
      whileTap={{ scale: 0.8 }}
      transition={springSnappy}
      className="-m-2 flex size-11 shrink-0 items-center justify-center"
    >
      <span className="relative flex size-[26px] items-center justify-center">
        <span
          className={`absolute inset-0 rounded-full border-[1.5px] transition-colors duration-200 ${
            paid ? "border-transparent" : "border-label-3"
          }`}
        />
        <AnimatePresence initial={false}>
          {paid && (
            <motion.span
              className="absolute inset-0 flex items-center justify-center rounded-full bg-ios-green"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={springSnappy}
            >
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.28, delay: 0.06, ease: [0.3, 0.9, 0.3, 1] }}
                />
              </svg>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}
