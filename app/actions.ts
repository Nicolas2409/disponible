"use server";

// Server actions delgadas sobre lib/finance. Aceptan un objeto plano o un FormData
// (los esquemas zod coaccionan strings). La validación ocurre en lib/finance con zod;
// si falla se lanza un Error con mensaje legible. Tras cada mutación se revalida todo el árbol.
import { revalidatePath } from "next/cache";
import {
  addExpense,
  addIncome,
  addObligation,
  addPurchase,
  addSource,
  confirmPurchase,
  deleteEntity,
  discardInboxItem,
  markPaid,
  resolveInboxItem,
  undoLast,
  unmarkPaid,
  updateExpense,
  updateIncome,
  updateObligation,
  updatePurchase,
  updateSettings,
  updateSource,
  type EntityKind,
  type ResolveInboxInput,
} from "@/lib/finance";
import { MonthKeySchema } from "@/lib/schemas";
import type {
  NewExpenseInput,
  NewIncomeInput,
  NewObligationInput,
  NewPurchaseInput,
  NewSourceInput,
  SettingsInput,
  UpdateExpenseInput,
  UpdateIncomeInput,
  UpdateObligationInput,
  UpdatePurchaseInput,
  UpdateSourceInput,
} from "@/lib/schemas";

function toObject<T>(input: T | FormData): T {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of input.entries()) {
      if (k.startsWith("$ACTION")) continue;
      if (k in obj) obj[k] = ([] as unknown[]).concat(obj[k], v);
      else obj[k] = v;
    }
    return obj as T;
  }
  return input as T;
}

function refresh() {
  revalidatePath("/", "layout");
}

function month(m?: string) {
  if (m === undefined || m === "") return undefined;
  const r = MonthKeySchema.safeParse(m);
  if (!r.success) throw new Error("Mes inválido (formato YYYY-MM)");
  return r.data;
}

const ENTITIES: EntityKind[] = ["source", "purchase", "income", "obligation", "expense"];

export async function addPurchaseAction(input: NewPurchaseInput | FormData) {
  const r = await addPurchase(toObject(input));
  refresh();
  return r;
}

export async function addExpenseAction(input: NewExpenseInput | FormData) {
  const r = await addExpense(toObject(input));
  refresh();
  return r;
}

export async function addIncomeAction(input: NewIncomeInput | FormData) {
  const r = await addIncome(toObject(input));
  refresh();
  return r;
}

export async function addObligationAction(input: NewObligationInput | FormData) {
  const r = await addObligation(toObject(input));
  refresh();
  return r;
}

export async function addSourceAction(input: NewSourceInput | FormData) {
  const r = await addSource(toObject(input));
  refresh();
  return r;
}

function requireId(id: string) {
  if (typeof id !== "string" || !id) throw new Error("Falta id");
}

export async function updatePurchaseAction(id: string, patch: UpdatePurchaseInput | FormData) {
  requireId(id);
  const r = await updatePurchase(id, toObject(patch));
  refresh();
  return r;
}

export async function updateExpenseAction(id: string, patch: UpdateExpenseInput | FormData) {
  requireId(id);
  const r = await updateExpense(id, toObject(patch));
  refresh();
  return r;
}

export async function updateIncomeAction(id: string, patch: UpdateIncomeInput | FormData) {
  requireId(id);
  const r = await updateIncome(id, toObject(patch));
  refresh();
  return r;
}

export async function updateObligationAction(id: string, patch: UpdateObligationInput | FormData) {
  requireId(id);
  const r = await updateObligation(id, toObject(patch));
  refresh();
  return r;
}

export async function updateSourceAction(id: string, patch: UpdateSourceInput | FormData) {
  requireId(id);
  const r = await updateSource(id, toObject(patch));
  refresh();
  return r;
}

export async function markPaidAction(targetId: string, m?: string) {
  if (!targetId) throw new Error("Falta targetId");
  const r = await markPaid(targetId, month(m));
  refresh();
  return r;
}

export async function unmarkPaidAction(targetId: string, m?: string) {
  if (!targetId) throw new Error("Falta targetId");
  await unmarkPaid(targetId, month(m));
  refresh();
}

export async function deleteAction(entity: EntityKind, id: string) {
  if (!ENTITIES.includes(entity)) throw new Error(`Entidad inválida: ${entity}`);
  if (!id) throw new Error("Falta id");
  await deleteEntity(entity, id);
  refresh();
}

export async function undoAction() {
  const r = await undoLast();
  refresh();
  return r;
}

export async function updateSettingsAction(input: SettingsInput | FormData) {
  const obj = toObject(input) as Record<string, unknown>;
  // FormData con una sola moneda → string; normalizar a arreglo
  if (typeof obj.currencies === "string") obj.currencies = obj.currencies.split(/[,\s]+/).filter(Boolean);
  const r = await updateSettings(obj as SettingsInput);
  refresh();
  return r;
}

// ---------- Registro automático ----------

/** "1 cuota está bien": quita la marca de revisar sin cambiar nada más. */
export async function confirmPurchaseAction(id: string) {
  requireId(id);
  const r = await confirmPurchase(id);
  refresh();
  return r;
}

/** Asigna un movimiento de la bandeja a una tarjeta (crea la compra). */
export async function resolveInboxAction(id: string, input: ResolveInboxInput) {
  requireId(id);
  const r = await resolveInboxItem(id, input);
  refresh();
  return r;
}

export async function discardInboxAction(id: string) {
  requireId(id);
  await discardInboxItem(id);
  refresh();
}
