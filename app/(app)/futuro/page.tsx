import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { FutureChart } from "@/components/future/FutureChart";
import { IconChevronRight } from "@/components/Icons";
import { Section } from "@/components/ui/Section";
import { getRange } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { currentMonth, formatMonth } from "@/lib/month";

export const metadata: Metadata = { title: "Futuro · Disponible" };

export default async function FuturePage() {
  await connection();
  const now = currentMonth();
  const months = await getRange(now, 12);
  const base = months[0]?.baseCurrency ?? "COP";
  const avg = months.length ? months.reduce((a, m) => a + m.available, 0) / months.length : 0;
  const tightest = months.reduce<(typeof months)[number] | null>(
    (min, m) => (min === null || m.available < min.available ? m : min),
    null,
  );

  return (
    <main className="pb-tabbar mx-auto w-full max-w-[520px] px-4">
      <header className="pt-safe">
        <h1 className="display mt-3 text-[34px] leading-[41px] font-bold">Futuro</h1>
        <p className="mt-1 text-[15px] text-label-2">Lo que te queda cada mes, con las cuotas que ya tienes.</p>
      </header>

      <div className="mt-6 rounded-[var(--radius-group)] bg-grouped-2 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[13px] font-semibold text-label-2">Promedio mensual</div>
            <div className={`display tnum text-[28px] leading-9 font-bold ${avg < 0 ? "text-ios-red" : ""}`}>
              {formatMoney(avg, base)}
            </div>
          </div>
          {tightest && (
            <div className="text-right">
              <div className="text-[13px] font-semibold text-label-2">Mes más justo</div>
              <div className="text-[17px] leading-9 font-semibold capitalize">{formatMonth(tightest.month).split(" ")[0]}</div>
            </div>
          )}
        </div>
        <div className="mt-5">
          <FutureChart points={months.map((m) => ({ month: m.month, value: m.available }))} currency={base} />
        </div>
      </div>

      <Section title="Mes a mes">
        {months.map((m) => {
          const label = formatMonth(m.month);
          return (
            <Link
              key={m.month}
              href={m.month === now ? "/" : `/?m=${m.month}`}
              className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 active:bg-fill-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[17px] capitalize">{label}</div>
                <div className="tnum text-[13px] text-label-2">Comprometido {formatMoney(m.committed, base)}</div>
              </div>
              <div className={`tnum text-[17px] font-semibold ${m.available < 0 ? "text-ios-red" : ""}`}>
                {formatMoney(m.available, base)}
              </div>
              <IconChevronRight className="size-4 text-label-3" />
            </Link>
          );
        })}
      </Section>
    </main>
  );
}
