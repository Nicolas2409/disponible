"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ViewTransition } from "react";
import { formatMoney } from "@/lib/money";
import type { MonthKey, SourceMonth } from "@/lib/types";
import { IconPlus } from "../Icons";
import { SourceCardFace } from "../SourceCardFace";
import { cuotasLabel } from "../format";

const PEEK = 70; // px visibles de cada tarjeta tapada

/** Pila de tarjetas estilo Wallet. Al tocar una, se transforma en la cabecera del detalle. */
export function WalletStack({ items, month }: { items: SourceMonth[]; month: MonthKey }) {
  if (items.length === 0) {
    return (
      <Link
        href="/ajustes#fuentes"
        className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-[1.5px] border-dashed border-label-3 text-center active:opacity-60"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-fill-2 text-ios-blue">
          <IconPlus className="size-6" />
        </span>
        <span className="text-[17px] font-semibold">Agrega tu primera tarjeta</span>
        <span className="max-w-[240px] text-[15px] text-label-2">
          Aquí verás cuánto pagar de cada una, mes a mes.
        </span>
      </Link>
    );
  }

  return (
    <div className="relative">
      {items.map((it, i) => (
        <motion.div
          key={it.source.id}
          className="relative"
          style={{ marginTop: i === 0 ? 0 : `calc(-63.05% + ${PEEK}px)`, zIndex: i }}
          initial={{ y: 40 + i * 28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.08 + i * 0.07 }}
        >
          <motion.div whileTap={{ scale: 0.97, y: -4 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
            <Link
              href={`/fuente/${encodeURIComponent(it.source.id)}${month ? `?m=${month}` : ""}`}
              className="block rounded-[var(--radius-card)]"
              aria-label={`${it.source.name}: ${formatMoney(it.total, it.source.currency)}${it.paid ? ", pagado" : ""}`}
            >
              <ViewTransition name={`card-${it.source.id}`} share="morph" default="none">
                <SourceCardFace
                  source={it.source}
                  amount={formatMoney(it.total, it.source.currency)}
                  paid={it.paid}
                  detail={cuotasLabel(it.lines.length)}
                />
              </ViewTransition>
            </Link>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
