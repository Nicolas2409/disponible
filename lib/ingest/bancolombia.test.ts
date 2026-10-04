import { describe, expect, it } from "vitest";
import { parseBancolombia } from "./bancolombia";

const HEAD = "¡Listo! Todo salió bien con tus movimientos Bancolombia: ";

describe("parseBancolombia (formatos reales)", () => {
  it("compra crédito A: 'con tu T.Cred *5678'", () => {
    const [m] = parseBancolombia(
      HEAD + "Compraste COP7.500,00 en SPOTIFY.COM con tu T.Cred *5678, el 01/10/2026 a las 15:37.",
    );
    expect(m).toMatchObject({
      kind: "compra",
      amount: 7500,
      currency: "COP",
      merchant: "SPOTIFY.COM",
      last4: "5678",
      cardType: "credito",
      issuer: "bancolombia",
      occurredAt: "2026-10-01T20:37:00.000Z", // 15:37 en Bogotá (UTC−5)
    });
  });

  it("compra crédito B: tarjeta en 'Esta compra esta asociada a T.Cred *5678'", () => {
    const [m] = parseBancolombia(
      HEAD +
        "Compraste COP54.900,00 en GOOGLE *YouTube Prem, el 01/10/2026 a las 16:42. Esta compra esta asociada a T.Cred *5678.",
    );
    expect(m).toMatchObject({
      kind: "compra",
      amount: 54900,
      merchant: "GOOGLE *YouTube Prem",
      last4: "5678",
      cardType: "credito",
      occurredAt: "2026-10-01T21:42:00.000Z",
    });
  });

  it("compra débito: se marca como débito", () => {
    const [m] = parseBancolombia(HEAD + "Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb *8765, el 02/10/2026 a las 12:55.");
    expect(m).toMatchObject({ kind: "compra", amount: 6200, merchant: "OXXO CALLE 80", last4: "8765", cardType: "debito" });
  });

  it("pago a tarjeta Nu → ignorado 'pago de tarjeta'", () => {
    const [m] = parseBancolombia(
      HEAD + "Pagaste $31250.40 a NU Compania de Financiamiento desde tu producto 0001 el 03/10/2026 11:59:48.",
    );
    expect(m).toMatchObject({ kind: "ignorado", reason: "pago de tarjeta", amount: 31250.4 });
  });

  it("pago de servicios → ignorado 'pago'", () => {
    const [m] = parseBancolombia("Pagaste $120000.00 a EPM desde tu producto 0001 el 03/10/2026 11:59:48.");
    expect(m).toMatchObject({ kind: "ignorado", reason: "pago" });
  });

  it("transferencias → ignorado", () => {
    expect(
      parseBancolombia(HEAD + "Transferiste $75300.00 desde tu cuenta *0001 a la cuenta *1234 el 30/09/26 a las 19:49.")[0],
    ).toMatchObject({ kind: "ignorado", reason: "transferencia", amount: 75300 });
    expect(parseBancolombia("ANA, transferiste $52100.00 a la llave 3001234567 el 30/09/2026")[0]).toMatchObject({
      kind: "ignorado",
      reason: "transferencia",
      amount: 52100,
    });
  });

  it("recibido → ignorado", () => {
    const [m] = parseBancolombia(HEAD + "Recibiste un pago por $2500000.00 de EMPRESA SAS a tu cuenta AHORROS *0001.");
    expect(m).toMatchObject({ kind: "ignorado", reason: "ingreso recibido", amount: 2500000 });
  });

  it("compra en dólares", () => {
    const [m] = parseBancolombia("Compraste USD12,50 en NETFLIX.COM con tu T.Cred *5678, el 05/10/2026 a las 08:00.");
    expect(m).toMatchObject({ kind: "compra", amount: 12.5, currency: "USD", merchant: "NETFLIX.COM", last4: "5678" });
    const [m2] = parseBancolombia("Compraste US$ 9.99 en SPOTIFY con tu T.Cred *5678, el 05/10/2026 a las 08:00.");
    expect(m2).toMatchObject({ amount: 9.99, currency: "USD", merchant: "SPOTIFY" });
  });

  it("varios movimientos en un mismo correo", () => {
    const ms = parseBancolombia(
      HEAD +
        "Compraste COP7.500,00 en SPOTIFY.COM con tu T.Cred *5678, el 01/10/2026 a las 15:37.\n\n" +
        "Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb *8765, el 02/10/2026 a las 12:55.",
    );
    expect(ms).toHaveLength(2);
    expect(ms[0]).toMatchObject({ amount: 7500, cardType: "credito" });
    expect(ms[1]).toMatchObject({ amount: 6200, cardType: "debito" });
  });

  it("sin fecha reconocible igual saca comercio y tarjeta", () => {
    const [m] = parseBancolombia("Compraste COP50.000,00 en TIENDA D1 con tu T.Cred *5678.");
    expect(m).toMatchObject({ kind: "compra", amount: 50000, merchant: "TIENDA D1", last4: "5678" });
    expect(m).not.toHaveProperty("occurredAt");
  });

  it("texto sin movimientos → []", () => {
    expect(parseBancolombia("Bancolombia te informa que tu clave fue cambiada.")).toEqual([]);
  });
});
