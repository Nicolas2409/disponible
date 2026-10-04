"use client";

// Estado global del sheet de edición. Las filas (ingresos, obligaciones, compras, gastos, fuentes)
// llaman a `useOpenEditor()(target)`; el sheet lo pinta AddButton, que ya tiene las fuentes
// y los ajustes cargados en el servidor.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Expense, Income, Obligation, Purchase, Source } from "@/lib/types";

export type MovementTarget =
  | { kind: "compra"; item: Purchase }
  | { kind: "gasto"; item: Expense }
  | { kind: "ingreso"; item: Income }
  | { kind: "obligacion"; item: Obligation };

export type EditTarget = MovementTarget | { kind: "fuente"; item: Source };

type EditorState = {
  target: EditTarget | null;
  open: boolean;
  /** Cambia en cada apertura para remontar el formulario con valores frescos. */
  session: number;
  openEditor: (t: EditTarget) => void;
  close: () => void;
};

const EditorContext = createContext<EditorState | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  const openEditor = useCallback((t: EditTarget) => {
    setTarget(t);
    setSession((s) => s + 1);
    setOpen(true);
  }, []);
  // Se conserva `target` al cerrar para que el contenido no desaparezca durante la animación.
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ target, open, session, openEditor, close }), [target, open, session, openEditor, close]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorState | null {
  return useContext(EditorContext);
}

/** Abre el sheet de edición. Sin provider (p.ej. en tests) no hace nada. */
export function useOpenEditor(): (t: EditTarget) => void {
  const ctx = useContext(EditorContext);
  return ctx?.openEditor ?? noop;
}

const noop = () => {};
