import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reutiliza pantallas ya visitadas al cambiar de pestaña. Los cambios hechos en la app
    // invalidan esta caché (revalidatePath) y al volver a la app se refresca (Providers).
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
