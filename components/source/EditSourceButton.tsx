"use client";

import type { Source } from "@/lib/types";
import { useOpenEditor } from "../edit/EditorProvider";

/** "Editar" en la barra de navegación del detalle de una fuente. */
export function EditSourceButton({ source }: { source: Source }) {
  const openEditor = useOpenEditor();
  return (
    <button
      type="button"
      onClick={() => openEditor({ kind: "fuente", item: source })}
      className="-mr-2 h-11 px-2 text-[17px] text-ios-blue active:opacity-50"
      aria-label={`Editar ${source.name}`}
    >
      Editar
    </button>
  );
}
