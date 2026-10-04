import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIconArt";

const SIZES = new Set([192, 512]);

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const n = Number(size.replace(/\.png$/, ""));
  if (!SIZES.has(n)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIconArt size={n} rounded={false} />, {
    width: n,
    height: n,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
