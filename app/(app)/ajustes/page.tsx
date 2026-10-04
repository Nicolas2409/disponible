import type { Metadata } from "next";
import { connection } from "next/server";
import { AutoIngestInfo } from "@/components/settings/AutoIngestInfo";
import { ConnectorInfo } from "@/components/settings/ConnectorInfo";
import { CurrencyPicker } from "@/components/settings/CurrencyPicker";
import { SourcesManager } from "@/components/settings/SourcesManager";
import { Section } from "@/components/ui/Section";
import { getSettings, listSources } from "@/lib/finance";

export const metadata: Metadata = { title: "Ajustes · Disponible" };

export default async function SettingsPage() {
  await connection();
  const [settings, sources] = await Promise.all([getSettings(), listSources()]);

  return (
    <main className="pb-tabbar mx-auto w-full max-w-[520px] px-4">
      <header className="pt-safe">
        <h1 className="display mt-3 text-[34px] leading-[41px] font-bold">Ajustes</h1>
      </header>

      <Section title="Moneda principal" footer="Los totales se convierten a esta moneda.">
        <CurrencyPicker settings={settings} />
      </Section>

      <div id="fuentes" className="scroll-mt-4">
        <Section
          title="Tarjetas y fuentes"
          footer={sources.length > 0 ? "Toca una fuente para editarla. Desliza a la izquierda para eliminarla junto con sus compras." : undefined}
          className="[--inset:78px]"
        >
          <SourcesManager sources={sources} settings={settings} />
        </Section>
      </div>

      <Section title="Registro automático">
        <AutoIngestInfo missingLast4={sources.filter((s) => (s.kind === "tarjeta" || s.kind === "debito") && !s.last4).map((s) => s.name)} />
      </Section>

      <Section title="Conectar con Claude">
        <ConnectorInfo />
      </Section>
    </main>
  );
}
