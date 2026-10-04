import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Disponible",
  description: "Cuánto te queda este mes, después de cuotas y obligaciones.",
  applicationName: "Disponible",
  appleWebApp: {
    capable: true,
    title: "Disponible",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="antialiased">
      <body className="min-h-dvh">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
