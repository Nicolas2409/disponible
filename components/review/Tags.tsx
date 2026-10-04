// Etiquetas pequeñas para compras que llegaron solas (correo, SMS, Apple Pay).
import { originLabel } from "../format";
import { IconBubble, IconCard, IconMail, IconMic } from "../Icons";

export function OriginTag({ origin, className }: { origin?: string; className?: string }) {
  const label = originLabel(origin);
  if (!label) return null;
  const Icon = origin === "correo" ? IconMail : origin === "sms" ? IconBubble : origin === "voz" ? IconMic : IconCard;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[12px] text-label-2 ${className ?? ""}`}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

export function ReviewPill({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full bg-ios-orange/15 px-2 text-[12px] font-semibold text-ios-orange ${className ?? ""}`}
    >
      Revisar cuotas
    </span>
  );
}
