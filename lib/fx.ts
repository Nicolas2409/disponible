import type { Rates } from "./types";
import { DEFAULT_RATES } from "./convert";

// Puro y seguro para cliente; reexportado aquí por conveniencia.
export { convert, DEFAULT_RATES } from "./convert";

const TTL_MS = 24 * 60 * 60 * 1000;
const URL = "https://open.er-api.com/v6/latest/USD";

let memory: { fetchedAt: number; rates: Rates } | null = null;

async function ratesFile(): Promise<string> {
  const path = await import("node:path");
  return path.join(process.cwd(), "data", "rates.json");
}

async function readFileCache(): Promise<{ fetchedAt: number; rates: Rates } | null> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(await ratesFile(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.fetchedAt === "number" && parsed.rates) return parsed;
  } catch {
    /* sin caché */
  }
  return null;
}

async function writeFileCache(entry: { fetchedAt: number; rates: Rates }) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await ratesFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(entry, null, 2), "utf8");
  } catch {
    /* no crítico */
  }
}

/**
 * Tasas de cambio (unidades de cada moneda por 1 USD).
 * Orden: memoria (<24h) → archivo data/rates.json (<24h) → red → archivo viejo → defaults.
 */
export async function getRates(): Promise<Rates> {
  const now = Date.now();
  if (memory && now - memory.fetchedAt < TTL_MS) return memory.rates;

  const file = await readFileCache();
  if (file && now - file.fetchedAt < TTL_MS) {
    memory = file;
    return file.rates;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(URL, { signal: ctrl.signal, next: { revalidate: 86400 } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Rates };
    if (json.result !== "success" || !json.rates) throw new Error("respuesta inválida");
    const entry = { fetchedAt: now, rates: { ...DEFAULT_RATES, ...json.rates, USD: 1 } };
    memory = entry;
    await writeFileCache(entry);
    return entry.rates;
  } catch {
    if (file) {
      memory = file;
      return file.rates;
    }
    return DEFAULT_RATES;
  }
}

