"use client";

import { motion } from "motion/react";
import { useCallback, useState } from "react";
import type { Settings, Source } from "@/lib/types";
import { useEditor } from "../edit/EditorProvider";
import { IconPlus } from "../Icons";
import { spring } from "../motion";
import { SourceForm } from "../settings/SourceForm";
import { Sheet } from "../ui/Sheet";
import { AddForm } from "./AddForm";

/** Botón flotante "+" junto a la barra de pestañas; abre el sheet para registrar. */
export function AddButton({ sources, settings }: { sources: Source[]; settings: Settings }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <motion.button
        type="button"
        aria-label="Agregar"
        aria-haspopup="dialog"
        onClick={() => {
          setSession((s) => s + 1);
          setOpen(true);
        }}
        whileTap={{ scale: 0.88 }}
        transition={spring}
        className="flex size-[60px] shrink-0 items-center justify-center rounded-full bg-ios-blue text-white shadow-[0_10px_24px_-6px_rgba(0,122,255,0.6),inset_0_1px_0_rgba(255,255,255,0.3)]"
      >
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={spring} className="flex">
          <IconPlus className="size-7" />
        </motion.span>
      </motion.button>
      <Sheet open={open} onClose={close} label="Agregar movimiento">
        <AddForm key={session} sources={sources} settings={settings} onDone={close} />
      </Sheet>
      <EditSheet sources={sources} settings={settings} />
    </>
  );
}

/** Sheet de edición: lo abren las filas tocables vía `useOpenEditor()`. */
function EditSheet({ sources, settings }: { sources: Source[]; settings: Settings }) {
  const editor = useEditor();
  if (!editor) return null;
  const { target, open, session, close } = editor;
  return (
    <Sheet open={open} onClose={close} label={target?.kind === "fuente" ? "Editar fuente" : "Editar movimiento"}>
      {target?.kind === "fuente" ? (
        <SourceForm key={`e${session}`} settings={settings} source={target.item} onDone={close} />
      ) : target ? (
        <AddForm
          key={`e${session}`}
          mode="edit"
          initial={target}
          sources={sources}
          settings={settings}
          onDone={close}
        />
      ) : null}
    </Sheet>
  );
}
