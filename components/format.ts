export function cuotasLabel(n: number) {
  if (n === 0) return "Sin cuotas este mes";
  return n === 1 ? "1 cuota este mes" : `${n} cuotas este mes`;
}

/** Etiqueta corta del origen de una compra automática (null si se anotó a mano). */
export function originLabel(origin: string | undefined): string | null {
  switch (origin) {
    case "correo":
      return "Desde correo";
    case "sms":
      return "SMS";
    case "applepay":
      return "Apple Pay";
    case "voz":
      return "Por voz";
    default:
      return null;
  }
}

// ---------- Fechas de gastos (siempre en hora de Colombia) ----------

const TZ = "America/Bogota";

/** Instante ISO → "YYYY-MM-DD" del día en Bogotá. */
export function bogotaDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Hoy en Bogotá, "YYYY-MM-DD". */
export function todayKey(): string {
  return bogotaDateKey(new Date().toISOString());
}

/** "YYYY-MM-DD" → "YYYY-MM". */
export function monthOfDateKey(key: string): string {
  return key.slice(0, 7);
}

type ExpenseLike = { occurredAt?: string; createdAt: string; origin?: string };

/**
 * ¿La hora del gasto es real? Los automáticos traen la hora del banco; los anotados a mano
 * solo si se anotaron el mismo día (si no, se guardan a mediodía y la hora no significa nada).
 */
function hasRealTime(e: ExpenseLike): boolean {
  if (!e.occurredAt) return false;
  if (e.origin === "correo" || e.origin === "sms" || e.origin === "applepay") return true;
  return bogotaDateKey(e.occurredAt) === bogotaDateKey(e.createdAt);
}

/** "12:55" o null si la hora no es real. */
export function expenseTime(e: ExpenseLike): string | null {
  if (!hasRealTime(e) || !e.occurredAt) return null;
  return new Date(e.occurredAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
}

/** "2 oct · 12:55" (o "2 oct" si la hora no es real). */
export function expenseWhen(e: ExpenseLike): string {
  const iso = e.occurredAt ?? e.createdAt;
  const day = new Date(iso)
    .toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: TZ })
    .replace(/\.$/, "")
    .replace(" de ", " "); // "2 de oct" → "2 oct"
  const time = expenseTime(e);
  return time ? `${day} · ${time}` : day;
}

/** Encabezado de un día: "Hoy", "Ayer" o "jueves 1 de octubre". */
export function dayHeading(key: string, today: string = todayKey()): string {
  if (key === today) return "Hoy";
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (key === y.toISOString().slice(0, 10)) return "Ayer";
  const s = new Date(`${key}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cuenta con que se pagó un gasto: nombre de la fuente, "Débito *8765", o null. */
export function expenseAccount(e: { sourceId?: string; last4?: string }, sourceNames: Record<string, string>): string | null {
  if (e.sourceId && sourceNames[e.sourceId]) return sourceNames[e.sourceId];
  if (e.last4) return `Débito *${e.last4}`;
  return null;
}
