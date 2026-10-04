// Búsqueda difusa de fuentes por nombre (módulo puro: sin servidor ni base de datos).
import type { Source } from "./types";

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Búsqueda difusa sin tildes ni mayúsculas: "visa" → "Visa Bancolombia". */
export function findSourceInList(sources: Source[], query: string): Source | null {
  const q = normalizeText(query);
  if (!q) return null;
  const named = sources.map((s) => ({ s, n: normalizeText(s.name) }));
  const qTokens = q.split(" ");

  const tests: Array<(n: string) => boolean> = [
    (n) => n === q,
    (n) => n.startsWith(q),
    (n) => n.split(" ").some((t) => t.startsWith(q)),
    (n) => n.includes(q),
    (n) => qTokens.every((t) => n.includes(t)),
    (n) => n.split(" ").every((t) => q.includes(t)), // "la visa bancolombia" → "Visa Bancolombia"
    (n) => qTokens.some((t) => t.length >= 3 && n.split(" ").some((w) => w.startsWith(t))),
  ];
  for (const test of tests) {
    const hit = named.find(({ n }) => test(n));
    if (hit) return hit.s;
  }
  return null;
}
