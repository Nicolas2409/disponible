// Herramientas del asistente (compartidas por el servidor MCP y /api/voz).
// Define esquemas zod + descripciones en español y un ejecutor que traduce
// (nombre de herramienta, argumentos) → llamadas a lib/finance → mensaje corto en español.

import { z } from "zod";
import * as finance from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { parseMonto } from "@/lib/monto";
import { currentMonth, formatMonth } from "@/lib/month";
import type { MonthSummary, Source } from "@/lib/types";

// ---------- Utilidades ----------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const mesSchema = z
  .string()
  .regex(MONTH_RE, "Formato de mes inválido; usa YYYY-MM, p.ej. 2026-10");

export { parseMonto };

const montoSchema = z
  .union([z.number(), z.string()])
  .describe(
    'Monto numérico. Convierte expresiones habladas: "450 mil" = 450000, "2 palos" o "2 millones" = 2000000. ' +
      "Está en la moneda de la fuente salvo que se indique `moneda`.",
  );

const monedaSchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .describe('Código ISO de moneda (p.ej. "COP", "USD"). Omítelo para usar la moneda de la fuente / principal.')
  .optional();

const tipoSchema = z
  .enum(["compra", "gasto", "ingreso", "obligacion"])
  .describe(
    'Tipo de movimiento: "compra" (con tarjeta de crédito, a cuotas), "gasto" (con débito, efectivo o cuenta; descuenta del mes), ' +
      '"ingreso" u "obligacion" (pago fijo mensual).',
  );

const fechaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Formato de fecha inválido; usa YYYY-MM-DD, p.ej. 2026-10-03");

const idSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Id exacto del movimiento (de listar_movimientos). Úsalo si lo tienes.");

const buscarSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Descripción o nombre actual para buscarlo si no tienes el id, p.ej. 'salario' o 'mercado'.");

const HASTA_RE = /^(\d{4}-(0[1-9]|1[0-2])|sin[ _-]?fin)$/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const ENTITY_ES: Record<string, string> = {
  source: "fuente",
  purchase: "compra",
  income: "ingreso",
  obligation: "obligación",
  payment: "pago",
  expense: "gasto",
};

const fm = (amount: number, currency: string) => formatMoney(amount, currency);

const MAX_LISTA = 60;

/** "3 oct" (día en hora de Colombia). */
const fechaCorta = (iso: string) =>
  new Date(iso)
    .toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" })
    .replace(/\.$/, "")
    .replace(" de ", " ");

// ---------- Definiciones ----------

export const toolShapes = {
  resumen_mes: {
    mes: mesSchema.optional().describe("Mes YYYY-MM. Omitir para el mes actual."),
  },
  listar_fuentes: {},
  registrar_compra: {
    descripcion: z.string().min(1).describe("Qué se compró, p.ej. 'mercado Éxito'."),
    monto: montoSchema,
    fuente: z
      .string()
      .min(1)
      .describe("Nombre de la tarjeta o fuente con que se pagó, p.ej. 'Visa' o 'Mastercard'."),
    cuotas: z.number().int().min(1).max(72).default(1).describe("Número de cuotas (1 si es de contado)."),
    moneda: monedaSchema,
    mes_primera_cuota: mesSchema
      .optional()
      .describe("Mes YYYY-MM de la primera cuota. Omitir para dejar el valor por defecto."),
  },
  registrar_gasto: {
    descripcion: z.string().min(1).describe("En qué se gastó, p.ej. 'almuerzo' o 'taxi'."),
    monto: montoSchema,
    moneda: monedaSchema,
    fecha: fechaSchema.optional().describe("Día del gasto YYYY-MM-DD (hora de Colombia). Omitir = hoy. El mes se deduce de la fecha."),
    fuente: z
      .string()
      .min(1)
      .optional()
      .describe("Opcional: cuenta o tarjeta débito con que se pagó (tipo 'debito'). Omitir si fue en efectivo o no se dijo."),
  },
  registrar_ingreso: {
    descripcion: z.string().min(1).describe("Concepto del ingreso, p.ej. 'salario' o 'freelance'."),
    monto: montoSchema,
    recurrente: z.boolean().default(false).describe("true si se repite cada mes (salario)."),
    moneda: monedaSchema,
    mes: mesSchema.optional().describe("Mes YYYY-MM del ingreso (o de inicio si es recurrente). Omitir = mes actual."),
  },
  registrar_obligacion: {
    nombre: z.string().min(1).describe("Nombre de la obligación fija, p.ej. 'arriendo', 'hipoteca'."),
    monto_mensual: montoSchema,
    desde: mesSchema.optional().describe("Mes YYYY-MM de inicio. Omitir = mes actual."),
    hasta: mesSchema.optional().describe("Mes YYYY-MM final (opcional)."),
    moneda: monedaSchema,
  },
  marcar_pagado: {
    fuente: z.string().min(1).describe("Tarjeta/fuente u obligación que se pagó, p.ej. 'Visa' o 'arriendo'."),
    mes: mesSchema.optional().describe("Mes YYYY-MM. Omitir = mes actual."),
  },
  proyeccion: {
    meses: z.number().int().min(1).max(24).default(6).describe("Cuántos meses proyectar desde el actual."),
  },
  deshacer_ultimo: {},
  listar_movimientos: {
    tipo: tipoSchema.optional().describe("Filtra por tipo. Omitir = todos."),
    mes: mesSchema.optional().describe("Solo los vigentes en ese mes YYYY-MM. Omitir = todos los registrados."),
  },
  editar_movimiento: {
    tipo: tipoSchema,
    id: idSchema,
    descripcion: buscarSchema,
    nueva_descripcion: z.string().min(1).optional().describe("Nuevo nombre o descripción."),
    monto: montoSchema.optional(),
    moneda: monedaSchema,
    cuotas: z.number().int().min(1).max(72).optional().describe("Solo compras: nuevo número de cuotas."),
    fuente: z
      .string()
      .min(1)
      .optional()
      .describe("Compras: nueva tarjeta de crédito, p.ej. 'Visa'. Gastos: cuenta débito con que se pagó."),
    fecha: fechaSchema.optional().describe("Solo gastos: nuevo día YYYY-MM-DD (cambia también el mes en que cuenta)."),
    recurrente: z.boolean().optional().describe("Solo ingresos: true si se repite cada mes."),
    desde: mesSchema
      .optional()
      .describe("Compra: mes YYYY-MM de la primera cuota. Ingreso: su mes (o inicio si es recurrente). Obligación: mes de inicio."),
    hasta: z
      .string()
      .regex(HASTA_RE, 'Usa YYYY-MM o "sin fin"')
      .optional()
      .describe('Ingresos recurrentes y obligaciones: último mes YYYY-MM (p.ej. para terminar un salario), o "sin fin" para quitar el final.'),
  },
  eliminar_movimiento: {
    tipo: tipoSchema,
    id: idSchema,
    descripcion: buscarSchema,
  },
  revisar_pendientes: {},
} satisfies Record<string, z.ZodRawShape>;

export type ToolName = keyof typeof toolShapes;

export interface ToolMeta {
  title: string;
  description: string;
  annotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

const MONTOS =
  ' Montos en la moneda de la fuente salvo que se indique moneda; "450 mil" = 450000, "2 palos/millones" = 2000000.';

export const toolMeta: Record<ToolName, ToolMeta> = {
  resumen_mes: {
    title: "Resumen del mes",
    description:
      "Muestra cuánto dinero queda disponible en un mes: ingresos, comprometido (cuotas + obligaciones), gastos con débito/efectivo, disponible y lo pendiente por pagar por cada tarjeta. Úsala cuando pregunten '¿cuánto tengo?', '¿cómo voy este mes?', '¿cuánto he gastado?'.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  listar_fuentes: {
    title: "Listar tarjetas y fuentes",
    description: "Lista las tarjetas de crédito y demás fuentes de pago registradas, con su moneda y lo que suman este mes.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  registrar_compra: {
    title: "Registrar compra",
    description:
      "Registra una compra con tarjeta de crédito, opcionalmente diferida a cuotas. Ej: 'compré un mercado de 450 mil con la Visa a 3 cuotas'. " +
      "Para gastos con débito, efectivo o cuenta usa registrar_gasto." +
      MONTOS +
      " Si la fuente no existe, devuelve la lista de fuentes disponibles para que preguntes al usuario.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  registrar_gasto: {
    title: "Registrar gasto",
    description:
      "Registra un gasto pagado con débito, efectivo o cuenta (no con tarjeta de crédito): descuenta del disponible del mes de la fecha, sin cuotas. " +
      "Ej: 'gasté 20 mil en almuerzo', 'pagué 15 mil de taxi en efectivo'." +
      MONTOS.replace("de la fuente", "principal"),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  registrar_ingreso: {
    title: "Registrar ingreso",
    description:
      "Registra un ingreso: único (bono, venta) o recurrente mensual (salario)." + MONTOS.replace("de la fuente", "principal"),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  registrar_obligacion: {
    title: "Registrar obligación fija",
    description:
      "Registra un pago fijo mensual (arriendo, hipoteca, colegio, servicios) que se descuenta cada mes del disponible." +
      MONTOS.replace("de la fuente", "principal"),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  marcar_pagado: {
    title: "Marcar como pagado",
    description:
      "Marca como pagada la cuenta de una tarjeta/fuente u obligación en un mes (p.ej. 'ya pagué la Visa'). No cambia el disponible, solo lo pendiente por pagar.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  proyeccion: {
    title: "Proyección de disponible",
    description: "Proyecta el disponible mes a mes para los próximos meses, considerando cuotas y obligaciones ya registradas.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  deshacer_ultimo: {
    title: "Deshacer último registro",
    description:
      "Elimina el último registro creado (compra, ingreso, obligación o pago). Úsala solo si el usuario pide deshacer o corregir lo último que anotó.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  listar_movimientos: {
    title: "Listar movimientos",
    description:
      "Lista compras, gastos, ingresos y obligaciones registrados con su id, descripción y monto. Úsala para encontrar qué editar o eliminar, o cuando pregunten qué tienen anotado o en qué gastaron.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  editar_movimiento: {
    title: "Editar movimiento",
    description:
      "Cambia una compra, un gasto, un ingreso o una obligación ya registrados: descripción, monto, moneda, cuotas, fuente, recurrencia, meses o fecha (gastos). " +
      "Identifícalo con `id` (de listar_movimientos) o con `descripcion` (búsqueda aproximada). Si hay varias coincidencias no cambia nada y devuelve las candidatas para que preguntes cuál. " +
      "Envía solo los campos que cambian." +
      MONTOS,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  eliminar_movimiento: {
    title: "Eliminar movimiento",
    description:
      "Elimina definitivamente una compra (con todas sus cuotas), un gasto, un ingreso o una obligación. Identifícalo con `id` o `descripcion`; si hay varias coincidencias no elimina nada y devuelve las candidatas. Confirma con el usuario si no es evidente cuál es.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  revisar_pendientes: {
    title: "Compras por revisar",
    description:
      "Lista las compras que llegaron solas (correo del banco, SMS o Apple Pay) y aún no tienen las cuotas confirmadas, " +
      "y los movimientos que no se pudieron asociar a una tarjeta. Úsala cuando pregunten '¿qué compras tengo por revisar?'. " +
      "Para fijar las cuotas usa editar_movimiento con el id de la compra y `cuotas` (eso la marca como revisada; si era de una cuota, editar_movimiento con cuotas=1).",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
};

export const TOOL_NAMES = Object.keys(toolShapes) as ToolName[];

export function isToolName(name: string): name is ToolName {
  return name in toolShapes;
}

export function toolSchema<N extends ToolName>(name: N) {
  return z.object(toolShapes[name]);
}

export type ToolArgs<N extends ToolName> = z.infer<ReturnType<typeof toolSchema<N>>>;

/** JSON Schema (para la API de Anthropic) de la herramienta. */
export function toolJsonSchema(name: ToolName): Record<string, unknown> {
  // io: "input" → los campos con default quedan opcionales.
  const schema = z.toJSONSchema(toolSchema(name), { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

// ---------- Ejecutor ----------

export interface ToolResult {
  ok: boolean;
  mensaje: string;
  datos?: Record<string, unknown>;
}

async function sourceNames(): Promise<string> {
  const sources = await finance.listSources();
  return sources.length ? sources.map((s) => s.name).join(", ") : "(no hay fuentes registradas)";
}

function resumenTexto(s: MonthSummary): string {
  const c = s.baseCurrency;
  const lines = [
    `${formatMonth(s.month)}: disponible ${fm(s.available, c)}.`,
    `Ingresos ${fm(s.income, c)}, comprometido ${fm(s.committed, c)}, gastos ${fm(s.spent, c)}, pendiente por pagar ${fm(s.pendingToPay, c)}.`,
  ];
  const porTarjeta = s.sources
    .filter((sm) => sm.total > 0)
    .map((sm) => `${sm.source.name} ${fm(sm.total, sm.source.currency)}${sm.paid ? " (pagada)" : ""}`);
  if (porTarjeta.length) lines.push(`Por tarjeta: ${porTarjeta.join("; ")}.`);
  const obl = s.obligations.map(
    (o) => `${o.obligation.name} ${fm(o.amountBase, c)}${o.paid ? " (pagada)" : ""}`,
  );
  if (obl.length) lines.push(`Obligaciones: ${obl.join("; ")}.`);
  if (s.expenses.length) {
    const recientes = s.expenses.slice(0, 5).map((e) => `${e.expense.description} ${fm(e.amountBase, c)}`);
    lines.push(
      `Gastos (${s.expenses.length}): ${recientes.join("; ")}${s.expenses.length > recientes.length ? "; …" : ""}.`,
    );
  }
  return lines.join("\n");
}

function resumenDatos(s: MonthSummary): Record<string, unknown> {
  return {
    mes: s.month,
    moneda: s.baseCurrency,
    disponible: s.available,
    ingresos: s.income,
    comprometido: s.committed,
    gastos: s.spent,
    porPagar: s.pendingToPay,
    fuentes: s.sources.map((sm) => ({
      nombre: sm.source.name,
      moneda: sm.source.currency,
      total: sm.total,
      totalBase: sm.totalBase,
      pagado: sm.paid,
    })),
    obligaciones: s.obligations.map((o) => ({
      nombre: o.obligation.name,
      montoBase: o.amountBase,
      pagado: o.paid,
    })),
    listaGastos: s.expenses.slice(0, MAX_LISTA).map((e) => ({
      id: e.expense.id,
      descripcion: e.expense.description,
      montoBase: e.amountBase,
      ...(e.expense.occurredAt ? { fecha: e.expense.occurredAt } : {}),
    })),
  };
}

const TIPO_KIND = { compra: "purchase", gasto: "expense", ingreso: "income", obligacion: "obligation" } as const;
type Tipo = keyof typeof TIPO_KIND;
const TIPO_ES: Record<Tipo, string> = { compra: "la compra", gasto: "el gasto", ingreso: "el ingreso", obligacion: "la obligación" };
const KIND_TIPO: Record<finance.MovementKind, Tipo> = {
  purchase: "compra",
  expense: "gasto",
  income: "ingreso",
  obligation: "obligacion",
};
const KIND_LABEL: Record<finance.MovementKind, string> = {
  purchase: "Compra",
  expense: "Gasto",
  income: "Ingreso",
  obligation: "Obligación",
};
const TIPO_PLURAL: Record<Tipo, string> = { compra: "compras", gasto: "gastos", ingreso: "ingresos", obligacion: "obligaciones" };

function movimientoDetalle(m: finance.Movement): string {
  if (m.kind === "expense") {
    return `${m.date ? fechaCorta(m.date) : formatMonth(m.month)}${m.sourceName ? ` con ${m.sourceName}` : ""}`;
  }
  if (m.kind === "purchase") {
    const cuotas = m.installments && m.installments > 1 ? `${m.installments} cuotas` : "1 cuota";
    return `${cuotas}${m.sourceName ? ` con ${m.sourceName}` : ""}, desde ${formatMonth(m.month)}`;
  }
  if (m.kind === "income" && !m.recurring) return `único, en ${formatMonth(m.month)}`;
  return `mensual desde ${formatMonth(m.month)}${m.endMonth ? ` hasta ${formatMonth(m.endMonth)}` : ""}`;
}

function movimientoTexto(m: finance.Movement): string {
  return `"${m.description}" ${fm(m.amount, m.currency)} (${movimientoDetalle(m)}) [id ${m.id}]`;
}

function movimientoDatos(m: finance.Movement): Record<string, unknown> {
  return {
    tipo: KIND_TIPO[m.kind],
    id: m.id,
    descripcion: m.description,
    monto: m.amount,
    moneda: m.currency,
    desde: m.month,
    ...(m.date ? { fecha: m.date } : {}),
    ...(m.endMonth ? { hasta: m.endMonth } : {}),
    ...(m.installments ? { cuotas: m.installments } : {}),
    ...(m.recurring !== undefined ? { recurrente: m.recurring } : {}),
    ...(m.sourceName ? { fuente: m.sourceName } : {}),
  };
}

/** Resuelve el movimiento por id o descripción; si no hay exactamente uno, devuelve la respuesta a dar. */
async function resolver(
  tipo: Tipo,
  id: string | undefined,
  descripcion: string | undefined,
): Promise<{ movement: finance.Movement } | { result: ToolResult }> {
  if (!id && !descripcion) {
    return { result: { ok: false, mensaje: `Indica el id o la descripción de ${TIPO_ES[tipo]} (usa listar_movimientos).` } };
  }
  const r = await finance.resolveMovement(TIPO_KIND[tipo], { id, query: descripcion });
  if (r.status === "ok") return { movement: r.movement };
  const lista = r.candidates.slice(0, MAX_LISTA);
  const datos = { candidatos: lista.map(movimientoDatos) };
  const items = lista.map((m) => `- ${movimientoTexto(m)}`).join("\n");
  if (r.status === "ambiguous") {
    return {
      result: {
        ok: false,
        mensaje: `Hay ${r.candidates.length} coincidencias para "${descripcion}"; no cambié nada. ¿Cuál es?\n${items}`,
        datos,
      },
    };
  }
  const buscado = id ? `con id "${id}"` : `"${descripcion}"`;
  return {
    result: {
      ok: false,
      mensaje: lista.length
        ? `No encontré ${TIPO_ES[tipo]} ${buscado}; no cambié nada. Registrados:\n${items}`
        : `No encontré ${TIPO_ES[tipo]} ${buscado}: no hay ninguno registrado.`,
      datos,
    },
  };
}

const sinCambios = (patch: Record<string, unknown>) => Object.values(patch).every((v) => v === undefined);

/** Registra un gasto (débito/efectivo) y responde con el disponible de su mes. */
async function registrarGasto(a: {
  descripcion: string;
  amount: number;
  moneda?: string;
  fecha?: string;
  sourceId?: string;
}): Promise<ToolResult> {
  const expense = await finance.addExpense({
    description: a.descripcion,
    amount: a.amount,
    currency: a.moneda?.toUpperCase(),
    date: a.fecha,
    sourceId: a.sourceId,
  });
  const [summary, sources] = await Promise.all([finance.getSummary(expense.month), finance.listSources()]);
  const fuente = expense.sourceId ? sources.find((s) => s.id === expense.sourceId)?.name : undefined;
  return {
    ok: true,
    mensaje:
      `Listo: gasto "${expense.description}" de ${fm(expense.amount, expense.currency)}` +
      `${fuente ? ` con ${fuente}` : ""}${expense.occurredAt ? ` (${fechaCorta(expense.occurredAt)})` : ""}. ` +
      `Disponible de ${formatMonth(summary.month)}: ${fm(summary.available, summary.baseCurrency)}.`,
    datos: {
      gasto: expense,
      ...(fuente ? { fuente } : {}),
      disponible: summary.available,
      gastosMes: summary.spent,
      mes: summary.month,
      moneda: summary.baseCurrency,
    },
  };
}

type Handlers = { [N in ToolName]: (args: ToolArgs<N>) => Promise<ToolResult> };

const handlers: Handlers = {
  async resumen_mes({ mes }) {
    const s = await finance.getSummary(mes);
    return { ok: true, mensaje: resumenTexto(s), datos: resumenDatos(s) };
  },

  async listar_fuentes() {
    const [sources, s] = await Promise.all([finance.listSources(), finance.getSummary()]);
    if (!sources.length) return { ok: true, mensaje: "No hay tarjetas ni fuentes registradas.", datos: { fuentes: [] } };
    const totals = new Map(s.sources.map((sm) => [sm.source.id, sm]));
    const fuentes = sources.map((src: Source) => {
      const sm = totals.get(src.id);
      return {
        id: src.id,
        nombre: src.name,
        tipo: src.kind,
        moneda: src.currency,
        totalMes: sm?.total ?? 0,
        pagado: sm?.paid ?? false,
      };
    });
    const mensaje =
      "Fuentes: " +
      fuentes
        .map((f) => `${f.nombre} (${f.tipo}, ${f.moneda}) — este mes ${fm(f.totalMes, f.moneda)}${f.pagado ? ", pagada" : ""}`)
        .join("; ") +
      ".";
    return { ok: true, mensaje, datos: { mes: s.month, fuentes } };
  },

  async registrar_compra({ descripcion, monto, fuente, cuotas, moneda, mes_primera_cuota }) {
    const source = await finance.findSourceByName(fuente);
    if (!source) {
      return {
        ok: false,
        mensaje: `No encontré la fuente "${fuente}". Fuentes disponibles: ${await sourceNames()}.`,
      };
    }
    const amount = parseMonto(monto);
    if (!(amount > 0)) return { ok: false, mensaje: "El monto debe ser mayor que cero." };
    // Con una cuenta de débito no hay cuotas: se anota como gasto.
    if (source.kind === "debito") return registrarGasto({ descripcion, amount, moneda, sourceId: source.id });
    const purchase = await finance.addPurchase({
      sourceId: source.id,
      description: descripcion,
      amount,
      currency: moneda?.toUpperCase(),
      installments: cuotas,
      firstMonth: mes_primera_cuota,
    });
    const detail = await finance.getSourceDetail(source.id);
    const line = detail?.purchases.find((p) => p.id === purchase.id);
    const perInstallment = line?.perInstallment ?? purchase.amount / purchase.installments;
    const summary = await finance.getSummary(purchase.firstMonth);
    const c = purchase.currency;
    const cuotaTxt =
      purchase.installments > 1
        ? ` a ${purchase.installments} cuotas de ${fm(perInstallment, c)} desde ${formatMonth(purchase.firstMonth)}`
        : ` (una cuota, ${formatMonth(purchase.firstMonth)})`;
    return {
      ok: true,
      mensaje:
        `Listo: ${purchase.description} por ${fm(purchase.amount, c)} con ${source.name}${cuotaTxt}. ` +
        `Disponible de ${formatMonth(summary.month)}: ${fm(summary.available, summary.baseCurrency)}.`,
      datos: {
        compra: purchase,
        fuente: source.name,
        cuotaMensual: perInstallment,
        disponible: summary.available,
        mes: summary.month,
        moneda: summary.baseCurrency,
      },
    };
  },

  async registrar_gasto({ descripcion, monto, moneda, fecha, fuente }) {
    const amount = parseMonto(monto);
    if (!(amount > 0)) return { ok: false, mensaje: "El monto debe ser mayor que cero." };
    let sourceId: string | undefined;
    if (fuente) {
      const source = await finance.findSourceByName(fuente);
      if (!source) {
        return { ok: false, mensaje: `No encontré la cuenta "${fuente}". Fuentes disponibles: ${await sourceNames()}.` };
      }
      if (source.kind === "tarjeta") {
        return {
          ok: false,
          mensaje: `${source.name} es tarjeta de crédito: usa registrar_compra (con cuotas) para ese pago.`,
        };
      }
      sourceId = source.id;
    }
    return registrarGasto({ descripcion, amount, moneda, fecha, sourceId });
  },

  async registrar_ingreso({ descripcion, monto, recurrente, moneda, mes }) {
    const amount = parseMonto(monto);
    if (!(amount > 0)) return { ok: false, mensaje: "El monto debe ser mayor que cero." };
    const income = await finance.addIncome({
      description: descripcion,
      amount,
      currency: moneda?.toUpperCase(),
      recurring: recurrente,
      month: mes,
    });
    const summary = await finance.getSummary(income.month);
    return {
      ok: true,
      mensaje:
        `Listo: ingreso "${income.description}" de ${fm(income.amount, income.currency)}` +
        `${income.recurring ? " mensual desde " : " en "}${formatMonth(income.month)}. ` +
        `Disponible de ${formatMonth(summary.month)}: ${fm(summary.available, summary.baseCurrency)}.`,
      datos: { ingreso: income, disponible: summary.available, mes: summary.month, moneda: summary.baseCurrency },
    };
  },

  async registrar_obligacion({ nombre, monto_mensual, desde, hasta, moneda }) {
    const amount = parseMonto(monto_mensual);
    if (!(amount > 0)) return { ok: false, mensaje: "El monto debe ser mayor que cero." };
    if (desde && hasta && hasta < desde) return { ok: false, mensaje: "El mes final es anterior al inicial." };
    const ob = await finance.addObligation({
      name: nombre,
      amount,
      currency: moneda?.toUpperCase(),
      startMonth: desde,
      endMonth: hasta,
    });
    const summary = await finance.getSummary(ob.startMonth);
    return {
      ok: true,
      mensaje:
        `Listo: ${ob.name} de ${fm(ob.amount, ob.currency)} al mes desde ${formatMonth(ob.startMonth)}` +
        `${ob.endMonth ? ` hasta ${formatMonth(ob.endMonth)}` : ""}. ` +
        `Disponible de ${formatMonth(summary.month)}: ${fm(summary.available, summary.baseCurrency)}.`,
      datos: { obligacion: ob, disponible: summary.available, mes: summary.month, moneda: summary.baseCurrency },
    };
  },

  async marcar_pagado({ fuente, mes }) {
    const month = mes ?? currentMonth();
    let targetId: string | undefined;
    let targetName: string | undefined;
    const source = await finance.findSourceByName(fuente);
    if (source) {
      targetId = source.id;
      targetName = source.name;
    } else {
      // Buscar entre las obligaciones vigentes del mes.
      const s = await finance.getSummary(month);
      const q = norm(fuente);
      const ob =
        s.obligations.find((o) => norm(o.obligation.name) === q) ??
        s.obligations.find((o) => norm(o.obligation.name).includes(q) || q.includes(norm(o.obligation.name)));
      if (ob) {
        targetId = ob.obligation.id;
        targetName = ob.obligation.name;
      }
    }
    if (!targetId) {
      return {
        ok: false,
        mensaje: `No encontré "${fuente}" entre las fuentes ni las obligaciones de ${formatMonth(month)}. Fuentes: ${await sourceNames()}.`,
      };
    }
    const payment = await finance.markPaid(targetId, month);
    const summary = await finance.getSummary(payment.month);
    return {
      ok: true,
      mensaje: `Marqué ${targetName} como pagada en ${formatMonth(payment.month)}. Pendiente por pagar: ${fm(summary.pendingToPay, summary.baseCurrency)}.`,
      datos: { pago: payment, porPagar: summary.pendingToPay, moneda: summary.baseCurrency },
    };
  },

  async proyeccion({ meses }) {
    const range = await finance.getRange(currentMonth(), meses);
    const lines = range.map((s) => `${formatMonth(s.month)}: ${fm(s.available, s.baseCurrency)}`);
    return {
      ok: true,
      mensaje: `Disponible proyectado:\n${lines.join("\n")}`,
      datos: {
        meses: range.map((s) => ({
          mes: s.month,
          moneda: s.baseCurrency,
          ingresos: s.income,
          comprometido: s.committed,
          gastos: s.spent,
          disponible: s.available,
        })),
      },
    };
  },

  async listar_movimientos({ tipo, mes }) {
    const items = await finance.listMovements({ kind: tipo ? TIPO_KIND[tipo] : undefined, month: mes });
    const scope = `${tipo ? TIPO_PLURAL[tipo] : "movimientos"}${mes ? ` vigentes en ${formatMonth(mes)}` : ""}`;
    if (!items.length) return { ok: true, mensaje: `No hay ${scope}.`, datos: { total: 0, movimientos: [] } };
    const lista = items.slice(0, MAX_LISTA);
    const extra = items.length > lista.length ? `\n(y ${items.length - lista.length} más; filtra por tipo o mes)` : "";
    return {
      ok: true,
      mensaje: `${items.length} ${scope}:\n` + lista.map((m) => `- ${KIND_LABEL[m.kind]} ${movimientoTexto(m)}`).join("\n") + extra,
      datos: { total: items.length, movimientos: lista.map(movimientoDatos) },
    };
  },

  async editar_movimiento(args) {
    const { tipo, id, descripcion, nueva_descripcion, monto, moneda, cuotas, fuente, recurrente, desde, hasta, fecha } = args;
    const found = await resolver(tipo, id, descripcion);
    if ("result" in found) return found.result;
    const target = found.movement;

    const amount = monto !== undefined ? parseMonto(monto) : undefined;
    if (amount !== undefined && !(amount > 0)) return { ok: false, mensaje: "El monto debe ser mayor que cero." };
    // "sin fin" → null (quita el mes final).
    const endMonth = hasta === undefined ? undefined : MONTH_RE.test(hasta) ? hasta : null;
    const currency = moneda?.toUpperCase();

    const ignorados: string[] = [];
    if (tipo === "compra") {
      if (recurrente !== undefined) ignorados.push("recurrente");
      if (hasta !== undefined) ignorados.push("hasta");
    } else if (tipo === "gasto") {
      if (cuotas !== undefined) ignorados.push("cuotas");
      if (recurrente !== undefined) ignorados.push("recurrente");
      if (desde !== undefined) ignorados.push("desde (usa fecha)");
      if (hasta !== undefined) ignorados.push("hasta");
    } else {
      if (cuotas !== undefined) ignorados.push("cuotas");
      if (fuente !== undefined) ignorados.push("fuente");
      if (tipo === "obligacion" && recurrente !== undefined) ignorados.push("recurrente");
    }
    if (tipo !== "gasto" && fecha !== undefined) ignorados.push("fecha");

    if (tipo === "gasto") {
      let sourceId: string | undefined;
      if (fuente) {
        const source = await finance.findSourceByName(fuente);
        if (!source) {
          return { ok: false, mensaje: `No encontré la cuenta "${fuente}". Fuentes disponibles: ${await sourceNames()}.` };
        }
        sourceId = source.id;
      }
      const patch = { description: nueva_descripcion, amount, currency, date: fecha, sourceId };
      if (sinCambios(patch)) return { ok: false, mensaje: "No indicaste qué cambiar." };
      await finance.updateExpense(target.id, patch);
    } else if (tipo === "compra") {
      let sourceId: string | undefined;
      if (fuente) {
        const source = await finance.findSourceByName(fuente);
        if (!source) {
          return { ok: false, mensaje: `No encontré la fuente "${fuente}". Fuentes disponibles: ${await sourceNames()}.` };
        }
        sourceId = source.id;
      }
      const patch = { description: nueva_descripcion, amount, currency, installments: cuotas, firstMonth: desde, sourceId };
      if (sinCambios(patch)) return { ok: false, mensaje: "No indicaste qué cambiar." };
      await finance.updatePurchase(target.id, patch);
    } else if (tipo === "ingreso") {
      const patch = { description: nueva_descripcion, amount, currency, recurring: recurrente, month: desde, endMonth };
      if (sinCambios(patch)) return { ok: false, mensaje: "No indicaste qué cambiar." };
      await finance.updateIncome(target.id, patch);
    } else {
      const patch = { name: nueva_descripcion, amount, currency, startMonth: desde, endMonth };
      if (sinCambios(patch)) return { ok: false, mensaje: "No indicaste qué cambiar." };
      await finance.updateObligation(target.id, patch);
    }

    const again = await finance.resolveMovement(TIPO_KIND[tipo], { id: target.id });
    const after = again.status === "ok" ? again.movement : target;
    const summary = await finance.getSummary();
    return {
      ok: true,
      mensaje:
        `Listo: actualicé ${TIPO_ES[tipo]} ${movimientoTexto(after)}.` +
        (ignorados.length ? ` (Ignoré ${ignorados.join(", ")}: no aplica a este tipo.)` : "") +
        ` Disponible de ${formatMonth(summary.month)}: ${fm(summary.available, summary.baseCurrency)}.`,
      datos: {
        antes: movimientoDatos(target),
        despues: movimientoDatos(after),
        disponible: summary.available,
        mes: summary.month,
        moneda: summary.baseCurrency,
      },
    };
  },

  async eliminar_movimiento({ tipo, id, descripcion }) {
    const found = await resolver(tipo, id, descripcion);
    if ("result" in found) return found.result;
    const m = found.movement;
    await finance.deleteEntity(TIPO_KIND[tipo], m.id);
    const summary = await finance.getSummary();
    return {
      ok: true,
      mensaje:
        `Eliminé ${TIPO_ES[tipo]} "${m.description}" de ${fm(m.amount, m.currency)}. ` +
        `Disponible de ${formatMonth(summary.month)}: ${fm(summary.available, summary.baseCurrency)}.`,
      datos: { eliminado: movimientoDatos(m), disponible: summary.available, mes: summary.month, moneda: summary.baseCurrency },
    };
  },

  async revisar_pendientes() {
    const { purchases, inbox } = await finance.listPendingReview();
    if (!purchases.length && !inbox.length) {
      return { ok: true, mensaje: "No hay nada por revisar.", datos: { compras: [], bandeja: [] } };
    }
    const ORIGEN: Record<string, string> = { correo: "correo", sms: "SMS", applepay: "Apple Pay", voz: "voz", manual: "app" };
    const lines: string[] = [];
    if (purchases.length) {
      lines.push(`${purchases.length} ${purchases.length === 1 ? "compra nueva" : "compras nuevas"} por confirmar cuotas (están a 1 cuota):`);
      for (const p of purchases.slice(0, MAX_LISTA)) {
        lines.push(
          `- "${p.description}" ${fm(p.amount, p.currency)} con ${p.sourceName}, ${formatMonth(p.firstMonth)}` +
            `${p.origin ? ` (desde ${ORIGEN[p.origin] ?? p.origin})` : ""} [id ${p.id}]`,
        );
      }
    }
    if (inbox.length) {
      lines.push(`${inbox.length} ${inbox.length === 1 ? "movimiento" : "movimientos"} sin tarjeta (asígnalos en la app, en Inicio):`);
      for (const i of inbox.slice(0, MAX_LISTA)) {
        const p = i.parsed;
        lines.push(
          p?.amount
            ? `- ${fm(p.amount, p.currency ?? "COP")}${p.merchant ? ` en ${p.merchant}` : ""}${p.last4 ? ` (tarjeta *${p.last4})` : ""}`
            : `- No entendido: "${i.text.slice(0, 120)}"`,
        );
      }
    }
    return {
      ok: true,
      mensaje: lines.join("\n"),
      datos: {
        compras: purchases.map((p) => ({
          id: p.id,
          descripcion: p.description,
          monto: p.amount,
          moneda: p.currency,
          fuente: p.sourceName,
          cuotas: p.installments,
          desde: p.firstMonth,
          ...(p.origin ? { origen: p.origin } : {}),
          ...(p.occurredAt ? { fecha: p.occurredAt } : {}),
        })),
        bandeja: inbox.map((i) => ({
          id: i.id,
          canal: i.channel,
          recibido: i.receivedAt,
          ...(i.parsed?.amount !== undefined ? { monto: i.parsed.amount, moneda: i.parsed.currency } : {}),
          ...(i.parsed?.merchant ? { comercio: i.parsed.merchant } : {}),
          ...(i.parsed?.last4 ? { ultimos4: i.parsed.last4 } : {}),
          texto: i.text.slice(0, 300),
        })),
      },
    };
  },

  async deshacer_ultimo() {
    const undone = await finance.undoLast();
    if (!undone) return { ok: true, mensaje: "No hay nada que deshacer." };
    return {
      ok: true,
      mensaje: `Deshice el último registro (${ENTITY_ES[undone.entity] ?? undone.entity}): ${undone.description}.`,
      datos: { deshecho: undone },
    };
  },
};

/** Valida los argumentos y ejecuta la herramienta. Nunca lanza: los errores vuelven como `ok: false`. */
export async function executeTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  if (!isToolName(name)) return { ok: false, mensaje: `Herramienta desconocida: ${name}` };
  const parsed = toolSchema(name).safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      mensaje: "Argumentos inválidos: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  try {
    const handler = handlers[name] as (args: unknown) => Promise<ToolResult>;
    return await handler(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mensaje: `No pude completar "${name}": ${msg}` };
  }
}

/** Descripción en español de una acción sin ejecutarla (para confirmación / dryRun). */
export function describeAction(name: ToolName, args: Record<string, unknown>): string {
  const a = args as Record<string, string | number | boolean | undefined>;
  const monto = (v: unknown) => {
    try {
      return parseMonto(v as number | string).toLocaleString("es-CO");
    } catch {
      return String(v);
    }
  };
  switch (name) {
    case "registrar_compra":
      return `Registrar compra "${a.descripcion}" por ${monto(a.monto)}${a.moneda ? ` ${a.moneda}` : ""} con ${a.fuente}` +
        `${Number(a.cuotas ?? 1) > 1 ? ` a ${a.cuotas} cuotas` : ""}${a.mes_primera_cuota ? ` desde ${a.mes_primera_cuota}` : ""}.`;
    case "registrar_gasto":
      return `Registrar gasto "${a.descripcion}" de ${monto(a.monto)}${a.moneda ? ` ${a.moneda}` : ""}` +
        `${a.fuente ? ` con ${a.fuente}` : ""}${a.fecha ? ` el ${a.fecha}` : ""}.`;
    case "registrar_ingreso":
      return `Registrar ingreso "${a.descripcion}" de ${monto(a.monto)}${a.moneda ? ` ${a.moneda}` : ""}${a.recurrente ? " (mensual)" : ""}${a.mes ? ` en ${a.mes}` : ""}.`;
    case "registrar_obligacion":
      return `Registrar obligación "${a.nombre}" de ${monto(a.monto_mensual)} al mes${a.desde ? ` desde ${a.desde}` : ""}${a.hasta ? ` hasta ${a.hasta}` : ""}.`;
    case "marcar_pagado":
      return `Marcar ${a.fuente} como pagada${a.mes ? ` en ${a.mes}` : " este mes"}.`;
    case "resumen_mes":
      return `Consultar el resumen de ${a.mes ?? "este mes"}.`;
    case "proyeccion":
      return `Proyectar ${a.meses ?? 6} meses.`;
    case "listar_fuentes":
      return "Listar fuentes.";
    case "deshacer_ultimo":
      return "Deshacer el último registro.";
    case "listar_movimientos":
      return `Listar ${a.tipo ?? "movimientos"}${a.mes ? ` de ${a.mes}` : ""}.`;
    case "editar_movimiento": {
      const cambios = [
        a.nueva_descripcion !== undefined && `descripción "${a.nueva_descripcion}"`,
        a.monto !== undefined && `monto ${monto(a.monto)}`,
        a.moneda && `moneda ${a.moneda}`,
        a.cuotas !== undefined && `${a.cuotas} cuotas`,
        a.fuente && `fuente ${a.fuente}`,
        a.recurrente !== undefined && (a.recurrente ? "mensual" : "único"),
        a.desde && `desde ${a.desde}`,
        a.hasta && `hasta ${a.hasta}`,
        a.fecha && `fecha ${a.fecha}`,
      ].filter(Boolean);
      return `Editar ${a.tipo} "${a.descripcion ?? a.id}": ${cambios.join(", ") || "sin cambios"}.`;
    }
    case "eliminar_movimiento":
      return `Eliminar ${a.tipo} "${a.descripcion ?? a.id}".`;
    case "revisar_pendientes":
      return "Listar compras por revisar.";
  }
}
