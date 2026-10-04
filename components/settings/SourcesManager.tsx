"use client";

import { useCallback, useState } from "react";
import type { Settings, Source } from "@/lib/types";
import { useOpenEditor } from "../edit/EditorProvider";
import { useDelete } from "../home/Rows";
import { IconChevronRight, IconPlus } from "../Icons";
import { cardBackground } from "../SourceCardFace";
import { Sheet } from "../ui/Sheet";
import { SwipeRow } from "../ui/SwipeRow";
import { KIND_SHORT, SourceForm } from "./SourceForm";

export function SourcesManager({ sources, settings }: { sources: Source[]; settings: Settings }) {
  const remove = useDelete();
  const openEditor = useOpenEditor();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {sources.map((s) => (
        <SwipeRow key={s.id} onDelete={() => remove("source", s.id)}>
          <button
            type="button"
            onClick={() => openEditor({ kind: "fuente", item: s })}
            aria-label={`Editar ${s.name}`}
            className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-fill-2"
          >
            <span className="h-8 w-[50px] shrink-0 rounded-[6px] shadow-[var(--shadow-card)]" style={cardBackground(s.color)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px]">{s.name}</div>
              <div className="text-[13px] text-label-2">
                {KIND_SHORT[s.kind]}, {s.currency}
                {s.cutDay ? `, corte el ${s.cutDay}` : ""}
                {s.dueDay ? `, pago el ${s.dueDay}` : ""}
              </div>
            </div>
            <IconChevronRight className="size-4 shrink-0 text-label-3" />
          </button>
        </SwipeRow>
      ))}
      <button
        type="button"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 text-[17px] text-ios-blue active:bg-fill-2"
      >
        <span className="flex size-[26px] items-center justify-center rounded-full bg-ios-blue text-white">
          <IconPlus className="size-4" />
        </span>
        Agregar tarjeta o fuente
      </button>
      <Sheet open={open} onClose={close} label="Nueva fuente">
        <SourceForm key={session} settings={settings} onDone={close} />
      </Sheet>
    </>
  );
}
