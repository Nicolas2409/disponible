// Registro automático de compras con tarjeta de crédito y gastos con débito (módulo puro: sin servidor ni base de datos).
//
// Canales → POST /api/ingesta:
//   - "correo":   alertas de Bancolombia reenviadas por Google Apps Script ({ texto, id }).
//   - "sms":      SMS de Nu (o Bancolombia) desde una automatización de Atajos ({ texto }).
//   - "applepay": automatización "Transacción" de Atajos ({ comercio, monto, tarjeta, fecha }).
//
// Aquí: validación del cuerpo, interpretación, clasificación, asociación con la tarjeta,
// detección de duplicados, mes de la primera cuota y planeación de lo que se guarda.
// Crédito → compra a 1 cuota "por revisar". Débito (T.Deb, o tarjeta tipo "debito") → gasto del mes.
// La escritura la hace lib/finance.ts (ingestPurchase).
import { z } from "zod";
import { formatMoney } from "../money";
import { addMonths } from "../month";
import { detectCurrency, parseMonto } from "../monto";
import { findSourceInList, normalizeText } from "../source-match";
import type { Db, Expense, InboxItem, InboxParsed, IngestChannel, MonthKey, Purchase, Source } from "../types";
import { looksLikeBancolombia, parseBancolombia } from "./bancolombia";
import { bogotaIso, bogotaParts, findMoney, squash, type ParsedMovement } from "./common";
import { parseNu } from "./nu";

export type { IgnoreReason, ParsedMovement } from "./common";
export { parseBancolombia } from "./bancolombia";
export { parseNu } from "./nu";

/** Ventana para considerar la misma compra llegada por dos canales (Apple Pay + SMS/correo). */
export const DUPLICATE_WINDOW_MIN = 20;
/** Tolerancia de monto (redondeos de centavos entre canales). */
export const DUPLICATE_AMOUNT_TOLERANCE = 1;
/** Máximo de caracteres del texto original que se guarda en la bandeja. */
const MAX_STORED_TEXT = 1500;
const MAX_INBOX = 200;

// ---------- Cuerpo de la petición ----------

const str = (max: number) => z.string().trim().max(max);

export const IngestBody = z.object({
  canal: z.enum(["correo", "sms", "applepay"]),
  texto: str(20_000).optional(),
  id: str(200).optional(),
  comercio: str(200).optional(),
  monto: z.union([z.number(), z.string().trim().max(60)]).optional(),
  tarjeta: str(120).optional(),
  fecha: str(60).optional(),
});
export type IngestBody = z.infer<typeof IngestBody>;

/** Fecha que manda un Atajo: ISO, "2026-10-03 14:05", "3/10/2026 2:05 p. m."… → ISO, o undefined. */
export function parseLooseDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?)?/i.exec(s);
  if (dmy) {
    const [, d, mo, y, h, mi, sec, ap] = dmy;
    let hour = h ? Number(h) : 12;
    if (ap && /p/i.test(ap) && hour < 12) hour += 12;
    if (ap && /a/i.test(ap) && hour === 12) hour = 0;
    return bogotaIso(Number(d), Number(mo), Number(y), hour, mi ? Number(mi) : 0, sec ? Number(sec) : 0);
  }
  // ISO sin zona → hora de Bogotá.
  const isoLocal = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(" ", "T")}-05:00` : s;
  const t = Date.parse(isoLocal);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

// ---------- Interpretación ----------

export interface Interpreted {
  movement: ParsedMovement;
  /** Id único del movimiento (id del mensaje, con #n si el mensaje traía varios). */
  externalId?: string;
}

/** Texto legible de un pedido de Apple Pay (para la bandeja). */
function applePayText(b: IngestBody): string {
  return [b.comercio && `Comercio: ${b.comercio}`, b.monto !== undefined && `Monto: ${b.monto}`, b.tarjeta && `Tarjeta: ${b.tarjeta}`]
    .filter(Boolean)
    .join(" · ") || "(Apple Pay sin datos)";
}

/** Convierte el cuerpo recibido en uno o más movimientos interpretados. Nunca lanza. */
export function interpret(body: IngestBody, now: Date = new Date()): Interpreted[] {
  const externalId = body.id || undefined;

  if (body.canal === "applepay") {
    const text = applePayText(body);
    let amount: number | undefined;
    try {
      amount = body.monto !== undefined ? parseMonto(body.monto) : undefined;
    } catch {
      amount = undefined;
    }
    if (!amount || !(amount > 0)) return [{ movement: { kind: "desconocido", text }, externalId }];
    return [
      {
        externalId,
        movement: {
          kind: "compra",
          amount,
          currency: typeof body.monto === "string" ? detectCurrency(body.monto) : "COP",
          ...(body.comercio ? { merchant: body.comercio } : {}),
          ...(body.tarjeta ? { cardName: body.tarjeta } : {}),
          // Crédito o débito lo decide la tarjeta asociada (tipo de la fuente), salvo que el nombre lo diga.
          ...(body.tarjeta && DEBIT_NAME_RE.test(body.tarjeta) ? { cardType: "debito" as const } : {}),
          occurredAt: parseLooseDate(body.fecha) ?? now.toISOString(),
          text,
        },
      },
    ];
  }

  const text = squash(body.texto ?? "");
  if (!text) return [{ movement: { kind: "ignorado", reason: "sin movimiento", text: "" }, externalId }];

  let movements: ParsedMovement[] = [];
  if (body.canal === "correo" || looksLikeBancolombia(text)) movements = parseBancolombia(text);
  if (movements.length === 0 && body.canal === "sms") movements = [parseNu(text)];
  if (movements.length === 0) {
    // Correo sin movimientos (avisos de seguridad, códigos…): sin monto no hay nada que revisar.
    movements = [findMoney(text) ? { kind: "desconocido", text } : { kind: "ignorado", reason: "sin movimiento", text }];
  }
  return movements.map((movement, i) => ({
    movement,
    externalId: externalId && movements.length > 1 ? `${externalId}#${i + 1}` : externalId,
  }));
}

// ---------- Tarjeta ----------

/** Nombre de tarjeta de Wallet que indica débito: "Débito Bancolombia", "Visa Debit"… */
const DEBIT_NAME_RE = /d[eé]bito|\bdebit\b/i;

const cardsFirst = (sources: Source[], kind: Source["kind"] = "tarjeta") => {
  const cards = sources.filter((s) => s.kind === kind);
  return cards.length ? cards : sources;
};

/**
 * Busca la tarjeta: 1) por últimos 4 dígitos; 2) por el nombre de Wallet (difuso, o con dígitos);
 * 3) si es de Nu, una fuente cuyo nombre tenga la palabra "nu". Sin coincidencia → null (bandeja).
 */
export function matchSource(
  sources: Source[],
  hint: { last4?: string; cardName?: string; issuer?: "bancolombia" | "nu" },
): Source | null {
  if (hint.last4) {
    // Con dígitos conocidos solo vale la coincidencia exacta (evita asignar a otra tarjeta).
    return sources.find((s) => s.last4 === hint.last4) ?? null;
  }
  if (hint.cardName) {
    const digits = /(\d{4})\D*$/.exec(hint.cardName)?.[1];
    const byDigits = digits ? sources.find((s) => s.last4 === digits) : undefined;
    if (byDigits) return byDigits;
    const name = hint.cardName.replace(/[*•·]+\s?\d{4}/g, " ").replace(/\b\d{4}\b/g, " ");
    // "Débito Bancolombia" busca primero entre las cuentas de débito; si no, primero entre las de crédito.
    const preferred = cardsFirst(sources, DEBIT_NAME_RE.test(hint.cardName) ? "debito" : "tarjeta");
    const byName = findSourceInList(preferred, name) ?? findSourceInList(sources, name);
    if (byName) return byName;
  }
  if (hint.issuer === "nu" || (hint.cardName && /\bnu\b/i.test(hint.cardName))) {
    return cardsFirst(sources).find((s) => normalizeText(s.name).split(" ").includes("nu")) ?? null;
  }
  return null;
}

// ---------- Duplicados y mes ----------

export interface DuplicateCandidate {
  externalId?: string;
  sourceId: string;
  amount: number;
  currency: string;
  occurredAt?: string;
}

/**
 * Compra ya registrada que corresponde a la misma: mismo `externalId`, o misma tarjeta y moneda,
 * monto ±1 y hora a menos de 20 minutos (Apple Pay + SMS/correo de la misma compra).
 */
export function findDuplicate(purchases: Purchase[], c: DuplicateCandidate): Purchase | null {
  if (c.externalId) {
    const same = purchases.find((p) => p.externalId === c.externalId);
    if (same) return same;
  }
  if (!c.occurredAt) return null;
  const t = Date.parse(c.occurredAt);
  return (
    purchases.find(
      (p) =>
        p.sourceId === c.sourceId &&
        p.currency === c.currency &&
        p.occurredAt !== undefined &&
        Math.abs(p.amount - c.amount) <= DUPLICATE_AMOUNT_TOLERANCE &&
        Math.abs(Date.parse(p.occurredAt) - t) <= DUPLICATE_WINDOW_MIN * 60_000,
    ) ?? null
  );
}

export interface ExpenseDuplicateCandidate {
  externalId?: string;
  sourceId?: string;
  last4?: string;
  amount: number;
  currency: string;
  occurredAt?: string;
}

/**
 * Gasto ya registrado que corresponde al mismo: mismo `externalId`, o misma cuenta (fuente o
 * últimos 4 dígitos) y moneda, monto ±1 y menos de 20 minutos. Solo se comparan gastos que
 * llegaron solos (los anotados a mano no tienen hora exacta).
 */
export function findExpenseDuplicate(expenses: Expense[], c: ExpenseDuplicateCandidate): Expense | null {
  if (c.externalId) {
    const same = expenses.find((e) => e.externalId === c.externalId);
    if (same) return same;
  }
  if (!c.occurredAt) return null;
  const t = Date.parse(c.occurredAt);
  return (
    expenses.find(
      (e) =>
        e.origin !== undefined &&
        e.origin !== "manual" &&
        e.origin !== "voz" &&
        ((c.sourceId !== undefined && e.sourceId === c.sourceId) || (c.last4 !== undefined && e.last4 === c.last4)) &&
        e.currency === c.currency &&
        e.occurredAt !== undefined &&
        Math.abs(e.amount - c.amount) <= DUPLICATE_AMOUNT_TOLERANCE &&
        Math.abs(Date.parse(e.occurredAt) - t) <= DUPLICATE_WINDOW_MIN * 60_000,
    ) ?? null
  );
}

/** Mes (hora de Bogotá) de un instante ISO. */
export function monthOf(iso: string): MonthKey {
  const { year, month } = bogotaParts(iso);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Mes de la primera cuota: el mes de la compra (hora de Bogotá); si la tarjeta tiene día de
 * corte y la compra fue después del corte, pasa al mes siguiente.
 */
export function firstMonthFor(occurredAt: string, cutDay?: number): MonthKey {
  const { year, month, day } = bogotaParts(occurredAt);
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return cutDay && day > cutDay ? addMonths(key, 1) : key;
}

/**
 * Instante de un gasto. "YYYY-MM-DD" (día en Bogotá): si es hoy, ahora mismo; si es otro día,
 * mediodía de ese día. Un ISO completo se respeta. Sin fecha: ahora.
 */
export function expenseInstant(date: string | undefined, now: Date = new Date()): string {
  if (!date) return now.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const today = bogotaParts(now.toISOString());
    if (today.year === y && today.month === mo && today.day === d) return now.toISOString();
    const iso = bogotaIso(d, mo, y, 12);
    if (!iso) throw new Error("Fecha inválida (formato YYYY-MM-DD)");
    return iso;
  }
  const t = Date.parse(date);
  if (Number.isNaN(t)) throw new Error("Fecha inválida (formato YYYY-MM-DD)");
  return new Date(t).toISOString();
}

/** "OXXO CALLE 80" → "Oxxo Calle 80"; texto con minúsculas se deja igual. */
export function prettyMerchant(m: string | undefined): string {
  const s = squash(m ?? "");
  if (!s) return "Compra";
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s/*-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

// ---------- Plan ----------

export type IngestPlan =
  | { type: "create"; purchase: Omit<Purchase, "id" | "createdAt">; source: Source }
  | { type: "duplicate"; purchase: Purchase; source?: Source }
  | { type: "expense"; expense: Omit<Expense, "id" | "createdAt">; source?: Source }
  | { type: "expense-duplicate"; expense: Expense; source?: Source }
  | { type: "inbox"; item: Omit<InboxItem, "id">; why: "sin tarjeta" | "no entendido" }
  | { type: "inbox-duplicate"; item: InboxItem };

const ORIGIN: Record<IngestChannel, Purchase["origin"]> = { correo: "correo", sms: "sms", applepay: "applepay" };

/** Decide qué hacer con una compra o un texto no entendido (no muta `db`). */
export function planIngest(
  db: Pick<Db, "sources" | "purchases" | "inbox"> & { expenses?: Expense[] },
  movement: Extract<ParsedMovement, { kind: "compra" | "desconocido" }>,
  meta: { channel: IngestChannel; externalId?: string; receivedAt: string },
): IngestPlan {
  const expenses = db.expenses ?? [];
  if (meta.externalId) {
    const dupInbox = db.inbox.find((i) => i.externalId === meta.externalId);
    if (dupInbox) return { type: "inbox-duplicate", item: dupInbox };
    const dup = db.purchases.find((p) => p.externalId === meta.externalId);
    if (dup) return { type: "duplicate", purchase: dup, source: db.sources.find((s) => s.id === dup.sourceId) };
    const dupExpense = expenses.find((e) => e.externalId === meta.externalId);
    if (dupExpense) {
      return { type: "expense-duplicate", expense: dupExpense, source: db.sources.find((s) => s.id === dupExpense.sourceId) };
    }
  }

  const inboxItem = (parsed?: InboxParsed): Omit<InboxItem, "id"> => ({
    text: movement.text.slice(0, MAX_STORED_TEXT),
    channel: meta.channel,
    receivedAt: meta.receivedAt,
    ...(meta.externalId ? { externalId: meta.externalId } : {}),
    ...(parsed ? { parsed } : {}),
  });

  if (movement.kind === "desconocido") return { type: "inbox", item: inboxItem(), why: "no entendido" };

  const occurredAt = movement.occurredAt ?? meta.receivedAt;
  const source = matchSource(db.sources, movement);

  // Débito: alerta "T.Deb" o tarjeta registrada como "Débito o cuenta" → gasto del mes (nunca a la bandeja).
  if (movement.cardType === "debito" || source?.kind === "debito") {
    const debit = source?.kind === "debito" ? source : undefined;
    const dupExpense = findExpenseDuplicate(expenses, {
      externalId: meta.externalId,
      sourceId: debit?.id,
      last4: movement.last4,
      amount: movement.amount,
      currency: movement.currency,
      occurredAt,
    });
    if (dupExpense) return { type: "expense-duplicate", expense: dupExpense, source: debit };
    return {
      type: "expense",
      ...(debit ? { source: debit } : {}),
      expense: {
        description: movement.merchant ? prettyMerchant(movement.merchant) : "Gasto con débito",
        amount: movement.amount,
        currency: movement.currency,
        month: monthOf(occurredAt),
        occurredAt,
        ...(debit ? { sourceId: debit.id } : {}),
        ...(movement.merchant ? { merchant: movement.merchant } : {}),
        ...(movement.last4 ? { last4: movement.last4 } : {}),
        origin: ORIGIN[meta.channel],
        ...(meta.externalId ? { externalId: meta.externalId } : {}),
      },
    };
  }

  if (!source) {
    const parsed: InboxParsed = {
      amount: movement.amount,
      currency: movement.currency,
      ...(movement.merchant ? { merchant: movement.merchant } : {}),
      ...(movement.last4 ? { last4: movement.last4 } : {}),
      ...(movement.cardName ? { cardName: movement.cardName } : {}),
      occurredAt,
    };
    return { type: "inbox", item: inboxItem(parsed), why: "sin tarjeta" };
  }

  const dup = findDuplicate(db.purchases, {
    externalId: meta.externalId,
    sourceId: source.id,
    amount: movement.amount,
    currency: movement.currency,
    occurredAt,
  });
  if (dup) return { type: "duplicate", purchase: dup, source };

  return {
    type: "create",
    source,
    purchase: {
      sourceId: source.id,
      description: prettyMerchant(movement.merchant),
      amount: movement.amount,
      currency: movement.currency,
      installments: 1,
      firstMonth: firstMonthFor(occurredAt, source.cutDay),
      origin: ORIGIN[meta.channel],
      ...(meta.externalId ? { externalId: meta.externalId } : {}),
      ...(movement.merchant ? { merchant: movement.merchant } : {}),
      occurredAt,
      needsReview: true,
    },
  };
}

/** Recorta la bandeja a los últimos MAX_INBOX elementos. */
export function trimInbox(inbox: InboxItem[]): InboxItem[] {
  return inbox.length > MAX_INBOX ? inbox.slice(inbox.length - MAX_INBOX) : inbox;
}

// ---------- Mensajes (para la notificación del Atajo) ----------

const money = (amount: number | undefined, currency = "COP") =>
  amount !== undefined ? formatMoney(amount, currency).replace(/\s/g, "") : "";

export function describeIgnored(m: Extract<ParsedMovement, { kind: "ignorado" }>): string {
  const what = [money(m.amount, m.currency), m.merchant && `en ${prettyMerchant(m.merchant)}`].filter(Boolean).join(" ");
  return `Ignorado (${m.reason})${what ? `: ${what}` : ""}`;
}

/** "Débito *8765" (o "Débito" sin dígitos): etiqueta de un gasto sin cuenta asociada. */
export function debitLabel(last4?: string): string {
  return last4 ? `Débito *${last4}` : "Débito";
}

export function describePlan(plan: IngestPlan): string {
  switch (plan.type) {
    case "expense": {
      const e = plan.expense;
      return `Gasto registrado: ${money(e.amount, e.currency)} en ${e.description} · ${plan.source?.name ?? debitLabel(e.last4)}`;
    }
    case "expense-duplicate": {
      const e = plan.expense;
      return `Ya estaba registrado: ${money(e.amount, e.currency)} en ${e.description} · ${plan.source?.name ?? debitLabel(e.last4)}`;
    }
    case "create": {
      const p = plan.purchase;
      return `Registrado: ${money(p.amount, p.currency)} en ${p.description} · ${plan.source.name} (1 cuota)`;
    }
    case "duplicate": {
      const p = plan.purchase;
      return `Ya estaba registrado: ${money(p.amount, p.currency)} en ${p.description}${plan.source ? ` · ${plan.source.name}` : ""}`;
    }
    case "inbox": {
      const p = plan.item.parsed;
      if (plan.why === "no entendido" || !p) return "Guardado para revisar: no entendí el mensaje";
      const card = p.last4 ? ` *${p.last4}` : p.cardName ? ` «${p.cardName}»` : "";
      return `Por revisar: ${money(p.amount, p.currency)}${p.merchant ? ` en ${prettyMerchant(p.merchant)}` : ""} (no encontré la tarjeta${card})`;
    }
    case "inbox-duplicate":
      return "Ya estaba en movimientos por revisar";
  }
}

