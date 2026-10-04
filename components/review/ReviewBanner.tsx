"use client";

// Aviso en Inicio de lo que llegó solo (correo del banco, SMS, Apple Pay) y falta revisar:
// compras nuevas a 1 cuota sin confirmar y movimientos sin tarjeta (bandeja).
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmPurchaseAction, discardInboxAction, resolveInboxAction } from "@/app/actions";
import type { ReviewPurchase } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { parseMonto } from "@/lib/monto";
import type { InboxItem, Source } from "@/lib/types";
import { useOpenEditor } from "../edit/EditorProvider";
import { IconCheck, IconChevronRight, IconTray } from "../Icons";
import { spring } from "../motion";
import { useToast } from "../Toast";
import { Sheet } from "../ui/Sheet";
import { OriginTag } from "./Tags";

const QUICK = [1, 3, 6, 12, 24];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function when(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Bogota",
    });
  } catch {
    return "";
  }
}

export function ReviewBanner({
  purchases,
  inbox,
  sources,
}: {
  purchases: ReviewPurchase[];
  inbox: InboxItem[];
  sources: Source[];
}) {
  const [open, setOpen] = useState(false);
  const openEditor = useOpenEditor();
  const total = purchases.length + inbox.length;

  const title = purchases.length
    ? `${plural(purchases.length, "compra nueva", "compras nuevas")} · revisar cuotas`
    : `${plural(inbox.length, "movimiento", "movimientos")} por revisar`;
  const subtitle = purchases.length && inbox.length
    ? `y ${plural(inbox.length, "movimiento", "movimientos")} sin tarjeta`
    : purchases.length
      ? "Llegaron solas a 1 cuota"
      : "No encontré a qué tarjeta asignarlos";

  const edit = (p: ReviewPurchase) => {
    setOpen(false);
    openEditor({ kind: "compra", item: p });
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {total > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
            whileTap={{ scale: 0.98 }}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="mt-6 flex w-full items-center gap-3 rounded-[var(--radius-group)] bg-grouped-2 py-3 pr-3 pl-3.5 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ios-orange/15 text-ios-orange">
              <IconTray className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{title}</span>
              <span className="block truncate text-[13px] text-label-2">{subtitle}</span>
            </span>
            <IconChevronRight className="size-4 shrink-0 text-label-3" />
          </motion.button>
        )}
      </AnimatePresence>

      <Sheet open={open && total > 0} onClose={() => setOpen(false)} label="Por revisar">
        <div data-sheet-handle className="flex shrink-0 items-center justify-between px-4 pb-2">
          <span className="min-w-[60px]" aria-hidden />
          <h2 className="text-[17px] font-semibold">Por revisar</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 min-w-[60px] text-right text-[17px] font-semibold text-ios-blue"
          >
            Listo
          </button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),20px)]">
          {purchases.length > 0 && (
            <section className="mt-2">
              <h3 className="px-4 pb-1.5 text-[13px] font-semibold text-label-2 uppercase">Compras nuevas</h3>
              <div className="group-list overflow-hidden rounded-[16px] bg-grouped-2">
                {purchases.map((p) => (
                  <PurchaseItem key={p.id} p={p} onEdit={() => edit(p)} />
                ))}
              </div>
              <p className="mt-2 px-4 text-[13px] leading-[18px] text-label-2">
                Llegaron solas a 1 cuota. Toca una para cambiar las cuotas, o “1 cuota” si está bien.
              </p>
            </section>
          )}
          {inbox.length > 0 && (
            <section className="mt-6">
              <h3 className="px-4 pb-1.5 text-[13px] font-semibold text-label-2 uppercase">Sin tarjeta</h3>
              <div className="space-y-3">
                {inbox.map((i) => (
                  <InboxCard key={i.id} item={i} sources={sources} />
                ))}
              </div>
              <p className="mt-2 px-4 text-[13px] leading-[18px] text-label-2">
                Pon los últimos 4 dígitos de cada tarjeta en Ajustes para que se asignen solas.
              </p>
            </section>
          )}
        </div>
      </Sheet>
    </>
  );
}

function PurchaseItem({ p, onEdit }: { p: ReviewPurchase; onEdit: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      try {
        await confirmPurchaseAction(p.id);
        router.refresh();
        toast({ message: "Confirmada a 1 cuota" });
      } catch {
        toast({ message: "No se pudo confirmar", tone: "error" });
      }
    });

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${p.description}`}
        className="flex min-w-0 flex-1 flex-col py-2.5 pr-2 pl-4 text-left transition-colors active:bg-fill-2"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[17px]">{p.description}</span>
          <span className="tnum shrink-0 text-[17px] font-semibold">{formatMoney(p.amount, p.currency)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[13px] text-label-2">
          <span className="truncate">
            {p.sourceName}
            {p.occurredAt ? ` · ${when(p.occurredAt)}` : ""}
          </span>
          <OriginTag origin={p.origin} />
        </span>
      </button>
      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        aria-label={`Confirmar ${p.description} a 1 cuota`}
        className="mr-3 flex h-8 shrink-0 items-center gap-1 rounded-full bg-fill-2 px-2.5 text-[13px] font-semibold text-ios-blue active:opacity-60 disabled:opacity-40"
      >
        <IconCheck className="size-3.5" />1 cuota
      </button>
    </div>
  );
}

function InboxCard({ item, sources }: { item: InboxItem; sources: Source[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const p = item.parsed;
  const [sourceId, setSourceId] = useState("");
  const [installments, setInstallments] = useState(1);
  const [rawAmount, setRawAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  let amount = p?.amount;
  if (!amount && rawAmount) {
    try {
      amount = parseMonto(rawAmount);
    } catch {
      amount = undefined;
    }
  }
  const currency = p?.currency ?? sources.find((s) => s.id === sourceId)?.currency ?? "COP";
  const canAssign = !!sourceId && !!amount && amount > 0;

  const assign = () =>
    start(async () => {
      setError(null);
      try {
        await resolveInboxAction(item.id, { sourceId, installments, ...(p?.amount ? {} : { amount }) });
        router.refresh();
        toast({ message: "Compra registrada" });
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "No se pudo asignar");
      }
    });

  const discard = () =>
    start(async () => {
      try {
        await discardInboxAction(item.id);
        router.refresh();
        toast({ message: "Descartado" });
      } catch {
        toast({ message: "No se pudo descartar", tone: "error" });
      }
    });

  return (
    <div className="rounded-[16px] bg-grouped-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[17px] font-medium">
          {p?.merchant ?? (p?.amount ? "Compra" : "No entendí el mensaje")}
        </span>
        {p?.amount ? (
          <span className="tnum shrink-0 text-[17px] font-semibold">{formatMoney(p.amount, p.currency ?? "COP")}</span>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-label-2">
        <OriginTag origin={item.channel} />
        {p?.last4 && <span>Tarjeta *{p.last4}</span>}
        {!p?.last4 && p?.cardName && <span>Tarjeta «{p.cardName}»</span>}
        <span>{when(p?.occurredAt ?? item.receivedAt)}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-[13px] leading-[18px] text-label-2">{item.text}</p>

      {sources.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Tarjeta">
          {sources.map((s) => {
            const on = s.id === sourceId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSourceId(s.id)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-2 text-[14px] font-semibold transition-colors ${
                  on ? "text-white" : "bg-fill-2 text-label"
                }`}
                style={on ? { background: s.color } : undefined}
              >
                <span className="size-4 rounded-[5px] ring-1 ring-white/30 ring-inset" style={{ background: s.color }} />
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {!p?.amount && (
        <input
          inputMode="decimal"
          value={rawAmount}
          onChange={(e) => setRawAmount(e.target.value)}
          placeholder="Monto, p.ej. 45.900"
          aria-label="Monto"
          className="tnum mt-3 h-10 w-full rounded-[10px] bg-fill-2 px-3 text-[15px] outline-none placeholder:text-label-3"
        />
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <span className="mr-1 text-[13px] text-label-2">Cuotas</span>
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setInstallments(q)}
            className={`tnum h-7 flex-1 rounded-full text-[13px] font-semibold transition-colors ${
              installments === q ? "bg-ios-blue text-white" : "bg-fill-2 text-label"
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      {amount && installments > 1 ? (
        <p className="tnum mt-1.5 text-right text-[12px] text-label-2">
          {installments} × {formatMoney(amount / installments, currency)}
        </p>
      ) : null}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-ios-red">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          className="h-10 flex-1 rounded-full bg-fill-2 text-[15px] font-semibold text-ios-red active:opacity-60 disabled:opacity-40"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={assign}
          disabled={!canAssign || pending}
          className="h-10 flex-1 rounded-full bg-ios-blue text-[15px] font-semibold text-white active:opacity-70 disabled:opacity-35"
        >
          {pending ? "Guardando…" : "Asignar"}
        </button>
      </div>
    </div>
  );
}
