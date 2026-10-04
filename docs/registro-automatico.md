# Registro automático de compras (crédito) y gastos (débito)

Con esto, cada vez que pagas con tarjeta de crédito la compra aparece sola en Disponible, **a 1 cuota**, marcada con **“Revisar cuotas”**. En Inicio verás un aviso como *“3 compras nuevas · revisar cuotas”*: tocas cada una y ajustas las cuotas (o tocas **“1 cuota”** si era de contado).

Y cada vez que pagas con **tarjeta débito**, el pago aparece solo en **Inicio → Gastos del mes** y se descuenta del disponible de ese mes (ver [Gastos con débito](#gastos-con-débito)).

Llegan por tres caminos, todos al mismo lugar de la app (`/api/ingesta`):

| Camino | Para | Cómo |
| --- | --- | --- |
| **Correo de Bancolombia** | Tus tarjetas Bancolombia (crédito y débito) | Un script de Google revisa tu Gmail cada 5 minutos |
| **SMS de Nu** | Tu tarjeta Nu (si la tienes) | Una automatización de Atajos en el iPhone |
| **Apple Pay** | Cualquier tarjeta en Wallet | Una automatización de Atajos en el iPhone |

Qué se anota y qué no:

- ✅ **Compras con tarjeta de crédito** → se anotan a 1 cuota, “por revisar”.
- 💸 **Compras con débito** (“con tu T.Deb *8765”) → se anotan como **gastos** del mes de la compra. No hay que revisarlas.
- ⏭️ **Transferencias, pagos recibidos y pagos a la tarjeta** (“Pagaste … a NU”) → se ignoran. No se guarda nada. (Los pagos a la tarjeta no se cuentan como gasto porque sus cuotas ya están contadas; tampoco la marcan como pagada: márcalo tú cuando quieras.)
- 📥 **Compras de una tarjeta que la app no reconoce, o mensajes que no entiende** → quedan en *“movimientos por revisar”* en Inicio. Desde ahí eliges la tarjeta y las cuotas, o lo descartas.
- 🔁 **La misma compra por dos caminos** (por ejemplo Apple Pay + SMS de Nu) → se anota una sola vez: si llega otra compra en la **misma tarjeta**, por el **mismo monto** y con menos de **20 minutos** de diferencia, se toma como la misma. Y un mismo correo enviado dos veces nunca se repite.
- 📅 **Mes de la primera cuota**: el mes de la compra. Si la tarjeta tiene **día de corte** y la compra fue **después** de ese día, pasa al mes siguiente.

> **¿Usas otro banco?** Hoy el intérprete de correos entiende las alertas de **Bancolombia**, y el de SMS de Nu es genérico (entiende mensajes del tipo *“Compraste $X en COMERCIO”*). Apple Pay funciona con cualquier banco. Para agregar otro banco, mira [Para quien mantiene la app](#para-quien-mantiene-la-app-detalles-técnicos).

> Lo que necesitas a mano: la dirección de tu app (p.ej. `https://tu-app.vercel.app`) y el valor de **MCP_SECRET** (está en Vercel → tu proyecto → Settings → Environment Variables). Ese valor es como una contraseña: no lo compartas.

---

## Paso 1 · Pon los últimos 4 dígitos de cada tarjeta

1. Abre Disponible → **Ajustes** → **Tarjetas y fuentes**.
2. Toca cada tarjeta → campo **Últimos 4 dígitos** → escribe los 4 números (los ves en la tarjeta o en el correo del banco, p.ej. `T.Cred *5678` → `5678`) → **Guardar**.
3. Aprovecha y revisa el **Día de corte** de cada una.
4. Para Nu: si la tarjeta se llama “Nu” (o “Nu Colombia”, “Tarjeta Nu”…), los SMS sin dígitos igual se asignan a ella.

En **Ajustes → Registro automático** verás la dirección a la que se envía todo y un aviso si a alguna tarjeta le faltan los dígitos.

> Si llega una compra de una tarjeta sin dígitos, queda en “por revisar”. Al asignarla, la app le guarda esos dígitos a la tarjeta y la próxima vez se asigna sola.

---

## Gastos con débito

- Las alertas de Bancolombia del tipo *“Compraste $6.200,00 en OXXO CALLE 80 con tu T.Deb \*8765, el 02/10/2026 a las 12:55.”* se anotan como **gasto** de ese mes (el día según la hora de Colombia, sin día de corte). La notificación dice *“Gasto registrado: $6.200 en Oxxo Calle 80 · Débito”*.
- Recomendado: en **Ajustes → Tarjetas y fuentes → Agregar**, crea tu tarjeta débito con tipo **“Débito o cuenta”** y sus **últimos 4 dígitos** (p.ej. `8765`). Así cada gasto muestra con qué cuenta se pagó. Esa cuenta **no** aparece en “Por pagar” y no recibe compras a cuotas.
- Si no la creas, el gasto igual se anota (aparece como *“Débito \*8765”*). Cuando la crees con esos dígitos, los gastos anteriores se le asocian solos.
- En Apple Pay: si la tarjeta de Wallet corresponde a una fuente “Débito o cuenta” (o su nombre dice “Débito”), se anota como gasto; si es de crédito, como compra.
- La misma compra por dos caminos se anota una vez (misma cuenta o mismos dígitos, mismo monto, menos de 20 minutos).
- También puedes anotar gastos a mano (botón **+** → **Gasto**) o con Claude (*“gasté 20 mil en almuerzo”*).

### Recuperar correos de días anteriores

El script de Gmail recuerda qué correos ya envió y no los vuelve a enviar. Si quieres recuperar alertas viejas (por ejemplo, las de los días antes de instalarlo, o después de actualizar el script a una versión que entiende más tipos de mensaje):

1. Si vas a **actualizar el script**: en **script.google.com** → proyecto **Disponible**, borra todo el código y **vuelve a pegar todo** el archivo [`integraciones/gmail-bancolombia.gs`](../integraciones/gmail-bancolombia.gs). Toca **guardar** (💾). Las propiedades (`DISPONIBLE_URL`, `DISPONIBLE_SECRET`) y el activador se conservan.
2. Arriba, en la lista de funciones, elige **`reprocesar`** y toca **▶ Ejecutar**. Reenvía los correos de los últimos 3 días. Lo que ya estaba anotado responde *“Ya estaba registrado”* (no se duplica nada) y las compras con débito quedan como gastos.
3. Opcional, para recuperar **todo el mes**: cerca del inicio del código cambia `var DIAS = 3;` por `var DIAS = 30;`, guarda, ejecuta **`reprocesar`**, y **luego vuelve a dejar `var DIAS = 3;`** y guarda (si lo dejas en 30, cada revisión tarda más).

---

## Paso 2 · Gmail → Disponible (correos de Bancolombia)

Se hace una sola vez, desde un computador (es más cómodo).

1. Entra a **https://script.google.com** con la misma cuenta de Gmail donde te llegan las alertas de Bancolombia.
2. Toca **Nuevo proyecto**. Arriba a la izquierda, cambia el nombre “Proyecto sin título” por **Disponible**.
3. Borra todo el código que aparece y **pega todo** el contenido del archivo [`integraciones/gmail-bancolombia.gs`](../integraciones/gmail-bancolombia.gs). Toca el ícono de **guardar** (💾).
4. En la barra de la izquierda toca el engranaje ⚙️ **Configuración del proyecto**. Baja hasta **Propiedades de la secuencia de comandos** → **Agregar propiedad de secuencia de comandos** y crea estas dos:
   | Propiedad | Valor |
   | --- | --- |
   | `DISPONIBLE_URL` | `https://tu-app.vercel.app` (tu dirección, **sin** `/` al final) |
   | `DISPONIBLE_SECRET` | el valor de **MCP_SECRET** |

   Toca **Guardar propiedades de la secuencia de comandos**.
5. Vuelve al editor (ícono `< >` a la izquierda). En la lista de funciones de arriba (al lado de **▶ Ejecutar** y **Depurar**) elige **`instalar`** y toca **▶ Ejecutar**.
   > ⚠️ **Ojo con la lista de funciones:** **▶ Ejecutar** corre la función que esté elegida en esa lista, no la que tengas a la vista en el código. Antes de ejecutar, revisa que diga `instalar` (o `probar`, `reprocesar`…). Si dice `procesar` o `config_`, cámbiala.
6. Google pedirá permisos:
   1. **Revisar permisos** → elige tu cuenta.
   2. Aparece **“Google no verificó esta app”**. Es normal: la app es *tu propio script*, nadie más la usa. Toca **Configuración avanzada** (o “Avanzado”) → **Ir a Disponible (no seguro)**.
   3. Revisa la lista (leer tu Gmail, conectarse a un servicio externo, ejecutarse sola) y toca **Permitir**.
7. Abajo, en el **Registro de ejecución**, debe decir *“Instalado: Disponible revisará tu Gmail cada 5 minutos.”* y *“Conexión correcta: …”*.
   - Si dice *“clave incorrecta”*: revisa `DISPONIBLE_SECRET`.
   - Si dice *“Revisa DISPONIBLE_URL”*: revisa la dirección.

Listo. Desde ahora, unos 5 minutos después de cada alerta la compra aparece en la app.

**Útil saber:**

- Ejecuta **`probar`** para ver en el registro lo que se enviaría de los últimos 3 correos, sin enviar nada.
- Ejecuta **`procesar`** para revisar ya mismo, sin esperar los 5 minutos.
- Ejecuta **`reprocesar`** para volver a enviar los correos de los últimos días (no duplica nada; ver *Recuperar correos de días anteriores*).
- En **Ejecuciones** (barra izquierda, ícono ☰ con reloj) ves cada revisión y lo que respondió la app (“Registrado: …”, “Gasto registrado: …”, “Ignorado (transferencia): …”).
- Para apagarlo: ejecuta **`desinstalar`**.
- Las conversaciones ya enviadas reciben la etiqueta **disponible/procesado** en Gmail (solo informativa).

---

## Paso 3 · SMS de Nu → Disponible (Atajos del iPhone)

1. Abre la app **Atajos** → pestaña **Automatización** (abajo) → **+** (o **Nueva automatización**).
2. Elige **Mensaje**.
3. Configura cuándo se ejecuta:
   - **Remitente** → elige el contacto de Nu. (Cuando te llegue el primer SMS de Nu, guarda ese número como contacto “Nu”.) Si no quieres crear el contacto, deja el remitente vacío y en **El mensaje contiene** escribe `Nu`.
   - Marca **Ejecutar inmediatamente** (y si quieres, apaga **Notificar al ejecutar**).
   - Toca **Siguiente** → **Nueva automatización en blanco**.
4. Agrega la acción **Obtener contenido de URL** (búscala con la lupa):
   - **URL**: `https://tu-app.vercel.app/api/ingesta`
   - Toca la flecha **>** (o **Mostrar más**) para ver las opciones:
     - **Método**: `POST`
     - **Encabezados** → **Agregar nuevo encabezado**: clave `Authorization`, valor `Bearer ` + tu MCP_SECRET (la palabra Bearer, **un espacio**, y el secreto).
     - **Cuerpo de la solicitud**: `JSON` → agrega dos campos de tipo **Texto**:
       | Clave | Valor |
       | --- | --- |
       | `canal` | `sms` |
       | `texto` | la variable **Mensaje** (toca el campo → *Seleccionar variable* → **Entrada del atajo** / **Mensaje**; si te deja elegir, usa su **Contenido**) |
5. Agrega **Obtener valor del diccionario**: obtener **Valor** para la clave `mensaje` en **Contenido de la URL**.
6. Agrega **Mostrar notificación** con el **Valor del diccionario**. Verás algo como *“Registrado: $45.900 en Rappi · Nu (1 cuota)”*.
7. Toca **OK** / **Listo**.

> También sirve para SMS de Bancolombia si te llegan: se interpretan igual que los correos.

---

## Paso 4 · Apple Pay → Disponible (Atajos del iPhone)

Requiere iOS 17 o superior.

1. **Atajos** → **Automatización** → **+** → elige **Transacción** (Wallet).
2. En **Tarjeta** elige las tarjetas que quieras (puedes elegir varias; las de débito se anotan como gastos). Deja categorías y comercios en *Cualquiera*.
3. Marca **Ejecutar inmediatamente** → **Siguiente** → **Nueva automatización en blanco**.
4. Agrega **Obtener contenido de URL**:
   - **URL**: `https://tu-app.vercel.app/api/ingesta`
   - **Método**: `POST`
   - **Encabezados**: `Authorization` = `Bearer ` + tu MCP_SECRET
   - **Cuerpo de la solicitud**: `JSON`, con estos campos de tipo **Texto**:
     | Clave | Valor (variable de **Entrada del atajo** / **Transacción**) |
     | --- | --- |
     | `canal` | `applepay` (escrito tal cual) |
     | `comercio` | **Comercio** (en algunos iPhone: *Comerciante*) |
     | `monto` | **Importe** (en algunos iPhone: *Cantidad*) |
     | `tarjeta` | **Tarjeta o pase** (el nombre de la tarjeta en Wallet) |

     Para elegir cada propiedad: toca el campo → **Seleccionar variable** → toca **Entrada del atajo** y, en el menú que aparece, la propiedad.
5. Agrega **Obtener valor del diccionario** (clave `mensaje`) y **Mostrar notificación**, igual que en el paso 3.

Notas:

- El monto puede llegar como `$45.900`, `45.900,00` o `45900`: la app entiende todos. Si dice `US$` o `USD`, la compra se anota en dólares.
- La tarjeta se reconoce por su nombre en Wallet (p.ej. “Nu” → tu tarjeta “Nu”; “Mastercard” → “Mastercard Bancolombia”) o por los 4 dígitos si el nombre los trae. Si no la reconoce, queda “por revisar”. Si dos tarjetas tienen nombres parecidos, cambia el nombre en Wallet o en la app para que se distingan.
- Si una compra llega por Apple Pay **y** por SMS o correo, se anota una sola vez (misma tarjeta, mismo monto, menos de 20 minutos).
- La hora de la compra es la hora en que corre el Atajo. Opcional: agrega un campo `fecha` con **Fecha actual** (formato ISO 8601).

---

## Revisar en la app

- **Inicio** → aviso naranja *“N compras nuevas · revisar cuotas”* (o *“N movimientos por revisar”*). Tócalo:
  - **Compras nuevas**: toca una para abrirla y cambiar las cuotas (al **Guardar** queda revisada), o toca **1 cuota** si está bien.
  - **Sin tarjeta**: elige la tarjeta y las cuotas → **Asignar**, o **Descartar**.
- En el detalle de cada tarjeta, las compras automáticas muestran su origen (*Desde correo*, *SMS*, *Apple Pay*) y, mientras no las revises, la etiqueta naranja **Revisar cuotas**.
- Con Claude: *“¿Qué compras tengo por revisar?”* y luego *“La de Falabella era a 6 cuotas”*.

---

## Para quien mantiene la app (detalles técnicos)

`POST /api/ingesta` con `Authorization: Bearer <MCP_SECRET>` y cuerpo JSON:

```json
{ "canal": "correo" | "sms" | "applepay", "texto": "…", "id": "…", "comercio": "…", "monto": "$45.900", "tarjeta": "…", "fecha": "…" }
```

Respuesta: `{ ok, mensaje, resultados: [{ estado: "registrado" | "duplicado" | "por revisar" | "ignorado", mensaje, compraId? | gastoId? | bandejaId? | ignorado? }], ignorado? }`.

Prueba rápida:

```bash
curl -X POST https://tu-app.vercel.app/api/ingesta \
  -H "Authorization: Bearer <MCP_SECRET>" -H "Content-Type: application/json" \
  -d '{"canal":"sms","texto":"Nu: Compra aprobada por $45.900 en RAPPI con tu tarjeta terminada en 1234."}'
```

- Débito → `Expense` (`db.expenses`, mes = mes de la compra en hora de Bogotá); crédito → `Purchase`. La decisión está en `planIngest` (`lib/ingest/index.ts`): alerta `T.Deb` o fuente de tipo `debito` → gasto.
- Intérpretes: `lib/ingest/bancolombia.ts` (formatos reales) y `lib/ingest/nu.ts` (genérico: el formato exacto de los SMS de Nu aún no se conoce; cuando llegue uno real, agrégalo a `lib/ingest/nu.test.ts` y ajusta las expresiones). Reglas (tarjeta, duplicados, mes según el corte): `lib/ingest/index.ts`.
- Correos sin ningún monto (avisos de seguridad, códigos) se ignoran como *“sin movimiento”* en vez de llenar la bandeja.

### Agregar otro banco

1. Crea `lib/ingest/<banco>.ts` con una función que reciba el texto del correo o SMS y devuelva los movimientos (`compra` con `amount`, `currency`, `merchant`, `last4`, `cardType`, `occurredAt`; o `ignorado` con un motivo). Usa `lib/ingest/bancolombia.ts` como modelo y las utilidades de `lib/ingest/common.ts` (montos, fechas, últimos 4 dígitos).
2. Escribe pruebas en `lib/ingest/<banco>.test.ts` con **ejemplos reales anonimizados** (cambia los dígitos, nombres y montos personales).
3. Conéctala en `interpret()` de `lib/ingest/index.ts` (cómo se decide qué intérprete usar según el canal y el texto).
4. Para correos, copia `integraciones/gmail-bancolombia.gs` y cambia `BUSQUEDA` y `esDeBancolombia_` por el remitente y asunto de tu banco.
