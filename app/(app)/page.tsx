import { connection } from "next/server";
import { ExpenseList } from "@/components/home/Expenses";
import { HomeHero } from "@/components/home/HomeHero";
import { IncomeRow, ObligationRow } from "@/components/home/Rows";
import { WalletStack } from "@/components/home/WalletStack";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { Section } from "@/components/ui/Section";
import { getSummary, listPendingReview, listSources } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { currentMonth, formatMonth, isMonthKey } from "@/lib/month";

export default async function Home(props: PageProps<"/">) {
  await connection();
  const { m } = await props.searchParams;
  const month = typeof m === "string" && isMonthKey(m) ? m : currentMonth();
  const [s, review, sources] = await Promise.all([getSummary(month), listPendingReview(), listSources()]);
  const base = s.baseCurrency;

  const sourcesTotal = s.sources.reduce((acc, x) => acc + x.totalBase, 0);
  const obligationsTotal = s.obligations.reduce((acc, x) => acc + x.amountBase, 0);
  const sourceNames = Object.fromEntries(sources.map((x) => [x.id, x.name]));

  return (
    <main className="pb-tabbar mx-auto w-full max-w-[520px] px-4">
      <HomeHero
        data={{
          month: s.month,
          baseCurrency: base,
          income: s.income,
          committed: s.committed,
          spent: s.spent,
          available: s.available,
          pendingToPay: s.pendingToPay,
        }}
      />

      <ReviewBanner
        purchases={review.purchases}
        inbox={review.inbox}
        sources={sources.filter((x) => x.kind !== "debito")}
      />

      <Section
        title="Por pagar este mes"
        aside={s.sources.length > 0 ? formatMoney(sourcesTotal, base) : undefined}
        bare
        className="mt-10"
      >
        <WalletStack items={s.sources} month={s.month} />
      </Section>

      <Section
        title="Gastos del mes"
        aside={s.expenses.length > 0 ? formatMoney(s.spent, base) : undefined}
        footer={s.expenses.length > 0 ? "Con débito o efectivo. Toca un gasto para editarlo; desliza a la izquierda para eliminarlo." : undefined}
      >
        <ExpenseList
          items={s.expenses}
          base={base}
          sourceNames={sourceNames}
          monthLabel={formatMonth(s.month).split(" ")[0]}
        />
      </Section>

      <Section
        title="Obligaciones"
        aside={s.obligations.length > 0 ? formatMoney(obligationsTotal, base) : undefined}
        footer={s.obligations.length > 0 ? "Toca el círculo para marcar como pagado, o la fila para editarla. Desliza a la izquierda para eliminar." : undefined}
      >
        {s.obligations.length > 0 ? (
          s.obligations.map((o) => <ObligationRow key={o.obligation.id} item={o} month={s.month} base={base} />)
        ) : (
          <Empty text="Arriendo, hipoteca o plan de celular: agrégalos con + y se descontarán cada mes." />
        )}
      </Section>

      <Section
        title="Ingresos"
        aside={s.incomes.length > 0 ? formatMoney(s.income, base) : undefined}
        footer={s.incomes.length > 0 ? "Toca un ingreso para editarlo o eliminarlo." : undefined}
      >
        {s.incomes.length > 0 ? (
          s.incomes.map((i) => (
            <IncomeRow key={i.income.id} income={i.income} amountBase={i.amountBase} base={base} />
          ))
        ) : (
          <Empty text="Registra tu salario con + para saber cuánto te queda." />
        )}
      </Section>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-4 text-[15px] leading-5 text-label-2">{text}</p>;
}
