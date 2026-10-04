import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIconArt";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS aplica su propia máscara redondeada: el ícono va a sangre.
export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={180} rounded={false} />, size);
}
