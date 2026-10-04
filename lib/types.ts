// Contrato compartido de datos. Todos los módulos (UI, MCP, voz) dependen de este archivo.

export type Currency = string; // ISO 4217, p.ej. "COP", "USD"
export type MonthKey = string; // "YYYY-MM"

/** "tarjeta" = tarjeta de crédito (compras a cuotas); "debito" = tarjeta débito o cuenta (gastos). */
export type SourceKind = "tarjeta" | "debito" | "hogar" | "otro";

/** Tarjeta de crédito u otra fuente de pagos. */
export interface Source {
  id: string;
  name: string; // "Visa", "Mastercard Bancolombia"
  kind: SourceKind;
  currency: Currency;
  color: string; // hex, para la tarjeta tipo Wallet
  cutDay?: number; // día de corte (1-31)
  dueDay?: number; // día de pago (1-31)
  /** Últimos 4 dígitos de la tarjeta, para asociar alertas del banco (registro automático). */
  last4?: string;
  createdAt: string; // ISO
}

/** De dónde llegó una compra. */
export type PurchaseOrigin = "manual" | "voz" | "correo" | "sms" | "applepay";

/** Canal de registro automático. */
export type IngestChannel = "correo" | "sms" | "applepay";

/** Compra diferida en cuotas, asociada a una fuente. */
export interface Purchase {
  id: string;
  sourceId: string;
  description: string;
  amount: number; // monto total
  currency: Currency;
  installments: number; // >= 1
  firstMonth: MonthKey; // mes de la primera cuota
  monthlyRate?: number; // interés mensual opcional, p.ej. 0.019
  createdAt: string;
  // ---- Registro automático (opcionales) ----
  origin?: PurchaseOrigin;
  /** Id del mensaje de origen (correo, SMS…), para no registrar dos veces. */
  externalId?: string;
  /** Comercio tal como llegó en la alerta, p.ej. "SPOTIFY.COM". */
  merchant?: string;
  /** Fecha y hora de la compra (ISO). */
  occurredAt?: string;
  /** Llegó sola: falta confirmar las cuotas. Se borra al editar o confirmar. */
  needsReview?: boolean;
}

/** Datos interpretados de un movimiento que llegó sin tarjeta reconocida. */
export interface InboxParsed {
  amount?: number;
  currency?: Currency;
  merchant?: string;
  last4?: string;
  cardName?: string;
  occurredAt?: string; // ISO
}

/** Movimiento recibido que no se pudo asociar a una tarjeta (o no se entendió). */
export interface InboxItem {
  id: string;
  text: string;
  channel: IngestChannel;
  receivedAt: string; // ISO
  externalId?: string;
  parsed?: InboxParsed;
}

/**
 * Gasto hecho con débito, efectivo o cuenta: se descuenta del disponible de su mes, sin cuotas.
 * (Las compras con tarjeta de crédito son `Purchase`.)
 */
export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  /** Mes en que cuenta (el de `occurredAt` en hora de Bogotá). */
  month: MonthKey;
  /** Fecha y hora del gasto (ISO). */
  occurredAt?: string;
  /** Fuente tipo "debito" con que se pagó (opcional). */
  sourceId?: string;
  /** Comercio tal como llegó en la alerta, p.ej. "OXXO CALLE 80". */
  merchant?: string;
  /** Últimos 4 dígitos de la tarjeta de la alerta (cuando no hay fuente asociada, se muestran como "Débito *8765"). */
  last4?: string;
  origin?: PurchaseOrigin;
  /** Id del mensaje de origen, para no registrar dos veces. */
  externalId?: string;
  createdAt: string;
}

/** Ingreso recurrente (mensual) o único. */
export interface Income {
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  recurring: boolean;
  month: MonthKey; // mes único, o mes de inicio si es recurrente
  endMonth?: MonthKey; // fin opcional si es recurrente
  createdAt: string;
}

/** Obligación fija mensual (hipoteca, arriendo...). */
export interface Obligation {
  id: string;
  name: string;
  amount: number; // monto mensual
  currency: Currency;
  startMonth: MonthKey;
  endMonth?: MonthKey;
  sourceId?: string; // opcional, si se agrupa bajo una fuente tipo "hogar"
  createdAt: string;
}

/** Marca de "pagado" de una fuente u obligación en un mes. */
export interface Payment {
  id: string;
  targetId: string; // sourceId u obligationId
  month: MonthKey;
  createdAt: string;
}

export interface Settings {
  baseCurrency: Currency; // moneda principal del dashboard
  currencies: Currency[]; // monedas habilitadas
}

export interface Db {
  settings: Settings;
  sources: Source[];
  purchases: Purchase[];
  incomes: Income[];
  obligations: Obligation[];
  payments: Payment[];
  /** Bandeja de movimientos automáticos por revisar (sin tarjeta o no entendidos). */
  inbox: InboxItem[];
  /** Gastos con débito/efectivo (descuentan del disponible de su mes). */
  expenses: Expense[];
  /** Pila para deshacer: últimas entidades creadas. */
  log: { entity: "source" | "purchase" | "income" | "obligation" | "payment" | "expense"; id: string; at: string }[];
}

export type Rates = Record<Currency, number>; // unidades de cada moneda por 1 USD

// ---------- Resultados de cálculo ----------

export interface InstallmentLine {
  purchaseId: string;
  description: string;
  number: number; // cuota n
  of: number; // de N
  amount: number; // en moneda de la compra
  currency: Currency;
  amountBase: number; // convertido a moneda principal
}

export interface SourceMonth {
  source: Source;
  lines: InstallmentLine[];
  total: number; // en moneda de la fuente
  totalBase: number;
  paid: boolean;
}

export interface ObligationMonth {
  obligation: Obligation;
  amountBase: number;
  paid: boolean;
}

export interface MonthSummary {
  month: MonthKey;
  baseCurrency: Currency;
  income: number; // base
  committed: number; // base: cuotas + obligaciones
  spent: number; // base: gastos con débito/efectivo del mes
  available: number; // income - committed - spent
  pendingToPay: number; // base: lo comprometido aún no marcado como pagado
  sources: SourceMonth[];
  obligations: ObligationMonth[];
  incomes: { income: Income; amountBase: number }[];
  /** Gastos del mes, más recientes primero. */
  expenses: { expense: Expense; amountBase: number }[];
}
