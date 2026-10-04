/**
 * DISPONIBLE · Registro automático de compras desde Gmail (alertas de Bancolombia)
 * ===============================================================================
 *
 * Qué hace:
 *   Cada 5 minutos revisa tu Gmail buscando los correos "Alertas y Notificaciones" de
 *   Bancolombia y envía cada uno a tu app Disponible. La app decide qué hacer:
 *     - Compras con tarjeta de crédito  → se anotan solas, a 1 cuota, "por revisar".
 *     - Compras con débito (T.Deb)      → se anotan como gastos del mes.
 *     - Transferencias, pagos           → se ignoran (no se guarda nada).
 *     - Tarjeta desconocida             → quedan en "movimientos por revisar" en Inicio.
 *
 * Cómo instalarlo (paso a paso en docs/registro-automatico.md):
 *   1. script.google.com → Nuevo proyecto → borra lo que haya y pega TODO este archivo.
 *   2. Engranaje "Configuración del proyecto" → "Propiedades de la secuencia de comandos":
 *        DISPONIBLE_URL     = https://tu-app.vercel.app   (tu dirección, sin "/" al final)
 *        DISPONIBLE_SECRET  = el mismo valor de MCP_SECRET
 *   3. Arriba elige la función "instalar" y toca "Ejecutar". Autoriza los permisos.
 *   Listo. Para ver qué está pasando: menú "Ejecuciones" (a la izquierda).
 *
 * Funciones que puedes ejecutar a mano (elígelas en la lista de arriba y toca "Ejecutar"):
 *   instalar()         Activa la revisión automática cada 5 minutos.
 *   desinstalar()      La desactiva.
 *   probar()           Muestra en el registro lo que se enviaría de los 3 últimos correos (no envía nada).
 *   probarConexion()   Verifica que la URL y la clave funcionan (no registra nada).
 *   procesar()         Hace una revisión ahora mismo.
 *   reprocesar()       Olvida qué correos ya envió y los vuelve a enviar todos (los de los últimos DIAS días).
 *                      Sirve para recuperar compras que antes se ignoraban (p.ej. las de débito). No duplica
 *                      nada: lo ya registrado responde "Ya estaba registrado".
 *
 * Nota técnica: Gmail agrupa todas las alertas en una sola conversación (mismo asunto), así
 * que no sirve marcar la conversación como "procesada" para saber qué falta. Por eso se
 * recuerda el id de cada correo ya enviado (los últimos 400). Además el servidor ignora un
 * id repetido, así que enviar dos veces el mismo correo nunca crea una compra doble.
 */

// ---------- Ajustes (normalmente no hay que tocarlos) ----------

/**
 * Cuántos días hacia atrás se revisan. Normalmente 3. Para recuperar todo el mes una sola vez,
 * pon 30, guarda, ejecuta reprocesar() y luego vuelve a dejar 3 (y guarda).
 */
var DIAS = 3;
/** Qué correos buscar. (No se excluye la etiqueta: una conversación ya etiquetada puede recibir alertas nuevas). */
var BUSQUEDA = 'from:(notificacionesbancolombia.com) subject:"Alertas y Notificaciones" newer_than:' + DIAS + 'd';
/** Etiqueta visible en Gmail para las conversaciones ya enviadas (solo informativa). */
var ETIQUETA = 'disponible/procesado';
/** Cuántos ids de correos enviados se recuerdan (una propiedad guarda máximo ~9 KB). */
var MAX_IDS = 400;

// ---------- Funciones principales ----------

/** Revisa Gmail y envía a Disponible los correos nuevos. La ejecuta el activador cada 5 minutos. */
function procesar() {
  var cfg = config_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // otra ejecución está en curso
  try {
    var hechos = cargarIds_();
    var limite = Date.now() - DIAS * 24 * 3600 * 1000;
    var etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
    var enviados = 0;

    GmailApp.search(BUSQUEDA, 0, 30).forEach(function (hilo) {
      var todoBien = true;
      // Se recorre cada CORREO, no cada conversación: una conversación trae muchas alertas.
      hilo.getMessages().forEach(function (msg) {
        var id = msg.getId();
        if (hechos.indexOf(id) >= 0) return; // ya enviado
        if (msg.getDate().getTime() < limite) return; // muy viejo
        if (!esDeBancolombia_(msg)) return;

        var r = enviar_(cfg, { canal: 'correo', id: id, texto: textoDe_(msg) });
        if (r.listo) {
          hechos.push(id);
          enviados++;
          Logger.log('OK  ' + r.mensaje);
        } else {
          todoBien = false;
          Logger.log('ERROR (' + r.codigo + '): ' + r.mensaje + ' — se reintenta en la próxima revisión.');
        }
      });
      if (todoBien) hilo.addLabel(etiqueta);
    });

    guardarIds_(hechos);
    if (enviados === 0) Logger.log('Sin correos nuevos.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Vuelve a enviar los correos de los últimos DIAS días, aunque ya se hubieran enviado.
 * El servidor no repite nada (reconoce el id de cada correo): las compras ya anotadas responden
 * "Ya estaba registrado" y las de débito que antes se ignoraban quedan como gastos.
 */
function reprocesar() {
  PropertiesService.getScriptProperties().deleteProperty('IDS_ENVIADOS');
  Logger.log('Reprocesando los correos de los últimos ' + DIAS + ' días…');
  procesar();
}

/** Crea el activador cada 5 minutos (y borra activadores repetidos). */
function instalar() {
  config_(); // falla con un mensaje claro si faltan las propiedades
  desinstalar();
  ScriptApp.newTrigger('procesar').timeBased().everyMinutes(5).create();
  if (!GmailApp.getUserLabelByName(ETIQUETA)) GmailApp.createLabel(ETIQUETA);
  Logger.log('Instalado: Disponible revisará tu Gmail cada 5 minutos.');
  probarConexion();
}

/** Borra los activadores de este script. */
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesar') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Activadores anteriores eliminados.');
}

/** Muestra lo que se enviaría de los 3 últimos correos, sin enviar nada. */
function probar() {
  var mensajes = [];
  GmailApp.search(BUSQUEDA, 0, 10).forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      if (esDeBancolombia_(msg)) mensajes.push(msg);
    });
  });
  mensajes.sort(function (a, b) {
    return b.getDate().getTime() - a.getDate().getTime();
  });
  if (mensajes.length === 0) {
    Logger.log('No encontré correos de Bancolombia de los últimos ' + DIAS + ' días.');
    return;
  }
  var hechos = cargarIds_();
  mensajes.slice(0, 3).forEach(function (msg) {
    var cuerpo = { canal: 'correo', id: msg.getId(), texto: textoDe_(msg) };
    Logger.log(
      '--- ' + msg.getDate() + (hechos.indexOf(msg.getId()) >= 0 ? ' (ya enviado)' : ' (pendiente)') + '\n' +
        JSON.stringify(cuerpo).slice(0, 1500)
    );
  });
}

/** Verifica la URL y la clave con un mensaje de prueba (el servidor responde "Ignorado (sin movimiento)"). */
function probarConexion() {
  var r = enviar_(config_(), { canal: 'correo', texto: 'Prueba de conexión desde Apps Script' });
  if (r.codigo === 401) Logger.log('ERROR: clave incorrecta. Revisa DISPONIBLE_SECRET (debe ser igual a MCP_SECRET).');
  else if (r.codigo >= 200 && r.codigo < 300) Logger.log('Conexión correcta: ' + r.mensaje);
  else Logger.log('ERROR ' + r.codigo + ': ' + r.mensaje + '. Revisa DISPONIBLE_URL.');
}

// ---------- Ayudantes ----------

function config_() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('DISPONIBLE_URL') || '').trim().replace(/\/+$/, '');
  var secreto = (p.getProperty('DISPONIBLE_SECRET') || '').trim();
  if (!url || !secreto) {
    throw new Error(
      'Faltan las propiedades DISPONIBLE_URL y/o DISPONIBLE_SECRET. ' +
        'Agrégalas en Configuración del proyecto → Propiedades de la secuencia de comandos.'
    );
  }
  return { url: url, secreto: secreto };
}

function esDeBancolombia_(msg) {
  return /notificacionesbancolombia\.com/i.test(msg.getFrom());
}

/** Texto del correo (sin HTML). Se recorta para no enviar textos enormes. */
function textoDe_(msg) {
  return (msg.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 15000);
}

/** Envía a /api/ingesta. Devuelve { listo, codigo, mensaje }. */
function enviar_(cfg, cuerpo) {
  var codigo = 0;
  var mensaje = '';
  try {
    var resp = UrlFetchApp.fetch(cfg.url + '/api/ingesta', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + cfg.secreto },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true,
      followRedirects: false,
    });
    codigo = resp.getResponseCode();
    var texto = resp.getContentText();
    try {
      var json = JSON.parse(texto);
      mensaje = json.mensaje || json.error || texto;
    } catch (e) {
      mensaje = texto.slice(0, 200);
    }
  } catch (e) {
    mensaje = String(e);
  }
  // 2xx = listo. 400 = el servidor no acepta ese correo: no tiene sentido reintentarlo.
  var listo = (codigo >= 200 && codigo < 300) || codigo === 400;
  return { listo: listo, codigo: codigo, mensaje: mensaje };
}

function cargarIds_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('IDS_ENVIADOS') || '[]');
  } catch (e) {
    return [];
  }
}

function guardarIds_(ids) {
  PropertiesService.getScriptProperties().setProperty('IDS_ENVIADOS', JSON.stringify(ids.slice(-MAX_IDS)));
}
