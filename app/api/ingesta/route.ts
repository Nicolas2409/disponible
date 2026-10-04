// Registro automático de compras con tarjeta de crédito (compras a 1 cuota) y con débito (gastos del mes).
//
// POST /api/ingesta   Header: Authorization: Bearer <MCP_SECRET>
// Cuerpo JSON:
//   { "canal": "correo",   "id": "<id del correo>", "texto": "<cuerpo del correo>" }   (Google Apps Script)
//   { "canal": "sms",      "texto": "<SMS>" }                                          (Atajo "Mensaje")
//   { "canal": "applepay", "comercio": "...", "monto": "$45.900", "tarjeta": "Nu", "fecha"?: "..." } (Atajo "Transacción")
// Respuesta: { ok, mensaje, resultados: [{ estado, mensaje, ... }], ignorado? }
// `mensaje` es corto, para mostrarlo en la notificación del Atajo. Ver docs/registro-automatico.md.

import { revalidatePath } from "next/cache";
import { ingestPurchase } from "@/lib/finance";
import { IngestBody } from "@/lib/ingest";
import { formatZodError } from "@/lib/schemas";
import { checkSecret } from "@/lib/secret-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const denied = checkSecret(req);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ ok: false, mensaje: 'Cuerpo inválido: envía JSON { "canal": "sms", "texto": "..." }.' }, 400);
  }
  const parsed = IngestBody.safeParse(raw);
  if (!parsed.success) return reply({ ok: false, mensaje: `Datos inválidos: ${formatZodError(parsed.error)}` }, 400);

  try {
    const outcomes = await ingestPurchase(parsed.data);
    if (outcomes.some((o) => o.status === "registrado" || o.status === "por revisar")) {
      revalidatePath("/", "layout");
    }
    const resultados = outcomes.map((o) => {
      switch (o.status) {
        case "registrado":
        case "duplicado":
          return "expense" in o
            ? { estado: o.status, mensaje: o.mensaje, gastoId: o.expense.id }
            : { estado: o.status, mensaje: o.mensaje, compraId: o.purchase.id };
        case "por revisar":
          return { estado: o.status, mensaje: o.mensaje, bandejaId: o.item.id };
        case "ignorado":
          return { estado: o.status, mensaje: o.mensaje, ignorado: o.reason };
      }
    });
    const single = outcomes.length === 1 ? outcomes[0] : null;
    return reply({
      ok: true,
      mensaje: outcomes.map((o) => o.mensaje).join("\n"),
      ...(single?.status === "ignorado" ? { ignorado: single.reason } : {}),
      resultados,
    });
  } catch (err) {
    console.error("[ingesta]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return reply({ ok: false, mensaje: `No pude registrar: ${msg}` }, 500);
  }
}
