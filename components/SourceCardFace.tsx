import type { Source } from "@/lib/types";
import { IconCheck } from "./Icons";

const KIND_LABEL: Record<Source["kind"], string> = { tarjeta: "Tarjeta", debito: "Débito", hogar: "Hogar", otro: "Otro" };

export function cardBackground(color: string) {
  return {
    backgroundColor: color,
    backgroundImage: [
      "radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)",
      `linear-gradient(160deg, color-mix(in oklab, ${color} 88%, white) 0%, ${color} 45%, color-mix(in oklab, ${color} 72%, black) 100%)`,
    ].join(","),
  } as const;
}

/** Cara de tarjeta estilo Wallet. Presentacional: se usa en la pila y en el detalle. */
export function SourceCardFace({
  source,
  amount,
  paid,
  detail,
  className,
}: {
  source: Source;
  amount: string;
  paid: boolean;
  /** Línea inferior izquierda (p.ej. "4 cuotas este mes"). */
  detail?: string;
  className?: string;
}) {
  const due = source.dueDay ? `Pago el día ${source.dueDay}` : KIND_LABEL[source.kind];
  return (
    <div
      className={`relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-[var(--radius-card)] p-[18px] text-white shadow-[var(--shadow-card)] ${className ?? ""}`}
      style={cardBackground(source.color)}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-white/15 ring-inset" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] leading-[22px] font-semibold">{source.name}</div>
          <div className="text-[13px] leading-[18px] text-white/70">{due}</div>
        </div>
        <div className="tnum shrink-0 text-right text-[19px] leading-[22px] font-semibold">{amount}</div>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-[13px] text-white/75">{detail}</div>
        <div
          className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors duration-300 ${
            paid ? "bg-white text-black" : "bg-white/18 text-white"
          }`}
          style={paid ? undefined : { backgroundColor: "rgba(255,255,255,0.18)" }}
        >
          {paid && <IconCheck className="size-3.5 text-[#248a3d]" />}
          {paid ? "Pagado" : "Pendiente"}
        </div>
      </div>
    </div>
  );
}
