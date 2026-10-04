"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  addExpenseAction,
  addIncomeAction,
  addObligationAction,
  addPurchaseAction,
  confirmPurchaseAction,
  deleteAction,
  undoAction,
  updateExpenseAction,
  updateIncomeAction,
  updateObligationAction,
  updatePurchaseAction,
} from "@/app/actions";
import { formatMoney, currencyDecimals } from "@/lib/money";
import { addMonths, compareMonths, currentMonth, formatMonth, isMonthKey } from "@/lib/month";
import type { MonthKey, Settings, Source } from "@/lib/types";
import type { MovementTarget } from "../edit/EditorProvider";
import { IconMic, IconPlus } from "../Icons";
import { spring } from "../motion";
import { useToast } from "../Toast";
import { bogotaDateKey, monthOfDateKey, originLabel, todayKey } from "../format";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MonthStepper, monthChip } from "../ui/MonthStepper";
import { Segmented } from "../ui/Segmented";
import { Switch } from "../ui/Switch";
import { AmountDisplay } from "./AmountDisplay";
import { Keypad, type KeypadKey } from "./Keypad";

type Kind = "compra" | "gasto" | "ingreso" | "obligacion";
const QUICK = [1, 3, 6, 12, 24, 36];
const MAX_INSTALLMENTS = 72;

const KIND_NOUN: Record<Kind, string> = { compra: "compra", gasto: "gasto", ingreso: "ingreso", obligacion: "obligación" };
const KIND_ENTITY = { compra: "purchase", gasto: "expense", ingreso: "income", obligacion: "obligation" } as const;

/** 5000000 → "5000000"; 12.5 USD → "12,5" (formato del teclado). */
function amountToRaw(amount: number, currency: string): string {
  if (!(amount > 0)) return "";
  if (currencyDecimals(currency) === 0) return String(Math.round(amount));
  return (Math.round(amount * 100) / 100).toString().replace(".", ",");
}

/** "2026-10-03" → "octubre" (con el año si no es el actual). */
function expenseMonthLabel(dateKey: string): string {
  const label = formatMonth(monthOfDateKey(dateKey));
  return dateKey.slice(0, 4) === todayKey().slice(0, 4) ? label.split(" ")[0] : label;
}

function targetName(t: MovementTarget) {
  return t.kind === "obligacion" ? t.item.name : t.item.description;
}

function targetStart(t: MovementTarget): MonthKey {
  switch (t.kind) {
    case "compra":
      return t.item.firstMonth;
    case "gasto":
    case "ingreso":
      return t.item.month;
    case "obligacion":
      return t.item.startMonth;
  }
}

/**
 * Formulario de movimiento compartido por crear ("+") y editar (tocar una fila).
 * `mode="edit"` con `initial`: oculta el selector de tipo (no se puede cambiar), precarga
 * los campos, permite cambiar los meses y agrega "Eliminar" con confirmación.
 */
export function AddForm({
  sources,
  settings,
  onDone,
  mode = "create",
  initial,
}: {
  sources: Source[];
  settings: Settings;
  onDone: () => void;
  mode?: "create" | "edit";
  initial?: MovementTarget;
}) {
  const edit = mode === "edit" && initial ? initial : null;
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const pathname = usePathname() ?? "/";
  const m = params?.get("m");
  const month = isMonthKey(m) ? m : undefined;
  const sourceFromPath = pathname.startsWith("/fuente/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : "";

  // Compras solo con tarjetas de crédito (y otras fuentes); gastos solo con cuentas de débito.
  const creditSources = sources.filter((s) => s.kind !== "debito");
  const debitSources = sources.filter((s) => s.kind === "debito");
  const initialSource =
    creditSources.find((s) => s.id === (edit?.kind === "compra" ? edit.item.sourceId : sourceFromPath)) ?? creditSources[0];
  const initialDate = edit?.kind === "gasto" ? bogotaDateKey(edit.item.occurredAt ?? edit.item.createdAt) : todayKey();
  const initialRaw = edit ? amountToRaw(edit.item.amount, edit.item.currency) : "";
  const [kind, setKind] = useState<Kind>(edit?.kind ?? "compra");
  const [raw, setRaw] = useState(initialRaw);
  const [sourceId, setSourceId] = useState(initialSource?.id ?? "");
  const [currency, setCurrency] = useState(edit?.item.currency ?? initialSource?.currency ?? settings.baseCurrency);
  const [expenseSourceId, setExpenseSourceId] = useState<string | null>(
    edit?.kind === "gasto" ? (edit.item.sourceId ?? null) : null,
  );
  const [date, setDate] = useState(initialDate);
  const [installments, setInstallments] = useState(edit?.kind === "compra" ? edit.item.installments : 1);
  const [text, setText] = useState(edit ? targetName(edit) : "");
  const [recurring, setRecurring] = useState(edit?.kind === "ingreso" ? edit.item.recurring : true);
  // Al crear se usa el mes que se está viendo; al editar, el mes guardado (y se puede cambiar).
  const [startMonth, setStartMonth] = useState<MonthKey>(edit ? targetStart(edit) : (month ?? currentMonth()));
  const [endMonth, setEndMonth] = useState<MonthKey | null>(
    edit?.kind === "ingreso" || edit?.kind === "obligacion" ? (edit.item.endMonth ?? null) : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const currencies = Array.from(new Set([settings.baseCurrency, ...settings.currencies, currency]));
  const decimals = currencyDecimals(currency) > 0;
  const amount = Number(raw.replace(",", ".")) || 0;
  const valid =
    amount > 0 && text.trim().length > 0 && (kind !== "compra" || !!sourceId) && (kind !== "gasto" || !!date);

  const onKey = (k: KeypadKey) => {
    setError(null);
    setRaw((r) => {
      if (k === "back") return r.slice(0, -1);
      if (k === ",") return r.includes(",") || !decimals ? r : (r || "0") + ",";
      const [int, dec] = r.split(",");
      if (dec !== undefined) return dec.length >= 2 ? r : r + k;
      const next = (int + k).replace(/^0+(?=\d)/, "");
      if (/^0+$/.test(next)) return "";
      return next.length > 12 ? r : next;
    });
  };

  const cycleCurrency = () => {
    const i = currencies.indexOf(currency);
    const next = currencies[(i + 1) % currencies.length];
    setCurrency(next);
    if (currencyDecimals(next) === 0) setRaw((r) => r.split(",")[0]);
  };

  const pickSource = (s: Source) => {
    setSourceId(s.id);
    setCurrency(s.currency);
    if (currencyDecimals(s.currency) === 0) setRaw((r) => r.split(",")[0]);
  };

  /** Cuenta del gasto: tocar la elegida la quita (efectivo / sin cuenta). */
  const pickExpenseSource = (s: Source) => {
    if (expenseSourceId === s.id) {
      setExpenseSourceId(null);
      return;
    }
    setExpenseSourceId(s.id);
    setCurrency(s.currency);
    if (currencyDecimals(s.currency) === 0) setRaw((r) => r.split(",")[0]);
  };

  const changeStart = (m: MonthKey) => {
    setStartMonth(m);
    setEndMonth((e) => (e && compareMonths(e, m) < 0 ? m : e));
  };

  const saveEdit = async (target: MovementTarget) => {
    const description = text.trim();
    // El monto solo se envía si se tocó (evita redondeos al reescribir el mismo valor).
    const amountPatch = raw !== initialRaw ? { amount } : {};
    if (target.kind === "gasto") {
      await updateExpenseAction(target.item.id, {
        description,
        currency,
        sourceId: expenseSourceId,
        // La fecha solo se envía si cambió (conserva la hora exacta del banco).
        ...(date !== initialDate ? { date } : {}),
        ...amountPatch,
      });
    } else if (target.kind === "compra") {
      await updatePurchaseAction(target.item.id, {
        sourceId,
        description,
        currency,
        installments,
        firstMonth: startMonth,
        ...amountPatch,
      });
    } else if (target.kind === "ingreso") {
      await updateIncomeAction(target.item.id, {
        description,
        currency,
        recurring,
        month: startMonth,
        endMonth: recurring ? endMonth : null,
        ...amountPatch,
      });
    } else {
      await updateObligationAction(target.item.id, {
        name: description,
        currency,
        startMonth,
        endMonth,
        ...amountPatch,
      });
    }
    onDone();
    router.refresh();
    toast({ message: "Actualizado" });
  };

  const save = () => {
    if (!valid || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        if (edit) {
          await saveEdit(edit);
          return;
        }
        if (kind === "compra") {
          await addPurchaseAction({ sourceId, description: text.trim(), amount, currency, installments });
        } else if (kind === "gasto") {
          await addExpenseAction({
            description: text.trim(),
            amount,
            currency,
            date,
            ...(expenseSourceId ? { sourceId: expenseSourceId } : {}),
          });
        } else if (kind === "ingreso") {
          await addIncomeAction({ description: text.trim(), amount, currency, recurring, ...(month ? { month } : {}) });
        } else {
          await addObligationAction({ name: text.trim(), amount, currency, ...(month ? { startMonth: month } : {}) });
        }
        onDone();
        router.refresh();
        toast({
          message: "Guardado",
          action: {
            label: "Deshacer",
            onAction: async () => {
              try {
                await undoAction();
                router.refresh();
                toast({ message: "Deshecho" });
              } catch {
                toast({ message: "No se pudo deshacer", tone: "error" });
              }
            },
          },
        });
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  };

  /** Compra automática: "1 cuota está bien". */
  const confirmAsIs = () => {
    if (edit?.kind !== "compra") return;
    setError(null);
    startTransition(async () => {
      try {
        await confirmPurchaseAction(edit.item.id);
        onDone();
        router.refresh();
        toast({ message: "Confirmada" });
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "No se pudo confirmar. Inténtalo de nuevo.");
      }
    });
  };

  const remove = () => {
    if (!edit) return;
    startDelete(async () => {
      try {
        await deleteAction(KIND_ENTITY[edit.kind], edit.item.id);
        setConfirming(false);
        onDone();
        router.refresh();
        toast({ message: "Eliminado" });
      } catch (e) {
        setConfirming(false);
        setError(e instanceof Error && e.message ? e.message : "No se pudo eliminar. Inténtalo de nuevo.");
      }
    });
  };

  const placeholder = {
    compra: "¿Qué compraste?",
    gasto: "¿En qué gastaste?",
    ingreso: "Salario, freelance…",
    obligacion: "Arriendo, hipoteca, celular…",
  }[kind];
  const lastInstallment = addMonths(startMonth, Math.max(1, installments) - 1);
  const hasEnd = kind === "obligacion" || (kind === "ingreso" && recurring);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {edit ? (
        <div data-sheet-handle className="flex shrink-0 items-center justify-between px-4 pb-1">
          <button type="button" onClick={onDone} className="h-11 min-w-[76px] text-left text-[17px] text-ios-blue">
            Cancelar
          </button>
          <h2 className="truncate text-[17px] font-semibold">Editar {KIND_NOUN[edit.kind]}</h2>
          <span className="min-w-[76px]" aria-hidden />
        </div>
      ) : (
        <div data-sheet-handle className="flex shrink-0 items-center gap-3 px-4 pt-1 pb-3">
          <Segmented<Kind>
            className="flex-1"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setError(null);
              if (k === "compra" && initialSource) {
                setCurrency(sources.find((s) => s.id === sourceId)?.currency ?? initialSource.currency);
              } else if (k === "gasto") {
                setCurrency(sources.find((s) => s.id === expenseSourceId)?.currency ?? settings.baseCurrency);
              } else setCurrency(settings.baseCurrency);
            }}
            options={[
              { value: "compra", label: "Compra" },
              { value: "gasto", label: "Gasto" },
              { value: "ingreso", label: "Ingreso" },
              { value: "obligacion", label: "Obligación" },
            ]}
          />
        </div>
      )}

      <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        <div className="relative pt-3 pb-4">
          <AmountDisplay raw={raw} currency={currency} />
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={cycleCurrency}
              disabled={currencies.length < 2}
              className="h-8 rounded-full bg-fill-2 px-3.5 text-[14px] font-semibold text-label active:opacity-60 disabled:opacity-100"
              aria-label={`Moneda: ${currency}. Toca para cambiar`}
            >
              {currency}
              {currencies.length > 1 && <span className="ml-1 text-label-2">⇄</span>}
            </button>
            {!edit && (
              <span className="group relative">
                <button
                  type="button"
                  disabled
                  aria-label="Dictar por voz (próximamente)"
                  className="flex size-8 items-center justify-center rounded-full bg-fill-2 text-label-2"
                >
                  <IconMic className="size-[18px]" />
                </button>
                <span className="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-md bg-label px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-grouped-2 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
                  Próximamente
                </span>
              </span>
            )}
          </div>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={kind}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={spring}
            className="space-y-3 pb-3"
          >
            {kind === "compra" && (
              <>
                {edit?.kind === "compra" && edit.item.needsReview && (
                  <div className="flex items-center gap-3 rounded-[16px] bg-ios-orange/12 py-3 pr-3 pl-4">
                    <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-label">
                      <span className="font-semibold">
                        Llegó sola{originLabel(edit.item.origin) ? ` (${originLabel(edit.item.origin)})` : ""}.
                      </span>{" "}
                      Quedó a 1 cuota: cámbialas y guarda, o confírmala si está bien.
                    </p>
                    <button
                      type="button"
                      onClick={confirmAsIs}
                      disabled={pending || deleting}
                      className="h-8 shrink-0 rounded-full bg-ios-orange px-3.5 text-[14px] font-semibold text-white active:opacity-70 disabled:opacity-40"
                    >
                      Confirmar
                    </button>
                  </div>
                )}
                {creditSources.length === 0 ? (
                  <Link
                    href="/ajustes"
                    onClick={onDone}
                    className="flex items-center gap-3 rounded-[16px] bg-grouped-2 px-4 py-3.5 text-[15px] text-ios-blue"
                  >
                    <IconPlus className="size-5" /> Agrega una tarjeta en Ajustes para registrar compras
                  </Link>
                ) : (
                  <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                    {creditSources.map((s) => {
                      const on = s.id === sourceId;
                      return (
                        <motion.button
                          key={s.id}
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          onClick={() => pickSource(s)}
                          aria-pressed={on}
                          className={`flex h-10 shrink-0 items-center gap-2 rounded-full pr-4 pl-2.5 text-[15px] font-semibold transition-colors duration-200 ${
                            on ? "text-white" : "bg-grouped-2 text-label"
                          }`}
                          style={on ? { background: s.color } : undefined}
                        >
                          <span
                            className="size-5 rounded-[6px] ring-1 ring-white/30 ring-inset"
                            style={{ background: s.color }}
                          />
                          {s.name}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-[16px] bg-grouped-2 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[17px]">Cuotas</div>
                      <div className="tnum text-[13px] text-label-2">
                        {amount > 0 && installments > 1
                          ? `${installments} × ${formatMoney(amount / installments, currency)}`
                          : installments === 1
                            ? "Un solo pago"
                            : `${installments} meses`}
                      </div>
                    </div>
                    <div className="flex items-center rounded-[10px] bg-fill-2">
                      <button
                        type="button"
                        aria-label="Menos cuotas"
                        onClick={() => setInstallments((n) => Math.max(1, n - 1))}
                        className="h-9 w-11 text-[22px] font-medium active:opacity-50"
                      >
                        −
                      </button>
                      <span className="tnum w-8 text-center text-[17px] font-semibold">{installments}</span>
                      <button
                        type="button"
                        aria-label="Más cuotas"
                        onClick={() => setInstallments((n) => Math.min(MAX_INSTALLMENTS, n + 1))}
                        className="h-9 w-11 text-[22px] font-medium active:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setInstallments(q)}
                        className={`tnum h-8 flex-1 rounded-full text-[14px] font-semibold transition-colors duration-200 ${
                          installments === q ? "bg-ios-blue text-white" : "bg-fill-2 text-label"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {kind === "gasto" && debitSources.length > 0 && (
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Cuenta">
                {debitSources.map((s) => {
                  const on = s.id === expenseSourceId;
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => pickExpenseSource(s)}
                      aria-pressed={on}
                      className={`flex h-10 shrink-0 items-center gap-2 rounded-full pr-4 pl-2.5 text-[15px] font-semibold transition-colors duration-200 ${
                        on ? "text-white" : "bg-grouped-2 text-label"
                      }`}
                      style={on ? { background: s.color } : undefined}
                    >
                      <span className="size-5 rounded-[6px] ring-1 ring-white/30 ring-inset" style={{ background: s.color }} />
                      {s.name}
                    </motion.button>
                  );
                })}
              </div>
            )}

            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              enterKeyHint="done"
              autoComplete="off"
              aria-label={kind === "obligacion" ? "Nombre" : "Descripción"}
              className="h-[50px] w-full rounded-[16px] bg-grouped-2 px-4 text-[17px] text-label outline-none placeholder:text-label-3 focus-visible:ring-2 focus-visible:ring-ios-blue"
            />

            {kind === "ingreso" && (
              <div className="flex items-center justify-between rounded-[16px] bg-grouped-2 px-4 py-2.5">
                <div>
                  <div className="text-[17px]">Cada mes</div>
                  <div className="text-[13px] text-label-2">
                    {recurring ? "Se suma todos los meses" : `Solo en ${formatMonth(startMonth)}`}
                  </div>
                </div>
                <Switch checked={recurring} onChange={setRecurring} label="Ingreso recurrente" />
              </div>
            )}

            {kind === "gasto" && (
              <>
                <label className="flex min-h-[50px] items-center justify-between gap-3 rounded-[16px] bg-grouped-2 py-1.5 pr-3 pl-4">
                  <span>
                    <span className="block text-[17px]">Fecha</span>
                    <span className="block text-[13px] text-label-2">
                      {date ? `Se descuenta de ${expenseMonthLabel(date)}` : "Elige el día"}
                    </span>
                  </span>
                  <input
                    type="date"
                    value={date}
                    max={todayKey()}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Fecha del gasto"
                    className="tnum h-9 rounded-[8px] bg-fill-2 px-2.5 text-[17px] text-label outline-none focus-visible:ring-2 focus-visible:ring-ios-blue"
                  />
                </label>
                {!edit && (
                  <p className="px-4 text-[13px] leading-[18px] text-label-2">
                    Con débito o en efectivo, sin cuotas.{" "}
                    {debitSources.length > 0
                      ? "Elige la cuenta si quieres; tócala otra vez para quitarla."
                      : "Para compras con tarjeta de crédito usa Compra."}
                  </p>
                )}
              </>
            )}

            {kind === "obligacion" && !edit && (
              <p className="px-4 text-[13px] text-label-2">Se descuenta cada mes desde {formatMonth(startMonth)}.</p>
            )}

            {edit && kind !== "gasto" && (
              <div className="group-list overflow-hidden rounded-[16px] bg-grouped-2">
                {kind === "compra" ? (
                  <MonthStepper
                    label="Primera cuota"
                    hint={installments > 1 ? `Última: ${monthChip(lastInstallment)}` : "Pago único"}
                    value={startMonth}
                    onChange={changeStart}
                  />
                ) : (
                  <MonthStepper
                    label={kind === "ingreso" && !recurring ? "Mes" : "Desde"}
                    value={startMonth}
                    onChange={changeStart}
                  />
                )}
                {hasEnd && (
                  <div className="flex min-h-[50px] items-center justify-between gap-3 px-4 py-1.5">
                    <div>
                      <div className="text-[17px]">Termina</div>
                      <div className="text-[13px] text-label-2">
                        {endMonth ? `Último mes: ${formatMonth(endMonth)}` : "Sin fin"}
                      </div>
                    </div>
                    <Switch
                      checked={endMonth !== null}
                      onChange={(on) => {
                        const now = currentMonth();
                        setEndMonth(on ? (compareMonths(now, startMonth) > 0 ? now : startMonth) : null);
                        // Mostrar el selector "Hasta" que aparece al final de la lista.
                        if (on) {
                          requestAnimationFrame(() =>
                            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }),
                          );
                        }
                      }}
                      label="Tiene mes final"
                    />
                  </div>
                )}
                {hasEnd && endMonth && (
                  <MonthStepper label="Hasta" value={endMonth} onChange={setEndMonth} min={startMonth} />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-separator/60 bg-grouped pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        <Keypad decimals={decimals} onKey={onKey} />
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-5 pt-2 text-center text-[13px] text-ios-red"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="px-4 pt-2">
          <motion.button
            type="button"
            onClick={save}
            disabled={!valid || pending || deleting}
            whileTap={valid ? { scale: 0.97 } : undefined}
            className="h-[52px] w-full rounded-full bg-ios-blue text-[17px] font-semibold text-white transition-opacity duration-200 disabled:opacity-35"
          >
            {pending ? "Guardando…" : edit ? "Guardar cambios" : "Guardar"}
          </motion.button>
          {edit && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending || deleting}
              className="mt-1 h-11 w-full rounded-full text-[17px] text-ios-red active:bg-fill-2 disabled:opacity-35"
            >
              Eliminar {KIND_NOUN[edit.kind]}
            </button>
          )}
        </div>
      </div>

      {edit && (
        <ConfirmDialog
          open={confirming}
          title={`¿Eliminar «${targetName(edit)}»?`}
          message={
            edit.kind === "compra"
              ? "Se borran todas sus cuotas. No se puede deshacer."
              : edit.kind === "gasto"
                ? `Deja de descontarse de ${formatMonth(edit.item.month)}. No se puede deshacer.`
                : edit.kind === "obligacion"
                ? "Deja de descontarse en todos los meses. No se puede deshacer."
                : "Deja de sumarse en todos los meses. No se puede deshacer."
          }
          confirmLabel={`Eliminar ${KIND_NOUN[edit.kind]}`}
          pending={deleting}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
