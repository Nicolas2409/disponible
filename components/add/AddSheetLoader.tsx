import { getSettings, listSources } from "@/lib/finance";
import { AddButton } from "./AddButton";

/** Carga en el servidor lo que el sheet necesita (fuentes y monedas). */
export async function AddSheetLoader() {
  const [sources, settings] = await Promise.all([listSources(), getSettings()]);
  return <AddButton sources={sources} settings={settings} />;
}
