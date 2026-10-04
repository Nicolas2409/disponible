import { describe, expect, it } from "vitest";
import { installmentAmount, installmentFor, lastInstallmentMonth, summarizeMonth, summarizeRange } from "./calc";
import { convert } from "./convert";
import { formatMoney } from "./money";
import type { Db, Purchase, Rates } from "./types";

const rates: Rates = { USD: 1, COP: 4000, EUR: 0.92 };
const at = "2026-01-01T00:00:00.000Z";

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    id: "p1",
    sourceId: "visa",
    description: "Compra",
    amount: 600_000,
    currency: "COP",
    installments: 6,
    firstMonth: "2026-10",
    createdAt: at,
    ...over,
  };
}

function db(over: Partial<Db> = {}): Db {
  return {
    settings: { baseCurrency: "COP", currencies: ["COP", "USD"] },
    sources: [
      { id: "visa", name: "Visa", kind: "tarjeta", currency: "COP", color: "#000", createdAt: at },
      { id: "amex", name: "Amex", kind: "tarjeta", currency: "USD", color: "#0f7c8a", createdAt: at },
      { id: "empty", name: "Vacía", kind: "tarjeta", currency: "COP", color: "#fff", createdAt: at },
    ],
    purchases: [],
    incomes: [
      { id: "sal", description: "Salario", amount: 5_000_000, currency: "COP", recurring: true, month: "2026-01", createdAt: at },
    ],
    obligations: [],
    payments: [],
    inbox: [],
    expenses: [],
    log: [],
    ...over,
  };
}

describe("installmentAmount", () => {
  it("cuotas iguales sin interés", () => {
    expect(installmentAmount(purchase())).toBe(100_000);
    expect(installmentAmount(purchase({ installments: 1 }))).toBe(600_000);
  });

  it("amortización francesa con monthlyRate", () => {
    const p = purchase({ amount: 1_000_000, installments: 12, monthlyRate: 0.02 });
    const r = 0.02;
    const expected = (1_000_000 * r) / (1 - Math.pow(1 + r, -12));
    expect(installmentAmount(p)).toBeCloseTo(expected, 6);
    expect(installmentAmount(p)).toBeCloseTo(94_559.6, 0);
    // Suma de cuotas > capital cuando hay interés
    expect(installmentAmount(p) * 12).toBeGreaterThan(1_000_000);
  });

  it("monthlyRate 0 equivale a sin interés", () => {
    expect(installmentAmount(purchase({ monthlyRate: 0 }))).toBe(100_000);
  });
});

describe("installmentFor", () => {
  const p = purchase(); // 6 cuotas oct-2026 .. mar-2027

  it("cuota 1 de N en el primer mes", () => {
    expect(installmentFor(p, "2026-10")).toEqual({ number: 1, of: 6, amount: 100_000 });
  });

  it("cruza el cambio de año", () => {
    expect(installmentFor(p, "2026-12")?.number).toBe(3);
    expect(installmentFor(p, "2027-01")?.number).toBe(4);
    expect(lastInstallmentMonth(p)).toBe("2027-03");
  });

  it("cuota N de N en el último mes", () => {
    expect(installmentFor(p, "2027-03")).toEqual({ number: 6, of: 6, amount: 100_000 });
  });

  it("fuera de rango → null", () => {
    expect(installmentFor(p, "2026-09")).toBeNull();
    expect(installmentFor(p, "2027-04")).toBeNull();
  });

  it("una sola cuota solo aplica en su mes", () => {
    const one = purchase({ installments: 1 });
    expect(installmentFor(one, "2026-10")).toEqual({ number: 1, of: 1, amount: 600_000 });
    expect(installmentFor(one, "2026-11")).toBeNull();
    expect(lastInstallmentMonth(one)).toBe("2026-10");
  });
});

describe("summarizeMonth", () => {
  it("compra de 6 cuotas a través del año", () => {
    const d = db({ purchases: [purchase()] });
    const months = summarizeRange(d, "2026-09", 8, rates);
    expect(months.map((m) => m.month)).toEqual([
      "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04",
    ]);
    expect(months.map((m) => m.committed)).toEqual([0, 1e5, 1e5, 1e5, 1e5, 1e5, 1e5, 0]);
    expect(months[4].sources[0].lines[0]).toMatchObject({ number: 4, of: 6 });
  });

  it("convierte compra en USD a la base COP", () => {
    const d = db({
      purchases: [purchase({ id: "u", sourceId: "amex", amount: 300, currency: "USD", installments: 3 })],
    });
    const s = summarizeMonth(d, "2026-10", rates);
    expect(s.sources).toHaveLength(1);
    const amex = s.sources[0];
    expect(amex.source.id).toBe("amex");
    expect(amex.total).toBe(100); // USD, moneda de la fuente
    expect(amex.totalBase).toBe(400_000); // 100 USD × 4000
    expect(amex.lines[0]).toMatchObject({ amount: 100, currency: "USD", amountBase: 400_000 });
    expect(s.committed).toBe(400_000);
    expect(s.available).toBe(5_000_000 - 400_000);
  });

  it("compra en COP sobre tarjeta USD: total en USD", () => {
    const d = db({ purchases: [purchase({ sourceId: "amex", amount: 400_000, installments: 1 })] });
    const s = summarizeMonth(d, "2026-10", rates);
    expect(s.sources[0].total).toBe(100);
    expect(s.sources[0].totalBase).toBe(400_000);
  });

  it("omite fuentes sin cuotas y ordena por totalBase desc", () => {
    const d = db({
      purchases: [
        purchase({ id: "a", amount: 100_000, installments: 1 }),
        purchase({ id: "b", sourceId: "amex", amount: 50, currency: "USD", installments: 1 }),
      ],
    });
    const s = summarizeMonth(d, "2026-10", rates);
    expect(s.sources.map((x) => x.source.id)).toEqual(["amex", "visa"]); // 200.000 > 100.000
  });

  it("obligación con endMonth", () => {
    const d = db({
      obligations: [
        { id: "hip", name: "Hipoteca", amount: 2_000_000, currency: "COP", startMonth: "2026-10", endMonth: "2026-12", createdAt: at },
      ],
    });
    const [sep, oct, dec, jan] = ["2026-09", "2026-10", "2026-12", "2027-01"].map((m) => summarizeMonth(d, m, rates));
    expect(sep.obligations).toHaveLength(0);
    expect(oct.obligations[0].amountBase).toBe(2_000_000);
    expect(dec.committed).toBe(2_000_000);
    expect(dec.available).toBe(5_000_000 - 2_000_000);
    expect(jan.obligations).toHaveLength(0);
    expect(jan.committed).toBe(0);
  });

  it("ingreso recurrente con endMonth y no recurrente solo en su mes", () => {
    const d = db({
      incomes: [
        { id: "sal", description: "Salario", amount: 5_000_000, currency: "COP", recurring: true, month: "2026-10", endMonth: "2026-12", createdAt: at },
        { id: "bono", description: "Prima", amount: 100, currency: "USD", recurring: false, month: "2026-12", createdAt: at },
      ],
    });
    expect(summarizeMonth(d, "2026-09", rates).income).toBe(0);
    expect(summarizeMonth(d, "2026-10", rates).income).toBe(5_000_000);
    expect(summarizeMonth(d, "2026-11", rates).income).toBe(5_000_000);
    const dec = summarizeMonth(d, "2026-12", rates);
    expect(dec.income).toBe(5_400_000);
    expect(dec.incomes).toHaveLength(2);
    expect(summarizeMonth(d, "2027-01", rates).income).toBe(0);
  });

  it("marcas de pago afectan pendingToPay pero no available", () => {
    const base = db({
      purchases: [purchase({ amount: 600_000, installments: 1 })],
      obligations: [
        { id: "arr", name: "Arriendo", amount: 1_500_000, currency: "COP", startMonth: "2026-01", createdAt: at },
      ],
    });
    const before = summarizeMonth(base, "2026-10", rates);
    expect(before.committed).toBe(2_100_000);
    expect(before.pendingToPay).toBe(2_100_000);

    const paidSource = summarizeMonth(
      { ...base, payments: [{ id: "x", targetId: "visa", month: "2026-10", createdAt: at }] },
      "2026-10",
      rates,
    );
    expect(paidSource.sources[0].paid).toBe(true);
    expect(paidSource.pendingToPay).toBe(1_500_000);
    expect(paidSource.available).toBe(before.available);

    const paidBoth = summarizeMonth(
      {
        ...base,
        payments: [
          { id: "x", targetId: "visa", month: "2026-10", createdAt: at },
          { id: "y", targetId: "arr", month: "2026-10", createdAt: at },
        ],
      },
      "2026-10",
      rates,
    );
    expect(paidBoth.obligations[0].paid).toBe(true);
    expect(paidBoth.pendingToPay).toBe(0);
    expect(paidBoth.committed).toBe(2_100_000);
    expect(paidBoth.available).toBe(before.available);

    // Una marca de otro mes no cuenta
    const otherMonth = summarizeMonth(
      { ...base, payments: [{ id: "x", targetId: "visa", month: "2026-09", createdAt: at }] },
      "2026-10",
      rates,
    );
    expect(otherMonth.pendingToPay).toBe(2_100_000);
  });

  it("gastos con débito: reducen el disponible solo en su mes, sin tocar lo comprometido", () => {
    const d = db({
      purchases: [purchase({ amount: 600_000, installments: 1 })],
      sources: [
        ...db().sources,
        { id: "deb", name: "Débito", kind: "debito", currency: "COP", color: "#000", last4: "8765", createdAt: at },
      ],
      expenses: [
        { id: "e1", description: "Oxxo", amount: 8_400, currency: "COP", month: "2026-10", occurredAt: "2026-10-02T17:55:00.000Z", sourceId: "deb", createdAt: at },
        { id: "e2", description: "Netflix", amount: 10, currency: "USD", month: "2026-10", occurredAt: "2026-10-05T12:00:00.000Z", createdAt: at },
        { id: "e3", description: "Otro mes", amount: 50_000, currency: "COP", month: "2026-11", createdAt: at },
      ],
    });
    const oct = summarizeMonth(d, "2026-10", rates);
    expect(oct.spent).toBe(8_400 + 40_000); // 10 USD × 4000
    expect(oct.committed).toBe(600_000);
    expect(oct.pendingToPay).toBe(600_000);
    expect(oct.available).toBe(5_000_000 - 600_000 - 48_400);
    // Más recientes primero, con el monto en la moneda base.
    expect(oct.expenses.map((e) => e.expense.id)).toEqual(["e2", "e1"]);
    expect(oct.expenses[0].amountBase).toBe(40_000);
    // La cuenta de débito no aparece en "Por pagar".
    expect(oct.sources.map((s) => s.source.id)).toEqual(["visa"]);

    const nov = summarizeMonth(d, "2026-11", rates);
    expect(nov.spent).toBe(50_000);
    expect(nov.available).toBe(5_000_000 - 50_000);
    expect(summarizeMonth(d, "2026-09", rates)).toMatchObject({ spent: 0, expenses: [] });
  });
});

describe("convert / formatMoney", () => {
  it("convierte vía USD", () => {
    expect(convert(1, "USD", "COP", rates)).toBe(4000);
    expect(convert(4000, "COP", "USD", rates)).toBe(1);
    expect(convert(92, "EUR", "USD", rates)).toBeCloseTo(100);
    expect(convert(5, "COP", "COP", rates)).toBe(5);
  });

  it("formatea COP sin decimales y USD con 2", () => {
    const norm = (s: string) => s.replace(/\s/g, " ");
    expect(norm(formatMoney(1_250_000, "COP"))).toBe("$ 1.250.000");
    expect(formatMoney(12.5, "USD")).toMatch(/12,50$/);
    expect(formatMoney(1_200_000, "COP", { compact: true })).toMatch(/1,2\sM/);
  });
});
