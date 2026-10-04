// Pruebas del servicio de edición. El store se reemplaza por uno en memoria: nunca se toca
// data/db.json ni Supabase (aunque haya credenciales en el entorno).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "./types";

const state = vi.hoisted(() => ({ db: null as unknown as Db }));

vi.mock("./store", () => ({
  readDb: async () => structuredClone(state.db),
  mutateDb: async <T,>(fn: (db: Db) => T): Promise<T> => {
    const draft = structuredClone(state.db);
    const result = fn(draft);
    state.db = draft;
    return result;
  },
}));

vi.mock("./fx", async () => {
  const { DEFAULT_RATES } = await import("./convert");
  return { getRates: async () => DEFAULT_RATES };
});

const finance = await import("./finance");
const { executeTool } = await import("./assistant-tools");

const at = "2026-01-01T00:00:00.000Z";

function freshDb(): Db {
  return {
    settings: { baseCurrency: "COP", currencies: ["COP", "USD"] },
    sources: [
      { id: "visa", name: "Visa", kind: "tarjeta", currency: "COP", color: "#1c1c1e", cutDay: 5, createdAt: at },
      { id: "master", name: "Mastercard", kind: "tarjeta", currency: "COP", color: "#c8102e", createdAt: at },
    ],
    purchases: [
      {
        id: "pur_tv",
        sourceId: "visa",
        description: "Televisor",
        amount: 1_200_000,
        currency: "COP",
        installments: 6,
        firstMonth: "2026-10",
        createdAt: at,
      },
      {
        id: "pur_m1",
        sourceId: "visa",
        description: "Mercado Éxito",
        amount: 300_000,
        currency: "COP",
        installments: 1,
        firstMonth: "2026-10",
        createdAt: at,
      },
      {
        id: "pur_m2",
        sourceId: "master",
        description: "Mercado Carulla",
        amount: 200_000,
        currency: "COP",
        installments: 1,
        firstMonth: "2026-11",
        createdAt: at,
      },
    ],
    incomes: [
      {
        id: "inc_sal",
        description: "Salario",
        amount: 5_000_000,
        currency: "COP",
        recurring: true,
        month: "2026-01",
        createdAt: at,
      },
    ],
    obligations: [
      { id: "obl_arr", name: "Arriendo", amount: 2_000_000, currency: "COP", startMonth: "2026-01", createdAt: at },
    ],
    payments: [],
    inbox: [],
    expenses: [],
    log: [],
  };
}

beforeEach(() => {
  state.db = freshDb();
});

describe("updateIncome", () => {
  it("cambia el monto y deja lo demás igual", async () => {
    const r = await finance.updateIncome("inc_sal", { amount: 7_000_000 });
    expect(r).toMatchObject({ id: "inc_sal", description: "Salario", amount: 7_000_000, recurring: true });
    expect(state.db.incomes[0].amount).toBe(7_000_000);
  });

  it("pone y quita el mes final (null = sin fin)", async () => {
    await finance.updateIncome("inc_sal", { endMonth: "2026-12" });
    expect(state.db.incomes[0].endMonth).toBe("2026-12");
    await finance.updateIncome("inc_sal", { endMonth: null });
    expect(state.db.incomes[0]).not.toHaveProperty("endMonth");
  });

  it("acepta valores de formulario y '' borra el fin", async () => {
    await finance.updateIncome("inc_sal", { endMonth: "2026-12" });
    await finance.updateIncome("inc_sal", { amount: "5000000", recurring: "true", endMonth: "" } as never);
    expect(state.db.incomes[0]).toMatchObject({ amount: 5_000_000, recurring: true });
    expect(state.db.incomes[0]).not.toHaveProperty("endMonth");
  });

  it("un ingreso único no conserva mes final", async () => {
    await finance.updateIncome("inc_sal", { endMonth: "2026-12" });
    const r = await finance.updateIncome("inc_sal", { recurring: false });
    expect(r.endMonth).toBeUndefined();
  });

  it("rechaza fin anterior al inicio, montos inválidos e ids inexistentes", async () => {
    await expect(finance.updateIncome("inc_sal", { endMonth: "2025-12" })).rejects.toThrow(/anterior/);
    await expect(finance.updateIncome("inc_sal", { amount: -1 })).rejects.toThrow(/mayor que 0/);
    await expect(finance.updateIncome("nope", { amount: 1 })).rejects.toThrow(/No existe/);
    expect(state.db.incomes[0].amount).toBe(5_000_000);
  });
});

describe("updatePurchase", () => {
  it("cambia cuotas, primer mes y fuente", async () => {
    const r = await finance.updatePurchase("pur_tv", { installments: 12, firstMonth: "2026-11", sourceId: "master" });
    expect(r).toMatchObject({ installments: 12, firstMonth: "2026-11", sourceId: "master", amount: 1_200_000 });
  });

  it("valida la fuente y la descripción", async () => {
    await expect(finance.updatePurchase("pur_tv", { sourceId: "x" })).rejects.toThrow(/fuente/);
    await expect(finance.updatePurchase("pur_tv", { description: "   " })).rejects.toThrow(/descripción/);
  });
});

describe("updateObligation / updateSource", () => {
  it("termina una obligación en un mes", async () => {
    const r = await finance.updateObligation("obl_arr", { endMonth: "2026-12", amount: 2_100_000 });
    expect(r).toMatchObject({ endMonth: "2026-12", amount: 2_100_000, name: "Arriendo" });
  });

  it("edita una fuente y borra su día de corte", async () => {
    const r = await finance.updateSource("visa", { name: "Visa Oro", color: "#0a64c8", cutDay: null, dueDay: 20 });
    expect(r).toMatchObject({ name: "Visa Oro", color: "#0a64c8", dueDay: 20 });
    expect(r).not.toHaveProperty("cutDay");
    await expect(finance.updateSource("visa", { color: "rojo" })).rejects.toThrow(/Color/);
  });
});

describe("listMovements / resolveMovement", () => {
  it("lista por tipo y por mes", async () => {
    expect(await finance.listMovements()).toHaveLength(5);
    expect(await finance.listMovements({ kind: "purchase", month: "2026-11" })).toHaveLength(2); // TV + Carulla
    const [inc] = await finance.listMovements({ kind: "income" });
    expect(inc).toMatchObject({ id: "inc_sal", description: "Salario", amount: 5_000_000 });
  });

  it("resuelve por id, por descripción difusa y detecta ambigüedad", async () => {
    expect(await finance.resolveMovement("income", { id: "inc_sal" })).toMatchObject({ status: "ok" });
    expect(await finance.resolveMovement("income", { query: "el salario" })).toMatchObject({
      status: "ok",
      movement: { id: "inc_sal" },
    });
    expect(await finance.resolveMovement("purchase", { query: "exito" })).toMatchObject({
      status: "ok",
      movement: { id: "pur_m1" },
    });
    const amb = await finance.resolveMovement("purchase", { query: "mercado" });
    expect(amb.status).toBe("ambiguous");
    expect(amb.status !== "ok" && amb.candidates.map((c) => c.id).sort()).toEqual(["pur_m1", "pur_m2"]);
    expect((await finance.resolveMovement("obligation", { query: "hipoteca" })).status).toBe("none");
  });
});

describe("herramientas del asistente", () => {
  it("editar_movimiento por descripción", async () => {
    const r = await executeTool("editar_movimiento", { tipo: "ingreso", descripcion: "salario", monto: "6 millones", hasta: "2026-12" });
    expect(r.ok).toBe(true);
    expect(state.db.incomes[0]).toMatchObject({ amount: 6_000_000, endMonth: "2026-12" });
    const r2 = await executeTool("editar_movimiento", { tipo: "ingreso", id: "inc_sal", hasta: "sin fin" });
    expect(r2.ok).toBe(true);
    expect(state.db.incomes[0]).not.toHaveProperty("endMonth");
  });

  it("no actúa si es ambiguo y devuelve candidatas", async () => {
    const r = await executeTool("eliminar_movimiento", { tipo: "compra", descripcion: "mercado" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/2 coincidencias/);
    expect((r.datos?.candidatos as unknown[]).length).toBe(2);
    expect(state.db.purchases).toHaveLength(3);
  });

  it("eliminar_movimiento y listar_movimientos", async () => {
    const r = await executeTool("eliminar_movimiento", { tipo: "compra", descripcion: "carulla" });
    expect(r.ok).toBe(true);
    expect(state.db.purchases.map((p) => p.id)).toEqual(["pur_tv", "pur_m1"]);
    const l = await executeTool("listar_movimientos", { tipo: "compra" });
    expect(l.datos?.total).toBe(2);
  });

  it("editar compra: cuotas y fuente por nombre", async () => {
    const r = await executeTool("editar_movimiento", { tipo: "compra", descripcion: "televisor", cuotas: 12, fuente: "master" });
    expect(r.ok).toBe(true);
    expect(state.db.purchases[0]).toMatchObject({ installments: 12, sourceId: "master" });
  });

  it("pide qué cambiar y qué movimiento", async () => {
    expect((await executeTool("editar_movimiento", { tipo: "ingreso", id: "inc_sal" })).ok).toBe(false);
    expect((await executeTool("eliminar_movimiento", { tipo: "ingreso" })).ok).toBe(false);
    expect(state.db.incomes).toHaveLength(1);
  });
});

describe("gastos (débito / efectivo)", () => {
  const now = new Date("2026-10-03T15:00:00.000Z");

  it("crear, editar (fecha → mes), eliminar y deshacer", async () => {
    const e = await finance.addExpense({ description: "Almuerzo", amount: 20_000, date: "2026-10-03" }, now);
    expect(e).toMatchObject({ description: "Almuerzo", amount: 20_000, currency: "COP", month: "2026-10", occurredAt: now.toISOString() });
    expect((await finance.getSummary("2026-10")).spent).toBe(20_000);

    const moved = await finance.updateExpense(e.id, { date: "2026-09-30", amount: 25_000 }, now);
    expect(moved).toMatchObject({ month: "2026-09", occurredAt: "2026-09-30T17:00:00.000Z", amount: 25_000 });
    expect((await finance.getSummary("2026-10")).spent).toBe(0);
    expect((await finance.getSummary("2026-09")).spent).toBe(25_000);

    await finance.deleteEntity("expense", e.id);
    expect(state.db.expenses).toHaveLength(0);

    await finance.addExpense({ description: "Taxi", amount: 15_000 }, now);
    expect(await finance.undoLast()).toMatchObject({ entity: "expense", description: "Taxi" });
    expect(state.db.expenses).toHaveLength(0);
  });

  it("cuenta de débito: recibe gastos, no compras; no aparece en Por pagar", async () => {
    const deb = await finance.addSource({ name: "Débito", kind: "debito", last4: "8765" });
    const e = await finance.addExpense({ description: "Mercado", amount: 80_000, sourceId: deb.id }, now);
    expect(e.sourceId).toBe(deb.id);
    await expect(finance.addPurchase({ sourceId: deb.id, description: "TV", amount: 1 })).rejects.toThrow(/débito/);
    await expect(finance.updatePurchase("pur_tv", { sourceId: deb.id })).rejects.toThrow(/débito/);
    await expect(finance.addExpense({ description: "X", amount: 1, sourceId: "visa" }, now)).rejects.toThrow(/crédito/);
    // Una tarjeta con compras no puede pasar a débito.
    await expect(finance.updateSource("visa", { kind: "debito" })).rejects.toThrow(/compras/);
    // Al eliminar la cuenta, el gasto se conserva sin cuenta.
    await finance.deleteEntity("source", deb.id);
    expect(state.db.expenses[0]).not.toHaveProperty("sourceId");
  });

  it("herramientas: registrar_gasto, listar, editar, eliminar y resumen", async () => {
    const r = await executeTool("registrar_gasto", { descripcion: "almuerzo", monto: "20 mil" });
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/gasto "almuerzo" de \$\s?20\.000/);
    const id = state.db.expenses[0].id;

    const l = await executeTool("listar_movimientos", { tipo: "gasto" });
    expect(l.datos).toMatchObject({ total: 1, movimientos: [{ tipo: "gasto", id, monto: 20_000 }] });

    const ed = await executeTool("editar_movimiento", { tipo: "gasto", descripcion: "almuerzo", monto: 22_000, fecha: "2026-10-01" });
    expect(ed.ok).toBe(true);
    expect(state.db.expenses[0]).toMatchObject({ amount: 22_000, month: "2026-10" });

    const res = await executeTool("resumen_mes", { mes: "2026-10" });
    expect(res.mensaje).toMatch(/gastos \$\s?22\.000/);
    expect(res.datos).toMatchObject({ gastos: 22_000 });

    const del = await executeTool("eliminar_movimiento", { tipo: "gasto", id });
    expect(del.ok).toBe(true);
    expect(state.db.expenses).toHaveLength(0);
  });

  it("registrar_compra con una cuenta de débito lo anota como gasto; registrar_gasto con crédito avisa", async () => {
    await finance.addSource({ name: "Ahorros", kind: "debito" });
    const r = await executeTool("registrar_compra", { descripcion: "mercado", monto: 50_000, fuente: "ahorros" });
    expect(r.ok).toBe(true);
    expect(state.db.expenses).toHaveLength(1);
    expect(state.db.purchases).toHaveLength(3);
    const bad = await executeTool("registrar_gasto", { descripcion: "x", monto: 1000, fuente: "visa" });
    expect(bad.ok).toBe(false);
    expect(bad.mensaje).toMatch(/registrar_compra/);
  });
});
