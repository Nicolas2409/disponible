"use client";

import { addMonths, compareMonths, formatMonthShort } from "@/lib/month";
import type { MonthKey } from "@/lib/types";
import { IconChevronLeft, IconChevronRight } from "../Icons";

/** "oct 2026" */
export function monthChip(m: MonthKey) {
  return `${formatMonthShort(m)} ${m.slice(0, 4)}`;
}

/** Fila con etiqueta y selector de mes ‹ oct 2026 ›. */
export function MonthStepper({
  label,
  hint,
  value,
  onChange,
  min,
}: {
  label: string;
  hint?: string;
  value: MonthKey;
  onChange: (m: MonthKey) => void;
  min?: MonthKey;
}) {
  const canPrev = !min || compareMonths(addMonths(value, -1), min) >= 0;
  return (
    <div className="flex min-h-[50px] items-center justify-between gap-3 px-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[17px]">{label}</div>
        {hint && <div className="tnum text-[13px] text-label-2">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center rounded-[10px] bg-fill-2" role="group" aria-label={label}>
        <button
          type="button"
          aria-label={`${label}: mes anterior`}
          disabled={!canPrev}
          onClick={() => onChange(addMonths(value, -1))}
          className="flex h-9 w-9 items-center justify-center text-label active:opacity-50 disabled:opacity-25"
        >
          <IconChevronLeft className="size-4" />
        </button>
        <span className="tnum min-w-[78px] text-center text-[15px] font-semibold" aria-live="polite">
          {monthChip(value)}
        </span>
        <button
          type="button"
          aria-label={`${label}: mes siguiente`}
          onClick={() => onChange(addMonths(value, 1))}
          className="flex h-9 w-9 items-center justify-center text-label active:opacity-50"
        >
          <IconChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
