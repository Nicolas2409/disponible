// Funciones PURAS de cálculo (sin IO). Seguras para cliente y servidor.
import { convert } from "./convert";
import { addMonths, compareMonths, monthDiff } from "./month";
import type {
  Db,
  Expense,
  Income,
  InstallmentLine,
  MonthKey,
  MonthSummary,
  Obligation,
  ObligationMonth,
  Purchase,
  Rates,
  SourceMonth,
} from "./types";

/**
 * Valor de cada cuota (en la moneda de la compra).
 * Sin interés: amount / installments. Con `monthlyRate` > 0: cuota fija
 * por amortización francesa  P·r / (1 − (1+r)^−n).
 */
export function installmentAmount(p: Purchase): number {
  const n = Math.max(1, Math.floor(p.installments));
  const r = p.monthlyRate ?? 0;
  if (r > 0) return (p.amount * r) / (1 - Math.pow(1 + r, -n));
  return p.amount / n;
}

/** Mes de la última cuota. */
export function lastInstallmentMonth(p: Purchase): MonthKey {
  return addMonths(p.firstMonth, Math.max(1, Math.floor(p.installments)) - 1);
}

/** Cuota que corresponde a `month`, o null si la compra no tiene cuota ese mes. */
export function installmentFor(
  p: Purchase,
  month: MonthKey,
): { number: number; of: number; amount: number } | null {
  const of = Math.max(1, Math.floor(p.installments));
  const number = monthDiff(p.firstMonth, month) + 1;
  if (number < 1 || number > of) return null;
  return { number, of, amount: installmentAmount(p) };
}

/** ¿La obligación aplica en `month`? */
export function obligationActive(o: Obligation, month: MonthKey): boolean {
  if (compareMonths(month, o.startMonth) < 0) return false;
  if (o.endMonth && compareMonths(month, o.endMonth) > 0) return false;
  return true;
}

/** ¿El ingreso aplica en `month`? Recurrente: entre month y endMonth; único: solo su mes. */
export function incomeActive(i: Income, month: MonthKey): boolean {
  if (!i.recurring) return i.month === month;
  if (compareMonths(month, i.month) < 0) return false;
  if (i.endMonth && compareMonths(month, i.endMonth) > 0) return false;
  return true;
}

export function isPaid(db: Pick<Db, "payments">, targetId: string, month: MonthKey): boolean {
  return db.payments.some((p) => p.targetId === targetId && p.month === month);
}

/** Resumen de un mes: ingresos − (cuotas + obligaciones) − gastos, todo en moneda base. */
export function summarizeMonth(db: Db, month: MonthKey, rates: Rates): MonthSummary {
  const base = db.settings.baseCurrency;

  // Fuentes y sus cuotas
  const sources: SourceMonth[] = [];
  for (const source of db.sources) {
    if (source.kind === "debito") continue; // las cuentas de débito no tienen cuotas por pagar
    const lines: InstallmentLine[] = [];
    for (const p of db.purchases) {
      if (p.sourceId !== source.id) continue;
      const inst = installmentFor(p, month);
      if (!inst) continue;
      lines.push({
        purchaseId: p.id,
        description: p.description,
        number: inst.number,
        of: inst.of,
        amount: inst.amount,
        currency: p.currency,
        amountBase: convert(inst.amount, p.currency, base, rates),
      });
    }
    const total = lines.reduce((s, l) => s + convert(l.amount, l.currency, source.currency, rates), 0);
    if (total <= 0) continue;
    const totalBase = lines.reduce((s, l) => s + l.amountBase, 0);
    sources.push({ source, lines, total, totalBase, paid: isPaid(db, source.id, month) });
  }
  sources.sort((a, b) => b.totalBase - a.totalBase);

  // Obligaciones fijas
  const obligations: ObligationMonth[] = db.obligations
    .filter((o) => obligationActive(o, month))
    .map((obligation) => ({
      obligation,
      amountBase: convert(obligation.amount, obligation.currency, base, rates),
      paid: isPaid(db, obligation.id, month),
    }));

  // Ingresos
  const incomes = db.incomes
    .filter((i) => incomeActive(i, month))
    .map((income) => ({ income, amountBase: convert(income.amount, income.currency, base, rates) }));

  // Gastos con débito/efectivo del mes (más recientes primero)
  const when = (e: Expense) => e.occurredAt ?? e.createdAt;
  const expenses = db.expenses
    .filter((e) => e.month === month)
    .sort((a, b) => when(b).localeCompare(when(a)))
    .map((expense) => ({ expense, amountBase: convert(expense.amount, expense.currency, base, rates) }));
  const spent = expenses.reduce((s, e) => s + e.amountBase, 0);

  const income = incomes.reduce((s, i) => s + i.amountBase, 0);
  const committed =
    sources.reduce((s, x) => s + x.totalBase, 0) + obligations.reduce((s, x) => s + x.amountBase, 0);
  const pendingToPay =
    sources.reduce((s, x) => s + (x.paid ? 0 : x.totalBase), 0) +
    obligations.reduce((s, x) => s + (x.paid ? 0 : x.amountBase), 0);

  return {
    month,
    baseCurrency: base,
    income,
    committed,
    spent,
    available: income - committed - spent,
    pendingToPay,
    sources,
    obligations,
    incomes,
    expenses,
  };
}

/** `count` resúmenes consecutivos empezando en `from`. */
export function summarizeRange(db: Db, from: MonthKey, count: number, rates: Rates): MonthSummary[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    summarizeMonth(db, addMonths(from, i), rates),
  );
}
