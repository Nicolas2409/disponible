import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ViewTransition } from "react";
import { EditSourceButton } from "@/components/source/EditSourceButton";
import { PaidToggle } from "@/components/source/PaidToggle";
import { PurchaseList } from "@/components/source/PurchaseList";
import { IconChevronLeft } from "@/components/Icons";
import { SourceCardFace } from "@/components/SourceCardFace";
import { cuotasLabel } from "@/components/format";
import { getSourceDetail, getSummary } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { currentMonth, formatMonth, isMonthKey } from "@/lib/month";

export default async function SourcePage(props: PageProps<"/fuente/[id]">) {
  await connection();
  const [{ id }, { m }] = await Promise.all([props.params, props.searchParams]);
  const sourceId = decodeURIComponent(id);
  const month = typeof m === "string" && isMonthKey(m) ? m : currentMonth();

  const [detail, summary] = await Promise.all([getSourceDetail(sourceId), getSummary(month)]);
  // Fuente inexistente (p.ej. recién eliminada desde su sheet de edición): volver al inicio.
  if (!detail) redirect("/");

  const { source, purchases } = detail;
  const sm = summary.sources.find((x) => x.source.id === source.id);
  const total = sm?.total ?? 0;
  const paid = sm?.paid ?? false;
  const backHref = month === currentMonth() ? "/" : `/?m=${month}`;

  const active = purchases.filter((p) => p.active);
  const upcoming = purchases.filter((p) => !p.active && p.installment === 0);
  const finished = purchases.filter((p) => !p.active && p.installment !== 0);

  return (
    <main className="pb-tabbar mx-auto w-full max-w-[520px] px-4">
      <nav className="pt-safe flex h-[52px] items-center justify-between">
        <Link
          href={backHref}
          className="-ml-2 flex h-11 items-center gap-0.5 pr-3 pl-1 text-[17px] text-ios-blue active:opacity-50"
        >
          <IconChevronLeft className="size-[22px]" />
          Inicio
        </Link>
        <EditSourceButton source={source} />
      </nav>

      <div className="mt-2">
        <ViewTransition name={`card-${source.id}`} share="morph" default="none">
          <SourceCardFace
            source={source}
            amount={formatMoney(total, source.currency)}
            paid={paid}
            detail={cuotasLabel(sm?.lines.length ?? 0)}
          />
        </ViewTransition>
      </div>

      <div className="mt-5">
        <PaidToggle targetId={source.id} month={month} paid={paid} monthLabel={formatMonth(month)} disabled={total <= 0} />
      </div>

      <PurchaseList
        active={active}
        upcoming={upcoming}
        finished={finished}
        currentMonthLabel={formatMonth(currentMonth())}
      />
    </main>
  );
}
