// Esquemas de entrada (zod v4). Aceptan valores "de formulario" (strings) y los coaccionan.
// Cada export es a la vez el esquema (valor) y el tipo de entrada (explícito, con opcionales) con el mismo nombre.
import { z } from "zod";
import { currentMonth } from "./month";

/** "" / null → undefined, para campos opcionales que vienen de FormData. */
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

export const MonthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido (formato YYYY-MM)");

export const CurrencySchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Moneda inválida (código ISO de 3 letras)"));

const money = z.coerce.number().positive("El monto debe ser mayor que 0");

const bool = z.preprocess((v) => {
  if (typeof v === "string") return ["true", "on", "1", "si", "sí", "yes"].includes(v.toLowerCase());
  return v;
}, z.boolean());

const day = z.coerce.number().int().min(1).max(31);

const last4 = z.coerce.string().trim().regex(/^\d{4}$/, "Últimos 4 dígitos: escribe exactamente 4 números");

export const NewPurchaseInput = z.object({
  sourceId: z.string().min(1, "Falta la fuente"),
  description: z.string().trim().min(1, "Falta la descripción"),
  amount: money,
  currency: opt(CurrencySchema), // por defecto: moneda de la fuente
  installments: z.preprocess(blank, z.coerce.number().int().min(1).max(72).default(1)),
  firstMonth: z.preprocess(blank, MonthKeySchema.default(() => currentMonth())),
  monthlyRate: opt(z.coerce.number().min(0).max(1)),
});
export type NewPurchaseInput = {
  sourceId: string;
  description: string;
  amount: number;
  currency?: string;
  installments?: number; // 1..72, por defecto 1
  firstMonth?: string; // por defecto currentMonth()
  monthlyRate?: number;
};

export const NewIncomeInput = z.object({
  description: z.string().trim().min(1, "Falta la descripción"),
  amount: money,
  currency: opt(CurrencySchema), // por defecto: moneda base
  recurring: z.preprocess(blank, bool.default(true)),
  month: z.preprocess(blank, MonthKeySchema.default(() => currentMonth())),
  endMonth: opt(MonthKeySchema),
});
export type NewIncomeInput = {
  description: string;
  amount: number;
  currency?: string;
  recurring?: boolean; // por defecto true
  month?: string; // por defecto currentMonth()
  endMonth?: string;
};

export const NewObligationInput = z.object({
  name: z.string().trim().min(1, "Falta el nombre"),
  amount: money,
  currency: opt(CurrencySchema), // por defecto: moneda base
  startMonth: z.preprocess(blank, MonthKeySchema.default(() => currentMonth())),
  endMonth: opt(MonthKeySchema),
  sourceId: opt(z.string().min(1)),
});
export type NewObligationInput = {
  name: string;
  amount: number;
  currency?: string;
  startMonth?: string; // por defecto currentMonth()
  endMonth?: string;
  sourceId?: string;
};

/** Fecha "YYYY-MM-DD" (día en hora de Bogotá) o instante ISO completo. */
export const ExpenseDateSchema = z
  .string()
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || (/^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))), {
    message: "Fecha inválida (formato YYYY-MM-DD)",
  });

export const NewExpenseInput = z.object({
  description: z.string().trim().min(1, "Falta la descripción"),
  amount: money,
  currency: opt(CurrencySchema), // por defecto: la de la fuente, o la moneda base
  date: opt(ExpenseDateSchema), // por defecto: ahora
  sourceId: opt(z.string().min(1)),
});
export type NewExpenseInput = {
  description: string;
  amount: number;
  currency?: string;
  /** "YYYY-MM-DD" o ISO. Por defecto: ahora. El mes se deduce de la fecha. */
  date?: string;
  /** Fuente tipo "debito" (opcional). */
  sourceId?: string;
};

export const NewSourceInput = z.object({
  name: z.string().trim().min(1, "Falta el nombre"),
  kind: z.preprocess(blank, z.enum(["tarjeta", "debito", "hogar", "otro"]).default("tarjeta")),
  currency: opt(CurrencySchema), // por defecto: moneda base
  color: opt(z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Color inválido (hex)")),
  cutDay: opt(day),
  dueDay: opt(day),
  last4: opt(last4),
});
export type NewSourceInput = {
  name: string;
  kind?: "tarjeta" | "debito" | "hogar" | "otro"; // por defecto "tarjeta"
  currency?: string;
  color?: string;
  cutDay?: number;
  dueDay?: number;
  last4?: string;
};

// ---------- Edición (parches parciales) ----------
// Reglas: `undefined` (o "" en campos no borrables) = sin cambio. En campos opcionales de la
// entidad (fin, días, tasa…), `null` o "" = borrar el valor (p.ej. endMonth: null → "sin fin").

/** "" → null; undefined se conserva (sin cambio). */
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());

export const UpdatePurchaseInput = z.object({
  sourceId: opt(z.string().min(1)),
  description: opt(z.string().trim().min(1, "Falta la descripción")),
  amount: opt(money),
  currency: opt(CurrencySchema),
  installments: opt(z.coerce.number().int().min(1).max(72)),
  firstMonth: opt(MonthKeySchema),
  monthlyRate: clearable(z.coerce.number().min(0).max(1)),
});
export type UpdatePurchaseInput = {
  sourceId?: string;
  description?: string;
  amount?: number;
  currency?: string;
  installments?: number;
  firstMonth?: string;
  monthlyRate?: number | null;
};

export const UpdateIncomeInput = z.object({
  description: opt(z.string().trim().min(1, "Falta la descripción")),
  amount: opt(money),
  currency: opt(CurrencySchema),
  recurring: opt(bool),
  month: opt(MonthKeySchema),
  endMonth: clearable(MonthKeySchema),
});
export type UpdateIncomeInput = {
  description?: string;
  amount?: number;
  currency?: string;
  recurring?: boolean;
  month?: string;
  /** null = sin fin */
  endMonth?: string | null;
};

export const UpdateObligationInput = z.object({
  name: opt(z.string().trim().min(1, "Falta el nombre")),
  amount: opt(money),
  currency: opt(CurrencySchema),
  startMonth: opt(MonthKeySchema),
  endMonth: clearable(MonthKeySchema),
  sourceId: clearable(z.string().min(1)),
});
export type UpdateObligationInput = {
  name?: string;
  amount?: number;
  currency?: string;
  startMonth?: string;
  /** null = sin fin */
  endMonth?: string | null;
  sourceId?: string | null;
};

export const UpdateSourceInput = z.object({
  name: opt(z.string().trim().min(1, "Falta el nombre")),
  kind: opt(z.enum(["tarjeta", "debito", "hogar", "otro"])),
  currency: opt(CurrencySchema),
  color: opt(z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Color inválido (hex)")),
  cutDay: clearable(day),
  dueDay: clearable(day),
  last4: clearable(last4),
});
export type UpdateSourceInput = {
  name?: string;
  kind?: "tarjeta" | "debito" | "hogar" | "otro";
  currency?: string;
  color?: string;
  cutDay?: number | null;
  dueDay?: number | null;
  /** null = borrar */
  last4?: string | null;
};

export const UpdateExpenseInput = z.object({
  description: opt(z.string().trim().min(1, "Falta la descripción")),
  amount: opt(money),
  currency: opt(CurrencySchema),
  date: opt(ExpenseDateSchema),
  sourceId: clearable(z.string().min(1)),
});
export type UpdateExpenseInput = {
  description?: string;
  amount?: number;
  currency?: string;
  /** "YYYY-MM-DD" o ISO; cambia también el mes. */
  date?: string;
  /** null = sin fuente */
  sourceId?: string | null;
};

export const SettingsInput = z.object({
  baseCurrency: opt(CurrencySchema),
  currencies: opt(z.array(CurrencySchema).min(1)),
});
export type SettingsInput = {
  baseCurrency?: string;
  currencies?: string[];
};

/** Mensaje legible a partir de un error de zod. */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}
