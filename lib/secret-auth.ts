// Autenticación por secreto compartido para /api/mcp y /api/voz.
//
// TODO(producción): reemplazar por OAuth 2.1 (p.ej. Supabase Auth u otro proveedor)
// siguiendo la especificación de autorización de MCP, para que claude.ai haga el flujo
// de login y no haya que poner el secreto en la URL del conector.

import { createHash, timingSafeEqual } from "node:crypto";

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** Comparación en tiempo constante (los hashes igualan la longitud). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function json(status: number, error: string, extraHeaders?: Record<string, string>): Response {
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

/**
 * Verifica el secreto. Acepta `Authorization: Bearer <secreto>` o, si se pasa,
 * un segmento de ruta con el secreto (`/api/mcp/<secreto>`).
 * Devuelve `null` si está autorizado, o la Response de error.
 */
export function checkSecret(req: Request, pathSecret?: string): Response | null {
  const secret = process.env.MCP_SECRET;
  if (!secret) {
    return json(503, "Servidor no configurado: define la variable de entorno MCP_SECRET.");
  }
  const auth = req.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  // Se evalúan ambas para no filtrar por tiempo cuál falló.
  const okBearer = bearer ? safeEqual(bearer, secret) : false;
  const okPath = pathSecret ? safeEqual(pathSecret, secret) : false;
  if (okBearer || okPath) return null;

  return json(401, "No autorizado.", { "WWW-Authenticate": 'Bearer realm="disponible"' });
}
