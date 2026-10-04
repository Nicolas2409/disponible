// Esqueletos de carga: se muestran al instante al cambiar de pestaña mientras llegan los datos.

function Block({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <main className="pb-tabbar mx-auto w-full max-w-[520px] px-4" aria-busy="true">
      <header className="pt-safe">
        {title ? (
          <h1 className="display mt-3 text-[34px] leading-[41px] font-bold">{title}</h1>
        ) : (
          <>
            <Block className="mt-3 h-4 w-12" />
            <Block className="mt-2 h-9 w-40" />
          </>
        )}
      </header>
      {children}
    </main>
  );
}

function Group({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-6">
      <Block className="mb-2 h-5 w-32" />
      <div className="rounded-[var(--radius-group)] bg-grouped-2 px-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[60px] items-center gap-3">
            <Block className="size-8 rounded-full" />
            <Block className="h-4 flex-1" />
            <Block className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <Shell>
      <Block className="mt-8 h-4 w-24" />
      <Block className="mt-3 h-14 w-64" />
      <Block className="mt-6 h-2.5 w-full rounded-full" />
      <Block className="mt-10 h-5 w-40" />
      <div className="mt-3 space-y-[-40px]">
        <Block className="h-[110px] w-full rounded-[22px]" />
        <Block className="h-[110px] w-full rounded-[22px]" />
        <Block className="h-[180px] w-full rounded-[22px]" />
      </div>
    </Shell>
  );
}

export function FutureSkeleton() {
  return (
    <Shell title="Futuro">
      <Block className="mt-1 h-4 w-64" />
      <Block className="mt-6 h-[260px] w-full rounded-[var(--radius-group)]" />
      <Group rows={4} />
    </Shell>
  );
}

export function SettingsSkeleton() {
  return (
    <Shell title="Ajustes">
      <Group rows={1} />
      <Group rows={3} />
      <Group rows={1} />
    </Shell>
  );
}

export function SourceSkeleton() {
  return (
    <Shell>
      <Block className="mt-4 h-[190px] w-full rounded-[22px]" />
      <Block className="mt-4 h-[50px] w-full rounded-2xl" />
      <Group rows={3} />
    </Shell>
  );
}
