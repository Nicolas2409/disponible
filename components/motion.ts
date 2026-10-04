import type { Transition } from "motion/react";

/** Resorte principal: rápido, sin rebote excesivo. */
export const spring: Transition = { type: "spring", stiffness: 400, damping: 32 };
/** Un poco más suelto, para elementos grandes (sheets, tarjetas). */
export const springSoft: Transition = { type: "spring", stiffness: 300, damping: 30 };
/** Más vivo, para dígitos y checks. */
export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 34 };
