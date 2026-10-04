import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Protege todas las pantallas y server actions con la sesión.
// /api/mcp y /api/voz tienen su propia clave (MCP_SECRET).
export async function proxy(request: NextRequest) {
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.method !== "GET") {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!login|api/mcp|api/voz|api/ingesta|_next/|manifest\\.webmanifest|icon|apple-icon|pwa-icon|favicon).*)",
  ],
};
