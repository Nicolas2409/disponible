// Servicio de dominio (solo servidor). Lo usan las server actions, el servidor MCP y la voz.
import { randomUUID } from "node:crypto";
import {
  incomeActive,
  installmentAmount,
  installmentFor,
  isPaid,
  lastInstallmentMonth,
  obligationActive,
  summarizeMonth,
  summarizeRange,
} from "./calc";
import { getRates } from "./fx";
import { addMonths, compareMonths, currentMonth, monthDiff } from "./month";
import {
  formatZodError,
  NewExpenseInput,
  NewIncomeInput,
  NewObligationInput,
  NewPurchaseInput,
  NewSourceInput,
  SettingsInput,
  UpdateExpenseInput,
  UpdateIncomeInput,
  UpdateObligationInput,
  UpdatePurchaseInput,
  UpdateSourceInput,
} from "./schemas";
import { findSourceInList, normalizeText } from "./source-match";
import { mutateDb, readDb } from "./store";
import type {
  Db,
  Expense,
  InboxItem,
  Income,
  MonthKey,
  MonthSummary,
  Obligation,
  Payment,
  Purchase,
  Settings,
  Source,
} from "./types";
import { z } from "zod";
import {
  describeIgnored,
  describePlan,
  expenseInstant,
  firstMonthFor,
  IngestBody,
  interpret,
  monthOf,
  planIngest,
  prettyMerchant,
  trimInbox,
  type IgnoreReason,
  type ParsedMovement,
} from "./ingest";

export type EntityKind = "source" | "purchase" | "income" | "obligation" | "expense";

export type PurchaseDetail = Purchase & {
  /** Número de cuota del mes actual (0 si aún no empieza, N si ya terminó). */
  installment: number;
  perInstallment: number;
  /**
   * Cuotas pagadas: las de meses anteriores al actual se asumen pagadas, más la del
   * mes actual si la fuente tiene marca de pagado este mes.
   */
  paidCount: number;
  /** (installments − paidCount) × perInstallment, en moneda de la compra. */
  remainingAmount: number;
  lastMonth: MonthKey;
  /** Tiene cuota en el mes actual. */
  active: boolean;
};

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error(formatZodError(r.error));
  return r.data;
}

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

const PALETTE = ["#1c1c1e", "#c8102e", "#0f7c8a", "#5b3fd6", "#e07a10", "#2f855a", "#b83280"];

// ---------- Lectura ----------

export async function getSummary(month: MonthKey = currentMonth()): Promise<MonthSummary> {
  const [db, rates] = await Promise.all([readDb(), getRates()]);
  return summarizeMonth(db, month, rates);
}

export async function getRange(from: MonthKey, count: number): Promise<MonthSummary[]> {
  const [db, rates] = await Promise.all([readDb(), getRates()]);
  return summarizeRange(db, from, count, rates);
}

export async function getSettings(): Promise<Settings> {
  return (await readDb()).settings;
}

export async function listSources(): Promise<Source[]> {
  return (await readDb()).sources;
}

export async function getSourceDetail(
  id: string,
): Promise<{ source: Source; purchases: PurchaseDetail[] } | null> {
  const db = await readDb();
  const source = db.sources.find((s) => s.id === id);
  if (!source) return null;
  const month = currentMonth();
  const paidThisMonth = isPaid(db, source.id, month);

  const purchases = db.purchases
    .filter((p) => p.sourceId === id)
    .map((p): PurchaseDetail => {
      const perInstallment = installmentAmount(p);
      const elapsed = monthDiff(p.firstMonth, month); // cuotas de meses anteriores = elapsed
      const current = installmentFor(p, month);
      const installment = current ? current.number : elapsed < 0 ? 0 : p.installments;
      let paidCount = Math.min(Math.max(elapsed, 0), p.installments);
      if (current && paidThisMonth) paidCount += 1;
      return {
        ...p,
        installment,
        perInstallment,
        paidCount,
        remainingAmount: (p.installments - paidCount) * perInstallment,
        lastMonth: lastInstallmentMonth(p),
        active: current !== null,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || compareMonths(b.firstMonth, a.firstMonth));

  return { source, purchases };
}

/** Búsqueda difusa sin tildes ni mayúsculas: "visa" → "Visa Bancolombia". */
export async function findSourceByName(query: string): Promise<Source | null> {
  return findSourceInList((await readDb()).sources, query);
}

// ---------- Escritura ----------

export async function updateSettings(input: SettingsInput): Promise<Settings> {
  const data = parse(SettingsInput, input);
  return mutateDb((db) => {
    const base = data.baseCurrency ?? db.settings.baseCurrency;
    const currencies = Array.from(new Set([base, ...(data.currencies ?? db.settings.currencies)]));
    db.settings = { baseCurrency: base, currencies };
    return db.settings;
  });
}

function pushLog(db: Db, entity: Db["log"][number]["entity"], id: string) {
  db.log.push({ entity, id, at: now() });
  if (db.log.length > 200) db.log.splice(0, db.log.length - 200);
}

/** Dos tarjetas no pueden tener los mismos últimos 4 dígitos (el registro automático no sabría cuál es). */
function checkLast4(db: Db, last4: string | undefined, exceptId?: string) {
  if (!last4) return;
  const other = db.sources.find((s) => s.last4 === last4 && s.id !== exceptId);
  if (other) throw new Error(`«${other.name}» ya tiene los dígitos ${last4}.`);
}

/** Las cuentas de débito no reciben compras a cuotas: lo que se paga con ellas es un gasto. */
function checkCreditSource(source: Source) {
  if (source.kind === "debito") {
    throw new Error(`«${source.name}» es una cuenta de débito: anota ese pago como gasto, no como compra.`);
  }
}

/** Fuente válida para un gasto: existe y no es tarjeta de crédito. */
function expenseSource(db: Db, sourceId: string): Source {
  const source = db.sources.find((s) => s.id === sourceId);
  if (!source) throw new Error(`No existe la fuente "${sourceId}"`);
  if (source.kind === "tarjeta") {
    throw new Error(`«${source.name}» es tarjeta de crédito: anota ese pago como compra.`);
  }
  return source;
}

/** Gastos automáticos que llegaron sin cuenta ("Débito *8765"): se asocian a la cuenta con esos dígitos. */
function linkOrphanExpenses(db: Db, source: Source) {
  if (source.kind !== "debito" || !source.last4) return;
  for (const e of db.expenses) {
    if (!e.sourceId && e.last4 === source.last4) e.sourceId = source.id;
  }
}

export async function addSource(input: NewSourceInput): Promise<Source> {
  const data = parse(NewSourceInput, input);
  return mutateDb((db) => {
    // Débito o cuenta: sin día de corte ni de pago.
    const days = data.kind !== "debito";
    const source: Source = {
      id: newId("src"),
      name: data.name,
      kind: data.kind,
      currency: data.currency ?? db.settings.baseCurrency,
      color: data.color ?? PALETTE[db.sources.length % PALETTE.length],
      ...(days && data.cutDay !== undefined ? { cutDay: data.cutDay } : {}),
      ...(days && data.dueDay !== undefined ? { dueDay: data.dueDay } : {}),
      ...(data.last4 ? { last4: data.last4 } : {}),
      createdAt: now(),
    };
    checkLast4(db, source.last4);
    db.sources.push(source);
    linkOrphanExpenses(db, source);
    pushLog(db, "source", source.id);
    return source;
  });
}

export async function addPurchase(input: NewPurchaseInput): Promise<Purchase> {
  const data = parse(NewPurchaseInput, input);
  return mutateDb((db) => {
    const source = db.sources.find((s) => s.id === data.sourceId);
    if (!source) throw new Error(`No existe la fuente "${data.sourceId}"`);
    checkCreditSource(source);
    const purchase: Purchase = {
      id: newId("pur"),
      sourceId: source.id,
      description: data.description,
      amount: data.amount,
      currency: data.currency ?? source.currency,
      installments: data.installments,
      firstMonth: data.firstMonth,
      ...(data.monthlyRate ? { monthlyRate: data.monthlyRate } : {}),
      createdAt: now(),
    };
    db.purchases.push(purchase);
    pushLog(db, "purchase", purchase.id);
    return purchase;
  });
}

export async function addIncome(input: NewIncomeInput): Promise<Income> {
  const data = parse(NewIncomeInput, input);
  return mutateDb((db) => {
    const income: Income = {
      id: newId("inc"),
      description: data.description,
      amount: data.amount,
      currency: data.currency ?? db.settings.baseCurrency,
      recurring: data.recurring,
      month: data.month,
      ...(data.recurring && data.endMonth ? { endMonth: data.endMonth } : {}),
      createdAt: now(),
    };
    db.incomes.push(income);
    pushLog(db, "income", income.id);
    return income;
  });
}

export async function addExpense(input: NewExpenseInput, at: Date = new Date()): Promise<Expense> {
  const data = parse(NewExpenseInput, input);
  const occurredAt = expenseInstant(data.date, at);
  return mutateDb((db) => {
    const source = data.sourceId ? expenseSource(db, data.sourceId) : undefined;
    const expense: Expense = {
      id: newId("exp"),
      description: data.description,
      amount: data.amount,
      currency: data.currency ?? source?.currency ?? db.settings.baseCurrency,
      month: monthOf(occurredAt),
      occurredAt,
      ...(source ? { sourceId: source.id } : {}),
      createdAt: now(),
    };
    db.expenses.push(expense);
    pushLog(db, "expense", expense.id);
    return expense;
  });
}

export async function addObligation(input: NewObligationInput): Promise<Obligation> {
  const data = parse(NewObligationInput, input);
  return mutateDb((db) => {
    if (data.sourceId && !db.sources.some((s) => s.id === data.sourceId)) {
      throw new Error(`No existe la fuente "${data.sourceId}"`);
    }
    const obligation: Obligation = {
      id: newId("obl"),
      name: data.name,
      amount: data.amount,
      currency: data.currency ?? db.settings.baseCurrency,
      startMonth: data.startMonth,
      ...(data.endMonth ? { endMonth: data.endMonth } : {}),
      ...(data.sourceId ? { sourceId: data.sourceId } : {}),
      createdAt: now(),
    };
    db.obligations.push(obligation);
    pushLog(db, "obligation", obligation.id);
    return obligation;
  });
}

/** Marca una fuente u obligación como pagada en `month` (idempotente). */
export async function markPaid(targetId: string, month: MonthKey = currentMonth()): Promise<Payment> {
  return mutateDb((db) => {
    const exists =
      db.sources.some((s) => s.id === targetId) || db.obligations.some((o) => o.id === targetId);
    if (!exists) throw new Error(`No existe la fuente u obligación "${targetId}"`);
    const prev = db.payments.find((p) => p.targetId === targetId && p.month === month);
    if (prev) return prev;
    const payment: Payment = { id: newId("pay"), targetId, month, createdAt: now() };
    db.payments.push(payment);
    pushLog(db, "payment", payment.id);
    return payment;
  });
}

export async function unmarkPaid(targetId: string, month: MonthKey = currentMonth()): Promise<void> {
  await mutateDb((db) => {
    db.payments = db.payments.filter((p) => !(p.targetId === targetId && p.month === month));
  });
}

// ---------- Edición ----------

/**
 * Aplica un parche ya validado: `undefined` = sin cambio, `null` = borrar el campo.
 * Devuelve un objeto nuevo (no muta `cur`).
 */
function applyPatch<T extends object>(cur: T, patch: Record<string, unknown>): T {
  const next = { ...cur } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next as T;
}

function checkRange(start: MonthKey, end: MonthKey | undefined) {
  if (end && compareMonths(end, start) < 0) throw new Error("El mes final es anterior al inicial.");
}

export async function updatePurchase(id: string, patch: UpdatePurchaseInput): Promise<Purchase> {
  const data = parse(UpdatePurchaseInput, patch);
  return mutateDb((db) => {
    const i = db.purchases.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`No existe la compra "${id}"`);
    if (data.sourceId !== undefined) {
      const source = db.sources.find((s) => s.id === data.sourceId);
      if (!source) throw new Error(`No existe la fuente "${data.sourceId}"`);
      checkCreditSource(source);
    }
    const next = applyPatch(db.purchases[i], {
      ...data,
      // Tasa 0 equivale a sin interés: no se guarda.
      monthlyRate: data.monthlyRate === 0 ? null : data.monthlyRate,
      // Editarla (en la app o con Claude) cuenta como revisada.
      needsReview: null,
    });
    db.purchases[i] = next;
    return next;
  });
}

export async function updateIncome(id: string, patch: UpdateIncomeInput): Promise<Income> {
  const data = parse(UpdateIncomeInput, patch);
  return mutateDb((db) => {
    const i = db.incomes.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`No existe el ingreso "${id}"`);
    const next = applyPatch(db.incomes[i], data);
    if (!next.recurring) delete next.endMonth; // un ingreso único no tiene fin
    checkRange(next.month, next.endMonth);
    db.incomes[i] = next;
    return next;
  });
}

export async function updateExpense(id: string, patch: UpdateExpenseInput, at: Date = new Date()): Promise<Expense> {
  const data = parse(UpdateExpenseInput, patch);
  const occurredAt = data.date !== undefined ? expenseInstant(data.date, at) : undefined;
  return mutateDb((db) => {
    const i = db.expenses.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`No existe el gasto "${id}"`);
    if (data.sourceId) expenseSource(db, data.sourceId);
    const { date: _date, ...rest } = data;
    void _date;
    const next = applyPatch(db.expenses[i], {
      ...rest,
      ...(occurredAt ? { occurredAt, month: monthOf(occurredAt) } : {}),
    });
    db.expenses[i] = next;
    return next;
  });
}

export async function updateObligation(id: string, patch: UpdateObligationInput): Promise<Obligation> {
  const data = parse(UpdateObligationInput, patch);
  return mutateDb((db) => {
    const i = db.obligations.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`No existe la obligación "${id}"`);
    if (data.sourceId && !db.sources.some((s) => s.id === data.sourceId)) {
      throw new Error(`No existe la fuente "${data.sourceId}"`);
    }
    const next = applyPatch(db.obligations[i], data);
    checkRange(next.startMonth, next.endMonth);
    db.obligations[i] = next;
    return next;
  });
}

export async function updateSource(id: string, patch: UpdateSourceInput): Promise<Source> {
  const data = parse(UpdateSourceInput, patch);
  return mutateDb((db) => {
    const i = db.sources.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`No existe la fuente "${id}"`);
    const next = applyPatch(db.sources[i], data);
    checkLast4(db, next.last4, id);
    if (next.kind === "debito") {
      if (db.purchases.some((p) => p.sourceId === id)) {
        throw new Error(`«${next.name}» tiene compras a cuotas: no puede ser cuenta de débito.`);
      }
      delete next.cutDay;
      delete next.dueDay;
    }
    db.sources[i] = next;
    linkOrphanExpenses(db, next);
    return next;
  });
}

// ---------- Movimientos (para el asistente) ----------

export type MovementKind = "purchase" | "income" | "obligation" | "expense";

export interface Movement {
  kind: MovementKind;
  id: string;
  description: string;
  amount: number;
  currency: string;
  /** Compra: primera cuota. Ingreso: mes (o inicio). Obligación: inicio. Gasto: su mes. */
  month: MonthKey;
  /** Solo gastos: fecha y hora (ISO). */
  date?: string;
  endMonth?: MonthKey;
  installments?: number;
  recurring?: boolean;
  sourceId?: string;
  sourceName?: string;
}

function movementsOf(db: Db, kind?: MovementKind, month?: MonthKey): Movement[] {
  const out: Movement[] = [];
  const srcName = (id?: string) => (id ? db.sources.find((s) => s.id === id)?.name : undefined);
  if (!kind || kind === "income") {
    for (const i of db.incomes) {
      if (month && !incomeActive(i, month)) continue;
      out.push({
        kind: "income",
        id: i.id,
        description: i.description,
        amount: i.amount,
        currency: i.currency,
        month: i.month,
        ...(i.endMonth ? { endMonth: i.endMonth } : {}),
        recurring: i.recurring,
      });
    }
  }
  if (!kind || kind === "purchase") {
    for (const p of db.purchases) {
      if (month && !installmentFor(p, month)) continue;
      out.push({
        kind: "purchase",
        id: p.id,
        description: p.description,
        amount: p.amount,
        currency: p.currency,
        month: p.firstMonth,
        endMonth: lastInstallmentMonth(p),
        installments: p.installments,
        sourceId: p.sourceId,
        sourceName: srcName(p.sourceId),
      });
    }
  }
  if (!kind || kind === "obligation") {
    for (const o of db.obligations) {
      if (month && !obligationActive(o, month)) continue;
      out.push({
        kind: "obligation",
        id: o.id,
        description: o.name,
        amount: o.amount,
        currency: o.currency,
        month: o.startMonth,
        ...(o.endMonth ? { endMonth: o.endMonth } : {}),
        ...(o.sourceId ? { sourceId: o.sourceId, sourceName: srcName(o.sourceId) } : {}),
      });
    }
  }
  if (!kind || kind === "expense") {
    const when = (e: Expense) => e.occurredAt ?? e.createdAt;
    const sorted = [...db.expenses].sort((a, b) => when(b).localeCompare(when(a)));
    for (const e of sorted) {
      if (month && e.month !== month) continue;
      out.push({
        kind: "expense",
        id: e.id,
        description: e.description,
        amount: e.amount,
        currency: e.currency,
        month: e.month,
        ...(e.occurredAt ? { date: e.occurredAt } : {}),
        ...(e.sourceId ? { sourceId: e.sourceId, sourceName: srcName(e.sourceId) } : {}),
      });
    }
  }
  return out;
}

/** Lista compras, ingresos, obligaciones y gastos (opcionalmente de un tipo y/o vigentes en `month`). */
export async function listMovements(opts: { kind?: MovementKind; month?: MonthKey } = {}): Promise<Movement[]> {
  return movementsOf(await readDb(), opts.kind, opts.month);
}

export type ResolveResult =
  | { status: "ok"; movement: Movement }
  | { status: "ambiguous" | "none"; candidates: Movement[] };

/**
 * Busca un movimiento por id exacto o por descripción difusa (sin tildes ni mayúsculas).
 * Si varias coinciden igual de bien devuelve "ambiguous" con las candidatas; nunca adivina.
 */
export async function resolveMovement(kind: MovementKind, ref: { id?: string; query?: string }): Promise<ResolveResult> {
  const all = movementsOf(await readDb(), kind);
  if (ref.id) {
    const hit = all.find((m) => m.id === ref.id);
    return hit ? { status: "ok", movement: hit } : { status: "none", candidates: all };
  }
  const q = normalizeText(ref.query ?? "");
  if (!q) return { status: "none", candidates: all };
  const named = all.map((m) => ({ m, n: normalizeText(m.description) }));
  const qTokens = q.split(" ");
  const tests: Array<(n: string) => boolean> = [
    (n) => n === q,
    (n) => n.startsWith(q),
    (n) => n.includes(q),
    (n) => qTokens.every((t) => n.includes(t)),
    (n) => n.length > 0 && n.split(" ").every((t) => q.includes(t)),
    (n) => qTokens.some((t) => t.length >= 3 && n.split(" ").some((w) => w.startsWith(t))),
  ];
  for (const test of tests) {
    const hits = named.filter(({ n }) => test(n)).map(({ m }) => m);
    if (hits.length === 1) return { status: "ok", movement: hits[0] };
    if (hits.length > 1) return { status: "ambiguous", candidates: hits };
  }
  return { status: "none", candidates: all };
}

/** Elimina en `db` y devuelve una descripción legible, o null si no existía. */
function removeEntity(db: Db, entity: Db["log"][number]["entity"], id: string): string | null {
  let description: string | null = null;
  switch (entity) {
    case "source": {
      const s = db.sources.find((x) => x.id === id);
      if (!s) return null;
      description = s.name;
      const purchaseIds = new Set(db.purchases.filter((p) => p.sourceId === id).map((p) => p.id));
      db.sources = db.sources.filter((x) => x.id !== id);
      db.purchases = db.purchases.filter((p) => p.sourceId !== id);
      // Los gastos se conservan (el dinero ya salió), solo pierden la cuenta.
      for (const e of db.expenses) if (e.sourceId === id) delete e.sourceId;
      db.payments = db.payments.filter((p) => p.targetId !== id);
      db.obligations = db.obligations.map((o) => {
        if (o.sourceId !== id) return o;
        const { sourceId: _drop, ...rest } = o;
        void _drop;
        return rest;
      });
      db.log = db.log.filter((l) => !(l.entity === "purchase" && purchaseIds.has(l.id)));
      break;
    }
    case "purchase": {
      const p = db.purchases.find((x) => x.id === id);
      if (!p) return null;
      description = p.description;
      db.purchases = db.purchases.filter((x) => x.id !== id);
      break;
    }
    case "income": {
      const i = db.incomes.find((x) => x.id === id);
      if (!i) return null;
      description = i.description;
      db.incomes = db.incomes.filter((x) => x.id !== id);
      break;
    }
    case "obligation": {
      const o = db.obligations.find((x) => x.id === id);
      if (!o) return null;
      description = o.name;
      db.obligations = db.obligations.filter((x) => x.id !== id);
      db.payments = db.payments.filter((p) => p.targetId !== id);
      break;
    }
    case "expense": {
      const e = db.expenses.find((x) => x.id === id);
      if (!e) return null;
      description = e.description;
      db.expenses = db.expenses.filter((x) => x.id !== id);
      break;
    }
    case "payment": {
      const p = db.payments.find((x) => x.id === id);
      if (!p) return null;
      const target =
        db.sources.find((s) => s.id === p.targetId)?.name ??
        db.obligations.find((o) => o.id === p.targetId)?.name ??
        p.targetId;
      description = `Pago de ${target} (${p.month})`;
      db.payments = db.payments.filter((x) => x.id !== id);
      break;
    }
  }
  db.log = db.log.filter((l) => !(l.entity === entity && l.id === id));
  return description;
}

export async function deleteEntity(entity: EntityKind, id: string): Promise<void> {
  await mutateDb((db) => {
    if (removeEntity(db, entity, id) === null) throw new Error(`No existe ${entity} "${id}"`);
  });
}

/** Deshace la última creación registrada (compra, gasto, ingreso, fuente, obligación o marca de pago). */
export async function undoLast(): Promise<{ entity: string; id: string; description: string } | null> {
  return mutateDb((db) => {
    while (db.log.length > 0) {
      const last = db.log[db.log.length - 1];
      const description = removeEntity(db, last.entity, last.id);
      if (description !== null) return { entity: last.entity, id: last.id, description };
      db.log.pop(); // entrada huérfana (ya eliminada): seguir buscando
    }
    return null;
  });
}

// ---------- Registro automático (alertas del banco, SMS, Apple Pay) ----------

export type IngestOutcome =
  | { status: "registrado"; mensaje: string; purchase: Purchase }
  | { status: "duplicado"; mensaje: string; purchase: Purchase }
  | { status: "registrado"; mensaje: string; expense: Expense }
  | { status: "duplicado"; mensaje: string; expense: Expense }
  | { status: "por revisar"; mensaje: string; item: InboxItem }
  | { status: "ignorado"; mensaje: string; reason: IgnoreReason };

/**
 * Registra lo que llega a /api/ingesta. Las compras con tarjeta de crédito crean compras
 * (1 cuota, marcadas "por revisar"); las compras con débito crean gastos del mes; transferencias
 * y pagos se ignoran sin guardar; lo que no tiene tarjeta conocida o no se entiende va a la
 * bandeja. Idempotente por `id`.
 */
export async function ingestPurchase(input: IngestBody, at: Date = new Date()): Promise<IngestOutcome[]> {
  const body = parse(IngestBody, input);
  const items = interpret(body, at);
  const receivedAt = at.toISOString();

  const ignoredOutcome = (m: Extract<ParsedMovement, { kind: "ignorado" }>): IngestOutcome => ({
    status: "ignorado",
    reason: m.reason,
    mensaje: describeIgnored(m),
  });

  // Nada que guardar: no se escribe en la base de datos.
  if (items.every((i) => i.movement.kind === "ignorado")) {
    return items.map((i) => ignoredOutcome(i.movement as Extract<ParsedMovement, { kind: "ignorado" }>));
  }

  return mutateDb((db) =>
    items.map(({ movement, externalId }): IngestOutcome => {
      if (movement.kind === "ignorado") return ignoredOutcome(movement);
      const plan = planIngest(db, movement, { channel: body.canal, externalId, receivedAt });
      const mensaje = describePlan(plan);
      switch (plan.type) {
        case "create": {
          const purchase: Purchase = { id: newId("pur"), ...plan.purchase, createdAt: now() };
          db.purchases.push(purchase);
          pushLog(db, "purchase", purchase.id);
          return { status: "registrado", mensaje, purchase };
        }
        case "duplicate":
          return { status: "duplicado", mensaje, purchase: plan.purchase };
        case "expense": {
          const expense: Expense = { id: newId("exp"), ...plan.expense, createdAt: now() };
          db.expenses.push(expense);
          pushLog(db, "expense", expense.id);
          return { status: "registrado", mensaje, expense };
        }
        case "expense-duplicate":
          return { status: "duplicado", mensaje, expense: plan.expense };
        case "inbox": {
          const item: InboxItem = { id: newId("inb"), ...plan.item };
          db.inbox = trimInbox([...db.inbox, item]);
          return { status: "por revisar", mensaje, item };
        }
        case "inbox-duplicate":
          return { status: "por revisar", mensaje, item: plan.item };
      }
    }),
  );
}

export type ReviewPurchase = Purchase & { sourceName: string };

/** Compras automáticas sin confirmar (más recientes primero) y la bandeja de movimientos sin tarjeta. */
export async function listPendingReview(): Promise<{ purchases: ReviewPurchase[]; inbox: InboxItem[] }> {
  const db = await readDb();
  const name = (id: string) => db.sources.find((s) => s.id === id)?.name ?? "";
  const when = (p: Purchase) => p.occurredAt ?? p.createdAt;
  const purchases = db.purchases
    .filter((p) => p.needsReview)
    .map((p) => ({ ...p, sourceName: name(p.sourceId) }))
    .sort((a, b) => when(b).localeCompare(when(a)));
  return { purchases, inbox: [...db.inbox].reverse() };
}

export async function listInbox(): Promise<InboxItem[]> {
  return [...(await readDb()).inbox].reverse();
}

const ResolveInboxInput = z.object({
  sourceId: z.string().min(1, "Elige la tarjeta"),
  description: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).optional()),
  amount: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().positive().optional()),
  installments: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(72).default(1)),
});
export type ResolveInboxInput = { sourceId: string; description?: string; amount?: number; installments?: number };

/**
 * Asigna un movimiento de la bandeja a una tarjeta: crea la compra y lo quita de la bandeja.
 * Si la tarjeta aún no tiene últimos 4 dígitos y el movimiento los traía, se le guardan
 * para que las próximas alertas se asocien solas.
 */
export async function resolveInboxItem(id: string, input: ResolveInboxInput): Promise<Purchase> {
  const data = parse(ResolveInboxInput, input);
  return mutateDb((db) => {
    const item = db.inbox.find((x) => x.id === id);
    if (!item) throw new Error("Ese movimiento ya no está por revisar.");
    const source = db.sources.find((s) => s.id === data.sourceId);
    if (!source) throw new Error(`No existe la fuente "${data.sourceId}"`);
    checkCreditSource(source);
    const p = item.parsed ?? {};
    const amount = data.amount ?? p.amount;
    if (!amount || !(amount > 0)) throw new Error("Falta el monto.");
    const occurredAt = p.occurredAt ?? item.receivedAt;
    const purchase: Purchase = {
      id: newId("pur"),
      sourceId: source.id,
      description: data.description ?? prettyMerchant(p.merchant),
      amount,
      currency: p.currency ?? source.currency,
      installments: data.installments,
      firstMonth: firstMonthFor(occurredAt, source.cutDay),
      createdAt: now(),
      origin: item.channel,
      ...(item.externalId ? { externalId: item.externalId } : {}),
      ...(p.merchant ? { merchant: p.merchant } : {}),
      occurredAt,
    };
    db.purchases.push(purchase);
    pushLog(db, "purchase", purchase.id);
    db.inbox = db.inbox.filter((x) => x.id !== id);
    if (p.last4 && !source.last4 && !db.sources.some((s) => s.last4 === p.last4)) source.last4 = p.last4;
    return purchase;
  });
}

export async function discardInboxItem(id: string): Promise<void> {
  await mutateDb((db) => {
    if (!db.inbox.some((x) => x.id === id)) throw new Error("Ese movimiento ya no está por revisar.");
    db.inbox = db.inbox.filter((x) => x.id !== id);
  });
}

/** Confirma una compra automática tal como llegó (1 cuota está bien). */
export async function confirmPurchase(id: string): Promise<Purchase> {
  return mutateDb((db) => {
    const p = db.purchases.find((x) => x.id === id);
    if (!p) throw new Error(`No existe la compra "${id}"`);
    delete p.needsReview;
    return p;
  });
}

// Reexport útil para consumidores (MCP/voz)
export { addMonths, currentMonth };
