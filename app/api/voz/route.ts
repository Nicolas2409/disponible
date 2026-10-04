// Plan B: texto dictado (dictado de la app o Atajo de Siri) → acción financiera.
//
// POST /api/voz            body: { "texto": "compré mercado de 450 mil con la visa a 3 cuotas" }
// POST /api/voz?dryRun=1   devuelve la acción interpretada sin ejecutarla (para confirmar en la UI)
// POST /api/voz            body: { "accion": { "herramienta", "argumentos" } } ejecuta una acción ya confirmada
// Header: Authorization: Bearer <MCP_SECRET>
// Respuesta: { ok, mensaje, accion? }

import Anthropic from "@anthropic-ai/sdk";
import { checkSecret } from "@/lib/secret-auth";
import { describeAction, executeTool, isToolName, toolJsonSchema, toolMeta, type ToolName } from "@/lib/assistant-tools";
import { listSources } from "@/lib/finance";
import { currentMonth } from "@/lib/month";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5";

const VOICE_TOOLS: ToolName[] = [
  "registrar_compra",
  "registrar_gasto",
  "registrar_ingreso",
  "registrar_obligacion",
  "marcar_pagado",
  "resumen_mes",
];

const tools: Anthropic.Tool[] = VOICE_TOOLS.map((name) => ({
  name,
  description: toolMeta[name].description,
  input_schema: toolJsonSchema(name) as Anthropic.Tool.InputSchema,
}));

function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const denied = checkSecret(req);
  if (denied) return denied;

  let texto: unknown;
  let confirmada: { herramienta?: unknown; argumentos?: unknown } | undefined;
  try {
    ({ texto, accion: confirmada } = (await req.json()) as {
      texto?: unknown;
      accion?: { herramienta?: unknown; argumentos?: unknown };
    });
  } catch {
    return reply({ ok: false, mensaje: 'Cuerpo inválido: envía JSON { "texto": "..." }.' }, 400);
  }

  // Confirmación de un dryRun previo: { accion: { herramienta, argumentos } } se ejecuta sin volver a llamar a la IA.
  if (confirmada && typeof confirmada === "object") {
    const h = String(confirmada.herramienta ?? "");
    if (!isToolName(h) || !VOICE_TOOLS.includes(h)) {
      return reply({ ok: false, mensaje: `Acción no permitida: ${h}` }, 400);
    }
    const result = await executeTool(h, confirmada.argumentos ?? {});
    return reply({ ok: result.ok, mensaje: result.mensaje, datos: result.datos });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return reply({ ok: false, mensaje: "Falta configurar ANTHROPIC_API_KEY en el servidor." }, 503);
  }

  if (typeof texto !== "string" || !texto.trim()) {
    return reply({ ok: false, mensaje: 'Falta "texto".' }, 400);
  }
  if (texto.length > 1000) return reply({ ok: false, mensaje: "Texto demasiado largo." }, 400);

  const dryRun = ["1", "true"].includes(new URL(req.url).searchParams.get("dryRun") ?? "");

  const sources = await listSources();
  const fuentes = sources.length
    ? sources.map((s) => `- ${s.name} (${s.kind}, ${s.currency})`).join("\n")
    : "(ninguna registrada)";

  const system = `Eres el asistente de "Disponible", una app de finanzas personales en Colombia.
Convierte la frase dictada por el usuario en UNA llamada a herramienta.
Mes actual: ${currentMonth()}. Hoy: ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })} (fechas YYYY-MM-DD; "ayer" = el día anterior). Moneda por defecto: la de la fuente (normalmente COP).
Fuentes/tarjetas registradas:
${fuentes}
Reglas:
- Montos: "450 mil" = 450000, "2 palos" / "2 millones" = 2000000, "1.5 millones" = 1500000. Envía el número.
- "fuente" debe ser uno de los nombres registrados (elige el más parecido: "la visa" → Visa).
- Compra con tarjeta de crédito (tipo "tarjeta", puede ir a cuotas) → registrar_compra. Gasto con débito, efectivo o cuenta ("gasté 20 mil en almuerzo") → registrar_gasto; si no dice cómo pagó algo cotidiano, es un gasto.
- "a 3 cuotas" → cuotas=3; si no dice cuotas, cuotas=1.
- Meses en formato YYYY-MM; "el próximo mes" = mes siguiente al actual.
- Si la frase no es una acción financiera clara o falta un dato imprescindible (monto o fuente de una compra), no llames herramientas: responde en una frase corta en español qué falta.`;

  const client = new Anthropic();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages: [{ role: "user", content: texto }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return reply({ ok: false, mensaje: "ANTHROPIC_API_KEY inválida." }, 502);
    } else if (error instanceof Anthropic.RateLimitError) {
      return reply({ ok: false, mensaje: "Demasiadas solicitudes; intenta en un momento." }, 429);
    } else if (error instanceof Anthropic.APIError) {
      console.error("[voz] API error", error.status, error.message);
      return reply({ ok: false, mensaje: "El servicio de IA falló; intenta de nuevo." }, 502);
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    return reply({ ok: false, mensaje: "No puedo procesar esa solicitud." });
  }

  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse || !isToolName(toolUse.name) || !VOICE_TOOLS.includes(toolUse.name)) {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return reply({ ok: false, mensaje: text || "No entendí qué registrar. Intenta de nuevo." });
  }

  const args = (toolUse.input ?? {}) as Record<string, unknown>;
  const accion = { herramienta: toolUse.name, argumentos: args };

  if (dryRun) {
    return reply({ ok: true, dryRun: true, mensaje: describeAction(toolUse.name, args), accion });
  }

  const result = await executeTool(toolUse.name, args);
  return reply({ ok: result.ok, mensaje: result.mensaje, accion, datos: result.datos });
}
