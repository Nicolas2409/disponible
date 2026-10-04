// Servidor MCP remoto (Streamable HTTP, sin estado, respuestas JSON) para el conector
// personalizado de claude.ai.
//
// URLs válidas:
//   POST /api/mcp/<MCP_SECRET>               (conector de claude.ai: el secreto va en la URL)
//   POST /api/mcp  + Authorization: Bearer <MCP_SECRET>
//
// TODO(producción): OAuth (Supabase Auth u otro proveedor) en lugar del secreto compartido.
// Ver lib/secret-auth.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { checkSecret } from "@/lib/secret-auth";
import { executeTool, TOOL_NAMES, toolMeta, toolShapes, type ToolName } from "@/lib/assistant-tools";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ path?: string[] }> };

const INSTRUCTIONS = `Disponible es la app de finanzas personales del usuario (Colombia, pesos COP por defecto).
Usa estas herramientas para anotar compras, gastos, ingresos, obligaciones fijas y pagos, para corregir o borrar lo anotado, y para responder cuánto dinero tiene disponible.
- "compra" = pago con tarjeta de crédito, que puede ir a cuotas (registrar_compra). "gasto" = pago con débito, efectivo o cuenta, sin cuotas, que descuenta del disponible del mes (registrar_gasto). "Gasté 20 mil en almuerzo" es un gasto; "compré un TV con la Visa a 12 cuotas" es una compra.
- Los montos hablados se convierten a número: "450 mil" = 450000, "2 palos" o "2 millones" = 2000000.
- Si no se dice con qué tarjeta de crédito se pagó una compra, pregunta antes de registrar (o usa listar_fuentes). Si no se dice cómo se pagó algo cotidiano (almuerzo, taxi, mercado pequeño), anótalo como gasto.
- Para cambiar algo ya registrado ("el salario ahora es 7 millones", "la compra del TV era a 12 cuotas", "el arriendo termina en diciembre") usa editar_movimiento; para borrarlo, eliminar_movimiento. Puedes identificarlo por descripción; si no estás seguro de cuál es, usa listar_movimientos. Si la herramienta devuelve varias candidatas, pregunta al usuario cuál antes de reintentar con el id.
- Las compras con tarjeta de crédito llegan solas desde el correo del banco, SMS o Apple Pay, a 1 cuota; las compras con débito llegan solas como gastos. Si preguntan qué tienen por revisar usa revisar_pendientes; para fijar las cuotas, editar_movimiento con el id y cuotas.
- Antes de eliminar algo que el usuario no nombró con claridad, confirma con él.
- Responde en español, en una o dos frases cortas, apto para modo voz. Si te equivocaste al registrar, usa deshacer_ultimo.`;

function buildServer(): McpServer {
  const server = new McpServer({ name: "disponible", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  for (const name of TOOL_NAMES) {
    const meta = toolMeta[name];
    server.registerTool(
      name,
      {
        title: meta.title,
        description: meta.description,
        inputSchema: toolShapes[name as ToolName],
        annotations: { title: meta.title, ...meta.annotations },
      },
      async (args: Record<string, unknown>) => {
        const r = await executeTool(name, args);
        return {
          content: [{ type: "text" as const, text: r.mensaje }],
          ...(r.datos ? { structuredContent: r.datos } : {}),
          ...(r.ok ? {} : { isError: true }),
        };
      },
    );
  }
  return server;
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  if (path && path.length > 1) return Response.json({ error: "No encontrado" }, { status: 404 });

  const denied = checkSecret(req, path?.[0]);
  if (denied) return denied;

  // Modo sin estado: no hay stream SSE independiente (GET) ni sesiones que cerrar (DELETE).
  if (req.method !== "POST") {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Método no permitido (servidor sin estado)." }, id: null },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // sin estado: apto para serverless
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    console.error("[mcp]", err);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Error interno" }, id: null },
      { status: 500 },
    );
  } finally {
    // Con enableJsonResponse la respuesta ya está completa; cerramos para liberar recursos.
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
