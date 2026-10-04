// Sección de lista agrupada estilo iOS (insetGrouped). Sirve en server y client components.
export function Section({
  title,
  aside,
  footer,
  children,
  className,
  bare,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sin contenedor blanco (para contenido propio como tarjetas). */
  bare?: boolean;
}) {
  return (
    <section className={`mt-8 ${className ?? ""}`}>
      {(title || aside) && (
        <div className="mb-2.5 flex items-baseline justify-between">
          {title && <h2 className="display text-[22px] leading-7 font-bold">{title}</h2>}
          {aside && <div className="tnum text-[15px] text-label-2">{aside}</div>}
        </div>
      )}
      {bare ? (
        children
      ) : (
        <div className="group-list overflow-hidden rounded-[var(--radius-group)] bg-grouped-2">{children}</div>
      )}
      {footer && <p className="mt-2 px-4 text-[13px] leading-[18px] text-label-2">{footer}</p>}
    </section>
  );
}

export function Row({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex min-h-[52px] items-center gap-3 px-4 py-2.5 ${className ?? ""}`}>{children}</div>;
}
