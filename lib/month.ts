import type { MonthKey } from "./types";

/** Parsea "YYYY-MM" a [año, mes(1-12)]. */
function parse(m: MonthKey): [number, number] {
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) throw new Error(`MonthKey inválido: "${m}" (se espera YYYY-MM)`);
  return [Number(match[1]), Number(match[2])];
}

function toKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Índice absoluto de meses (año*12 + mes-1). */
function index(m: MonthKey): number {
  const [y, mo] = parse(m);
  return y * 12 + (mo - 1);
}

function fromIndex(i: number): MonthKey {
  return toKey(Math.floor(i / 12), (((i % 12) + 12) % 12) + 1);
}

export function isMonthKey(m: unknown): m is MonthKey {
  return typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

/** Mes actual según la hora local. */
export function currentMonth(): MonthKey {
  const d = new Date();
  return toKey(d.getFullYear(), d.getMonth() + 1);
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  return fromIndex(index(m) + n);
}

/** b − a en meses. */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  return index(b) - index(a);
}

/** Negativo si a < b, 0 si iguales, positivo si a > b. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  return index(a) - index(b);
}

function toDate(m: MonthKey): Date {
  const [y, mo] = parse(m);
  return new Date(y, mo - 1, 1);
}

/** "octubre 2026" */
export function formatMonth(m: MonthKey, locale = "es-CO"): string {
  const d = toDate(m);
  const name = d.toLocaleDateString(locale, { month: "long" });
  return `${name} ${d.getFullYear()}`;
}

/** "oct" */
export function formatMonthShort(m: MonthKey, locale = "es-CO"): string {
  return toDate(m).toLocaleDateString(locale, { month: "short" }).replace(/\.$/, "");
}
