import type { Currency } from "./types";

const ZERO_DECIMALS = new Set(["COP", "CLP", "JPY", "PYG", "KRW"]);

export function currencyDecimals(currency: Currency): number {
  return ZERO_DECIMALS.has(currency.toUpperCase()) ? 0 : 2;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: Currency, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact}`;
  let f = cache.get(key);
  if (!f) {
    const decimals = currencyDecimals(currency);
    f = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      ...(compact
        ? { notation: "compact", maximumFractionDigits: 1 }
        : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    });
    cache.set(key, f);
  }
  return f;
}

/**
 * Formatea un monto: COP → "$ 1.250.000" (sin decimales), USD → "US$ 1.250,00".
 * `compact` → "$1,2 M".
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  opts?: { compact?: boolean },
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return formatter(currency, !!opts?.compact).format(value);
  } catch {
    // Código de moneda no reconocido por Intl
    return `${currency} ${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
  }
}
