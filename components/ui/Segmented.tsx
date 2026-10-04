"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { spring } from "../motion";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" className={`flex h-9 rounded-[10px] bg-fill-2 p-[2px] ${className ?? ""}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="relative flex-1 rounded-[8px] text-[14px] font-semibold"
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className="absolute inset-0 rounded-[8px] bg-grouped-2 shadow-[0_2px_8px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:bg-[#636366]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
