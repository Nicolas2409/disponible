"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { IconTrash } from "../Icons";
import { spring } from "../motion";

const REVEAL = 84;

/** Fila con "deslizar para eliminar" al estilo de Mail/Recordatorios. */
export function SwipeRow({
  children,
  onDelete,
  deleteLabel = "Eliminar",
}: {
  children: React.ReactNode;
  onDelete: () => void | Promise<void>;
  deleteLabel?: string;
}) {
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Tras arrastrar, el "click" que dispara el navegador al soltar no debe abrir la fila.
  const dragged = useRef(false);
  const btnScale = useTransform(x, [-REVEAL, -24, 0], [1, 0.6, 0.6]);
  const btnOpacity = useTransform(x, [-REVEAL, -24, 0], [1, 0.4, 0]);
  const bgOpacity = useTransform(x, [-2, 0], [1, 0]);

  const settle = (to: number) => {
    setOpen(to !== 0);
    animate(x, to, spring);
  };

  return (
    <motion.div
      className="relative overflow-hidden"
      animate={removing ? { opacity: 0, scale: 0.98 } : { opacity: 1, scale: 1 }}
      transition={spring}
    >
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-y-0 right-0 flex w-[84px] items-center justify-center bg-ios-red"
      >
        <motion.button
          type="button"
          style={{ scale: btnScale, opacity: btnOpacity }}
          onClick={async () => {
            setRemoving(true);
            try {
              await onDelete();
            } catch {
              setRemoving(false);
              settle(0);
            }
          }}
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-white"
          aria-label={deleteLabel}
          tabIndex={open ? 0 : -1}
        >
          <IconTrash className="size-5" />
          <span className="text-[12px] font-semibold">{deleteLabel}</span>
        </motion.button>
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.25, right: 0.05 }}
        dragMomentum={false}
        style={{ x, touchAction: "pan-y" }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          // Si el click no llega (se soltó fuera), no bloquear el siguiente toque real.
          setTimeout(() => {
            dragged.current = false;
          }, 80);
          const shouldOpen = x.get() < -REVEAL / 2 || info.velocity.x < -400;
          settle(shouldOpen ? -REVEAL : 0);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            dragged.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (open) {
            e.preventDefault();
            e.stopPropagation();
            settle(0);
          }
        }}
        className="relative bg-grouped-2"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
