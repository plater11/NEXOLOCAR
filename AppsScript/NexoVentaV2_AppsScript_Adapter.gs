/**
 * NEXOVENTA V2 - ADAPTADOR API
 * Copiar este bloque AL FINAL del Code.gs de QASO V9.
 * No reemplazar las funciones existentes.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return nexoventaJson_({ ok: false, mensaje: 'Solicitud vacía.' });
    }
    var req = JSON.parse(e.postData.contents);
    var fn = String(req.fn || '');
    var args = Array.isArray(req.args) ? req.args : [];
    var token = String(req.token || '');
    if (!fn) return nexoventaJson_({ ok: false, mensaje: 'Falta indicar la función.' });
    var resultado = dispatch(fn, args, token);
    return nexoventaJson_({ ok: true, resultado: resultado, servidor: new Date().toISOString() });
  } catch (error) {
    return nexoventaJson_({ ok: false, mensaje: String(error && error.message || error), servidor: new Date().toISOString() });
  }
}

function nexoventaJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
