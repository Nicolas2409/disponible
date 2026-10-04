// Registro automático de punta a punta sobre un store en memoria (nunca toca data/db.json ni Supabase).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "./types";

const state = vi.hoisted(() => ({ db: null as unknown as Db, writes: 0 }));

vi.mock("./store", () => ({
  readDb: async () => structuredClone(state.db),
  mutateDb: async <T,>(fn: (db: Db) => T): Promise<T> => {
    const draft = structuredClone(state.db);
    const result = fn(draft);
    state.db = draft;
    state.writes++;
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
const CREDIT_A = "¡Listo! Todo salió bien con tus movimientos Bancolombia: Compraste COP7.500,00 en SPOTIFY.COM con tu T.Cred *5678, el 01/10/2026 a las 15:37.";
const CREDIT_B =
  "Compraste COP54.900,00 en GOOGLE *YouTube Prem, el 01/10/2026 a las 16:42. Esta compra esta asociada a T.Cred *5678.";
const DEBIT =
  "¡Listo! Todo salió bien con tus movimientos Bancolombia: Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb *8765, el 02/10/2026 a las 12:55.";

beforeEach(() => {
  state.writes = 0;
  state.db = {
    settings: { baseCurrency: "COP", currencies: ["COP", "USD"] },
    sources: [
      { id: "mc", name: "Mastercard Bancolombia", kind: "tarjeta", currency: "COP", color: "#000", last4: "5678", createdAt: at },
      { id: "nu", name: "Nu", kind: "tarjeta", currency: "COP", color: "#5b3fd6", cutDay: 25, createdAt: at },
    ],
    purchases: [],
    incomes: [],
    obligations: [],
    payments: [],
    inbox: [],
    expenses: [],
    log: [],
  };
});

describe("ingestPurchase", () => {
  it("registra compras de crédito (formatos A y B) a 1 cuota y por revisar", async () => {
    const [a] = await finance.ingestPurchase({ canal: "correo", id: "g1", texto: CREDIT_A });
    const [b] = await finance.ingestPurchase({ canal: "correo", id: "g2", texto: CREDIT_B });
    expect(a).toMatchObject({ status: "registrado", mensaje: "Registrado: $7.500 en Spotify.com · Mastercard Bancolombia (1 cuota)" });
    expect(b.status).toBe("registrado");
    expect(state.db.purchases).toHaveLength(2);
    expect(state.db.purchases[0]).toMatchObject({
      sourceId: "mc",
      amount: 7500,
      installments: 1,
      firstMonth: "2026-10",
      origin: "correo",
      externalId: "g1",
      merchant: "SPOTIFY.COM",
      occurredAt: "2026-10-01T20:37:00.000Z",
      needsReview: true,
    });
    // Se puede deshacer como cualquier registro.
    expect(state.db.log.map((l) => l.entity)).toEqual(["purchase", "purchase"]);
  });

  it("el mismo id dos veces → una sola compra", async () => {
    await finance.ingestPurchase({ canal: "correo", id: "g1", texto: CREDIT_A });
    const [again] = await finance.ingestPurchase({ canal: "correo", id: "g1", texto: CREDIT_A });
    expect(again.status).toBe("duplicado");
    expect(state.db.purchases).toHaveLength(1);
  });

  it("pagos a la tarjeta y transferencias se ignoran sin escribir", async () => {
    const r = await Promise.all([
      finance.ingestPurchase({ canal: "correo", texto: "Pagaste $31250.40 a NU Compania de Financiamiento desde tu producto 0001 el 03/10/2026 11:59:48." }),
      finance.ingestPurchase({ canal: "correo", texto: "Transferiste $75300.00 desde tu cuenta *0001 a la cuenta *5555 el 30/09/26 a las 19:49." }),
      finance.ingestPurchase({ canal: "correo", texto: "ANA, transferiste $52100.00 a la llave 3001234567 el 30/09/2026" }),
    ]);
    expect(r.map(([x]) => x.status === "ignorado" && x.reason)).toEqual(["pago de tarjeta", "transferencia", "transferencia"]);
    expect(state.writes).toBe(0);
    expect(state.db.purchases).toHaveLength(0);
    expect(state.db.expenses).toHaveLength(0);
  });

  it("débito sin cuenta de débito registrada: gasto del mes con 'Débito *8765', sin bandeja ni revisión", async () => {
    const [r] = await finance.ingestPurchase({ canal: "correo", id: "d1", texto: DEBIT });
    expect(r).toMatchObject({ status: "registrado", mensaje: "Gasto registrado: $6.200 en Oxxo Calle 80 · Débito *8765" });
    expect(state.db.expenses).toHaveLength(1);
    expect(state.db.expenses[0]).toMatchObject({
      description: "Oxxo Calle 80",
      amount: 6200,
      currency: "COP",
      month: "2026-10",
      occurredAt: "2026-10-02T17:55:00.000Z",
      merchant: "OXXO CALLE 80",
      last4: "8765",
      origin: "correo",
      externalId: "d1",
    });
    expect(state.db.expenses[0]).not.toHaveProperty("sourceId");
    expect(state.db.inbox).toHaveLength(0);
    expect(state.db.purchases).toHaveLength(0);
    // Descuenta del disponible de octubre, no de "por pagar".
    const s = await finance.getSummary("2026-10");
    expect(s.spent).toBe(6200);
    expect(s.pendingToPay).toBe(0);
    expect(s.available).toBe(-6200);
    // Se puede deshacer.
    expect(state.db.log.at(-1)?.entity).toBe("expense");
    await finance.undoLast();
    expect(state.db.expenses).toHaveLength(0);
  });

  it("débito con cuenta registrada (últimos 4): se asocia y el mensaje usa su nombre", async () => {
    const deb = await finance.addSource({ name: "Débito", kind: "debito", last4: "8765", cutDay: 10 });
    expect(deb).not.toHaveProperty("cutDay"); // las cuentas de débito no tienen corte
    const [r] = await finance.ingestPurchase({ canal: "correo", id: "d1", texto: DEBIT });
    expect(r.mensaje).toBe("Gasto registrado: $6.200 en Oxxo Calle 80 · Débito");
    expect(state.db.expenses[0].sourceId).toBe(deb.id);
  });

  it("débito: el mismo id dos veces → un solo gasto; misma cuenta, monto y hora → duplicado", async () => {
    await finance.ingestPurchase({ canal: "correo", id: "d1", texto: DEBIT });
    const [again] = await finance.ingestPurchase({ canal: "correo", id: "d1", texto: DEBIT });
    expect(again).toMatchObject({ status: "duplicado", mensaje: "Ya estaba registrado: $6.200 en Oxxo Calle 80 · Débito *8765" });
    const [sms] = await finance.ingestPurchase({ canal: "sms", texto: DEBIT.replace("12:55", "13:05") });
    expect(sms.status).toBe("duplicado");
    expect(state.db.expenses).toHaveLength(1);
    // Otro monto sí es otro gasto.
    await finance.ingestPurchase({ canal: "correo", id: "d2", texto: DEBIT.replace("6.200", "7.200") });
    expect(state.db.expenses).toHaveLength(2);
  });

  it("los gastos sin cuenta se asocian solos al agregar la cuenta de débito con esos dígitos", async () => {
    await finance.ingestPurchase({ canal: "correo", id: "d1", texto: DEBIT });
    const deb = await finance.addSource({ name: "Bancolombia Ahorros", kind: "debito", last4: "8765" });
    expect(state.db.expenses[0].sourceId).toBe(deb.id);
  });

  it("Apple Pay: tarjeta de débito → gasto; de crédito → compra", async () => {
    await finance.addSource({ name: "Débito Bancolombia", kind: "debito", last4: "8765" });
    const t = new Date("2026-10-03T15:00:00.000Z");
    const [a] = await finance.ingestPurchase({ canal: "applepay", comercio: "Juan Valdez", monto: "$12.000", tarjeta: "Débito Bancolombia" }, t);
    expect(a.mensaje).toBe("Gasto registrado: $12.000 en Juan Valdez · Débito Bancolombia");
    const [b] = await finance.ingestPurchase({ canal: "applepay", comercio: "Rappi", monto: "$45.900", tarjeta: "Mastercard" }, t);
    expect(b.mensaje).toBe("Registrado: $45.900 en Rappi · Mastercard Bancolombia (1 cuota)");
    expect(state.db.expenses).toHaveLength(1);
    expect(state.db.purchases).toHaveLength(1);
  });

  it("un correo con crédito y débito: una compra y un gasto", async () => {
    const r = await finance.ingestPurchase({ canal: "correo", id: "m", texto: `${CREDIT_A}\n\n${DEBIT}` });
    expect(r.map((x) => x.status)).toEqual(["registrado", "registrado"]);
    expect(state.db.purchases).toHaveLength(1);
    expect(state.db.expenses).toHaveLength(1);
    expect(state.db.expenses[0].externalId).toBe("m#2");
  });

  it("Apple Pay + SMS de la misma compra → una sola compra", async () => {
    const t0 = new Date("2026-10-03T15:00:00.000Z");
    const [ap] = await finance.ingestPurchase({ canal: "applepay", comercio: "Rappi", monto: "$45.900", tarjeta: "Nu" }, t0);
    expect(ap).toMatchObject({ status: "registrado", mensaje: "Registrado: $45.900 en Rappi · Nu (1 cuota)" });
    const t1 = new Date("2026-10-03T15:03:00.000Z");
    const [sms] = await finance.ingestPurchase({ canal: "sms", texto: "Nu: Compra aprobada por $45.900 en RAPPI." }, t1);
    expect(sms.status).toBe("duplicado");
    expect(state.db.purchases).toHaveLength(1);
    expect(state.db.purchases[0].origin).toBe("applepay");
  });

  it("después del día de corte la primera cuota es el mes siguiente", async () => {
    await finance.ingestPurchase({ canal: "applepay", comercio: "X", monto: "10.000", tarjeta: "Nu" }, new Date("2026-10-28T15:00:00.000Z"));
    expect(state.db.purchases[0].firstMonth).toBe("2026-11");
  });

  it("tarjeta desconocida → bandeja; asignarla crea la compra y aprende los dígitos", async () => {
    const [r] = await finance.ingestPurchase({
      canal: "correo",
      id: "g9",
      texto: "Compraste COP20.000,00 en CINE COLOMBIA con tu T.Cred *5555, el 02/10/2026 a las 20:00.",
    });
    expect(r).toMatchObject({ status: "por revisar", mensaje: "Por revisar: $20.000 en Cine Colombia (no encontré la tarjeta *5555)" });
    expect(state.db.inbox).toHaveLength(1);
    // Repetido: no se duplica en la bandeja.
    await finance.ingestPurchase({ canal: "correo", id: "g9", texto: "lo que sea" });
    expect(state.db.inbox).toHaveLength(1);

    const item = state.db.inbox[0];
    const p = await finance.resolveInboxItem(item.id, { sourceId: "nu", installments: 3 });
    expect(p).toMatchObject({ sourceId: "nu", amount: 20000, installments: 3, description: "Cine Colombia", origin: "correo", externalId: "g9" });
    expect(p).not.toHaveProperty("needsReview");
    expect(state.db.inbox).toHaveLength(0);
    expect(state.db.sources.find((s) => s.id === "nu")?.last4).toBe("5555");
  });

  it("descartar de la bandeja y confirmar una compra", async () => {
    await finance.ingestPurchase({ canal: "sms", texto: "Mensaje raro con $5.000 sin sentido" });
    const [item] = await finance.listInbox();
    expect(item.text).toContain("$5.000");
    await finance.discardInboxItem(item.id);
    expect(state.db.inbox).toHaveLength(0);

    const [r] = await finance.ingestPurchase({ canal: "correo", id: "g1", texto: CREDIT_A });
    const id = r.status === "registrado" && "purchase" in r ? r.purchase.id : "";
    expect((await finance.listPendingReview()).purchases).toHaveLength(1);
    await finance.confirmPurchase(id);
    expect(state.db.purchases[0]).not.toHaveProperty("needsReview");
    expect((await finance.listPendingReview()).purchases).toHaveLength(0);
  });

  it("editar la compra (app o Claude) la da por revisada", async () => {
    await finance.ingestPurchase({ canal: "correo", id: "g1", texto: CREDIT_A });
    const r = await executeTool("editar_movimiento", { tipo: "compra", id: state.db.purchases[0].id, cuotas: 3 });
    expect(r.ok).toBe(true);
    expect(state.db.purchases[0]).toMatchObject({ installments: 3 });
    expect(state.db.purchases[0]).not.toHaveProperty("needsReview");
  });

  it("revisar_pendientes lista compras sin confirmar y la bandeja", async () => {
    let r = await executeTool("revisar_pendientes", {});
    expect(r).toMatchObject({ ok: true, mensaje: "No hay nada por revisar." });
    await finance.ingestPurchase({ canal: "correo", id: "g1", texto: CREDIT_A });
    await finance.ingestPurchase({ canal: "correo", id: "g2", texto: "Compraste COP1.000,00 en X con tu T.Cred *0000, el 02/10/2026 a las 20:00." });
    r = await executeTool("revisar_pendientes", {});
    expect(r.ok).toBe(true);
    expect(r.mensaje).toContain("Spotify.com");
    expect(r.mensaje).toContain("*0000");
    expect(r.datos).toMatchObject({ compras: [{ fuente: "Mastercard Bancolombia", cuotas: 1 }], bandeja: [{ monto: 1000 }] });
  });
});

describe("fuentes con últimos 4 dígitos", () => {
  it("guarda, valida, impide repetidos y borra", async () => {
    const s = await finance.addSource({ name: "Visa", last4: "4321" });
    expect(s.last4).toBe("4321");
    await expect(finance.addSource({ name: "Otra", last4: "12" })).rejects.toThrow(/4 números/);
    await expect(finance.addSource({ name: "Otra", last4: "5678" })).rejects.toThrow(/ya tiene/);
    await expect(finance.updateSource(s.id, { last4: "5678" })).rejects.toThrow(/ya tiene/);
    const cleared = await finance.updateSource(s.id, { last4: null });
    expect(cleared).not.toHaveProperty("last4");
  });
});
