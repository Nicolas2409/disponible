// Tipos y utilidades compartidas por los intérpretes de alertas (módulo puro).
import { detectCurrency, parseMonto } from "../monto";
import type { Currency } from "../types";

/** Motivos por los que un movimiento se reconoce pero no se registra. */
export type IgnoreReason =
  | "transferencia"
  | "pago de tarjeta"
  | "pago"
  | "ingreso recibido"
  | "retiro"
  | "rechazada"
  | "sin movimiento"
  | "otro movimiento";

export type CardType = "credito" | "debito";

/** Resultado de interpretar una alerta. */
export type ParsedMovement =
  | {
      kind: "compra";
      amount: number;
      currency: Currency;
      merchant?: string;
      last4?: string;
      /** Nombre de la tarjeta tal como lo da Apple Pay / Wallet. */
      cardName?: string;
      cardType?: CardType;
      issuer?: "bancolombia" | "nu";
      occurredAt?: string; // ISO
      text: string;
    }
  | {
      kind: "ignorado";
      reason: IgnoreReason;
      amount?: number;
      currency?: Currency;
      merchant?: string;
      text: string;
    }
  | { kind: "desconocido"; text: string };

/** Espacios simples (incluye saltos de línea y espacios duros). */
export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Monto con prefijo de moneda: "COP7.500,00", "$6.200,00", "$31250.40", "USD12,50", "US$ 12.50". */
export const MONEY_RE = /(COP|USD|US\$|U\$S|\$)\s?(\d[\d.,]*\d|\d)/i;

/** Monto con la moneda después: "45.900 COP", "12,50 USD", "45.900 pesos". */
const MONEY_AFTER_RE = /(\d[\d.,]*\d|\d)\s?(COP|USD|pesos|d[oó]lares)\b/i;

export interface Money {
  amount: number;
  currency: Currency;
  index: number;
  length: number;
}

/** Primer monto del texto, o null. */
export function findMoney(text: string): Money | null {
  const m = MONEY_RE.exec(text) ?? MONEY_AFTER_RE.exec(text);
  if (!m) return null;
  try {
    const amount = parseMonto(m[0]);
    if (!(amount > 0)) return null;
    return { amount, currency: detectCurrency(m[0]), index: m.index, length: m[0].length };
  } catch {
    return null;
  }
}

/** Colombia está en UTC−5 todo el año (sin horario de verano). */
const BOGOTA_OFFSET_H = 5;

/** Fecha/hora de Bogotá → ISO (UTC). Año de 2 dígitos = 20xx. Devuelve undefined si es inválida. */
export function bogotaIso(
  day: number,
  month: number,
  year: number,
  hour = 12,
  minute = 0,
  second = 0,
): string | undefined {
  const y = year < 100 ? 2000 + year : year;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  const d = new Date(Date.UTC(y, month - 1, day, hour + BOGOTA_OFFSET_H, minute, second));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Año, mes y día en hora de Bogotá de un instante ISO. */
export function bogotaParts(iso: string): { year: number; month: number; day: number } {
  const d = new Date(new Date(iso).getTime() - BOGOTA_OFFSET_H * 3_600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** "01/10/2026 a las 15:37", "30/09/26 a las 19:49", "03/10/2026 11:59:48" → ISO (hora de Bogotá). */
const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s*(?:a\s+las|,)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i;

export function findDate(text: string): string | undefined {
  const m = DATE_RE.exec(text);
  if (!m) return undefined;
  const [, d, mo, y, h, mi, s] = m;
  return bogotaIso(Number(d), Number(mo), Number(y), h ? Number(h) : 12, mi ? Number(mi) : 0, s ? Number(s) : 0);
}

/** Últimos 4 dígitos: "*5678", "terminada en 1234", "•••• 1234". */
export function findLast4(text: string): string | undefined {
  const m =
    /(?:terminad[ao]s?|termina|finalizad[ao]|finaliza|terminaci[oó]n)\s+(?:en\s+)?(?:\*+\s?)?(\d{4})\b/i.exec(text) ??
    /[*•·]+\s?(\d{4})\b/.exec(text);
  return m?.[1];
}
