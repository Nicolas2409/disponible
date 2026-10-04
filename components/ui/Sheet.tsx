"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { springSoft } from "../motion";

/** Bottom sheet iOS: resorte, fondo difuminado, arrastrar hacia abajo para cerrar. */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[calc(100dvh-max(env(safe-area-inset-top),12px)-8px)] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[30px] bg-grouped shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.35)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springSoft}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1.5"
              onPointerDown={(e) => controls.start(e)}
              aria-hidden
            >
              <span className="h-[5px] w-9 rounded-full bg-label-3" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col" onPointerDown={(e) => {
              // Arrastre desde la zona superior del contenido (cabecera) también cierra.
              const target = e.target as HTMLElement;
              if (target.closest("[data-sheet-handle]")) controls.start(e);
            }}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const noopSubscribe = () => () => {};
