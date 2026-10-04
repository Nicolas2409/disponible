// Intérprete de alertas de Bancolombia (correo "Alertas y Notificaciones" y SMS). Módulo puro.
//
// Formatos reales conocidos (el cuerpo empieza con "¡Listo! Todo salió bien con tus movimientos Bancolombia: ..."):
//   Compraste COP7.500,00 en SPOTIFY.COM con tu T.Cred *5678, el 01/10/2026 a las 15:37.
//   Compraste COP54.900,00 en GOOGLE *YouTube Prem, el 01/10/2026 a las 16:42. Esta compra esta asociada a T.Cred *5678.
//   Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb *8765, el 02/10/2026 a las 12:55.
//   Pagaste $31250.40 a NU Compania de Financiamiento desde tu producto 0001 el 03/10/2026 11:59:48.
//   Transferiste $75300.00 desde tu cuenta *0001 a la cuenta *... el 30/09/26 a las 19:49.
//   ANA, transferiste $52100.00 a la llave ...
//   Recibiste un pago por $2500000.00 de EMPRESA SAS a tu cuenta AHORROS...
//
// Un correo puede traer varios movimientos: se separa en un segmento por verbo.
import { findDate, findLast4, findMoney, squash, type CardType, type IgnoreReason, type ParsedMovement } from "./common";

const VERB_RE = /\b(compraste|pagaste|transferiste|recibiste|retiraste)\b/gi;

/** ¿Parece una alerta de Bancolombia? */
export function looksLikeBancolombia(text: string): boolean {
  return /bancolombia/i.test(text) || /\bT\.\s?(?:Cred|Deb)\b/i.test(text) || /^\s*compraste\b/i.test(text);
}

function cardTypeOf(s: string | undefined): CardType | undefined {
  if (!s) return undefined;
  if (/cr[eé]d|\bt\.?\s?c\b/i.test(s)) return "credito";
  if (/d[eé]b|\bt\.?\s?d\b/i.test(s)) return "debito";
  return undefined;
}

function parsePurchase(seg: string): ParsedMovement {
  const money = findMoney(seg);
  if (!money) return { kind: "desconocido", text: seg };
  const rest = seg.slice(money.index + money.length);

  // "en <comercio> [con tu T.Cred *5678], el 01/10/2026 a las 15:37"
  const full =
    /^\s*en\s+(.+?)(?:\s+con\s+tu\s+(.+?))?,?\s+el\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.exec(rest) ??
    /^\s*en\s+(.+?)(?:\s+con\s+tu\s+(.+?))?(?=[,.](?:\s|$)|$)/i.exec(rest);
  const merchant = full?.[1]?.trim();
  const cardPhrase = full?.[2];
  // "Esta compra esta asociada a T.Cred *5678"
  const assoc = /asociada\s+a\s+(?:tu\s+)?(.+?\*\s?\d{4})/i.exec(seg)?.[1];
  const card = cardPhrase ?? assoc;

  return {
    kind: "compra",
    amount: money.amount,
    currency: money.currency,
    ...(merchant ? { merchant } : {}),
    ...(card && findLast4(card) ? { last4: findLast4(card) } : {}),
    ...(cardTypeOf(card) ? { cardType: cardTypeOf(card) } : {}),
    issuer: "bancolombia",
    ...(findDate(seg) ? { occurredAt: findDate(seg) } : {}),
    text: seg,
  };
}

function ignored(seg: string, reason: IgnoreReason): ParsedMovement {
  const money = findMoney(seg);
  return {
    kind: "ignorado",
    reason,
    ...(money ? { amount: money.amount, currency: money.currency } : {}),
    text: seg,
  };
}

function parseSegment(verb: string, seg: string): ParsedMovement {
  switch (verb.toLowerCase()) {
    case "compraste":
      return parsePurchase(seg);
    case "pagaste":
      // Pago a una tarjeta (Nu, T.Cred…) o pago de otra cosa (servicios, PSE).
      return ignored(seg, /\bnu\b|tarjeta|t\.?\s?cred|financiamiento|cr[eé]dito/i.test(seg) ? "pago de tarjeta" : "pago");
    case "transferiste":
      return ignored(seg, "transferencia");
    case "recibiste":
      return ignored(seg, "ingreso recibido");
    case "retiraste":
      return ignored(seg, "retiro");
    default:
      return ignored(seg, "otro movimiento");
  }
}

/**
 * Interpreta el texto de una alerta de Bancolombia. Devuelve un movimiento por cada verbo
 * reconocido ("Compraste", "Pagaste", "Transferiste"…), o [] si no encontró ninguno.
 */
export function parseBancolombia(raw: string): ParsedMovement[] {
  const text = squash(raw);
  const hits = [...text.matchAll(VERB_RE)];
  return hits.map((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const seg = text.slice(m.index, end).trim();
    return parseSegment(m[1], seg);
  });
}
