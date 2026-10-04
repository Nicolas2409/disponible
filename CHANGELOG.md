# Changelog

Todos los cambios importantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [1.0.0] - 2026-10-03

Primera versión pública.

### Agregado

- **Disponible del mes:** ingresos − cuotas de tarjetas de crédito − obligaciones fijas − gastos con débito/efectivo.
- **Compras a cuotas** con tarjeta de crédito, interés mensual opcional (cuota fija) y día de corte.
- **Obligaciones fijas** con mes de inicio y fin opcional; **ingresos** únicos o recurrentes.
- **Gastos** con débito, efectivo o cuenta, por mes.
- **Por pagar:** marcar tarjetas y obligaciones como pagadas cada mes.
- **Futuro:** proyección de los próximos meses con gráfica.
- **Varias monedas** con tasas de cambio diarias y valores de respaldo sin conexión.
- **PWA estilo iPhone:** instalable desde Safari, pantalla completa, animaciones, modo claro y oscuro, tarjetas tipo Wallet.
- **Login con contraseña** (`APP_PASSWORD`) y cookie de sesión firmada.
- **Servidor MCP** en `/api/mcp/<MCP_SECRET>` para usar la app desde Claude (conector personalizado), en chat y modo voz: registrar compras, gastos, ingresos y obligaciones, marcar pagos, consultar el mes y la proyección, editar, eliminar y deshacer.
- **Registro automático** en `/api/ingesta`: correos de Bancolombia (Google Apps Script en `integraciones/gmail-bancolombia.gs`), SMS (p.ej. Nu) y Apple Pay (Atajos de iOS). Compras con crédito a 1 cuota “por revisar”, compras con débito como gastos, detección de duplicados y bandeja de movimientos por revisar.
- **Dictado opcional** en `/api/voz` con la API de Anthropic (Atajo de Siri).
- **Persistencia** en Supabase (una fila `jsonb` con RLS y control de versión optimista) o en `data/db.json` para desarrollo local con datos de ejemplo ficticios.
- Documentación: guía de instalación paso a paso, conexión con Claude y registro automático.

[1.0.0]: https://github.com/<tu-usuario>/disponible/releases/tag/v1.0.0
