import type { Currency, Rates } from "./types";

/** Tasas por defecto (unidades por 1 USD) si no hay red ni caché. */
export const DEFAULT_RATES: Rates = { USD: 1, COP: 4000, EUR: 0.92 };

/** Convierte entre monedas usando tasas por 1 USD. Puro. */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return amount;
  const rFrom = rates[from] ?? DEFAULT_RATES[from];
  const rTo = rates[to] ?? DEFAULT_RATES[to];
  if (!rFrom || !rTo) throw new Error(`Sin tasa de cambio para ${!rFrom ? from : to}`);
  return (amount / rFrom) * rTo;
}
