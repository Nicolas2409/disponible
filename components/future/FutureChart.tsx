"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { currentMonth, formatMonth, formatMonthShort } from "@/lib/month";
import type { Currency, MonthKey } from "@/lib/types";

const H = 180;

export function FutureChart({ points, currency }: { points: { month: MonthKey; value: number }[]; currency: Currency }) {
  const values = points.map((p) => p.value);
  const posMax = Math.max(0, ...values);
  const negMax = Math.max(0, ...values.map((v) => -v));
  const total = posMax + negMax || 1;
  const zero = (posMax / total) * H;
  const now = currentMonth();

  return (
    <div>
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 h-px bg-separator" style={{ top: zero }} aria-hidden />
        <div className="absolute inset-0 flex gap-[5px]">
          {points.map((p, i) => {
            const h = (Math.abs(p.value) / total) * H;
            const neg = p.value < 0;
            const isNow = p.month === now;
            return (
              <Link
                key={p.month}
                href={p.month === now ? "/" : `/?m=${p.month}`}
                aria-label={`${formatMonth(p.month)}: ${formatMoney(p.value, currency)}`}
                className="group relative flex-1 rounded-[6px] active:bg-fill-2"
              >
                <motion.span
                  className={`absolute inset-x-0 rounded-[6px] ${
                    neg ? "bg-ios-red" : isNow ? "bg-ios-blue" : "bg-ios-blue/40"
                  }`}
                  style={
                    neg
                      ? { top: zero, height: Math.max(h, 3), transformOrigin: "top" }
                      : { top: zero - Math.max(h, 3), height: Math.max(h, 3), transformOrigin: "bottom" }
                  }
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.1 + i * 0.045 }}
                />
              </Link>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[5px]" aria-hidden>
        {points.map((p) => (
          <span
            key={p.month}
            className={`flex-1 text-center text-[11px] font-semibold ${p.month === now ? "text-ios-blue" : "text-label-2"}`}
          >
            {formatMonthShort(p.month).charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
