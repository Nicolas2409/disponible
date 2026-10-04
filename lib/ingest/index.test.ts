import { describe, expect, it } from "vitest";
import { parseMonto } from "../monto";
import type { Expense, Purchase, Source } from "../types";
import {
  findDuplicate,
  firstMonthFor,
  interpret,
  matchSource,
  parseLooseDate,
  parseNu,
  planIngest,
  prettyMerchant,
  describePlan,
  expenseInstant,
  findExpenseDuplicate,
  monthOf,
} from "./index";

const at = "2026-01-01T00:00:00.000Z";
const src = (id: string, name: string, extra: Partial<Source> = {}): Source => ({
  id,
  name,
  kind: "tarjeta",
  currency: "COP",
  color: "#000",
  createdAt: at,
  ...extra,
});

const SOURCES: Source[] = [
  src("mc", "Mastercard Bancolombia", { last4: "5678", cutDay: 15 }),
  src("visa", "Visa Bancolombia", { last4: "4321" }),
  src("nu", "Nu", { last4: "1234" }),
  { ...src("hogar", "Hogar"), kind: "hogar" },
];

const purchase = (over: Partial<Purchase>): Purchase => ({
  id: "p1",
  sourceId: "nu",
  description: "Rappi",
  amount: 45900,
  currency: "COP",
  installments: 1,
  firstMonth: "2026-10",
  createdAt: at,
  ...over,
});

describe("parseMonto (montos de Atajos y alertas)", () => {
  it.each([
    ["$45.900", 45900],
    ["45.900,00", 45900],
    ["45900", 45900],
    ["COP7.500,00", 7500],
    ["$31250.40", 31250.4],
    ["$75300.00", 75300],
    ["US$12.50", 12.5],
    ["USD12,50", 12.5],
    ["$ 1.234.567,89", 1234567.89],
    ["1,234.56", 1234.56],
    ["COP 45.900", 45900],
    ["450 mil", 450000],
  ])("%s → %d", (input, expected) => {
    expect(parseMonto(input)).toBeCloseTo(expected, 2);
  });
});

describe("interpret", () => {
  it("correo: crédito → compra; débito → compra con cardType débito; Pagaste → pago de tarjeta", () => {
    const [a] = interpret({ canal: "correo", id: "m1", texto: "Compraste COP7.500,00 en SPOTIFY.COM con tu T.Cred *5678, el 01/10/2026 a las 15:37." });
    expect(a).toMatchObject({ externalId: "m1", movement: { kind: "compra", last4: "5678" } });
    const [b] = interpret({ canal: "correo", texto: "Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb *8765, el 02/10/2026 a las 12:55." });
    expect(b.movement).toMatchObject({ kind: "compra", cardType: "debito", last4: "8765", amount: 6200 });
    const [c] = interpret({ canal: "correo", texto: "Pagaste $31250.40 a NU Compania de Financiamiento desde tu producto 0001 el 03/10/2026 11:59:48." });
    expect(c.movement).toMatchObject({ kind: "ignorado", reason: "pago de tarjeta" });
  });

  it("correo con varios movimientos: ids con #n", () => {
    const r = interpret({
      canal: "correo",
      id: "m2",
      texto: "Compraste COP7.500,00 en A con tu T.Cred *5678, el 01/10/2026 a las 15:37. Compraste COP5.000,00 en B con tu T.Cred *5678, el 01/10/2026 a las 15:40.",
    });
    expect(r.map((x) => x.externalId)).toEqual(["m2#1", "m2#2"]);
  });

  it("correo sin monto se ignora; con monto pero sin entender va a revisar", () => {
    expect(interpret({ canal: "correo", texto: "Inscribiste un nuevo dispositivo." })[0].movement).toMatchObject({
      kind: "ignorado",
      reason: "sin movimiento",
    });
    expect(interpret({ canal: "correo", texto: "Tu avance por $200.000 fue exitoso" })[0].movement.kind).toBe("desconocido");
  });

  it("sms: Bancolombia por SMS usa el mismo intérprete; Nu usa el genérico", () => {
    expect(interpret({ canal: "sms", texto: "Bancolombia: Compraste $50.000,00 en EXITO con tu T.Cred *5678, el 03/10/2026 a las 10:00." })[0].movement).toMatchObject({
      kind: "compra",
      issuer: "bancolombia",
      last4: "5678",
    });
    expect(interpret({ canal: "sms", texto: "Nu: Compra aprobada por $45.900 en RAPPI con tu tarjeta terminada en 1234." })[0].movement).toMatchObject({
      kind: "compra",
      issuer: "nu",
      merchant: "RAPPI",
    });
  });

  it("applepay: monto localizado, tarjeta y fecha", () => {
    const now = new Date("2026-10-03T15:00:00.000Z");
    const [r] = interpret({ canal: "applepay", comercio: "Rappi", monto: "$45.900", tarjeta: "Nu" }, now);
    expect(r.movement).toMatchObject({ kind: "compra", amount: 45900, currency: "COP", merchant: "Rappi", cardName: "Nu", occurredAt: now.toISOString() });
    const [u] = interpret({ canal: "applepay", comercio: "Apple", monto: "US$ 9,99", tarjeta: "Nu", fecha: "2026-10-03T10:00:00-05:00" });
    expect(u.movement).toMatchObject({ amount: 9.99, currency: "USD", occurredAt: "2026-10-03T15:00:00.000Z" });
    expect(interpret({ canal: "applepay", comercio: "X", monto: "gratis" })[0].movement.kind).toBe("desconocido");
  });
});

describe("parseLooseDate", () => {
  it("formatos de Atajos", () => {
    expect(parseLooseDate("2026-10-03 14:05")).toBe("2026-10-03T19:05:00.000Z");
    expect(parseLooseDate("3/10/2026 2:05 p. m.")).toBe("2026-10-03T19:05:00.000Z");
    expect(parseLooseDate("2026-10-03T14:05:00Z")).toBe("2026-10-03T14:05:00.000Z");
    expect(parseLooseDate("ayer")).toBeUndefined();
  });
});

describe("matchSource", () => {
  it("por últimos 4 dígitos (exacto, sin caer a otra tarjeta)", () => {
    expect(matchSource(SOURCES, { last4: "5678" })?.id).toBe("mc");
    expect(matchSource(SOURCES, { last4: "9999", issuer: "nu" })).toBeNull();
  });
  it("por nombre de Wallet (difuso o con dígitos)", () => {
    expect(matchSource(SOURCES, { cardName: "Visa" })?.id).toBe("visa");
    expect(matchSource(SOURCES, { cardName: "Mastercard ••••5678" })?.id).toBe("mc");
    expect(matchSource(SOURCES, { cardName: "Tarjeta 4321" })?.id).toBe("visa");
    expect(matchSource(SOURCES, { cardName: "Amex" })).toBeNull();
  });
  it("Nu sin dígitos → fuente cuyo nombre tiene la palabra 'nu'", () => {
    expect(matchSource(SOURCES, { issuer: "nu" })?.id).toBe("nu");
    expect(matchSource([src("x", "Nueva tarjeta")], { issuer: "nu" })).toBeNull();
    expect(matchSource([src("y", "Tarjeta Nu Colombia")], { issuer: "nu" })?.id).toBe("y");
  });
});

describe("findDuplicate", () => {
  const existing = purchase({ externalId: "sms-1", occurredAt: "2026-10-03T15:00:00.000Z" });

  it("mismo externalId", () => {
    expect(findDuplicate([existing], { externalId: "sms-1", sourceId: "otra", amount: 1, currency: "COP" })).toBe(existing);
  });

  it("misma tarjeta, monto ±1 y menos de 20 minutos (Apple Pay + SMS)", () => {
    const c = { sourceId: "nu", currency: "COP", amount: 45900.5, occurredAt: "2026-10-03T15:12:00.000Z" };
    expect(findDuplicate([existing], c)).toBe(existing);
    expect(findDuplicate([existing], { ...c, occurredAt: "2026-10-03T14:41:00.000Z" })).toBe(existing);
  });

  it("no es duplicado si cambia la tarjeta, el monto, la moneda o pasan más de 20 min", () => {
    const c = { sourceId: "nu", currency: "COP", amount: 45900, occurredAt: "2026-10-03T15:05:00.000Z" };
    expect(findDuplicate([existing], { ...c, sourceId: "visa" })).toBeNull();
    expect(findDuplicate([existing], { ...c, amount: 45902 })).toBeNull();
    expect(findDuplicate([existing], { ...c, currency: "USD" })).toBeNull();
    expect(findDuplicate([existing], { ...c, occurredAt: "2026-10-03T15:21:00.000Z" })).toBeNull();
    expect(findDuplicate([purchase({})], c)).toBeNull(); // compras manuales sin hora no cuentan
  });
});

describe("firstMonthFor (día de corte)", () => {
  it("sin corte: mes de la compra en hora de Bogotá", () => {
    expect(firstMonthFor("2026-10-01T20:37:00.000Z")).toBe("2026-10");
    // 31 oct 22:00 en Bogotá = 1 nov 03:00 UTC → sigue siendo octubre.
    expect(firstMonthFor("2026-11-01T03:00:00.000Z")).toBe("2026-10");
  });
  it("después del corte pasa al mes siguiente; el día del corte no", () => {
    expect(firstMonthFor("2026-10-16T17:00:00.000Z", 15)).toBe("2026-11");
    expect(firstMonthFor("2026-10-15T17:00:00.000Z", 15)).toBe("2026-10");
    expect(firstMonthFor("2026-12-20T17:00:00.000Z", 15)).toBe("2027-01");
  });
});

describe("prettyMerchant", () => {
  it("solo cambia textos en mayúsculas", () => {
    expect(prettyMerchant("OXXO CALLE 80")).toBe("Oxxo Calle 80");
    expect(prettyMerchant("SPOTIFY.COM")).toBe("Spotify.com");
    expect(prettyMerchant("GOOGLE *YouTube Prem")).toBe("GOOGLE *YouTube Prem");
    expect(prettyMerchant(undefined)).toBe("Compra");
  });
});

describe("planIngest", () => {
  const db = { sources: SOURCES, purchases: [] as Purchase[], inbox: [] };
  const meta = { channel: "correo" as const, externalId: "m1", receivedAt: "2026-10-03T12:00:00.000Z" };

  it("crea compra a 1 cuota, por revisar, con el mes según el corte", () => {
    const [{ movement }] = interpret({ canal: "correo", texto: "Compraste COP54.900,00 en GOOGLE *YouTube Prem, el 20/10/2026 a las 16:42. Esta compra esta asociada a T.Cred *5678." });
    const plan = planIngest(db, movement as never, meta);
    expect(plan).toMatchObject({
      type: "create",
      purchase: {
        sourceId: "mc",
        description: "GOOGLE *YouTube Prem",
        amount: 54900,
        installments: 1,
        firstMonth: "2026-11", // corte el 15
        origin: "correo",
        externalId: "m1",
        merchant: "GOOGLE *YouTube Prem",
        needsReview: true,
      },
    });
    expect(describePlan(plan)).toBe("Registrado: $54.900 en GOOGLE *YouTube Prem · Mastercard Bancolombia (1 cuota)");
  });

  it("tarjeta desconocida → bandeja con lo interpretado", () => {
    const m = parseNu("Nu: Compra aprobada por $45.900 en RAPPI con tu tarjeta terminada en 9999.");
    const plan = planIngest(db, m as never, { ...meta, channel: "sms" });
    expect(plan).toMatchObject({
      type: "inbox",
      why: "sin tarjeta",
      item: { channel: "sms", externalId: "m1", parsed: { amount: 45900, merchant: "RAPPI", last4: "9999" } },
    });
    expect(describePlan(plan)).toBe("Por revisar: $45.900 en Rappi (no encontré la tarjeta *9999)");
  });

  it("texto no entendido → bandeja", () => {
    expect(planIngest(db, { kind: "desconocido", text: "???" }, meta)).toMatchObject({ type: "inbox", why: "no entendido" });
  });

  it("mismo id en la bandeja o en compras → no se repite", () => {
    const withInbox = { ...db, inbox: [{ id: "i1", text: "x", channel: "correo" as const, receivedAt: at, externalId: "m1" }] };
    expect(planIngest(withInbox, { kind: "desconocido", text: "x" }, meta).type).toBe("inbox-duplicate");
    const withPurchase = { ...db, purchases: [purchase({ externalId: "m1" })] };
    expect(planIngest(withPurchase, { kind: "desconocido", text: "x" }, meta).type).toBe("duplicate");
  });
});

describe("gastos con débito", () => {
  const DEBIT = "Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb *8765, el 02/10/2026 a las 12:55.";
  const deb = { ...src("deb", "Cuenta ahorros", { last4: "8765" }), kind: "debito" as const };
  const meta = { channel: "correo" as const, externalId: "d1", receivedAt: "2026-10-03T12:00:00.000Z" };
  const base = { sources: SOURCES, purchases: [] as Purchase[], inbox: [], expenses: [] as Expense[] };
  const debitMovement = () => interpret({ canal: "correo", texto: DEBIT })[0].movement as never;

  it("T.Deb sin cuenta registrada → gasto con los dígitos, nunca a la bandeja", () => {
    const plan = planIngest(base, debitMovement(), meta);
    expect(plan).toMatchObject({
      type: "expense",
      expense: { description: "Oxxo Calle 80", amount: 6200, month: "2026-10", last4: "8765", merchant: "OXXO CALLE 80", origin: "correo", externalId: "d1" },
    });
    expect(plan.type === "expense" && plan.expense).not.toHaveProperty("sourceId");
    expect(describePlan(plan)).toBe("Gasto registrado: $6.200 en Oxxo Calle 80 · Débito *8765");
  });

  it("T.Deb con cuenta de débito por últimos 4 → gasto asociado", () => {
    const plan = planIngest({ ...base, sources: [...SOURCES, deb] }, debitMovement(), meta);
    expect(plan).toMatchObject({ type: "expense", expense: { sourceId: "deb" } });
    expect(describePlan(plan)).toBe("Gasto registrado: $6.200 en Oxxo Calle 80 · Cuenta ahorros");
  });

  it("los dígitos de una tarjeta de crédito no convierten el débito en compra", () => {
    const plan = planIngest({ ...base, sources: [src("x", "Visa", { last4: "8765" })] }, debitMovement(), meta);
    expect(plan.type).toBe("expense");
    expect(plan.type === "expense" && plan.expense.sourceId).toBeUndefined();
  });

  it("mismo id ya registrado como gasto → duplicado", () => {
    const e: Expense = { id: "e1", description: "Oxxo", amount: 6200, currency: "COP", month: "2026-10", externalId: "d1", createdAt: at };
    expect(planIngest({ ...base, expenses: [e] }, debitMovement(), meta)).toMatchObject({ type: "expense-duplicate", expense: { id: "e1" } });
  });

  it("findExpenseDuplicate: misma cuenta o dígitos, monto ±1 y 20 minutos; los manuales no cuentan", () => {
    const auto: Expense = {
      id: "e1", description: "Oxxo", amount: 6200, currency: "COP", month: "2026-10",
      occurredAt: "2026-10-02T17:55:00.000Z", last4: "8765", origin: "correo", createdAt: at,
    };
    const c = { amount: 6200.5, currency: "COP", last4: "8765", occurredAt: "2026-10-02T18:10:00.000Z" };
    expect(findExpenseDuplicate([auto], c)).toBe(auto);
    expect(findExpenseDuplicate([auto], { ...c, last4: "0000" })).toBeNull();
    expect(findExpenseDuplicate([auto], { ...c, occurredAt: "2026-10-02T18:20:00.000Z" })).toBeNull();
    expect(findExpenseDuplicate([auto], { ...c, amount: 9000 })).toBeNull();
    expect(findExpenseDuplicate([{ ...auto, origin: undefined }], c)).toBeNull();
  });

  it("Apple Pay: la tarjeta de Wallet decide (débito → gasto, crédito → compra)", () => {
    const sources = [...SOURCES, { ...src("deb2", "Débito Bancolombia"), kind: "debito" as const }];
    const pay = (tarjeta: string) =>
      interpret({ canal: "applepay", comercio: "Juan Valdez", monto: "$12.000", tarjeta }, new Date("2026-10-03T15:00:00.000Z"))[0].movement as never;
    const ap = { ...meta, channel: "applepay" as const, externalId: undefined };
    expect(planIngest({ ...base, sources }, pay("Débito Bancolombia"), ap)).toMatchObject({ type: "expense", expense: { sourceId: "deb2", origin: "applepay" } });
    expect(planIngest({ ...base, sources }, pay("Mastercard"), ap)).toMatchObject({ type: "create", purchase: { sourceId: "mc" } });
    // Sin cuenta de débito pero el nombre dice débito → gasto sin cuenta.
    expect(planIngest(base, pay("Visa Débito"), ap)).toMatchObject({ type: "expense" });
  });

  it("monthOf y expenseInstant (hora de Bogotá)", () => {
    expect(monthOf("2026-11-01T03:00:00.000Z")).toBe("2026-10");
    const now = new Date("2026-10-03T15:00:00.000Z");
    expect(expenseInstant(undefined, now)).toBe(now.toISOString());
    expect(expenseInstant("2026-10-03", now)).toBe(now.toISOString()); // hoy: ahora mismo
    expect(expenseInstant("2026-09-30", now)).toBe("2026-09-30T17:00:00.000Z"); // otro día: mediodía
    expect(() => expenseInstant("ayer", now)).toThrow();
  });
});
