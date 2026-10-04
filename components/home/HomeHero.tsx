"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import { addMonths, compareMonths, currentMonth, formatMonth } from "@/lib/month";
import type { MonthSummary } from "@/lib/types";
import { IconChevronLeft, IconChevronRight } from "../Icons";
import { NumberRoll } from "../NumberRoll";
import { spring, springSoft } from "../motion";

type HeroData = Pick<MonthSummary, "month" | "baseCurrency" | "income" | "committed" | "spent" | "available" | "pendingToPay">;

/** Cabecera de Inicio: paginador de meses (deslizar o chevrons) + número disponible + barra. */
export function HomeHero({ data }: { data: HeroData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [prevMonth, setPrevMonth] = useState(data.month);
  const [dir, setDir] = useState(1);
  if (prevMonth !== data.month) {
    setDir(compareMonths(data.month, prevMonth) >= 0 ? 1 : -1);
    setPrevMonth(data.month);
  }

  const go = (delta: number) => {
    const target = addMonths(data.month, delta);
    startTransition(() => router.push(target === currentMonth() ? "/" : `/?m=${target}`, { scroll: false }));
  };

  const [name, year] = splitMonth(formatMonth(data.month));
  const isCurrent = data.month === currentMonth();
  const negative = data.available < 0;
  const fmt = (n: number) => formatMoney(n, data.baseCurrency, { compact: Math.abs(n) >= 10_000_000 });

  // Barra: pagado (verde) → por pagar (naranja) → gastos (índigo), sobre los ingresos.
  const used = data.committed + data.spent;
  const base = Math.max(data.income, used, 1);
  const paid = Math.max(0, data.committed - data.pendingToPay);
  const fracPaid = paid / base;
  const fracCommitted = data.committed / base;
  const fracUsed = used / base;

  const len = formatMoney(data.available, data.baseCurrency).length;
  const heroSize = len > 14 ? 40 : len > 12 ? 46 : len > 10 ? 54 : 62;

  return (
    <motion.div
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      dragSnapToOrigin
      style={{ touchAction: "pan-y" }}
      onDragEnd={(_, info) => {
        if (info.offset.x < -60 || info.velocity.x < -500) go(1);
        else if (info.offset.x > 60 || info.velocity.x > 500) go(-1);
      }}
      className="pt-safe select-none"
    >
      <header className="flex items-end justify-between pt-3">
        <div className="relative h-[64px] min-w-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={data.month}
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d * 60, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -60, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring}
              className="absolute inset-x-0 bottom-0"
            >
              <div className="tnum text-[15px] leading-5 font-semibold text-label-2">{year}</div>
              <h1 className="display truncate text-[34px] leading-[41px] font-bold">{name}</h1>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mb-1 flex shrink-0 items-center gap-2">
          <AnimatePresence>
            {!isCurrent && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={spring}
                onClick={() => startTransition(() => router.push("/", { scroll: false }))}
                className="h-9 rounded-full bg-fill-2 px-3.5 text-[15px] font-semibold text-ios-blue"
              >
                Hoy
              </motion.button>
            )}
          </AnimatePresence>
          <PagerButton label="Mes anterior" onClick={() => go(-1)}>
            <IconChevronLeft className="size-[18px]" />
          </PagerButton>
          <PagerButton label="Mes siguiente" onClick={() => go(1)}>
            <IconChevronRight className="size-[18px]" />
          </PagerButton>
        </div>
      </header>

      <div className={`mt-7 transition-opacity duration-300 ${isPending ? "opacity-60" : "opacity-100"}`}>
        <div className="text-[15px] font-semibold text-label-2">Disponible</div>
        <div
          className={`display mt-1 font-bold transition-colors duration-500 ${negative ? "text-ios-red" : "text-label"}`}
          style={{ fontSize: heroSize, lineHeight: 1.05, letterSpacing: "-0.045em" }}
        >
          <NumberRoll value={data.available} currency={data.baseCurrency} />
        </div>
        <p className="tnum mt-2 text-[15px] text-label-2">
          {data.pendingToPay > 0
            ? `Te faltan ${formatMoney(data.pendingToPay, data.baseCurrency)} por pagar`
            : data.committed > 0
              ? "Todo pagado este mes"
              : data.income > 0
                ? "Sin pagos comprometidos"
                : "Agrega tus ingresos con el botón +"}
        </p>

        <div
          className="relative mt-6 h-3 overflow-hidden rounded-full bg-fill-2"
          role="img"
          aria-label={`Comprometido ${fmt(data.committed)} y gastos ${fmt(data.spent)} de ${fmt(data.income)} de ingresos`}
        >
          <motion.div
            className={`absolute inset-0 origin-left rounded-full ${negative ? "bg-ios-red/70" : "bg-ios-indigo"}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: fracUsed }}
            transition={{ ...springSoft, delay: 0.1 }}
          />
          <motion.div
            className={`absolute inset-0 origin-left rounded-full ${negative ? "bg-ios-red" : "bg-ios-orange"}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: fracCommitted }}
            transition={{ ...springSoft, delay: 0.15 }}
          />
          <motion.div
            className="absolute inset-0 origin-left rounded-full bg-ios-green"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: fracPaid }}
            transition={{ ...springSoft, delay: 0.3 }}
          />
        </div>
        <dl className="tnum mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
          <Legend color="bg-ios-green" label="Pagado" value={fmt(paid)} />
          <Legend color={negative ? "bg-ios-red" : "bg-ios-orange"} label="Por pagar" value={fmt(data.pendingToPay)} />
          <Legend color={negative ? "bg-ios-red/70" : "bg-ios-indigo"} label="Gastos" value={fmt(data.spent)} />
          <Legend color="bg-fill" label="Ingresos" value={fmt(data.income)} />
        </dl>
      </div>
    </motion.div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-label-2">
        <span className={`size-2 shrink-0 rounded-full ${color}`} />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold text-label">{value}</dd>
    </div>
  );
}

function PagerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      transition={spring}
      className="flex size-9 items-center justify-center rounded-full bg-fill-2 text-label"
    >
      {children}
    </motion.button>
  );
}

function splitMonth(s: string): [string, string] {
  const i = s.lastIndexOf(" ");
  const name = i > 0 ? s.slice(0, i) : s;
  return [name.charAt(0).toUpperCase() + name.slice(1), i > 0 ? s.slice(i + 1) : ""];
}
