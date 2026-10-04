// Persistencia (solo servidor) detrás de readDb / mutateDb.
// - Con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: una fila jsonb en Supabase
//   (tabla app_state), con control de versión optimista.
// - Sin ellas (desarrollo local): archivo data/db.json.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSeed } from "./seed";
import type { Db } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ROW_ID = 1;
const MAX_RETRIES = 5;

/** Cola en proceso: serializa todas las lecturas/escrituras. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function normalize(db: Partial<Db>): Db {
  const seed = createSeed();
  return {
    settings: db.settings ?? seed.settings,
    sources: db.sources ?? [],
    purchases: db.purchases ?? [],
    incomes: db.incomes ?? [],
    obligations: db.obligations ?? [],
    payments: db.payments ?? [],
    inbox: db.inbox ?? [],
    expenses: db.expenses ?? [],
    log: db.log ?? [],
  };
}

// ---------- Supabase ----------

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

async function loadRemote(sb: SupabaseClient): Promise<{ db: Db; version: number }> {
  const { data, error } = await sb.from("app_state").select("data, version").eq("id", ROW_ID).maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (data) return { db: normalize(data.data as Partial<Db>), version: data.version as number };

  // En producción se empieza vacío (sin datos de ejemplo), solo con los ajustes.
  const empty = normalize({ settings: createSeed().settings });
  const { error: insertError } = await sb.from("app_state").insert({ id: ROW_ID, data: empty, version: 1 });
  // Si otra petición la creó al mismo tiempo, se vuelve a leer.
  if (insertError) return loadRemote(sb);
  return { db: empty, version: 1 };
}

async function mutateRemote<T>(sb: SupabaseClient, fn: (db: Db) => T): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { db, version } = await loadRemote(sb);
    const result = fn(db);
    const { data, error } = await sb
      .from("app_state")
      .update({ data: db, version: version + 1, updated_at: new Date().toISOString() })
      .eq("id", ROW_ID)
      .eq("version", version)
      .select("id");
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (data && data.length > 0) return result;
    // Conflicto: otra escritura ganó (p.ej. Claude y la app a la vez). Reintentar.
  }
  throw new Error("No se pudo guardar: demasiados cambios simultáneos. Intenta de nuevo.");
}

// ---------- Archivo local ----------

async function loadFile(): Promise<Db> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const seed = createSeed();
    await saveFile(seed);
    return seed;
  }
}

async function saveFile(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const json = JSON.stringify(db, null, 2);
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, json, "utf8");
    await fs.rename(tmp, DB_FILE);
  } catch {
    // En Windows/OneDrive rename puede fallar (EPERM); escribir directo.
    await fs.writeFile(DB_FILE, json, "utf8");
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

// ---------- API ----------

/** Lectura en curso: llamadas simultáneas (resumen, fuentes, ajustes) comparten una consulta. */
let inflight: Promise<Db> | null = null;

export function readDb(): Promise<Db> {
  if (inflight) return inflight.then((db) => structuredClone(db));
  const sb = supabase();
  const read = enqueue(async () => (sb ? (await loadRemote(sb)).db : loadFile()));
  inflight = read;
  const clear = () => {
    if (inflight === read) inflight = null;
  };
  read.then(clear, clear);
  return read;
}

/** Lee, aplica `fn` (que puede mutar `db`) y guarda. Serializado. */
export function mutateDb<T>(fn: (db: Db) => T): Promise<T> {
  const sb = supabase();
  return enqueue(async () => {
    if (sb) return mutateRemote(sb, fn);
    const db = await loadFile();
    const result = fn(db);
    await saveFile(db);
    return result;
  });
}
