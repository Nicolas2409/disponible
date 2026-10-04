"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";
import { ToastProvider } from "./Toast";

/** Al volver a la app (p.ej. después de dictarle algo a Claude) se traen los datos nuevos. */
function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 2000) router.refresh();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <RefreshOnReturn />
        {children}
      </ToastProvider>
    </MotionConfig>
  );
}
