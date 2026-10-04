"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { springSoft } from "../motion";

/**
 * Confirmación estilo action sheet de iOS, dentro del sheet que la contiene
 * (el padre debe ser `relative`). Botón destructivo en rojo + "Cancelar" aparte.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Eliminar",
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Sin autoFocus: haría scroll del contenedor (overflow hidden) mientras el panel entra desde abajo.
    if (open) cancelRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end" role="alertdialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-black/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={pending ? undefined : onCancel}
          />
          <motion.div
            className="relative space-y-2 px-2.5 pb-[max(env(safe-area-inset-bottom),10px)]"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={springSoft}
          >
            <div className="material overflow-hidden rounded-[14px] text-center">
              <div className="px-4 pt-3.5 pb-3">
                <div className="text-[13px] font-semibold text-label-2">{title}</div>
                {message && <div className="mt-0.5 text-[13px] text-label-2">{message}</div>}
              </div>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className="h-[56px] w-full border-t border-separator text-[20px] text-ios-red active:bg-fill-2 disabled:opacity-50"
              >
                {pending ? "Eliminando…" : confirmLabel}
              </button>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              ref={cancelRef}
              className="h-[56px] w-full rounded-[14px] bg-grouped-2 text-[20px] font-semibold text-ios-blue active:bg-fill-2 disabled:opacity-50"
            >
              Cancelar
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
