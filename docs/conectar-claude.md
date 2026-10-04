# Conectar Disponible con Claude (voz desde el iPhone)

Hay dos caminos:

1. **Conector MCP en Claude** (recomendado): hablas con la app de Claude y ella anota en Disponible.
2. **Atajo de Siri "Anotar gasto"** (Plan B): dictas una frase y el atajo la envía a `/api/voz`.

> ¿Quieres que las compras con tarjeta de crédito se anoten solas (correos de Bancolombia, SMS de Nu, Apple Pay)? Ver **[Registro automático de compras](registro-automatico.md)**. Usa el mismo `MCP_SECRET`.

## 1. Desplegar

1. Genera un secreto largo:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Despliega la app (ver la [guía de instalación del README](../README.md#guía-de-instalación-paso-a-paso)) con estas variables de entorno (ver `.env.example`):
   - `MCP_SECRET` = el secreto generado.
   - `ANTHROPIC_API_KEY` = solo si usarás el Plan B (`/api/voz`).
3. Prueba que responde (debe devolver `401` sin secreto y JSON con el secreto):
   ```bash
   curl -X POST https://tu-app.vercel.app/api/mcp/<MCP_SECRET> \
     -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

> **Nota:** En producción los datos se guardan en Supabase (variables `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`). Sin ellas la app usa el archivo local `data/db.json`, que **no** sirve en Vercel (el disco no es persistente).

> **Seguridad:** El secreto viaja en la URL porque los conectores personalizados sin OAuth no permiten cabeceras. Trátalo como una contraseña: no compartas la URL, y si se filtra cambia `MCP_SECRET` y vuelve a crear el conector. La mejora de producción es OAuth.

## 2. Agregar el conector en claude.ai

Requiere un plan de pago de Claude (Pro, Max, Team o Enterprise).

1. En **claude.ai** (web) → **Configuración** → **Conectores** → **Agregar conector personalizado**.
2. Nombre: `Disponible`. URL:
   ```
   https://tu-app.vercel.app/api/mcp/<MCP_SECRET>
   ```
   (Cambia `tu-app.vercel.app` por tu dirección y `<MCP_SECRET>` por el valor de tu variable, sin los signos `< >`.)
3. Guarda. No pide login (la autenticación es el secreto en la URL).
4. El conector queda sincronizado con tu cuenta, así que aparece también en la app del iPhone.

Herramientas disponibles: `resumen_mes`, `listar_fuentes`, `registrar_compra`, `registrar_gasto`, `registrar_ingreso`, `registrar_obligacion`, `marcar_pagado`, `proyeccion`, `deshacer_ultimo`, `listar_movimientos`, `editar_movimiento`, `eliminar_movimiento`, `revisar_pendientes` (compras que llegaron solas y falta confirmar las cuotas: *"¿Qué compras tengo por revisar?"*).

> Si actualizas la app y aparecen herramientas nuevas, en claude.ai **desconecta y vuelve a conectar** el conector (o elimínalo y agrégalo de nuevo) para que Claude las vea.

## 3. Probar desde el iPhone

- **Chat**: abre la app de Claude, en una conversación nueva toca el botón de herramientas y verifica que **Disponible** esté activado. Escribe: *"¿Cuánto tengo disponible este mes?"*.
- **Modo voz**: toca el ícono de voz y di, por ejemplo:
  - *"Compré un mercado de 450 mil con la Visa a 3 cuotas."*
  - *"Me entró el salario de 8 palos, es mensual."*
  - *"Gasté 25 mil en almuerzo."*
  - *"Ya pagué la Mastercard."*
  - *"¿Cómo voy los próximos 6 meses?"*
  - *"Deshaz lo último."*
- La primera vez Claude pedirá permiso para usar cada herramienta; puedes elegir **Permitir siempre**.

## 4. Atajo de iOS "Anotar gasto" (Plan B)

En la app **Atajos** → **+** → nombre *Anotar gasto*:

1. **Dictar texto** (idioma: Español).
2. **Obtener contenido de URL**:
   - URL: `https://tu-app.vercel.app/api/voz`
   - Método: **POST**
   - Encabezados: `Authorization` = `Bearer <MCP_SECRET>`
   - Cuerpo de la solicitud: **JSON**, campo `texto` (Texto) = *Texto dictado*.
3. **Obtener valor del diccionario**: clave `mensaje` de *Contenido de la URL*.
4. **Mostrar resultado** (o **Leer texto** para escuchar la confirmación).

Úsalo con *"Oye Siri, anotar gasto"*. La respuesta es `{ ok, mensaje }`.

Opcional: `POST /api/voz?dryRun=1` devuelve la acción interpretada sin ejecutarla (`{ ok, mensaje, accion }`); para confirmarla, envía `{ "accion": <accion> }` a `/api/voz`.
