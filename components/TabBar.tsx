"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { IconChart, IconGear, IconHomeFill } from "./Icons";
import { spring } from "./motion";

const tabs = [
  { href: "/", label: "Inicio", Icon: IconHomeFill, match: (p: string) => p === "/" || p.startsWith("/fuente") },
  { href: "/futuro", label: "Futuro", Icon: IconChart, match: (p: string) => p.startsWith("/futuro") },
  { href: "/ajustes", label: "Ajustes", Icon: IconGear, match: (p: string) => p.startsWith("/ajustes") },
];

export function TabBar() {
  const pathname = usePathname() ?? "/";
  // La pestaña tocada se marca al instante, sin esperar a que llegue la pantalla.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const current = tapped && tapped.from === pathname ? tapped.href : pathname;
  return (
    <nav
      aria-label="Secciones"
      className="material flex h-[60px] flex-1 items-center rounded-full p-1 shadow-[var(--shadow-float)]"
    >
      {tabs.map(({ href, label, Icon, match }) => {
        const active = match(current);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setTapped({ href, from: pathname })}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-200 ${
              active ? "text-ios-blue" : "text-label"
            }`}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                transition={spring}
                className="absolute inset-0 rounded-full bg-fill-2"
                aria-hidden
              />
            )}
            <Icon className="relative size-[22px]" />
            <span className="relative text-[10px] font-semibold tracking-normal">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
