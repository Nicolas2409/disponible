// Intérprete tolerante de SMS de Nu Colombia (y genérico para otros SMS de compra). Módulo puro.
//
// El formato exacto de Nu aún no se conoce: se buscan piezas sueltas (monto, comercio,
// últimos 4 dígitos, fecha). Para ajustarlo cuando llegue un SMS real, basta con cambiar
// las expresiones de esta lista y agregar el ejemplo a nu.test.ts.
//   Nu: Compra aprobada por $45.900 en RAPPI con tu tarjeta terminada en 1234.
//   Nu: Compraste $120.000,00 en FALABELLA el 03/10/2026 a las 10:15.
//   Usaste tu tarjeta Nu *1234 por COP 89.900 en NETFLIX.COM
import { findDate, findLast4, findMoney, squash, type ParsedMovement } from "./common";

/** Palabras que indican que es una compra. */
const PURCHASE_RE = /compra|compraste|usaste|pagaste\s+en|pago\s+en|cargo|aprobad|transacci[oó]n/i;
/** Compra que no pasó. */
const DECLINED_RE = /rechaz|declinad|no\s+(?:fue|pudo\s+ser)\s+aprobad|fallid|no\s+exitos/i;
/** Pago a la tarjeta Nu (no es una compra). */
const CARD_PAYMENT_RE = /recibimos\s+tu\s+pago|pago\s+(?:a|de)\s+tu\s+(?:tarjeta|factura)|abono\s+a\s+tu\s+tarjeta|pagaste\s+tu\s+(?:tarjeta|factura)/i;
/** Movimientos de cuenta (Cajita, transferencias). */
const TRANSFER_RE = /transfer|recibiste|enviaste|cajita|dep[oó]sit|bre-?b/i;

/** Texto después de "en" que no es un comercio: "terminada en 1234". */
function merchantOf(text: string): string | undefined {
  const re = /\ben\s+(?:el\s+comercio\s+)?(?!\*?\d{2,4}\b)(.+?)(?=\s+(?:con|el|por|a\s+las|desde|usando|hoy|ayer|ha\s+sido|fue)\b|[,;]|\.(?:\s|$)|$)/gi;
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 14), m.index);
    const name = m[1].trim();
    if (!name || /^\*?\d{2,4}$/.test(name) || /termin\w*\s*$|finaliz\w*\s*$/i.test(before)) continue;
    if (/^(?:tu|su)\s+(?:tarjeta|cuenta)\b/i.test(name) || /^(?:tu\s+)?nu$/i.test(name)) continue;
    return name;
  }
  return undefined;
}

/** Interpreta un SMS de compra (pensado para Nu). Nunca lanza. */
export function parseNu(raw: string): ParsedMovement {
  const text = squash(raw);
  if (DECLINED_RE.test(text)) return { kind: "ignorado", reason: "rechazada", text };
  const money = findMoney(text);
  if (!money) return { kind: "desconocido", text };
  if (CARD_PAYMENT_RE.test(text)) {
    return { kind: "ignorado", reason: "pago de tarjeta", amount: money.amount, currency: money.currency, text };
  }
  if (!PURCHASE_RE.test(text)) {
    if (TRANSFER_RE.test(text)) {
      return { kind: "ignorado", reason: "transferencia", amount: money.amount, currency: money.currency, text };
    }
    return { kind: "desconocido", text };
  }
  const merchant = merchantOf(text);
  const last4 = findLast4(text);
  const occurredAt = findDate(text);
  const isNu = /\bnu\b/i.test(text);
  return {
    kind: "compra",
    amount: money.amount,
    currency: money.currency,
    ...(merchant ? { merchant } : {}),
    ...(last4 ? { last4 } : {}),
    ...(isNu ? { issuer: "nu" as const, cardType: "credito" as const } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    text,
  };
}
