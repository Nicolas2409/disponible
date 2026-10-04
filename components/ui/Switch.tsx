"use client";

import { motion } from "motion/react";
import { spring } from "../motion";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 ${
        checked ? "justify-end bg-ios-green" : "justify-start bg-fill"
      }`}
    >
      <motion.span
        layout
        transition={spring}
        className="block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)]"
      />
    </button>
  );
}
