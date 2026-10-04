"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { IconCheck, IconCopy } from "../Icons";
import { springSnappy } from "../motion";

/** Registro automático de compras: URL del endpoint (el secreto nunca se muestra). */
export function AutoIngestInfo({ missingLast4 }: { missingLast4: string[] }) {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin || "https://tu-dominio"}/api/ingesta`;

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
        Las compras con tarjeta de crédito se anotan solas, a 1 cuota, desde los correos de Bancolombia, los SMS de Nu
        y Apple Pay. Las verás en Inicio como “por revisar” para ajustar las cuotas. Las compras con débito se anotan
        como gastos del mes. Transferencias y pagos a la tarjeta se ignoran.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-fill-2 py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate text-[14px] text-label">{url}</code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar URL de registro automático"
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
        Clave: encabezado <code>Authorization: Bearer</code> con el valor de MCP_SECRET. Los pasos (Gmail con Apps Script y
        los Atajos del iPhone) están en la guía <code>docs/registro-automatico.md</code>.
      </p>
      <p className="mt-2.5 text-[13px] leading-[18px] text-label-2">
        Consejo: agrega tu tarjeta débito como fuente tipo “Débito o cuenta” con sus últimos 4 dígitos (p.ej. 8765) para
        ver con qué cuenta se hizo cada gasto.
      </p>
      {missingLast4.length > 0 && (
        <p className="mt-2.5 text-[13px] leading-[18px] text-ios-orange">
          Falta poner los últimos 4 dígitos en: {missingLast4.join(", ")}.
        </p>
      )}
    </div>
  );
}

const noopSubscribe = () => () => {};
