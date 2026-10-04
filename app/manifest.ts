import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Disponible",
    short_name: "Disponible",
    description: "Cuánto te queda este mes, después de cuotas y obligaciones.",
    lang: "es-CO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/pwa-icon/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
