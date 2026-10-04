// Interpretación de montos escritos o dictados (módulo puro: sin servidor ni base de datos).
// Lo usan el asistente (voz / MCP) y el registro automático (alertas del banco, Atajos).

/**
 * Convierte montos a número.
 * Voz: "450 mil" → 450000, "2 palos" / "2 millones" → 2000000, "1.5M" → 1500000.
 * Formato colombiano: "450.000" → 450000, "1.234.567,89" → 1234567.89, "COP7.500,00" → 3900.
 * Formato con punto decimal: "$31250.40" → 31250.4, "US$12.50" → 12.5, "1,234.56" → 1234.56.
 */
export function parseMonto(input: number | string): number {
  if (typeof input === "number") return input;
  let s = input
    .toLowerCase()
    .trim()
    .replace(/u\$s|us\$|\$|cop|usd|pesos?|d[oó]lares?/g, "")
    .trim();
  let mult = 1;
  const suffixes: [RegExp, number][] = [
    [/\s*(millones|mill[oó]n|palos?|melones?|m)$/, 1_000_000],
    [/\s*(mil|k|lucas?)$/, 1_000],
  ];
  for (const [re, m] of suffixes) {
    if (re.test(s)) {
      s = s.replace(re, "").trim();
      mult = m;
      break;
    }
  }
  s = s.replace(/\s+/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot > lastComma) {
    // "1,234.56": la coma es separador de miles.
    s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Hay coma: la coma es decimal y los puntos son miles.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!s || !Number.isFinite(n)) throw new Error(`No entendí el monto "${input}"`);
  return n * mult;
}

/** Moneda indicada en un texto de monto: USD si dice USD / US$ / dólares; si no, COP. */
export function detectCurrency(input: string): "COP" | "USD" {
  return /usd|us\$|u\$s|d[oó]lar/i.test(input) ? "USD" : "COP";
}
