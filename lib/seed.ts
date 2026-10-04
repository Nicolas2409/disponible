import { addMonths, currentMonth } from "./month";
import type { Db, Expense, MonthKey, Purchase } from "./types";

/**
 * Datos de ejemplo (ficticios) para probar la app en local sin base de datos.
 * Meses y fechas son relativos al momento actual, así la demo siempre se ve "viva".
 */
export function createSeed(now: MonthKey = currentMonth()): Db {
  const at = new Date().toISOString();
  const m = (n: number) => addMonths(now, n);

  /** Fecha ISO de hace `days` días a la hora indicada (hora de Bogotá, UTC−5). */
  const ago = (days: number, hh: number, mm: number) => {
    const d = new Date(Date.now() - 5 * 3600_000); // "hoy" en Bogotá
    d.setUTCDate(d.getUTCDate() - days);
    d.setUTCHours(hh + 5, mm, 0, 0);
    return d.toISOString();
  };
  /** Mes (YYYY-MM) de una fecha ISO en hora de Bogotá. */
  const monthOf = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 7);

  const purchase = (
    id: string,
    sourceId: string,
    description: string,
    amount: number,
    currency: string,
    installments: number,
    firstMonth: string,
    extra: Partial<Purchase> = {},
  ): Purchase => ({ id, sourceId, description, amount, currency, installments, firstMonth, createdAt: at, ...extra });

  const expense = (
    id: string,
    description: string,
    amount: number,
    occurredAt: string,
    extra: Partial<Expense> = {},
  ): Expense => ({
    id,
    description,
    amount,
    currency: "COP",
    month: monthOf(occurredAt),
    occurredAt,
    createdAt: at,
    ...extra,
  });

  // Gastos de días pasados que caigan dentro del mes actual (la demo no muestra gastos de otro mes).
  const day = new Date(Date.now() - 5 * 3600_000).getUTCDate();
  const recent = (days: number) => Math.min(days, day - 1);

  return {
    settings: { baseCurrency: "COP", currencies: ["COP", "USD"] },
    sources: [
      { id: "src_visa", name: "Visa Bancolombia", kind: "tarjeta", currency: "COP", color: "#1c1c1e", cutDay: 15, dueDay: 30, last4: "4321", createdAt: at },
      { id: "src_nu", name: "Nu", kind: "tarjeta", currency: "COP", color: "#820ad1", cutDay: 22, dueDay: 7, last4: "1111", createdAt: at },
      { id: "src_master", name: "Mastercard", kind: "tarjeta", currency: "COP", color: "#c8102e", cutDay: 5, dueDay: 20, last4: "5678", createdAt: at },
      { id: "src_amex", name: "Amex", kind: "tarjeta", currency: "USD", color: "#0f7c8a", cutDay: 25, dueDay: 10, createdAt: at },
      { id: "src_debito", name: "Cuenta de ahorros", kind: "debito", currency: "COP", color: "#34c759", last4: "8765", createdAt: at },
    ],
    purchases: [
      purchase("pur_portatil", "src_visa", "Portátil", 4_800_000, "COP", 12, m(-4)),
      purchase("pur_tiquetes", "src_visa", "Tiquetes Cartagena", 1_800_000, "COP", 6, m(-2)),
      purchase("pur_mercado", "src_visa", "Mercado", 380_000, "COP", 1, m(0), {
        origin: "correo",
        merchant: "EXITO CALLE 80",
        occurredAt: ago(recent(3), 18, 42),
        externalId: "demo-correo-1",
        needsReview: true,
      }),
      purchase("pur_celular", "src_nu", "Celular", 2_400_000, "COP", 12, m(-3)),
      purchase("pur_bici", "src_nu", "Bicicleta", 1_350_000, "COP", 6, m(-1), { origin: "applepay", merchant: "DECATHLON" }),
      purchase("pur_streaming", "src_nu", "Suscripciones", 89_900, "COP", 1, m(0), {
        origin: "sms",
        merchant: "SPOTIFY",
        occurredAt: ago(recent(1), 9, 15),
        externalId: "demo-sms-1",
      }),
      purchase("pur_nevera", "src_master", "Nevera", 3_200_000, "COP", 24, m(-8), { monthlyRate: 0.019 }),
      purchase("pur_ropa", "src_master", "Ropa", 600_000, "COP", 3, m(-1)),
      purchase("pur_audifonos", "src_amex", "Audífonos", 349, "USD", 3, m(0), { origin: "voz" }),
    ],
    incomes: [
      { id: "inc_salario", description: "Salario", amount: 7_800_000, currency: "COP", recurring: true, month: m(-12), createdAt: at },
      { id: "inc_freelance", description: "Proyecto freelance", amount: 1_200_000, currency: "COP", recurring: false, month: m(0), createdAt: at },
    ],
    obligations: [
      { id: "obl_arriendo", name: "Arriendo", amount: 1_900_000, currency: "COP", startMonth: m(-10), createdAt: at },
      { id: "obl_celular", name: "Plan celular", amount: 65_000, currency: "COP", startMonth: m(-6), createdAt: at },
    ],
    payments: [
      { id: "pay_arriendo", targetId: "obl_arriendo", month: m(0), createdAt: at },
      { id: "pay_master", targetId: "src_master", month: m(0), createdAt: at },
    ],
    inbox: [],
    expenses: [
      expense("exp_1", "Almuerzo", 28_500, ago(0, 13, 10), { origin: "voz" }),
      expense("exp_2", "Oxxo", 8_400, ago(recent(1), 12, 55), { sourceId: "src_debito", merchant: "OXXO CALLE 80", origin: "correo", last4: "8765" }),
      expense("exp_3", "Supermercado", 123_000, ago(recent(1), 19, 38), { sourceId: "src_debito", merchant: "CARULLA", origin: "correo", last4: "8765" }),
      expense("exp_4", "Gasolina", 95_000, ago(recent(2), 8, 20), { sourceId: "src_debito", origin: "applepay" }),
      expense("exp_5", "Café", 12_000, ago(recent(3), 10, 5), { origin: "manual" }),
      expense("exp_6", "Farmacia", 46_800, ago(recent(4), 17, 30), { sourceId: "src_debito", merchant: "CRUZ VERDE", origin: "correo", last4: "8765" }),
      expense("exp_7", "Cine", 64_000, ago(recent(5), 20, 0), { origin: "manual" }),
    ],
    log: [],
  };
}
