"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { PurchaseDetail } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/month";
import { originLabel } from "../format";
import { useOpenEditor } from "../edit/EditorProvider";
import { useDelete } from "../home/Rows";
import { IconChevronDown, IconChevronRight } from "../Icons";
import { spring, springSoft } from "../motion";
import { OriginTag, ReviewPill } from "../review/Tags";
import { Section } from "../ui/Section";
import { SwipeRow } from "../ui/SwipeRow";

type P = PurchaseDetail;

export function PurchaseList({
  active,
  upcoming,
  finished,
  currentMonthLabel,
}: {
  active: P[];
  upcoming: P[];
  finished: P[];
  currentMonthLabel: string;
}) {
  const [showDone, setShowDone] = useState(false);
  const remove = useDelete();
  const openEditor = useOpenEditor();
  const edit = (p: P) => openEditor({ kind: "compra", item: p });

  return (
    <>
      <Section
        title="Compras activas"
        footer={active.length > 0 ? `Cuotas calculadas para ${currentMonthLabel}. Toca una compra para editarla.` : undefined}
      >
        {active.length > 0 ? (
          active.map((p, i) => (
            <SwipeRow key={p.id} onDelete={() => remove("purchase", p.id)}>
              <Tappable label={p.description} onClick={() => edit(p)}>
                <PurchaseRow p={p} index={i} />
              </Tappable>
            </SwipeRow>
          ))
        ) : (
          <p className="px-4 py-4 text-[15px] text-label-2">
            No hay cuotas este mes. Registra una compra con el botón +.
          </p>
        )}
      </Section>

      {upcoming.length > 0 && (
        <Section title="Próximas">
          {upcoming.map((p) => (
            <SwipeRow key={p.id} onDelete={() => remove("purchase", p.id)}>
              <Tappable label={p.description} onClick={() => edit(p)}>
                <div className="flex min-h-[56px] items-center gap-3 py-2.5 pl-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px]">{p.description}</div>
                    <div className="text-[13px] text-label-2">
                      Empieza en {formatMonth(p.firstMonth)}, {p.installments} {p.installments === 1 ? "cuota" : "cuotas"}
                    </div>
                    <AutoTags p={p} />
                  </div>
                  <div className="tnum text-[17px]">{formatMoney(p.perInstallment, p.currency)}</div>
                </div>
              </Tappable>
            </SwipeRow>
          ))}
        </Section>
      )}

      {finished.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center justify-between pb-2.5"
          >
            <span className="display text-[22px] leading-7 font-bold">Terminadas</span>
            <span className="flex items-center gap-1.5 text-[15px] text-label-2">
              {finished.length}
              <motion.span animate={{ rotate: showDone ? 180 : 0 }} transition={spring} className="flex">
                <IconChevronDown className="size-4" />
              </motion.span>
            </span>
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={springSoft}
                className="group-list origin-top overflow-hidden rounded-[var(--radius-group)] bg-grouped-2"
              >
                {finished.map((p) => (
                  <SwipeRow key={p.id} onDelete={() => remove("purchase", p.id)}>
                    <Tappable label={p.description} onClick={() => edit(p)}>
                      <div className="flex min-h-[52px] items-center gap-3 py-2.5 pl-4 text-label-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[17px]">{p.description}</div>
                          <div className="text-[13px]">Terminó en {formatMonth(p.lastMonth)}</div>
                        </div>
                        <div className="tnum text-[15px]">{formatMoney(p.amount, p.currency)}</div>
                      </div>
                    </Tappable>
                  </SwipeRow>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </>
  );
}

/** Fila tocable (abre la edición) con chevron a la derecha y estado presionado. */
function Tappable({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Editar ${label}`}
      className="flex w-full items-center text-left transition-colors active:bg-fill-2"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <IconChevronRight className="mr-3 ml-1 size-4 shrink-0 text-label-3" />
    </button>
  );
}

function PurchaseRow({ p, index }: { p: P; index: number }) {
  const progress = p.installments > 0 ? Math.min(1, p.paidCount / p.installments) : 0;
  return (
    <div className="py-3 pl-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate text-[17px] font-medium">{p.description}</div>
        <div className="tnum shrink-0 text-[17px] font-semibold">{formatMoney(p.perInstallment, p.currency)}</div>
      </div>
      <div className="tnum mt-0.5 flex items-baseline justify-between gap-3 text-[13px] text-label-2">
        <span>
          {p.installments === 1 ? "Pago único" : `Cuota ${p.installment} de ${p.installments}`}
        </span>
        <span>
          {p.remainingAmount > 0
            ? `Faltan ${formatMoney(p.remainingAmount, p.currency)}`
            : p.installments === 1
              ? "Pagada"
              : "Completada"}
        </span>
      </div>
      <AutoTags p={p} />
      {p.installments > 1 && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-fill-2" aria-hidden>
          <motion.div
            className="h-full origin-left rounded-full bg-ios-blue"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            transition={{ ...springSoft, delay: 0.2 + index * 0.05 }}
          />
        </div>
      )}
    </div>
  );
}

/** Origen automático y aviso de cuotas sin confirmar. */
function AutoTags({ p }: { p: P }) {
  if (!p.needsReview && !originLabel(p.origin)) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {p.needsReview && <ReviewPill />}
      <OriginTag origin={p.origin} />
    </div>
  );
}
