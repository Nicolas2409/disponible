"use client";

import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSourceAction, deleteAction, updateSourceAction } from "@/app/actions";
import type { Settings, Source, SourceKind } from "@/lib/types";
import { IconCheck } from "../Icons";
import { springSnappy } from "../motion";
import { cardBackground } from "../SourceCardFace";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export const SWATCHES = ["#1c1c1e", "#c8102e", "#e07a10", "#2f855a", "#0f7c8a", "#0a64c8", "#5b3fd6", "#b83280"];
export const KIND_LABEL: Record<SourceKind, string> = {
  tarjeta: "Tarjeta de crédito",
  debito: "Débito o cuenta",
  hogar: "Hogar",
  otro: "Otro",
};
/** Etiqueta corta (lista de fuentes). */
export const KIND_SHORT: Record<SourceKind, string> = { tarjeta: "Crédito", debito: "Débito", hogar: "Hogar", otro: "Otro" };
const KINDS: SourceKind[] = ["tarjeta", "debito", "hogar", "otro"];

/** Formulario de fuente: crear (sin `source`) o editar/eliminar (con `source`). */
export function SourceForm({
  settings,
  source,
  onDone,
}: {
  settings: Settings;
  source?: Source;
  onDone: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [name, setName] = useState(source?.name ?? "");
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? "tarjeta");
  const [currency, setCurrency] = useState(source?.currency ?? settings.baseCurrency);
  const [color, setColor] = useState(source?.color ?? SWATCHES[0]);
  const [cutDay, setCutDay] = useState(source?.cutDay ? String(source.cutDay) : "");
  const [dueDay, setDueDay] = useState(source?.dueDay ? String(source.dueDay) : "");
  const [last4, setLast4] = useState(source?.last4 ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencies = Array.from(new Set([settings.baseCurrency, ...settings.currencies, currency]));
  // El color guardado puede no estar en la paleta: se muestra como una opción más.
  const swatches =
    source && !SWATCHES.includes(source.color) ? [...SWATCHES.slice(0, -1), source.color] : SWATCHES;

  const day = (v: string) => {
    const n = Number(v);
    return v !== "" && Number.isInteger(n) && n >= 1 && n <= 31 ? n : undefined;
  };

  // Débito o cuenta: no tiene día de corte ni de pago.
  const hasDays = kind !== "debito";

  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        const cut = hasDays ? day(cutDay) : undefined;
        const due = hasDays ? day(dueDay) : undefined;
        if (source) {
          await updateSourceAction(source.id, {
            name: name.trim(),
            kind,
            currency,
            color,
            cutDay: cut ?? null,
            dueDay: due ?? null,
            last4: last4 || null,
          });
        } else {
          await addSourceAction({ name: name.trim(), kind, currency, color, cutDay: cut, dueDay: due, last4: last4 || undefined });
        }
        onDone();
        router.refresh();
        toast({ message: source ? "Actualizado" : "Fuente agregada" });
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "No se pudo guardar");
      }
    });

  const remove = () => {
    if (!source) return;
    startDelete(async () => {
      try {
        await deleteAction("source", source.id);
        setConfirming(false);
        onDone();
        if (pathname.startsWith("/fuente/")) router.replace("/");
        else router.refresh();
        toast({ message: "Eliminado" });
      } catch (e) {
        setConfirming(false);
        setError(e instanceof Error && e.message ? e.message : "No se pudo eliminar");
      }
    });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div data-sheet-handle className="flex items-center justify-between px-4 pb-2">
        <button type="button" onClick={onDone} className="h-11 min-w-[76px] text-left text-[17px] text-ios-blue">
          Cancelar
        </button>
        <h2 className="text-[17px] font-semibold">{source ? "Editar fuente" : "Nueva fuente"}</h2>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || (last4 !== "" && last4.length !== 4) || pending || deleting}
          className="h-11 min-w-[76px] text-right text-[17px] font-semibold text-ios-blue disabled:opacity-35"
        >
          {pending ? "Guardando…" : source ? "Guardar" : "Agregar"}
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pt-2 pb-[max(env(safe-area-inset-bottom),20px)]">
        <motion.div
          layout
          className="mx-auto flex aspect-[1.586] w-[78%] flex-col justify-between rounded-[18px] p-4 text-white shadow-[var(--shadow-card)] transition-[background-color] duration-300"
          style={cardBackground(color)}
          aria-hidden
        >
          <div className="truncate text-[17px] font-semibold">{name.trim() || "Nombre"}</div>
          <div className="text-[13px] text-white/75">{KIND_LABEL[kind]}</div>
        </motion.div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "debito" ? "Bancolombia Ahorros, Débito…" : "Visa Bancolombia, Hogar…"}
          aria-label="Nombre"
          autoComplete="off"
          className="h-[50px] w-full rounded-[16px] bg-grouped-2 px-4 text-[17px] outline-none placeholder:text-label-3 focus-visible:ring-2 focus-visible:ring-ios-blue"
        />

        <div role="radiogroup" aria-label="Tipo" className="group-list overflow-hidden rounded-[16px] bg-grouped-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={k === kind}
              onClick={() => setKind(k)}
              className="flex min-h-[46px] w-full items-center justify-between gap-3 px-4 text-left text-[17px] transition-colors active:bg-fill-2"
            >
              {KIND_LABEL[k]}
              {k === kind && <IconCheck className="size-[18px] shrink-0 text-ios-blue" />}
            </button>
          ))}
        </div>

        <div className="flex justify-between gap-1" role="radiogroup" aria-label="Color">
          {swatches.map((c) => (
            <motion.button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={`Color ${c}`}
              whileTap={{ scale: 0.85 }}
              onClick={() => setColor(c)}
              className="relative flex size-10 items-center justify-center rounded-full"
              style={{ background: c }}
            >
              {c === color && (
                <motion.span
                  layoutId="swatch-ring"
                  transition={springSnappy}
                  className="absolute -inset-[4px] rounded-full border-[2.5px]"
                  style={{ borderColor: c }}
                />
              )}
              {c === color && <IconCheck className="relative size-4 text-white" />}
            </motion.button>
          ))}
        </div>

        <div className="group-list overflow-hidden rounded-[16px] bg-grouped-2">
          {currencies.length > 1 && (
            <div className="flex min-h-[50px] items-center justify-between px-4">
              <span className="text-[17px]">Moneda</span>
              <div className="flex gap-1.5">
                {currencies.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`h-8 rounded-full px-3 text-[14px] font-semibold transition-colors ${
                      c === currency ? "bg-ios-blue text-white" : "bg-fill-2"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasDays && <DayField label="Día de corte" value={cutDay} onChange={setCutDay} />}
          {hasDays && <DayField label="Día de pago" value={dueDay} onChange={setDueDay} />}
          <label className="flex min-h-[50px] items-center justify-between gap-3 px-4">
            <span className="text-[17px]">Últimos 4 dígitos</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Opcional"
              autoComplete="off"
              className="tnum w-24 bg-transparent text-right text-[17px] text-label-2 outline-none placeholder:text-label-3"
            />
          </label>
        </div>
        <p className="-mt-3 px-4 text-[13px] leading-[18px] text-label-2">
          {kind === "tarjeta"
            ? "Con los últimos 4 dígitos, las compras que avisa el banco se anotan solas en esta tarjeta. Si hay corte, las compras después del día de corte pasan al mes siguiente."
            : kind === "debito"
              ? "Con los últimos 4 dígitos (p.ej. T.Deb *8765), las compras con débito que avisa el banco se anotan solas como gastos de esta cuenta. No aparece en “Por pagar”."
              : "Los últimos 4 dígitos sirven para el registro automático de compras con tarjeta."}
        </p>

        {error && (
          <p role="alert" className="text-center text-[13px] text-ios-red">
            {error}
          </p>
        )}

        {source && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending || deleting}
            className="h-[50px] w-full rounded-[16px] bg-grouped-2 text-[17px] text-ios-red active:bg-fill-2 disabled:opacity-35"
          >
            Eliminar fuente
          </button>
        )}
      </div>

      {source && (
        <ConfirmDialog
          open={confirming}
          title={`¿Eliminar «${source.name}»?`}
          message="También se eliminan todas sus compras y cuotas. No se puede deshacer."
          confirmLabel="Eliminar fuente"
          pending={deleting}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function DayField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-h-[50px] items-center justify-between gap-3 px-4">
      <span className="text-[17px]">{label}</span>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder="Opcional"
        className="tnum w-24 bg-transparent text-right text-[17px] text-label-2 outline-none placeholder:text-label-3"
      />
    </label>
  );
}
