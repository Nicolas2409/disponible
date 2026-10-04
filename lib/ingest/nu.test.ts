// Ejemplos plausibles de SMS de Nu (el formato real aún no se conoce): al recibir uno real,
// agrégalo aquí y ajusta lib/ingest/nu.ts.
import { describe, expect, it } from "vitest";
import { parseNu } from "./nu";

describe("parseNu", () => {
  it("compra aprobada con últimos 4 dígitos", () => {
    expect(parseNu("Nu: Compra aprobada por $45.900 en RAPPI con tu tarjeta terminada en 1234.")).toMatchObject({
      kind: "compra",
      amount: 45900,
      currency: "COP",
      merchant: "RAPPI",
      last4: "1234",
      issuer: "nu",
      cardType: "credito",
    });
  });

  it("compra con fecha y decimales", () => {
    expect(parseNu("Nu: Compraste $120.000,00 en FALABELLA el 03/10/2026 a las 10:15.")).toMatchObject({
      kind: "compra",
      amount: 120000,
      merchant: "FALABELLA",
      occurredAt: "2026-10-03T15:15:00.000Z",
    });
  });

  it("comercio después de los dígitos y moneda con espacio", () => {
    expect(parseNu("Usaste tu tarjeta Nu *1234 por COP 89.900 en NETFLIX.COM")).toMatchObject({
      kind: "compra",
      amount: 89900,
      merchant: "NETFLIX.COM",
      last4: "1234",
    });
    expect(parseNu("Nu: Compra de $15.000 con tu tarjeta terminada en 1234 en EL CORRAL hoy")).toMatchObject({
      merchant: "EL CORRAL",
      last4: "1234",
    });
  });

  it("sin dígitos: queda para asociar por la palabra Nu", () => {
    const m = parseNu("Hiciste una compra en Nu por $32.500 en DROGUERIA ALEMANA.");
    expect(m).toMatchObject({ kind: "compra", amount: 32500, issuer: "nu", merchant: "DROGUERIA ALEMANA" });
    expect(m).not.toHaveProperty("last4");
  });

  it("compra en dólares", () => {
    expect(parseNu("Nu: Compra aprobada por USD 20,00 en OPENAI")).toMatchObject({ amount: 20, currency: "USD", merchant: "OPENAI" });
  });

  it("rechazada, pago de la tarjeta y movimientos de cuenta se ignoran", () => {
    expect(parseNu("Nu: Tu compra por $45.900 en RAPPI fue rechazada.")).toMatchObject({ kind: "ignorado", reason: "rechazada" });
    expect(parseNu("Nu: Recibimos tu pago de $500.000. ¡Gracias!")).toMatchObject({ kind: "ignorado", reason: "pago de tarjeta" });
    expect(parseNu("Nu: Recibiste $100.000 en tu Cajita")).toMatchObject({ kind: "ignorado", reason: "transferencia" });
  });

  it("sin monto o sin señales de compra → desconocido", () => {
    expect(parseNu("Nu: tu código de verificación es 123456")).toMatchObject({ kind: "desconocido" });
    expect(parseNu("Nu: tienes $45.900 disponibles")).toMatchObject({ kind: "desconocido" });
  });
});
