"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { IconCheck, IconCopy } from "../Icons";
import { springSnappy } from "../motion";

/** URL del conector MCP para claude.ai. El secreto nunca se muestra: el usuario lo agrega. */
export function ConnectorInfo() {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin || "https://tu-dominio"}/api/mcp/`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* el portapapeles puede no estar disponible */
    }
  };

  return (
    <div className="px-4 py-3.5">
      <p className="text-[15px] leading-5 text-label-2">
        Agrega Disponible como conector personalizado en Claude y podrás decir “anota 450 mil en la Visa a 6
        cuotas” o preguntar cuánto te queda este mes.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-fill-2 py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate text-[14px] text-label">
          {url}
          <span className="text-label-2">tu-clave</span>
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar URL"
          className="flex h-8 items-center gap-1 rounded-[8px] bg-grouped-2 px-2.5 text-[13px] font-semibold text-ios-blue"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied ? "ok" : "copy"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={springSnappy}
              className="flex items-center gap-1"
            >
              {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
              {copied ? "Copiada" : "Copiar"}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
      <p className="mt-2.5 text-[13px] leading-[18px] text-label-2">
        Reemplaza “tu-clave” por el valor de MCP_SECRET configurado en el servidor.
      </p>
    </div>
  );
}

const noopSubscribe = () => () => {};
