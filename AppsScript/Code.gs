// QASO SYSTEM V3 - Gestión unificada y motor de stock optimizado
const SPREADSHEET_ID = "1BdYm0k-ttkpLNILPaB48aI7q9bHVfBMYcCHWzdp6qXQ";
const HOJA_PRODUCTOS = "Productos";
const HOJA_MOVIMIENTOS = "Movimientos";
const HOJA_UNIDADES = "Unidades";
const HOJA_GRUPOS = "Grupos";
const HOJA_VENTAS = "Ventas";
const HOJA_IMPRESIONES = "Impresiones";
const HOJA_CLIENTES = "Clientes";
const HOJA_USUARIOS = "Usuarios";
const ADMIN_EMAIL = "jvizarretape@gmail.com";
// Versión v16: evita ventas duplicadas por doble clic y optimiza registro de venta.

const TIPOS_MOVIMIENTO = { INGRESO:"INGRESO", SALIDA:"SALIDA", AJUSTE_POSITIVO:"AJUSTE_POSITIVO", AJUSTE_NEGATIVO:"AJUSTE_NEGATIVO" };

function doGet(){return HtmlService.createHtmlOutputFromFile('index').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle('QASO SYSTEM');}
function ss(){return SpreadsheetApp.openById(SPREADSHEET_ID);}
function normalizarCodigo(c){return String(c||'').trim().toUpperCase();}
function num(v){return Math.max(0, Number(v)||0);}
function crearFecha(s){
  if(!s) return new Date();
  if(Object.prototype.toString.call(s)==='[object Date]') return s;
  const txt=String(s).trim();
  const p=txt.split('-');
  return p.length===3 ? new Date(+p[0],+p[1]-1,+p[2],12,0,0) : new Date(txt);
}

function fechaSerializable_(v){
  if(v instanceof Date && !isNaN(v.getTime())){
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'America/Lima', 'yyyy-MM-dd HH:mm:ss');
  }
  return v == null ? '' : String(v);
}




var CURRENT_USER = null;
const AUTH_TTL_SECONDS = 8 * 60 * 60;

function hashPassword_(password, salt){
  const raw = String(salt || '') + '|' + String(password || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytes.map(function(b){ return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
}
function crearSalt_(){ return Utilities.getUuid().replace(/-/g,''); }
function crearToken_(){ return Utilities.getUuid() + '-' + Utilities.getUuid(); }
function guardarSesion_(usuario){
  const token = crearToken_();
  const payload = JSON.stringify({usuario:usuario.usuario,nombre:usuario.nombre,perfil:usuario.perfil,ts:Date.now()});
  CacheService.getScriptCache().put('AUTH_' + token, payload, AUTH_TTL_SECONDS);
  return token;
}
function leerSesion_(token){
  if(!token) return null;
  const txt = CacheService.getScriptCache().get('AUTH_' + String(token));
  if(!txt) return null;
  try{return JSON.parse(txt);}catch(e){return null;}
}
function cerrarSesion(token){
  if(token) CacheService.getScriptCache().remove('AUTH_' + String(token));
  return true;
}

function asegurarUsuarios(){
  const libro=ss();
  let sh=libro.getSheetByName(HOJA_USUARIOS)||libro.insertSheet(HOJA_USUARIOS);
  const headers=['Usuario','Nombre','Password Hash','Salt','Perfil','Estado','Fecha Creación','Último Login','Comentarios','Permisos'];
  if(sh.getLastRow()===0){
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.getRange(1,1,1,headers.length).setBackground('#1C5F7B').setFontColor('white').setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.autoResizeColumns(1,headers.length);
  }else{
    const old=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0].map(String);
    if(old[0]==='Email'){
      const data=sh.getDataRange().getValues();
      sh.clear();
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      for(let i=1;i<data.length;i++){
        if(!data[i][0]) continue;
        const usuario=String(data[i][0]).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g,'') || ('usuario'+i);
        const salt=crearSalt_();
        const pass='123456';
        sh.appendRow([usuario,String(data[i][1]||usuario),hashPassword_(pass,salt),salt,String(data[i][2]||'PENDIENTE').toUpperCase(),String(data[i][3]||'PENDIENTE').toUpperCase(),new Date(),'',String(data[i][7]||'Migrado. Cambiar contraseña inicial: 123456')]);
      }
      sh.getRange(1,1,1,headers.length).setBackground('#1C5F7B').setFontColor('white').setFontWeight('bold');
      sh.autoResizeColumns(1,headers.length);
    }else{
      headers.forEach((x,i)=>{if(old[i]!==x)sh.getRange(1,i+1).setValue(x);});
    }
  }
  const data=sh.getDataRange().getValues();
  let existe=false;
  for(let i=1;i<data.length;i++) if(String(data[i][0]||'').toLowerCase().trim()==='master') existe=true;
  if(!existe){
    const salt=crearSalt_();
    sh.appendRow(['master','Administrador',hashPassword_('123456',salt),salt,'MASTER','ACTIVO',new Date(),'','Usuario master inicial. Contraseña inicial: 123456']);
  }
  return sh;
}
function obtenerUsuarioPorUsuario(usuario){
  const sh=asegurarUsuarios();
  usuario=String(usuario||'').toLowerCase().trim();
  const data=sh.getDataRange().getValues();
  for(let i=1;i<data.length;i++){
    if(String(data[i][0]||'').toLowerCase().trim()===usuario){
      return {fila:i+1,usuario:String(data[i][0]||''),nombre:String(data[i][1]||''),passwordHash:String(data[i][2]||''),salt:String(data[i][3]||''),perfil:String(data[i][4]||'').toUpperCase(),estado:String(data[i][5]||'').toUpperCase(),fechaCreacion:data[i][6],ultimoLogin:data[i][7],comentarios:String(data[i][8]||''),permisos:parsearPermisos_(data[i][9],data[i][4])};
    }
  }
  return null;
}
function loginUsuario(usuario,password){
  asegurarHojas();
  usuario=String(usuario||'').toLowerCase().trim();
  password=String(password||'');
  if(!usuario || !password) return {ok:false,mensaje:'Ingrese usuario y contraseña.'};
  const u=obtenerUsuarioPorUsuario(usuario);
  if(!u) return {ok:false,mensaje:'Usuario o contraseña incorrectos.'};
  if(u.estado!=='ACTIVO') return {ok:false,mensaje:'Usuario bloqueado o inactivo. Solicite acceso al administrador.'};
  if(hashPassword_(password,u.salt)!==u.passwordHash) return {ok:false,mensaje:'Usuario o contraseña incorrectos.'};
  const sh=asegurarUsuarios();
  sh.getRange(u.fila,8).setValue(new Date());
  const token=guardarSesion_(u);
  return {ok:true,token:token,usuario:u.usuario,nombre:u.nombre,perfil:u.perfil,permisos:u.permisos};
}
function obtenerSesion(token){
  asegurarHojas();
  const s=leerSesion_(token);
  if(!s) return {ok:false,estado:'LOGIN',mensaje:'Ingrese usuario y contraseña.'};
  const u=obtenerUsuarioPorUsuario(s.usuario);
  if(!u || u.estado!=='ACTIVO') return {ok:false,estado:'LOGIN',mensaje:'La sesión expiró o el usuario está inactivo.'};
  return {ok:true,token:token,usuario:u.usuario,nombre:u.nombre,perfil:u.perfil,permisos:u.permisos};
}
function parsearPermisos_(valor,perfil){
  const permitidos=['dashboard','clientes','ventas','emisiones','cobranza','inventario','centroGerencial','reportes','analisis','configuracion'];
  const txt=String(valor||'').trim();
  if(!txt) return permisosPerfil(perfil).filter(x=>permitidos.includes(x));
  return txt.split(',').map(x=>String(x).trim()).filter((x,i,a)=>permitidos.includes(x)&&a.indexOf(x)===i);
}
function permisosPerfil(perfil){
  perfil=String(perfil||'').toUpperCase();
  if(perfil==='MASTER') return ['dashboard','productos','clientes','ingresos','ventas','emisiones','cobranza','inventario','reportes','analisis','centroGerencial','buscar','configuracion'];
  if(perfil==='PREVENTA') return ['dashboard','clientes','ventas','emisiones','cobranza','inventario'];
  if(perfil==='COMPRADOR') return ['inventario','reportes','analisis'];
  return [];
}
function perfilActual(){
  if(CURRENT_USER && CURRENT_USER.perfil) return String(CURRENT_USER.perfil).toUpperCase();
  return '';
}
function tienePerfil(perfiles){
  const p=perfilActual();
  if(!p) return false;
  return perfiles.map(x=>String(x).toUpperCase()).includes(p);
}
function requerirPerfil(perfiles){
  if(!tienePerfil(perfiles)) throw new Error('No tienes permiso para ejecutar esta acción.');
}
function usuarioSistema_(){ return CURRENT_USER ? (CURRENT_USER.usuario || CURRENT_USER.nombre || 'Sistema') : 'Sistema'; }
function emailActivo(){ return usuarioSistema_(); }
function asegurarHistorialUsuarios_(){
  const libro=ss();
  let sh=libro.getSheetByName('Usuarios_Historial')||libro.insertSheet('Usuarios_Historial');
  const headers=['Fecha','Administrador','Acción','Usuario afectado','Detalle'];
  if(sh.getLastRow()===0){
    sh.getRange(1,1,1,headers.length).setValues([headers]).setBackground('#1C5F7B').setFontColor('white').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function auditarUsuario_(accion,usuario,detalle){
  asegurarHistorialUsuarios_().appendRow([new Date(),usuarioSistema_(),accion,String(usuario||''),String(detalle||'')]);
}
function administradoresSeguros_(excepto){
  const sh=asegurarUsuarios();
  const data=sh.getDataRange().getValues();
  return data.slice(1).filter(r=>String(r[0]||'').toLowerCase()!==String(excepto||'').toLowerCase()&&String(r[4]||'').toUpperCase()==='MASTER'&&String(r[5]||'').toUpperCase()==='ACTIVO'&&parsearPermisos_(r[9],r[4]).includes('configuracion')).length;
}

function obtenerUsuarios(){
  requerirPerfil(['MASTER']);
  const sh=asegurarUsuarios();
  const data=sh.getDataRange().getValues();
  return data.slice(1).filter(r=>r[0]).map(r=>({usuario:String(r[0]||''),nombre:String(r[1]||''),perfil:String(r[4]||''),estado:String(r[5]||''),fechaCreacion:r[6]?Utilities.formatDate(new Date(r[6]),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'):'',ultimoLogin:r[7]?Utilities.formatDate(new Date(r[7]),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'):'',comentarios:String(r[8]||''),permisos:parsearPermisos_(r[9],r[4])}));
}
function crearUsuarioSistema(usuario){
  requerirPerfil(['MASTER']);
  usuario=usuario||{};
  const user=String(usuario.usuario||'').toLowerCase().trim();
  const nombre=String(usuario.nombre||'').trim();
  const password=String(usuario.password||'');
  const perfil=String(usuario.perfil||'').toUpperCase();
  const estado=String(usuario.estado||'ACTIVO').toUpperCase();
  if(!user || !nombre || !password || !perfil) return 'Complete usuario, nombre, contraseña y perfil.';
  if(!/^[a-z0-9._-]{3,30}$/.test(user)) return 'Usuario inválido. Use 3 a 30 caracteres: letras, números, punto, guion o guion bajo.';
  if(password.length<4) return 'La contraseña debe tener al menos 4 caracteres.';
  if(!['MASTER','PREVENTA','COMPRADOR'].includes(perfil)) return 'Perfil inválido.';
  if(!['ACTIVO','BLOQUEADO'].includes(estado)) return 'Estado inválido.';
  if(obtenerUsuarioPorUsuario(user)) return 'Ya existe un usuario con ese nombre.';
  const sh=asegurarUsuarios();
  const salt=crearSalt_();
  const permisos=parsearPermisos_(Array.isArray(usuario.permisos)?usuario.permisos.join(','):'',perfil);
  sh.appendRow([user,nombre,hashPassword_(password,salt),salt,perfil,estado,new Date(),' ',String(usuario.comentarios||''),permisos.join(',')]);
  auditarUsuario_('CREAR',user,'Perfil '+perfil+'; estado '+estado+'; permisos '+permisos.join(','));
  return 'Usuario creado correctamente.';
}
function actualizarUsuario(usuario){
  requerirPerfil(['MASTER']);
  usuario=usuario||{};
  const original=String(usuario.originalUsuario||usuario.usuario||'').toLowerCase().trim();
  const user=String(usuario.usuario||'').toLowerCase().trim();
  const nombre=String(usuario.nombre||'').trim();
  const perfil=String(usuario.perfil||'').toUpperCase();
  const estado=String(usuario.estado||'').toUpperCase();
  if(!original || !user || !nombre) return 'Complete usuario y nombre.';
  if(!/^[a-z0-9._-]{3,30}$/.test(user)) return 'Usuario inválido. Use 3 a 30 caracteres: letras, números, punto, guion o guion bajo.';
  if(!['MASTER','PREVENTA','COMPRADOR'].includes(perfil)) return 'Perfil inválido.';
  if(!['ACTIVO','BLOQUEADO'].includes(estado)) return 'Estado inválido.';
  const sh=asegurarUsuarios();
  const u=obtenerUsuarioPorUsuario(original);
  if(!u) return 'Usuario no encontrado.';
  const permisos=parsearPermisos_(Array.isArray(usuario.permisos)?usuario.permisos.join(','):usuario.permisos,perfil);
  const esActual=CURRENT_USER&&String(CURRENT_USER.usuario||'').toLowerCase()===original;
  if(esActual&&(estado!=='ACTIVO'||!permisos.includes('configuracion'))) throw new Error('Por seguridad no puedes bloquear tu propio usuario ni quitarte Configuración.');
  const pierdeControl=u.perfil==='MASTER'&&(perfil!=='MASTER'||estado!=='ACTIVO'||!permisos.includes('configuracion'));
  if(pierdeControl&&administradoresSeguros_(original)<1) throw new Error('Debe quedar al menos un administrador activo con acceso a Configuración.');
  if(user!==original && obtenerUsuarioPorUsuario(user)) return 'Ya existe otro usuario con ese nombre.';
  sh.getRange(u.fila,1).setValue(user);
  sh.getRange(u.fila,2).setValue(nombre);
  if(usuario.password){
    const pass=String(usuario.password);
    if(pass.length<4) return 'La nueva contraseña debe tener al menos 4 caracteres.';
    const salt=crearSalt_();
    sh.getRange(u.fila,3).setValue(hashPassword_(pass,salt));
    sh.getRange(u.fila,4).setValue(salt);
  }
  sh.getRange(u.fila,5).setValue(perfil);
  sh.getRange(u.fila,6).setValue(estado);
  sh.getRange(u.fila,9).setValue(String(usuario.comentarios||''));
  sh.getRange(u.fila,10).setValue(permisos.join(','));
  auditarUsuario_('ACTUALIZAR',user,'Antes: perfil '+u.perfil+', estado '+u.estado+', permisos '+u.permisos.join(',')+' | Después: perfil '+perfil+', estado '+estado+', permisos '+permisos.join(','));
  return 'Usuario actualizado correctamente.';
}
function eliminarUsuarioSistema(usuario){
  requerirPerfil(['MASTER']);
  const user=String(usuario||'').toLowerCase().trim();
  if(!user) return 'Usuario inválido.';
  if(CURRENT_USER && String(CURRENT_USER.usuario||'').toLowerCase()===user) return 'No puedes eliminar el usuario con el que has iniciado sesión.';
  const sh=asegurarUsuarios();
  const u=obtenerUsuarioPorUsuario(user);
  if(!u) return 'Usuario no encontrado.';
  const data=sh.getDataRange().getValues();
  const masters=data.slice(1).filter(r=>r[0] && String(r[4]||'').toUpperCase()==='MASTER');
  if(String(u.perfil||'').toUpperCase()==='MASTER' && masters.length<=1) return 'No se puede eliminar el último usuario MASTER.';
  if(String(u.perfil||'').toUpperCase()==='MASTER'&&administradoresSeguros_(user)<1) throw new Error('Debe quedar al menos un administrador activo con acceso a Configuración.');
  auditarUsuario_('ELIMINAR',user,'Perfil '+u.perfil+'; estado '+u.estado+'; permisos '+u.permisos.join(','));
  sh.deleteRow(u.fila);
  return 'Usuario eliminado correctamente.';
}
function solicitarAcceso(){ return 'Solicita tus credenciales al administrador del sistema.'; }

function dispatch(fn,args,token){
  const libres = {loginUsuario:true, obtenerSesion:true, cerrarSesion:true};
  if(libres[fn]) return globalThis[fn].apply(globalThis,args||[]);
  const ses=leerSesion_(token);
  if(!ses) throw new Error('Sesión expirada. Vuelva a iniciar sesión.');
  const u=obtenerUsuarioPorUsuario(ses.usuario);
  if(!u || u.estado!=='ACTIVO') throw new Error('Usuario inactivo o sin permiso.');
  CURRENT_USER={usuario:u.usuario,nombre:u.nombre,perfil:u.perfil};
  const permitidas={obtenerListas:1,obtenerResumen:1,registrarProducto:1,actualizarProducto:1,eliminarProducto:1,registrarMovimiento:1,registrarMovimientosMasivos:1,obtenerMovimientosIngreso:1,actualizarMovimientoIngreso:1,eliminarMovimientoIngreso:1,registrarVenta:1,buscarProductosVenta:1,obtenerStock:1,buscarProducto:1,obtenerHistorial:1,obtenerEmisiones:1,generarCodigoImpresion:1,actualizarEstadoOperativoPedido:1,obtenerAnalisis:1,obtenerDashboardAnalisis:1,registrarCliente:1,limpiarClientesDuplicados:1,obtenerClientes:1,obtenerClientesPreventa:1,obtenerAlertasCumpleanos:1,obtenerUsuarios:1,crearUsuarioSistema:1,actualizarUsuario:1,eliminarUsuarioSistema:1,actualizarCliente:1,eliminarCliente:1,validarIntegridad:1,inicializarHojas:1,repararFechasMovimientosVenta:1,obtenerCatalogoProductos:1,obtenerUltimosProductos:1,obtenerProductosConIngresoReciente:1,buscarProductosIngreso:1,diagnosticoFuenteDatos:1,obtenerCentroGerencial:1,registrarMovimientoFinanciero:1,registrarActivoFinanciero:1,registrarPasivoFinanciero:1,guardarConfigFinanciera:1,obtenerPlaneamientoFinanciero:1,guardarPlaneamientoFinanciero:1,duplicarPlaneamientoMesAnterior:1,guardarObjetivoEstrategico:1,obtenerAnalisisVentasTemporal:1,obtenerPlaneamientoMensual:1,guardarPlaneamientoMensual:1,duplicarPlaneamientoMensualAnterior:1,obtenerContabilidadDiaria:1,guardarContabilidadDiaria:1,cerrarDiaContable:1,reabrirDiaContable:1,obtenerCurvaS:1,obtenerCobranzaPedidos:1,guardarCobranzaPedido:1,registrarGastoOperacion:1,obtenerGastosOperacion:1,obtenerRendicionDia:1,validarRendicionDia:1,subirComprobanteGasto:1,registrarCalificacionCliente:1,validarCargaMasivaInventario:1,importarCargaMasivaInventario:1};
  permitidas.corregirPedido=1;
  if(!permitidas[fn] || typeof globalThis[fn] !== 'function') throw new Error('Función no permitida: '+fn);
  return globalThis[fn].apply(globalThis,args||[]);
}


function asegurarHojas(){
  const libro=ss();
  asegurarUsuarios();
  let p=libro.getSheetByName(HOJA_PRODUCTOS)||libro.insertSheet(HOJA_PRODUCTOS);
  if(p.getLastRow()===0){p.getRange(1,1,1,13).setValues([["Código","Nombre","Unidad","Grupo","Stock Mínimo","Precio Costo","Precio Venta","Imagen Base64","Fecha Creación","Promoción Activa","Cantidad Promo","Precio Promo","Descripción Promo"]]);p.getRange(1,1,1,13).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');p.getRange('A:A').setNumberFormat('@');p.autoResizeColumns(1,13);}
  let m=libro.getSheetByName(HOJA_MOVIMIENTOS)||libro.insertSheet(HOJA_MOVIMIENTOS);
  if(m.getLastRow()===0){m.getRange(1,1,1,10).setValues([["Código","Fecha","Tipo","Cantidad","Usuario","Timestamp","Observaciones","Stock Resultante","Venta ID","Cliente"]]);m.getRange(1,1,1,10).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');m.getRange('A:A').setNumberFormat('@');m.autoResizeColumns(1,10);}
  let v=libro.getSheetByName(HOJA_VENTAS)||libro.insertSheet(HOJA_VENTAS);
  if(v.getLastRow()===0){v.getRange(1,1,1,9).setValues([["Venta ID","Fecha","Cliente","Total","Items JSON","Usuario","Timestamp","Observaciones","Solicitud ID"]]);v.getRange(1,1,1,9).setBackground('#28a745').setFontColor('white').setFontWeight('bold');v.autoResizeColumns(1,9);}
  let imp=libro.getSheetByName(HOJA_IMPRESIONES)||libro.insertSheet(HOJA_IMPRESIONES);
  if(imp.getLastRow()===0){imp.getRange(1,1,1,5).setValues([["Código Impresión","Venta ID","Fecha Impresión","Usuario","Timestamp"]]);imp.getRange(1,1,1,5).setBackground('#1C5F7B').setFontColor('white').setFontWeight('bold');imp.autoResizeColumns(1,5);}
  let cli=libro.getSheetByName(HOJA_CLIENTES)||libro.insertSheet(HOJA_CLIENTES);
  if(cli.getLastRow()===0){cli.getRange(1,1,1,9).setValues([["Cliente ID","Nombre","Apellidos","Correo electrónico","Número de contacto","Fecha cumpleaños","Dirección","Comentarios","Fecha Registro","Rate Amabilidad","Rate Responsabilidad","Rate","N° Calificaciones"]]);cli.getRange(1,1,1,13).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');cli.autoResizeColumns(1,13);}
  migrarColumnasVentas();
  obtenerListas();
  migrarColumnasProductos();
  migrarColumnasClientes();
  return 'Sistema inicializado correctamente.';
}
function inicializarHojas(){requerirPerfil(['MASTER']);return asegurarHojas();}


function migrarColumnasVentas(){
  const sh=ss().getSheetByName(HOJA_VENTAS); if(!sh) return;
  const requeridos=["Venta ID","Fecha","Cliente","Total","Items JSON","Usuario","Timestamp","Observaciones","Solicitud ID"];
  const maxCol=Math.max(sh.getLastColumn(),9);
  const headers=sh.getRange(1,1,1,maxCol).getValues()[0];
  requeridos.forEach((h,i)=>{ if(headers[i]!==h) sh.getRange(1,i+1).setValue(h); });
}

function migrarColumnasProductos(){
  const sh=ss().getSheetByName(HOJA_PRODUCTOS); if(!sh) return;
  const headers=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),13)).getValues()[0];
  const requeridos=["Código","Nombre","Unidad","Grupo","Stock Mínimo","Precio Costo","Precio Venta","Imagen Base64","Fecha Creación","Promoción Activa","Cantidad Promo","Precio Promo","Descripción Promo"];
  requeridos.forEach((h,i)=>{ if(headers[i]!==h) sh.getRange(1,i+1).setValue(h); });
}

function migrarColumnasClientes(){
  const sh=ss().getSheetByName(HOJA_CLIENTES); if(!sh) return;
  const requeridos=["Cliente ID","Nombre","Apellidos","Correo electrónico","Número de contacto","Fecha cumpleaños","Dirección","Comentarios","Fecha Registro","Rate Amabilidad","Rate Responsabilidad","Rate","N° Calificaciones"];
  const headers=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),13)).getValues()[0];
  requeridos.forEach((h,i)=>{ if(headers[i]!==h) sh.getRange(1,i+1).setValue(h); });
}

function registrarCliente(cliente){
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    requerirPerfil(['MASTER','PREVENTA']);
    asegurarHojas();
    cliente=cliente||{};
    const nombre=String(cliente.nombre||'').trim();
    const apellidos=String(cliente.apellidos||'').trim();
    const contacto=String(cliente.contacto||'').trim();
    const fechaCumpleanos=String(cliente.fechaCumpleanos||'').trim();
    const direccion=String(cliente.direccion||'').trim();
    if(!nombre || !contacto || !fechaCumpleanos || !direccion) return 'Le falta rellenar el formulario';
    const sh=ss().getSheetByName(HOJA_CLIENTES);
    const clave=nexoventaClaveCliente_([nombre,apellidos,contacto,fechaCumpleanos,direccion]);
    if(sh.getLastRow()>1){
      const existentes=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
      for(let i=0;i<existentes.length;i++){
        const r=existentes[i];
        const fecha=r[5] instanceof Date ? Utilities.formatDate(r[5],Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[5]||'');
        if(nexoventaClaveCliente_([r[1],r[2],r[4],fecha,r[6]])===clave){
          return 'El cliente ya estaba registrado. No se creó un duplicado.';
        }
      }
    }
    const id='C-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
    const cumple=crearFecha(fechaCumpleanos);
    sh.appendRow([id,nombre,apellidos,String(cliente.correo||'').trim(),contacto,cumple,direccion,String(cliente.comentarios||'').trim(),new Date(),0,0,0,0]);
    try{CacheService.getScriptCache().remove('QASO_CLIENTES_PREVENTA_V1');}catch(err){}
    return 'Cliente registrado correctamente.';
  }catch(e){return 'Error al registrar cliente: '+e.message;}
  finally{try{lock.releaseLock();}catch(err){}}
}

function nexoventaClaveCliente_(partes){
  return (partes||[]).map(x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ')).join('|');
}

function limpiarClientesDuplicados(){
  asegurarHojas();
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const sh=ss().getSheetByName(HOJA_CLIENTES);if(!sh||sh.getLastRow()<=2)return 'No se encontraron clientes duplicados.';
    const data=sh.getRange(2,1,sh.getLastRow()-1,13).getValues(),vistos={},eliminar=[];
    for(let i=0;i<data.length;i++){
      const r=data[i],fecha=r[5] instanceof Date?Utilities.formatDate(r[5],Session.getScriptTimeZone(),'yyyy-MM-dd'):String(r[5]||'');
      const clave=nexoventaClaveCliente_([r[1],r[2],r[4],fecha,r[6]]);
      if(!clave.replace(/\|/g,''))continue;
      if(vistos[clave])eliminar.push(i+2);else vistos[clave]=i+2;
    }
    for(let j=eliminar.length-1;j>=0;j--)sh.deleteRow(eliminar[j]);
    try{CacheService.getScriptCache().remove('QASO_CLIENTES_PREVENTA_V1');}catch(err){}
    return eliminar.length?'Limpieza terminada. Duplicados eliminados: '+eliminar.length+'.':'No se encontraron clientes duplicados.';
  }finally{try{lock.releaseLock();}catch(err){}}
}

function obtenerClientes(texto){
  asegurarHojas();
  const sh=ss().getSheetByName(HOJA_CLIENTES); if(!sh || sh.getLastRow()<=1) return [];
  const q=String(texto||'').toLowerCase().trim();
  const data=sh.getDataRange().getValues();
  const out=[];
  for(let i=1;i<data.length;i++){
    const r=data[i]; if(!r[1]) continue;
    const cumple=r[5] ? Utilities.formatDate(new Date(r[5]),Session.getScriptTimeZone(),'dd/MM/yyyy') : '';
    const obj={id:String(r[0]||''),nombre:String(r[1]||''),apellidos:String(r[2]||''),correo:String(r[3]||''),contacto:String(r[4]||''),fechaCumpleanos:cumple,direccion:String(r[6]||''),comentarios:String(r[7]||''),rateAmabilidad:Number(r[9])||0,rateResponsabilidad:Number(r[10])||0,rate:Number(r[11])||0,numeroCalificaciones:Number(r[12])||0};
    const buscar=(obj.id+' '+obj.nombre+' '+obj.apellidos+' '+obj.correo+' '+obj.contacto+' '+obj.direccion).toLowerCase();
    if(!q || buscar.includes(q)) out.push(obj);
  }
  return out.reverse();
}


function obtenerClientesPreventa(){
  asegurarHojas();
  const cache=CacheService.getScriptCache();
  const key='QASO_CLIENTES_PREVENTA_V1';
  try{
    const cached=cache.get(key);
    if(cached) return JSON.parse(cached);
  }catch(e){}
  const clientes=obtenerClientes('');
  const porId={}, porNombre={};
  clientes.forEach(c=>{
    porId[String(c.id||'')]=c;
    const n=String((c.nombre||'')+' '+(c.apellidos||'')).trim().toLowerCase().replace(/\s+/g,' ');
    if(n) porNombre[n]=c;
    c.ultimaVentaTs=0;c.ventasRecientes=0;
  });
  const sh=ss().getSheetByName(HOJA_VENTAS);
  if(sh && sh.getLastRow()>1){
    const data=sh.getDataRange().getValues();
    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nombre=String(r[2]||'').trim().toLowerCase().replace(/\s+/g,' ');
      const c=porNombre[nombre];
      if(!c) continue;
      const f=new Date(r[1]||r[6]);
      const ts=isNaN(f.getTime())?0:f.getTime();
      if(ts>c.ultimaVentaTs)c.ultimaVentaTs=ts;
      c.ventasRecientes++;
    }
  }
  clientes.sort((a,b)=>(b.ultimaVentaTs-a.ultimaVentaTs)||(b.ventasRecientes-a.ventasRecientes)||String(b.id).localeCompare(String(a.id)));
  // Cache breve: permite que cambios manuales en la hoja se reflejen casi de inmediato.
  try{cache.put(key,JSON.stringify(clientes),15);}catch(e){}
  return clientes;
}

function actualizarCliente(cliente){
  try{
    requerirPerfil(['MASTER','PREVENTA']);
    asegurarHojas();
    cliente=cliente||{};
    const id=String(cliente.id||'').trim();
    const nombre=String(cliente.nombre||'').trim();
    const contacto=String(cliente.contacto||'').trim();
    const fechaCumpleanos=String(cliente.fechaCumpleanos||'').trim();
    const direccion=String(cliente.direccion||'').trim();
    if(!id) return 'Cliente inválido.';
    if(!nombre || !contacto || !fechaCumpleanos || !direccion) return 'Le falta rellenar el formulario';
    const sh=ss().getSheetByName(HOJA_CLIENTES);
    const data=sh.getDataRange().getValues();
    let fila=0;
    for(let i=1;i<data.length;i++){ if(String(data[i][0]||'')===id){ fila=i+1; break; } }
    if(!fila) return 'Cliente no encontrado.';
    sh.getRange(fila,2,1,7).setValues([[
      nombre,
      String(cliente.apellidos||'').trim(),
      String(cliente.correo||'').trim(),
      contacto,
      crearFecha(fechaCumpleanos),
      direccion,
      String(cliente.comentarios||'').trim()
    ]]);
    try{CacheService.getScriptCache().remove('QASO_CLIENTES_PREVENTA_V1');}catch(err){}
    return 'Cliente actualizado correctamente.';
  }catch(e){ return 'Error al actualizar cliente: '+e.message; }
}

function eliminarCliente(id){
  try{
    requerirPerfil(['MASTER','PREVENTA']);
    asegurarHojas();
    id=String(id||'').trim();
    if(!id) return 'Cliente inválido.';
    const sh=ss().getSheetByName(HOJA_CLIENTES);
    const data=sh.getDataRange().getValues();
    for(let i=1;i<data.length;i++){
      if(String(data[i][0]||'')===id){ sh.deleteRow(i+1); try{CacheService.getScriptCache().remove('QASO_CLIENTES_PREVENTA_V1');}catch(err){} return 'Cliente eliminado correctamente.'; }
    }
    return 'Cliente no encontrado.';
  }catch(e){ return 'Error al eliminar cliente: '+e.message; }
}

function obtenerAlertasCumpleanos(){
  asegurarHojas();
  const clientes=obtenerClientes('');
  const hoy=new Date();
  const base=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate());
  const out=[];
  clientes.forEach(c=>{
    if(!c.fechaCumpleanos) return;
    const p=String(c.fechaCumpleanos).split('/');
    if(p.length!==3) return;
    const dia=Number(p[0]), mes=Number(p[1])-1;
    let prox=new Date(base.getFullYear(),mes,dia);
    if(prox<base) prox=new Date(base.getFullYear()+1,mes,dia);
    const dias=Math.round((prox-base)/86400000);
    if(dias>=0 && dias<=30){
      out.push({...c,proximoCumple:Utilities.formatDate(prox,Session.getScriptTimeZone(),'dd/MM/yyyy'),dias});
    }
  });
  return out.sort((a,b)=>a.dias-b.dias);
}


function normalizarClienteRate_(v){
  return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function asegurarCalificacionesClientes_(){
  migrarColumnasClientes();
  const libro=ss(),nombre='Clientes_Calificaciones';
  let sh=libro.getSheetByName(nombre)||libro.insertSheet(nombre);
  if(sh.getLastRow()===0){
    const h=['ID','Venta ID','Cliente ID','Cliente','Amabilidad','Responsabilidad','Rate','Usuario','Fecha'];
    sh.getRange(1,1,1,h.length).setValues([h]).setBackground('#173f55').setFontColor('white').setFontWeight('bold');
    sh.setFrozenRows(1);sh.autoResizeColumns(1,h.length);
  }
  return sh;
}
function registrarCalificacionCliente(p){
  requerirPerfil(['MASTER','PREVENTA']); asegurarHojas(); asegurarCalificacionesClientes_(); p=p||{};
  const ventaId=String(p.ventaId||'').trim(),clienteNombre=String(p.cliente||'').trim();
  const amabilidad=Number(p.amabilidad),responsabilidad=Number(p.responsabilidad);
  if(!ventaId)return 'Venta inválida para calificación.';
  if(!(amabilidad>=1&&amabilidad<=5&&responsabilidad>=1&&responsabilidad<=5))return 'Seleccione de 1 a 5 estrellas en ambos criterios.';
  const hist=ss().getSheetByName('Clientes_Calificaciones'),hd=hist.getDataRange().getValues();
  for(let i=1;i<hd.length;i++)if(String(hd[i][1]||'')===ventaId)return 'Este pago ya cuenta con una calificación registrada.';
  const sh=ss().getSheetByName(HOJA_CLIENTES),data=sh.getDataRange().getValues(),buscado=normalizarClienteRate_(clienteNombre);
  let fila=0,clienteId='';
  for(let i=1;i<data.length;i++){
    const full=normalizarClienteRate_((data[i][1]||'')+' '+(data[i][2]||''));
    const solo=normalizarClienteRate_(data[i][1]||'');
    if(full===buscado||solo===buscado){fila=i+1;clienteId=String(data[i][0]||'');break;}
  }
  if(!fila)return 'No se encontró al cliente para guardar la calificación.';
  const n=Number(sh.getRange(fila,13).getValue())||0;
  const oldA=Number(sh.getRange(fila,10).getValue())||0,oldR=Number(sh.getRange(fila,11).getValue())||0;
  const newA=Math.round(((oldA*n+amabilidad)/(n+1))*100)/100;
  const newR=Math.round(((oldR*n+responsabilidad)/(n+1))*100)/100;
  const rate=Math.round(((newA+newR)/2)*100)/100;
  sh.getRange(fila,10,1,4).setValues([[newA,newR,rate,n+1]]);
  hist.appendRow(['RATE-'+Utilities.getUuid().slice(0,8).toUpperCase(),ventaId,clienteId,clienteNombre,amabilidad,responsabilidad,Math.round(((amabilidad+responsabilidad)/2)*100)/100,usuarioSistema_(),new Date()]);
  try{CacheService.getScriptCache().remove('QASO_CLIENTES_PREVENTA_V1');}catch(e){}
  SpreadsheetApp.flush();
  return 'Calificación registrada correctamente. Rate actual: '+rate.toFixed(2)+' / 5.';
}

function registrarProducto(producto){
  try{requerirPerfil(['MASTER']);asegurarHojas(); if(!producto||!producto.codigo||!producto.nombre)return 'Código y nombre son obligatorios.';
    const sh=ss().getSheetByName(HOJA_PRODUCTOS); const data=sh.getDataRange().getValues(); const codigo=normalizarCodigo(producto.codigo);
    for(let i=1;i<data.length;i++){ if(normalizarCodigo(data[i][0])===codigo) return 'Ya existe un producto con este código.'; }
    const nombre=String(producto.nombre).trim(); if(nombre.length<2)return 'El nombre del producto debe tener al menos 2 caracteres.';
    const imagen = String(producto.imagen || '');
    if (imagen.length > 45000) return 'La imagen es muy pesada. Use una imagen más pequeña u optimizada.';
    // Las ofertas se configuran únicamente desde Editar producto.
    const promoActiva='NO';
    const cantidadPromo=0;
    const precioPromo=0;
    const descripcionPromo='';
    sh.appendRow([codigo,nombre,producto.unidad||'Unidades',producto.grupo||'General',num(producto.stockMin),num(producto.precioCosto),num(producto.precioVenta),imagen,new Date(),promoActiva,cantidadPromo,precioPromo,descripcionPromo]);
    return 'Producto registrado correctamente.';
  }catch(e){return 'Error al registrar producto: '+e.message;}
}

function actualizarProducto(producto){
  try{
    requerirPerfil(['MASTER']); asegurarHojas();
    if(!producto||!producto.codigoOriginal||!producto.codigo||!producto.nombre) return 'Código y nombre son obligatorios.';
    const sh=ss().getSheetByName(HOJA_PRODUCTOS), data=sh.getDataRange().getValues();
    const original=normalizarCodigo(producto.codigoOriginal), nuevo=normalizarCodigo(producto.codigo);
    let fila=-1;
    for(let i=1;i<data.length;i++){
      const c=normalizarCodigo(data[i][0]);
      if(c===original) fila=i+1;
      if(c===nuevo && c!==original) return 'Ya existe otro producto con este código.';
    }
    if(fila<0) return 'Producto no encontrado.';
    const nombre=String(producto.nombre).trim(); if(nombre.length<2) return 'El nombre del producto debe tener al menos 2 caracteres.';
    const imagen=sh.getRange(fila,8).getValue();
    const promoActiva=String(producto.promocionActiva||'NO').toUpperCase()==='SI'?'SI':'NO';
    const cantidadPromo=promoActiva==='SI'?num(producto.cantidadPromo):0;
    const precioPromo=promoActiva==='SI'?num(producto.precioPromo):0;
    const descripcionPromo=promoActiva==='SI'?String(producto.descripcionPromo||'').trim():'';
    if(promoActiva==='SI' && (cantidadPromo<2 || precioPromo<=0)) return 'Para activar la promoción ingrese una cantidad mínima de 2 y un precio promocional válido.';
    if(promoActiva==='SI' && precioPromo>=num(producto.precioVenta)*cantidadPromo) return 'El precio promocional total debe ser menor al precio normal por la cantidad mínima.';
    sh.getRange(fila,1,1,13).setValues([[nuevo,nombre,producto.unidad||'Unidades',producto.grupo||'General',num(producto.stockMin),num(producto.precioCosto),num(producto.precioVenta),imagen,data[fila-1][8]||new Date(),promoActiva,cantidadPromo,precioPromo,descripcionPromo]]);
    if(nuevo!==original){
      const mov=ss().getSheetByName(HOJA_MOVIMIENTOS);
      if(mov&&mov.getLastRow()>1){const vals=mov.getRange(2,1,mov.getLastRow()-1,1).getValues();for(let i=0;i<vals.length;i++)if(normalizarCodigo(vals[i][0])===original)vals[i][0]=nuevo;mov.getRange(2,1,vals.length,1).setValues(vals);}
    }
    return 'Producto actualizado correctamente.';
  }catch(e){return 'Error al actualizar producto: '+e.message;}
}

function eliminarProducto(codigo){
  try{
    requerirPerfil(['MASTER']); asegurarHojas();
    const c=normalizarCodigo(codigo); if(!c) return 'Código inválido.';
    const mov=ss().getSheetByName(HOJA_MOVIMIENTOS);
    if(mov&&mov.getLastRow()>1){const codigos=mov.getRange(2,1,mov.getLastRow()-1,1).getValues().flat();if(codigos.some(x=>normalizarCodigo(x)===c))return 'No se puede eliminar el producto porque tiene movimientos registrados. Puede editar sus datos, pero conservarlo protege el historial.';}
    const sh=ss().getSheetByName(HOJA_PRODUCTOS), data=sh.getDataRange().getValues();
    for(let i=1;i<data.length;i++){if(normalizarCodigo(data[i][0])===c){sh.deleteRow(i+1);return 'Producto eliminado correctamente.';}}
    return 'Producto no encontrado.';
  }catch(e){return 'Error al eliminar producto: '+e.message;}
}

function obtenerProductoMap(){
  asegurarHojas(); const data=ss().getSheetByName(HOJA_PRODUCTOS).getDataRange().getValues(); const map={};
  for(let i=1;i<data.length;i++){const r=data[i], c=normalizarCodigo(r[0]); if(c) map[c]={codigo:c,nombre:r[1]||'',unidad:r[2]||'Unidades',grupo:r[3]||'General',stockMin:num(r[4]),precioCosto:num(r[5]),precioVenta:num(r[6]),imagen:r[7]||'',fechaCreacion:fechaSerializable_(r[8]),promocionActiva:String(r[9]||'NO').toUpperCase(),cantidadPromo:num(r[10]),precioPromo:num(r[11]),descripcionPromo:String(r[12]||'')};}
  return map;
}


function obtenerStockMap_(){
  asegurarHojas();const sh=ss().getSheetByName(HOJA_MOVIMIENTOS),map={};if(!sh||sh.getLastRow()<2)return map;
  const data=sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
  for(const r of data){const c=normalizarCodigo(r[0]);if(!c)continue;const t=String(r[2]||'').toUpperCase(),q=Number(r[3])||0;
    if(t==='INGRESO'||t==='AJUSTE_POSITIVO')map[c]=(map[c]||0)+q;
    else if(t==='SALIDA'||t==='AJUSTE_NEGATIVO')map[c]=(map[c]||0)-q;
  }
  Object.keys(map).forEach(c=>map[c]=Math.max(0,Math.round(map[c]*100)/100));return map;
}
function obtenerCatalogoProductos(){
  const productos=obtenerProductoMap(),stock=obtenerStockMap_();
  return Object.values(productos).map(p=>({...p,stock:stock[p.codigo]||0})).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
}


function diagnosticoFuenteDatos(){
  const libro=ss();
  const p=libro.getSheetByName(HOJA_PRODUCTOS);
  const m=libro.getSheetByName(HOJA_MOVIMIENTOS);
  return {
    spreadsheetId: libro.getId(),
    spreadsheetNombre: libro.getName(),
    hojaProductos: !!p,
    productosRegistrados: p ? Math.max(0,p.getLastRow()-1) : 0,
    hojaMovimientos: !!m,
    movimientosRegistrados: m ? Math.max(0,m.getLastRow()-1) : 0
  };
}

function buscarProductosIngreso(texto,limite){
  const q=String(texto||'').toLowerCase().trim();
  const n=Math.max(1,Math.min(Number(limite)||12,30));
  if(!q)return [];
  return obtenerCatalogoProductos().filter(p=>(String(p.codigo)+' '+String(p.nombre)+' '+String(p.grupo)+' '+String(p.unidad)).toLowerCase().includes(q)).slice(0,n);
}

function obtenerProductosConIngresoReciente(limite){
  asegurarHojas();
  const n=Math.max(1,Math.min(Number(limite)||8,20));
  const productos=obtenerProductoMap(), stocks=obtenerStockMap_();
  const sh=ss().getSheetByName(HOJA_MOVIMIENTOS);
  if(!sh||sh.getLastRow()<2)return [];
  const data=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  const vistos={},out=[];
  for(let i=data.length-1;i>=0&&out.length<n;i--){
    const r=data[i],codigo=normalizarCodigo(r[0]),tipo=String(r[2]||'').toUpperCase();
    if(!codigo||vistos[codigo]||!['INGRESO','AJUSTE_POSITIVO'].includes(tipo)||!productos[codigo])continue;
    vistos[codigo]=true;
    const p=productos[codigo],fv=r[1];
    let fecha='';
    if(fv instanceof Date&&!isNaN(fv))fecha=Utilities.formatDate(fv,Session.getScriptTimeZone()||'America/Lima','dd/MM/yyyy');
    else fecha=String(fv||'');
    out.push({...p,stock:stocks[codigo]||0,ultimaFecha:fecha,ultimaCantidad:Number(r[3])||0,ultimaObservacion:r[6]||''});
  }
  return out;
}

function obtenerUltimosProductos(limite){
  asegurarHojas();
  const sh=ss().getSheetByName(HOJA_PRODUCTOS);
  if(!sh||sh.getLastRow()<2)return [];
  const n=Math.max(1,Math.min(Number(limite)||8,20));
  const total=sh.getLastRow()-1;
  const inicio=Math.max(2,sh.getLastRow()-n+1);
  const filas=sh.getRange(inicio,1,sh.getLastRow()-inicio+1,9).getValues();
  const stock=obtenerStockMap_();
  return filas.reverse().map(r=>{
    const codigo=normalizarCodigo(r[0]);
    return {codigo:codigo,nombre:r[1]||'',unidad:r[2]||'Unidades',grupo:r[3]||'General',stockMin:num(r[4]),precioCosto:num(r[5]),precioVenta:num(r[6]),imagen:r[7]||'',fechaCreacion:fechaSerializable_(r[8]),stock:stock[codigo]||0};
  }).filter(p=>p.codigo);
}

function buscarProducto(texto){
  const q=String(texto||'').toLowerCase().trim();
  return obtenerCatalogoProductos().filter(p=>(p.codigo+' '+p.nombre+' '+p.grupo).toLowerCase().includes(q)).map(p=>[p.codigo,p.nombre,p.unidad,p.grupo,p.stockMin,p.stock,p.precioCosto,p.precioVenta]);
}
function buscarProductoPorCodigo(codigo){return buscarProductosVenta(codigo).slice(0,10).map(p=>({codigo:p.codigo,nombre:p.nombre,unidad:p.unidad,grupo:p.grupo,stock:p.stock}));}
function buscarProductosVenta(texto){
  const q=String(texto||'').toLowerCase().trim();
  return obtenerCatalogoProductos().filter(p=>(p.codigo+' '+p.nombre+' '+p.grupo).toLowerCase().includes(q)).slice(0,30);
}

function registrarMovimiento(mov){
  try{requerirPerfil(['MASTER']);asegurarHojas(); if(!mov||!mov.codigo||!mov.fecha||!mov.tipo||!mov.cantidad)return 'Datos incompletos.';
    const codigo=normalizarCodigo(mov.codigo), tipo=String(mov.tipo).toUpperCase(), cantidad=Number(mov.cantidad)||0; const map=obtenerProductoMap();
    if(!map[codigo])return 'El producto no existe. Regístrelo primero.'; if(cantidad<=0)return 'La cantidad debe ser mayor a 0.';
    if(!Object.values(TIPOS_MOVIMIENTO).includes(tipo))return 'Tipo de movimiento inválido.';
    const stock=calcularStock(codigo); if((tipo==='SALIDA'||tipo==='AJUSTE_NEGATIVO')&&stock<cantidad)return `Stock insuficiente. Disponible: ${stock}, solicitado: ${cantidad}`;
    const nuevo=(tipo==='INGRESO'||tipo==='AJUSTE_POSITIVO')?stock+cantidad:stock-cantidad;
    ss().getSheetByName(HOJA_MOVIMIENTOS).appendRow([codigo,crearFecha(mov.fecha),tipo,cantidad,usuarioSistema_(),new Date(),mov.observaciones||'',Math.max(0,nuevo),mov.ventaId||'',mov.cliente||'']);
    return 'Movimiento registrado correctamente.';
  }catch(e){return 'Error al registrar movimiento: '+e.message;}
}


function registrarMovimientosMasivos(movs){
  try{
    requerirPerfil(['MASTER']);asegurarHojas();
    if(!Array.isArray(movs)||!movs.length)return {ok:false,mensaje:'No hay movimientos para guardar.'};
    const map=obtenerProductoMap(), sh=ss().getSheetByName(HOJA_MOVIMIENTOS), filas=[], errores=[], stocks={};
    movs.forEach((m,i)=>{
      const codigo=normalizarCodigo(m&&m.codigo),tipo=String(m&&m.tipo||'').toUpperCase(),cantidad=Number(m&&m.cantidad)||0;
      if(!codigo||!map[codigo]){errores.push(`Fila ${i+1}: producto no encontrado.`);return;}
      if(!m.fecha){errores.push(`Fila ${i+1}: falta la fecha.`);return;}
      if(!Object.values(TIPOS_MOVIMIENTO).includes(tipo)){errores.push(`Fila ${i+1}: tipo inválido.`);return;}
      if(cantidad<=0){errores.push(`Fila ${i+1}: cantidad inválida.`);return;}
      if(stocks[codigo]===undefined)stocks[codigo]=calcularStock(codigo);
      if((tipo==='SALIDA'||tipo==='AJUSTE_NEGATIVO')&&stocks[codigo]<cantidad){errores.push(`Fila ${i+1}: stock insuficiente para ${codigo}. Disponible ${stocks[codigo]}.`);return;}
      stocks[codigo]=(tipo==='INGRESO'||tipo==='AJUSTE_POSITIVO')?stocks[codigo]+cantidad:stocks[codigo]-cantidad;
      filas.push([codigo,crearFecha(m.fecha),tipo,cantidad,usuarioSistema_(),new Date(),String(m.observaciones||''),Math.max(0,Math.round(stocks[codigo]*100)/100),'','']);
    });
    if(errores.length)return {ok:false,mensaje:'No se guardó ningún movimiento. '+errores.join(' '),errores};
    if(filas.length)sh.getRange(sh.getLastRow()+1,1,filas.length,10).setValues(filas);
    SpreadsheetApp.flush();
    return {ok:true,mensaje:`Ingreso masivo guardado correctamente: ${filas.length} producto(s).`,registros:filas.length};
  }catch(e){return {ok:false,mensaje:'Error al guardar ingresos masivos: '+e.message};}
}

function impactoMovimientoIngreso_(tipo,cantidad){
  tipo=String(tipo||'').toUpperCase();cantidad=Number(cantidad)||0;
  return (tipo==='INGRESO'||tipo==='AJUSTE_POSITIVO')?cantidad:(tipo==='AJUSTE_NEGATIVO'?-cantidad:0);
}
function fechaInput_(v){
  if(!v)return '';
  const d=new Date(v);
  if(isNaN(d.getTime()))return '';
  return Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd');
}
function obtenerMovimientosIngreso(texto){
  requerirPerfil(['MASTER']);asegurarHojas();
  const sh=ss().getSheetByName(HOJA_MOVIMIENTOS), data=sh.getDataRange().getValues(), map=obtenerProductoMap();
  const q=String(texto||'').toLowerCase().trim(), out=[];
  for(let i=data.length-1;i>=1&&out.length<10;i--){
    const r=data[i], tipo=String(r[2]||'').toUpperCase(), ventaId=String(r[8]||'').trim();
    if(ventaId||!['INGRESO','AJUSTE_POSITIVO','AJUSTE_NEGATIVO'].includes(tipo))continue;
    const codigo=normalizarCodigo(r[0]), producto=map[codigo]?map[codigo].nombre:codigo;
    const hay=(codigo+' '+producto+' '+tipo+' '+String(r[6]||'')).toLowerCase();
    if(q&&!hay.includes(q))continue;
    out.push({fila:i+1,codigo,producto,fecha:fechaInput_(r[1]),tipo,cantidad:Number(r[3])||0,observaciones:r[6]||''});
  }
  return out;
}
function stockSinFila_(codigo,filaExcluir){
  const sh=ss().getSheetByName(HOJA_MOVIMIENTOS), data=sh.getDataRange().getValues();let total=0;
  codigo=normalizarCodigo(codigo);
  for(let i=1;i<data.length;i++){
    if(i+1===Number(filaExcluir)||normalizarCodigo(data[i][0])!==codigo)continue;
    const tipo=String(data[i][2]||'').toUpperCase(), cant=Number(data[i][3])||0;
    if(tipo==='INGRESO'||tipo==='AJUSTE_POSITIVO')total+=cant;
    else if(tipo==='SALIDA'||tipo==='AJUSTE_NEGATIVO')total-=cant;
  }
  return Math.round(total*100)/100;
}
function recalcularStockResultanteMovimientos_(){
  const sh=ss().getSheetByName(HOJA_MOVIMIENTOS), data=sh.getDataRange().getValues();if(data.length<=1)return;
  const stocks={}, valores=[];
  for(let i=1;i<data.length;i++){
    const codigo=normalizarCodigo(data[i][0]), tipo=String(data[i][2]||'').toUpperCase(), cant=Number(data[i][3])||0;
    stocks[codigo]=stocks[codigo]||0;
    if(tipo==='INGRESO'||tipo==='AJUSTE_POSITIVO')stocks[codigo]+=cant;
    else if(tipo==='SALIDA'||tipo==='AJUSTE_NEGATIVO')stocks[codigo]-=cant;
    valores.push([Math.max(0,Math.round(stocks[codigo]*100)/100)]);
  }
  sh.getRange(2,8,valores.length,1).setValues(valores);
}
function actualizarMovimientoIngreso(datos){
  try{
    requerirPerfil(['MASTER']);asegurarHojas();
    const fila=Number(datos&&datos.fila), sh=ss().getSheetByName(HOJA_MOVIMIENTOS);
    if(!fila||fila<2||fila>sh.getLastRow())return 'Movimiento no encontrado.';
    const actual=sh.getRange(fila,1,1,10).getValues()[0], ventaId=String(actual[8]||'').trim(), tipoActual=String(actual[2]||'').toUpperCase();
    if(ventaId||!['INGRESO','AJUSTE_POSITIVO','AJUSTE_NEGATIVO'].includes(tipoActual))return 'No se puede editar un movimiento de venta.';
    const codigo=normalizarCodigo(datos.codigo), tipo=String(datos.tipo||'').toUpperCase(), cantidad=Number(datos.cantidad)||0;
    if(!codigo||!datos.fecha||cantidad<=0)return 'Fecha, código y cantidad válida son obligatorios.';
    if(!['INGRESO','AJUSTE_POSITIVO','AJUSTE_NEGATIVO'].includes(tipo))return 'Tipo de movimiento inválido.';
    if(!obtenerProductoMap()[codigo])return 'El producto indicado no existe.';
    const codigoAnterior=normalizarCodigo(actual[0]);
    const stockViejo=stockSinFila_(codigoAnterior,fila);
    if(stockViejo<0)return 'No se puede modificar: dejaría stock negativo en el producto anterior.';
    const stockNuevo=stockSinFila_(codigo,fila)+impactoMovimientoIngreso_(tipo,cantidad);
    if(stockNuevo<0)return `No se puede modificar: el stock de ${codigo} quedaría negativo.`;
    sh.getRange(fila,1,1,7).setValues([[codigo,crearFecha(datos.fecha),tipo,cantidad,actual[4]||usuarioSistema_(),actual[5]||new Date(),datos.observaciones||'']]);
    recalcularStockResultanteMovimientos_();
    return 'Ingreso actualizado correctamente.';
  }catch(e){return 'Error al actualizar ingreso: '+e.message;}
}
function eliminarMovimientoIngreso(fila){
  try{
    requerirPerfil(['MASTER']);asegurarHojas();
    fila=Number(fila);const sh=ss().getSheetByName(HOJA_MOVIMIENTOS);
    if(!fila||fila<2||fila>sh.getLastRow())return 'Movimiento no encontrado.';
    const r=sh.getRange(fila,1,1,10).getValues()[0], tipo=String(r[2]||'').toUpperCase(), ventaId=String(r[8]||'').trim();
    if(ventaId||!['INGRESO','AJUSTE_POSITIVO','AJUSTE_NEGATIVO'].includes(tipo))return 'No se puede eliminar un movimiento de venta.';
    const codigo=normalizarCodigo(r[0]), stockRestante=stockSinFila_(codigo,fila);
    if(stockRestante<0)return `No se puede eliminar: el stock de ${codigo} quedaría negativo.`;
    sh.deleteRow(fila);recalcularStockResultanteMovimientos_();
    return 'Ingreso eliminado correctamente.';
  }catch(e){return 'Error al eliminar ingreso: '+e.message;}
}


function registrarClienteBasicoDesdeVenta_(nombreCompleto){
  const nombreLimpio=String(nombreCompleto||'').trim().replace(/\s+/g,' ');
  if(!nombreLimpio) return {nuevo:false,id:'',nombre:''};
  const sh=ss().getSheetByName(HOJA_CLIENTES);
  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  if(sh && sh.getLastRow()>1){
    const data=sh.getRange(2,1,sh.getLastRow()-1,3).getValues();
    for(let i=0;i<data.length;i++){
      const existente=(String(data[i][1]||'')+' '+String(data[i][2]||'')).trim();
      if(norm(existente)===norm(nombreLimpio)) return {nuevo:false,id:String(data[i][0]||''),nombre:existente};
    }
  }
  const partes=nombreLimpio.split(' ');
  const nombre=partes.shift()||nombreLimpio;
  const apellidos=partes.join(' ');
  const id='C-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
  sh.appendRow([id,nombre,apellidos,'','','','','Pendiente de regularización - creado desde venta',new Date()]);
  return {nuevo:true,id:id,nombre:nombreLimpio};
}

function registrarVenta(venta){
  requerirPerfil(['MASTER','PREVENTA']);
  const lock = LockService.getScriptLock();
  try{
    lock.waitLock(8000);
    asegurarHojas();
    if(!venta||!venta.items||!venta.items.length)return {ok:false,mensaje:'La venta no tiene productos.'};
    const solicitudId=String(venta.solicitudId||'').trim();
    const ventasSheet=ss().getSheetByName(HOJA_VENTAS);

    // Evita duplicados si el usuario presiona Finalizar varias veces o si el navegador reintenta.
    if(solicitudId && ventasSheet.getLastRow()>1){
      const ids=ventasSheet.getRange(2,9,ventasSheet.getLastRow()-1,1).getValues().flat().map(String);
      const pos=ids.indexOf(solicitudId);
      if(pos>=0){
        const fila=pos+2;
        const ventaId=ventasSheet.getRange(fila,1).getValue();
        const fecha=ventasSheet.getRange(fila,2).getValue();
        const total=ventasSheet.getRange(fila,4).getValue();
        return {ok:true,mensaje:'Venta ya registrada. Se evitó duplicarla.',ventaId,total,fecha:Utilities.formatDate(new Date(fecha),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm')};
      }
    }

    const fechaServidor = new Date();
    const cliente=String(venta.cliente||'').trim();
    if(!cliente) return {ok:false,mensaje:'El cliente es obligatorio.'};
    const clienteInfo=registrarClienteBasicoDesdeVenta_(cliente);
    const map=obtenerProductoMap();
    const movSheet=ss().getSheetByName(HOJA_MOVIMIENTOS);
    const movData=movSheet.getDataRange().getValues();
    const stockMap={};
    for(let i=1;i<movData.length;i++){
      const codigo=normalizarCodigo(movData[i][0]); if(!codigo) continue;
      const tipo=String(movData[i][2]||'').toUpperCase();
      const q=Number(movData[i][3])||0;
      stockMap[codigo]=(stockMap[codigo]||0)+((tipo==='INGRESO'||tipo==='AJUSTE_POSITIVO')?q:((tipo==='SALIDA'||tipo==='AJUSTE_NEGATIVO')?-q:0));
    }

    let total=0;
    const items=venta.items.map(it=>{
      const c=normalizarCodigo(it.codigo);
      const cant=Number(it.cantidad)||0;
      if(!map[c])throw new Error('Producto no existe: '+c);
      if(cant<=0)throw new Error('Cantidad inválida: '+c);
      const st=Math.max(0,Math.round((stockMap[c]||0)*100)/100);
      if(st<cant)throw new Error(`Stock insuficiente para ${map[c].nombre}. Disponible: ${st}`);
      const precioNormal=num(map[c].precioVenta);
      const cantidadPromo=num(map[c].cantidadPromo);
      const precioPromoTotal=num(map[c].precioPromo);
      const precioPromoUnitario=cantidadPromo>0?precioPromoTotal/cantidadPromo:0;
      const promoValida=String(map[c].promocionActiva||'NO').toUpperCase()==='SI' && cantidadPromo>=2 && precioPromoTotal>0 && precioPromoTotal<(precioNormal*cantidadPromo);
      const promocionAplicada=promoValida && cant>=cantidadPromo;
      const precio=promocionAplicada?precioPromoUnitario:precioNormal;
      const descuentoUnitario=Math.max(0,precioNormal-precio);
      total+=cant*precio;
      stockMap[c]=st-cant;
      return {codigo:c,nombre:map[c].nombre,cantidad:cant,precioVenta:precio,precioNormal:precioNormal,promocionAplicada:promocionAplicada?'SI':'NO',cantidadPromo:num(map[c].cantidadPromo),descripcionPromo:promocionAplicada?String(map[c].descripcionPromo||''):'',descuentoTotal:Math.round(descuentoUnitario*cant*100)/100,stockNuevo:Math.max(0,stockMap[c])};
    });

    const ventaId='V-'+Utilities.formatDate(fechaServidor, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
    const totalRedondeado=Math.round(total*100)/100;
    ventasSheet.appendRow([ventaId,fechaServidor,cliente,totalRedondeado,JSON.stringify(items),usuarioSistema_(),fechaServidor,venta.observaciones||'',solicitudId]);

    const usuario=usuarioSistema_();
    const obs=venta.observaciones||`Venta ${ventaId}`;
    const filas=items.map(it=>[it.codigo,fechaServidor,'SALIDA',it.cantidad,usuario,fechaServidor,obs,it.stockNuevo,ventaId,cliente]);
    if(filas.length){
      movSheet.getRange(movSheet.getLastRow()+1,1,filas.length,10).setValues(filas);
    }
    return {ok:true,mensaje:'Venta finalizada correctamente.',ventaId,total:totalRedondeado,fecha:Utilities.formatDate(fechaServidor,Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'),clienteNuevo:!!clienteInfo.nuevo,clienteId:clienteInfo.id};
  }catch(e){
    return {ok:false,mensaje:'Error al registrar venta: '+e.message};
  }finally{
    try{lock.releaseLock();}catch(err){}
  }
}

function corregirPedido(pedido){
  requerirPerfil(['MASTER','PREVENTA']);
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000); asegurarHojas(); pedido=pedido||{};
    const ventaId=String(pedido.ventaId||'').trim(), cliente=String(pedido.cliente||'').trim(), nuevos=Array.isArray(pedido.items)?pedido.items:[];
    if(!ventaId||!cliente||!nuevos.length)return {ok:false,mensaje:'Pedido, cliente y materiales son obligatorios.'};
    const ventas=ss().getSheetByName(HOJA_VENTAS), vd=ventas.getDataRange().getValues(); let fila=0, anterior=[];
    for(let i=1;i<vd.length;i++)if(String(vd[i][0])===ventaId){fila=i+1;try{anterior=JSON.parse(vd[i][4]||'[]');}catch(e){anterior=[];}break;}
    if(!fila)return {ok:false,mensaje:'Pedido no encontrado.'};
    const cobros=typeof cobranzaMap_==='function'?cobranzaMap_():{}, cobrado=Number((cobros[ventaId]||{}).totalCobrado)||0;
    const productos=obtenerProductoMap(), stock=obtenerStockMap_();
    anterior.forEach(it=>{const c=normalizarCodigo(it.codigo);stock[c]=(Number(stock[c])||0)+(Number(it.cantidad)||0);});
    let total=0;
    const normalizados=nuevos.map(it=>{const c=normalizarCodigo(it.codigo),cantidad=Number(it.cantidad)||0;if(!productos[c])throw new Error('Producto no existe: '+c);if(cantidad<=0)throw new Error('Cantidad inválida: '+c);if((Number(stock[c])||0)<cantidad)throw new Error('Stock insuficiente para '+productos[c].nombre+'. Disponible: '+(Number(stock[c])||0));const precio=num(productos[c].precioVenta);stock[c]-=cantidad;total+=cantidad*precio;return {codigo:c,nombre:productos[c].nombre,cantidad,precioVenta:precio,precioNormal:precio,promocionAplicada:'NO',cantidadPromo:0,descripcionPromo:'',descuentoTotal:0,stockNuevo:Math.max(0,stock[c])};});
    total=Math.round(total*100)/100;
    if(cobrado>total+.01)return {ok:false,mensaje:'El nuevo total no puede ser menor que lo ya cobrado ('+cobrado.toFixed(2)+').'};
    ventas.getRange(fila,3).setValue(cliente); ventas.getRange(fila,4).setValue(total); ventas.getRange(fila,5).setValue(JSON.stringify(normalizados)); ventas.getRange(fila,8).setValue(String(pedido.observaciones||''));
    const mov=ss().getSheetByName(HOJA_MOVIMIENTOS), md=mov.getDataRange().getValues();
    for(let i=md.length-1;i>=1;i--)if(String(md[i][8])===ventaId)mov.deleteRow(i+1);
    const ahora=new Date(), usuario=usuarioSistema_(), obs=String(pedido.observaciones||('Pedido corregido '+ventaId));
    const filas=normalizados.map(it=>[it.codigo,ahora,'SALIDA',it.cantidad,usuario,ahora,obs,it.stockNuevo,ventaId,cliente]);
    if(filas.length)mov.getRange(mov.getLastRow()+1,1,filas.length,10).setValues(filas);
    if(cobros[ventaId]){const c=cobros[ventaId],saldo=Math.max(0,total-cobrado),csh=ss().getSheetByName(HOJA_COBRANZA);csh.getRange(c.fila,4).setValue(cliente);csh.getRange(c.fila,5).setValue(total);csh.getRange(c.fila,15).setValue(saldo);actualizarCxC_({ventaId,cliente,totalPedido:total,totalCobrado:cobrado,fechaEntrega:c.fecha,fechaPromesa:c.fechaPromesa,medioPrometido:c.medioPrometido,estadoCobro:c.estadoCobro,observacion:c.observacion});}
    SpreadsheetApp.flush(); return {ok:true,mensaje:'Pedido actualizado correctamente.',total};
  }catch(e){return {ok:false,mensaje:'No se pudo editar el pedido: '+e.message};}
  finally{try{lock.releaseLock();}catch(err){}}
}

function calcularStock(codigo){return obtenerStockMap_()[normalizarCodigo(codigo)]||0;}
function obtenerStock(){return obtenerCatalogoProductos().map(p=>({...p,cantidad:p.stock})).sort((a,b)=>a.nombre.localeCompare(b.nombre));}
function obtenerResumen(){
  const s=obtenerStock();
  let totalClientes=0, cumpleanos=0;
  try{ const c=obtenerClientes(''); totalClientes=c.length; cumpleanos=obtenerAlertasCumpleanos().length; }catch(e){}
  return {totalProductos:s.length,totalMovimientos:Math.max(0,(ss().getSheetByName(HOJA_MOVIMIENTOS)||{getLastRow:()=>1}).getLastRow()-1),sinStock:s.filter(p=>p.cantidad<=0).length,stockBajo:s.filter(p=>p.cantidad>0&&p.cantidad<=p.stockMin&&p.stockMin>0).length,cumpleanos,totalClientes,valorTotalInventario:Math.round(s.reduce((a,p)=>a+p.cantidad*p.precioCosto,0)*100)/100};
}
function obtenerListas(){
  const unidadesDefault=['Unidades','Piezas','Cajas','Paquetes','Docenas','Kilogramos','Gramos','Litros','Metros','Rollos','Bolsas','Pares','Plancha','Set'];
  const gruposDefault=['General','Limpieza','Ferretería','Útiles','Bisutería','Piñatería','Cuchillos','Plásticos','Otros'];
  try{
    const libro=ss();
    let u=libro.getSheetByName(HOJA_UNIDADES)||libro.insertSheet(HOJA_UNIDADES);
    let g=libro.getSheetByName(HOJA_GRUPOS)||libro.insertSheet(HOJA_GRUPOS);

    if(u.getLastRow()===0){
      u.getRange(1,1,unidadesDefault.length+1,1).setValues([['Unidad'],...unidadesDefault.map(x=>[x])]);
      u.getRange(1,1).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');
    }
    if(g.getLastRow()===0){
      g.getRange(1,1,gruposDefault.length+1,1).setValues([['Grupo'],...gruposDefault.map(x=>[x])]);
      g.getRange(1,1).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');
    }

    let unidades=u.getDataRange().getValues().slice(1).map(r=>String(r[0]||'').trim()).filter(Boolean);
    let grupos=g.getDataRange().getValues().slice(1).map(r=>String(r[0]||'').trim()).filter(Boolean);

    // Corrección: si la hoja existe pero está vacía, con celdas en blanco, o mal cargada, se repone la lista base.
    if(unidades.length===0){
      u.clear();
      u.getRange(1,1,unidadesDefault.length+1,1).setValues([['Unidad'],...unidadesDefault.map(x=>[x])]);
      u.getRange(1,1).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');
      unidades=[...unidadesDefault];
    }
    if(grupos.length===0){
      g.clear();
      g.getRange(1,1,gruposDefault.length+1,1).setValues([['Grupo'],...gruposDefault.map(x=>[x])]);
      g.getRange(1,1).setBackground('#5DADE2').setFontColor('white').setFontWeight('bold');
      grupos=[...gruposDefault];
    }

    return {
      unidades:[...new Set(unidades)].sort(),
      grupos:[...new Set(grupos)].sort()
    };
  }catch(e){
    console.error('Error obtenerListas:',e);
    return {unidades:unidadesDefault,grupos:gruposDefault};
  }
}
function obtenerHistorial(filtros){
  requerirPerfil(['MASTER','COMPRADOR']);
  const sh=ss().getSheetByName(HOJA_MOVIMIENTOS); if(!sh)return [];
  const map=obtenerProductoMap(), data=sh.getDataRange().getValues();
  filtros=filtros||{};
  const d1=filtros.fechaDesde ? crearFecha(filtros.fechaDesde) : new Date(1900,0,1);
  const d2=filtros.fechaHasta ? new Date(crearFecha(filtros.fechaHasta).getTime()+86399000) : new Date(2999,11,31,23,59,59);

  // Mapa de fechas de Ventas para completar registros antiguos que quedaron sin fecha en Movimientos.
  const fechasVenta={};
  const vsh=ss().getSheetByName(HOJA_VENTAS);
  if(vsh && vsh.getLastRow()>1){
    const vd=vsh.getDataRange().getValues();
    for(let j=1;j<vd.length;j++){ if(vd[j][0] && vd[j][1]) fechasVenta[String(vd[j][0])]=vd[j][1]; }
  }

  const out=[];
  for(let i=1;i<data.length;i++){
    const r=data[i]; if(!r[0])continue;
    const ventaId=r[8]||'';
    let fechaBase=r[1] || fechasVenta[String(ventaId)] || r[5];
    if(!fechaBase) continue;
    const f=new Date(fechaBase);
    if(isNaN(f.getTime())) continue;
    const t=String(r[2]||'').toUpperCase();
    if(f>=d1 && f<=d2 && (!filtros.tipo || t===String(filtros.tipo).toUpperCase())){
      out.push({fecha:Utilities.formatDate(f,Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'),codigo:r[0],producto:(map[normalizarCodigo(r[0])]||{}).nombre||'Producto no encontrado',tipo:t,cantidad:r[3],observaciones:r[6]||'',cliente:r[9]||'',ventaId});
    }
  }
  return out.reverse();
}

function repararFechasMovimientosVenta(){
  requerirPerfil(['MASTER']);
  asegurarHojas();
  const mov=ss().getSheetByName(HOJA_MOVIMIENTOS);
  const ventas=ss().getSheetByName(HOJA_VENTAS);
  if(!mov||!ventas) return 'No hay hojas para reparar.';
  const vd=ventas.getDataRange().getValues();
  const mapa={};
  for(let i=1;i<vd.length;i++){ if(vd[i][0]&&vd[i][1]) mapa[String(vd[i][0])]=vd[i][1]; }
  const md=mov.getDataRange().getValues();
  let reparados=0;
  for(let i=1;i<md.length;i++){
    const tipo=String(md[i][2]||'').toUpperCase();
    const ventaId=String(md[i][8]||'');
    if(tipo==='SALIDA' && !md[i][1] && ventaId && mapa[ventaId]){
      mov.getRange(i+1,2).setValue(mapa[ventaId]);
      reparados++;
    }
  }
  return `Reparación finalizada. Fechas completadas: ${reparados}`;
}

function obtenerCodigoImpresionMap(){
  const sh=ss().getSheetByName(HOJA_IMPRESIONES);
  const map={};
  if(!sh || sh.getLastRow()<=1) return map;
  const data=sh.getDataRange().getValues();
  for(let i=1;i<data.length;i++){
    const codigo=String(data[i][0]||'').trim();
    const ventaId=String(data[i][1]||'').trim();
    const fecha=data[i][2];
    if(ventaId && codigo){
      map[ventaId]={codigoImpresion:codigo, fechaImpresion:fecha ? Utilities.formatDate(new Date(fecha),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm') : ''};
    }
  }
  return map;
}

function generarCodigoImpresion(ventaId){
  requerirPerfil(['MASTER','PREVENTA']);
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(8000);
    asegurarHojas();
    ventaId=String(ventaId||'').trim();
    if(!ventaId) return {ok:false,mensaje:'No se recibió la venta a imprimir.'};

    const ahora=new Date();
    const sh=ss().getSheetByName(HOJA_IMPRESIONES);

    // Si el pedido ya fue impreso, conserva exactamente la misma codificación.
    // Solo actualiza la fecha/hora de impresión para registrar la reimpresión.
    if(sh && sh.getLastRow()>1){
      const data=sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
      for(let i=0;i<data.length;i++){
        if(String(data[i][1]||'').trim()===ventaId){
          const codigoExistente=String(data[i][0]||'').trim();
          sh.getRange(i+2,3).setValue(ahora);
          sh.getRange(i+2,4).setValue(usuarioSistema_());
          sh.getRange(i+2,5).setValue(ahora);
          return {
            ok:true,
            codigo:codigoExistente,
            fechaImpresion:Utilities.formatDate(ahora,Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'),
            reimpresion:true
          };
        }
      }
    }

    // El contador es global por día, no por pedido.
    const ymd=Utilities.formatDate(ahora,Session.getScriptTimeZone(),'yyyyMMdd');
    const props=PropertiesService.getScriptProperties();
    const key='GV_PRINT_COUNTER_'+ymd;
    let n=Number(props.getProperty(key)||0);

    // Se contrasta con todos los códigos ya emitidos para impedir duplicados.
    if(sh && sh.getLastRow()>1){
      const codigos=sh.getRange(2,1,sh.getLastRow()-1,1).getValues().flat().map(String);
      codigos.forEach(c=>{
        const m=c.match(new RegExp('^GV'+ymd+'-(\\d{5})$'));
        if(m) n=Math.max(n,Number(m[1])||0);
      });
    }

    n+=1;
    props.setProperty(key,String(n));
    const codigo='GV'+ymd+'-'+String(n).padStart(5,'0');
    sh.appendRow([codigo,ventaId,ahora,usuarioSistema_(),ahora]);
    return {
      ok:true,
      codigo:codigo,
      fechaImpresion:Utilities.formatDate(ahora,Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'),
      reimpresion:false
    };
  }catch(e){
    return {ok:false,mensaje:'No se pudo generar el código de impresión: '+e.message};
  }finally{
    try{lock.releaseLock();}catch(err){}
  }
}

function obtenerEmisiones(filtros){
  requerirPerfil(['MASTER','PREVENTA']);
  asegurarHojas();
  filtros=filtros||{};
  const vsh=ss().getSheetByName(HOJA_VENTAS);
  if(!vsh || vsh.getLastRow()<=1) return [];
  const map=obtenerProductoMap();
  const impresiones=obtenerCodigoImpresionMap();
  const data=vsh.getDataRange().getValues();
  const d1=filtros.fechaDesde ? crearFecha(filtros.fechaDesde) : new Date(1900,0,1);
  const d2=filtros.fechaHasta ? new Date(crearFecha(filtros.fechaHasta).getTime()+86399000) : new Date(2999,11,31,23,59,59);
  const q=String(filtros.texto||'').toLowerCase().trim();
  const out=[];
  for(let i=1;i<data.length;i++){
    const r=data[i];
    const ventaId=String(r[0]||'');
    if(!ventaId) continue;
    const fecha=new Date(r[1]||r[6]);
    if(isNaN(fecha.getTime())) continue;
    if(fecha<d1 || fecha>d2) continue;
    const cliente=String(r[2]||'Cliente mostrador');
    const obs=String(r[7]||'');
    let items=[];
    try{ items=JSON.parse(String(r[4]||'[]')); }catch(e){ items=[]; }
    items=items.map(it=>{
      const codigo=normalizarCodigo(it.codigo);
      const prod=map[codigo]||{};
      const cantidad=Number(it.cantidad)||0;
      const precio=Number(it.precioVenta||prod.precioVenta)||0;
      return {
        codigo:codigo,
        nombre:String(it.nombre||prod.nombre||'Producto no encontrado'),
        cantidad:cantidad,
        precioUnitario:Math.round(precio*100)/100,
        precioNormal:Math.round((Number(it.precioNormal)||precio)*100)/100,
        promocionAplicada:String(it.promocionAplicada||'NO').toUpperCase(),
        descripcionPromo:String(it.descripcionPromo||''),
        descuentoTotal:Math.round((Number(it.descuentoTotal)||0)*100)/100,
        subtotal:Math.round(cantidad*precio*100)/100,
        imagen:prod.imagen||it.imagen||''
      };
    });
    const textoBuscar=(ventaId+' '+cliente+' '+obs+' '+items.map(x=>x.codigo+' '+x.nombre).join(' ')).toLowerCase();
    if(q && !textoBuscar.includes(q)) continue;
    out.push({
      ventaId:ventaId,
      codigoImpresion:(impresiones[ventaId]||{}).codigoImpresion||'',
      fechaImpresion:(impresiones[ventaId]||{}).fechaImpresion||'',
      fecha:Utilities.formatDate(fecha,Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm'),
      fechaOrden:fecha.getTime(),
      cliente:cliente,
      observaciones:obs,
      total:Math.round((Number(r[3])||items.reduce((a,x)=>a+x.subtotal,0))*100)/100,
      itemsCount:items.reduce((a,x)=>a+(Number(x.cantidad)||0),0),
      lineas:items.length,
      items:items
    });
  }
  return out.sort((a,b)=>b.fechaOrden-a.fechaOrden);
}



function obtenerAnalisis(tipo, filtros){
  requerirPerfil(['MASTER','COMPRADOR']);
  asegurarHojas();
  filtros=filtros||{};
  tipo=String(tipo||'general').toLowerCase();
  const vsh=ss().getSheetByName(HOJA_VENTAS);
  if(!vsh || vsh.getLastRow()<=1) return {topProductos:[], topClientes:[], totalVentas:0, totalItems:0, totalImporte:0};
  const map=obtenerProductoMap();
  const data=vsh.getDataRange().getValues();
  const d1=filtros.fechaDesde ? crearFecha(filtros.fechaDesde) : new Date(new Date().getFullYear(),0,1);
  const d2=filtros.fechaHasta ? new Date(crearFecha(filtros.fechaHasta).getTime()+86399000) : new Date(new Date().getFullYear(),11,31,23,59,59);
  const texto=String(filtros.texto||'').toLowerCase().trim();
  const clientes={};
  const productos={};
  let totalVentas=0,totalItems=0,totalImporte=0;
  for(let i=1;i<data.length;i++){
    const r=data[i];
    const ventaId=String(r[0]||'');
    const fecha=new Date(r[1]||r[6]);
    if(!ventaId || isNaN(fecha.getTime()) || fecha<d1 || fecha>d2) continue;
    const cliente=String(r[2]||'Cliente mostrador').trim()||'Cliente mostrador';
    let items=[];
    try{items=JSON.parse(String(r[4]||'[]'));}catch(e){items=[];}
    let ventaTotal=0, ventaItems=0;
    const textoItems=items.map(it=>String(it.codigo||'')+' '+String(it.nombre||'')).join(' ').toLowerCase();
    if(texto && tipo==='cliente' && !cliente.toLowerCase().includes(texto)) continue;
    if(texto && tipo==='producto' && !textoItems.includes(texto)) continue;
    items.forEach(it=>{
      const codigo=normalizarCodigo(it.codigo);
      const prod=map[codigo]||{};
      const nombre=String(it.nombre||prod.nombre||codigo||'Producto no encontrado');
      const cant=Number(it.cantidad)||0;
      const precio=Number(it.precioVenta||prod.precioVenta)||0;
      const subtotal=Math.round(cant*precio*100)/100;
      ventaTotal+=subtotal; ventaItems+=cant;
      if(!productos[codigo]) productos[codigo]={codigo:codigo,nombre:nombre,cantidad:0,total:0,ventas:0};
      productos[codigo].cantidad+=cant;
      productos[codigo].total+=subtotal;
      productos[codigo].ventas+=1;
    });
    totalVentas++;
    totalItems+=ventaItems;
    totalImporte+=ventaTotal;
    if(!clientes[cliente]) clientes[cliente]={cliente:cliente,ventas:0,items:0,total:0};
    clientes[cliente].ventas+=1;
    clientes[cliente].items+=ventaItems;
    clientes[cliente].total+=ventaTotal;
  }
  const topProductos=Object.values(productos).map(x=>({...x,total:Math.round(x.total*100)/100})).sort((a,b)=>b.total-a.total).slice(0,10);
  const topClientes=Object.values(clientes).map(x=>({...x,total:Math.round(x.total*100)/100})).sort((a,b)=>b.total-a.total).slice(0,10);
  return {topProductos,topClientes,totalVentas,totalItems,totalImporte:Math.round(totalImporte*100)/100};
}

function validarIntegridad(){
  requerirPerfil(['MASTER']);
  const errores=[];
  try{
    asegurarHojas();
    const p=ss().getSheetByName(HOJA_PRODUCTOS).getDataRange().getValues();
    const vistos={};
    for(let i=1;i<p.length;i++){
      const c=normalizarCodigo(p[i][0]);
      if(!c)continue;
      if(vistos[c])errores.push('Código duplicado en Productos: '+c);
      vistos[c]=true;
      if(!p[i][1])errores.push('Producto sin nombre: '+c);
      if(Number(p[i][6])<0)errores.push('Precio de venta negativo: '+c);
    }
    const m=ss().getSheetByName(HOJA_MOVIMIENTOS).getDataRange().getValues();
    for(let i=1;i<m.length;i++){
      const c=normalizarCodigo(m[i][0]);
      if(!c)continue;
      if(!vistos[c])errores.push('Movimiento con producto no registrado: '+c+' fila '+(i+1));
      if(!m[i][1])errores.push('Movimiento sin fecha: '+c+' fila '+(i+1));
      if((Number(m[i][3])||0)<=0)errores.push('Movimiento con cantidad inválida: '+c+' fila '+(i+1));
    }
  }catch(e){errores.push('Error al validar: '+e.message);}
  return {errores};
}
function exportarStockCSV(){return null;}

// ================= QASO V5.0 - CENTRO GERENCIAL FINANCIERO =================
const HOJA_FIN_MOVIMIENTOS='Finanzas_Movimientos';
const HOJA_FIN_ACTIVOS='Finanzas_Activos';
const HOJA_FIN_PASIVOS='Finanzas_Pasivos';
const HOJA_FIN_CONFIG='Finanzas_Config';

function asegurarHojasFinancieras_(){
  const libro=ss();
  const defs=[
    [HOJA_FIN_MOVIMIENTOS,['ID','Fecha','Tipo','Categoría','Descripción','Monto','Medio','Unidad de Negocio','Estado','Usuario','Timestamp']],
    [HOJA_FIN_ACTIVOS,['ID','Fecha','Tipo de Activo','Descripción','Valor','Depreciación Acumulada','Unidad de Negocio','Estado','Usuario','Timestamp']],
    [HOJA_FIN_PASIVOS,['ID','Fecha','Tipo de Pasivo','Descripción','Saldo','Cuota Mensual','Tasa Anual %','Vencimiento','Unidad de Negocio','Estado','Usuario','Timestamp']],
    [HOJA_FIN_CONFIG,['Parámetro','Valor','Descripción']]
  ];
  defs.forEach(d=>{
    let sh=libro.getSheetByName(d[0])||libro.insertSheet(d[0]);
    if(sh.getLastRow()===0){
      sh.getRange(1,1,1,d[1].length).setValues([d[1]]).setBackground('#173f55').setFontColor('white').setFontWeight('bold');
      sh.autoResizeColumns(1,d[1].length);
    }
  });
  const cfg=libro.getSheetByName(HOJA_FIN_CONFIG);
  if(cfg.getLastRow()===1){
    cfg.getRange(2,1,6,3).setValues([
      ['CAJA_INICIAL',0,'Saldo de caja y bancos al iniciar el control financiero'],
      ['CUENTAS_COBRAR',0,'Ventas pendientes de cobro no registradas automáticamente'],
      ['CUENTAS_PAGAR',0,'Obligaciones comerciales pendientes no registradas como pasivo'],
      ['IMPUESTO_PORCENTAJE',1.5,'Tasa referencial editable para estimación gerencial'],
      ['META_MARGEN_BRUTO',25,'Meta mínima de margen bruto (%)'],
      ['MESES_RESERVA',3,'Meses de gastos operativos que debe cubrir la reserva']
    ]);
  }
  return true;
}



// QASO V8 - Carga masiva de inventario
function validarCargaMasivaInventario(filas){return procesarCargaMasivaInventario_(filas,false);}
function importarCargaMasivaInventario(filas){return procesarCargaMasivaInventario_(filas,true);}
function procesarCargaMasivaInventario_(filas,confirmar){
  requerirPerfil(['MASTER']);asegurarHojas();
  filas=Array.isArray(filas)?filas:[];
  if(!filas.length)return {ok:false,validos:0,errores:1,omitidos:0,detalle:[],mensaje:'No existen filas con cantidad para procesar.'};
  const lock=LockService.getScriptLock();
  try{
    if(confirmar)lock.waitLock(20000);
    const productos=obtenerProductoMap(),stocks=obtenerStockMap_(),detalle=[],movimientos=[],costos={},codigosFila={};
    let validos=0,errores=0,omitidos=0;
    for(let i=0;i<filas.length;i++){
      const r=filas[i]||{},fila=Number(r.filaExcel)||i+2,codigo=normalizarCodigo(r.codigo),p=productos[codigo];
      let tipo=String(r.tipo||'INGRESO').trim().toUpperCase().replace(/\s+/g,' ');
      if(tipo==='STOCK FINAL'||tipo==='AJUSTE DE STOCK'||tipo==='AJUSTE ABSOLUTO')tipo='AJUSTE';
      const cantidadCarga=Number(r.cantidadCarga)||0,factor=Number(r.factor)||1,cantidadBase=Math.round(cantidadCarga*factor*10000)/10000;
      const antes=Math.round((stocks[codigo]||0)*10000)/10000;let despues=antes,tipoReal='',cantidadReal=0,mensaje='',estado='CORRECTO';
      if(!cantidadCarga){omitidos++;continue;}
      if(!codigo||!p){estado='ERROR';mensaje='Código inexistente en la base de productos.';}
      else if(codigosFila[codigo]){estado='ERROR';mensaje='Código duplicado en el archivo (también en fila '+codigosFila[codigo]+'). Consolide la cantidad en una sola fila.';}
      else if(cantidadCarga<=0||factor<=0||cantidadBase<=0){estado='ERROR';mensaje='Cantidad y factor deben ser mayores a cero.';}
      else if(tipo==='INGRESO'){tipoReal='INGRESO';cantidadReal=cantidadBase;despues=antes+cantidadReal;}
      else if(tipo==='SALIDA'){tipoReal='SALIDA';cantidadReal=cantidadBase;despues=antes-cantidadReal;if(despues<0){estado='ERROR';mensaje='Stock insuficiente. Disponible: '+antes;}}
      else if(tipo==='AJUSTE'){
        despues=cantidadBase;const dif=Math.round((despues-antes)*10000)/10000;
        tipoReal=dif>=0?'AJUSTE_POSITIVO':'AJUSTE_NEGATIVO';cantidadReal=Math.abs(dif);
        if(cantidadReal===0){estado='OMITIDO';mensaje='El stock final ya coincide con el stock actual.';omitidos++;}
      }else{estado='ERROR';mensaje='Tipo inválido. Use INGRESO, SALIDA o AJUSTE.';}
      if(estado==='CORRECTO'){
        validos++;codigosFila[codigo]=fila;stocks[codigo]=Math.max(0,Math.round(despues*10000)/10000);
        movimientos.push([codigo,crearFecha(r.fecha),tipoReal,cantidadReal,usuarioSistema_(),new Date(),String(r.observacion||'Carga masiva de inventario'),stocks[codigo],'','']);
        const costo=Number(r.costoCompra)||0;if(costo>0)costos[codigo]=costo;
      }else if(estado==='ERROR')errores++;
      detalle.push({fila:mesaFila_(fila),codigo:codigo,producto:p?p.nombre:String(r.producto||''),tipo:tipo,cantidadCarga:cantidadCarga,factor:factor,cantidadBase:cantidadBase,stockAntes:antes,stockDespues:Math.max(0,Math.round(despues*10000)/10000),estado:estado,mensaje:mensaje});
    }
    if(errores)return {ok:false,validos:validos,errores:errores,omitidos:omitidos,detalle:detalle,mensaje:'Se encontraron '+errores+' error(es). No se modificó el inventario.'};
    if(!validos)return {ok:false,validos:0,errores:0,omitidos:omitidos,detalle:detalle,mensaje:'No hay movimientos válidos para importar.'};
    if(confirmar){
      const shMov=ss().getSheetByName(HOJA_MOVIMIENTOS),inicio=shMov.getLastRow()+1;
      shMov.getRange(inicio,1,movimientos.length,10).setValues(movimientos);
      if(Object.keys(costos).length){
        const shP=ss().getSheetByName(HOJA_PRODUCTOS),data=shP.getRange(2,1,Math.max(0,shP.getLastRow()-1),7).getValues();
        const updates=[];for(let j=0;j<data.length;j++){const c=normalizarCodigo(data[j][0]);if(costos[c])updates.push({fila:j+2,costo:costos[c]});}
        updates.forEach(u=>shP.getRange(u.fila,6).setValue(u.costo));
      }
      SpreadsheetApp.flush();
      return {ok:true,validos:validos,errores:0,omitidos:omitidos,detalle:detalle,mensaje:'Importación finalizada correctamente. '+validos+' movimiento(s) registrados.'};
    }
    return {ok:true,validos:validos,errores:0,omitidos:omitidos,detalle:detalle,mensaje:'Validación correcta. Puede importar '+validos+' movimiento(s).'};
  }catch(e){return {ok:false,validos:0,errores:1,omitidos:0,detalle:[],mensaje:'Error en carga masiva: '+e.message};}
  finally{if(confirmar){try{lock.releaseLock();}catch(e){}}}
}
function mesaFila_(n){return Number(n)||0;}

function registrarMovimientoFinanciero(d){
  requerirPerfil(['MASTER']); asegurarHojasFinancieras_(); d=d||{};
  const tipo=String(d.tipo||'').toUpperCase();
  if(!['INGRESO','GASTO'].includes(tipo)) return 'Tipo financiero inválido.';
  const monto=Number(d.monto)||0; if(monto<=0)return 'El monto debe ser mayor que cero.';
  const id='FM-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
  ss().getSheetByName(HOJA_FIN_MOVIMIENTOS).appendRow([id,crearFecha(d.fecha),tipo,String(d.categoria||'OTROS'),String(d.descripcion||''),monto,String(d.medio||'CAJA'),String(d.unidad||'DISTRIBUCIÓN'),String(d.estado||'PAGADO').toUpperCase(),usuarioSistema_(),new Date()]);
  return 'Movimiento financiero registrado correctamente.';
}
function registrarActivoFinanciero(d){
  requerirPerfil(['MASTER']); asegurarHojasFinancieras_(); d=d||{}; const valor=Number(d.valor)||0;if(valor<=0)return 'El valor debe ser mayor que cero.';
  const id='FA-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
  ss().getSheetByName(HOJA_FIN_ACTIVOS).appendRow([id,crearFecha(d.fecha),String(d.tipo||'OTRO'),String(d.descripcion||''),valor,Number(d.depreciacion)||0,String(d.unidad||'DISTRIBUCIÓN'),String(d.estado||'ACTIVO'),usuarioSistema_(),new Date()]);
  return 'Activo registrado correctamente.';
}
function registrarPasivoFinanciero(d){
  requerirPerfil(['MASTER']); asegurarHojasFinancieras_(); d=d||{}; const saldo=Number(d.saldo)||0;if(saldo<=0)return 'El saldo debe ser mayor que cero.';
  const id='FP-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
  ss().getSheetByName(HOJA_FIN_PASIVOS).appendRow([id,crearFecha(d.fecha),String(d.tipo||'PRÉSTAMO'),String(d.descripcion||''),saldo,Number(d.cuota)||0,Number(d.tasa)||0,d.vencimiento?crearFecha(d.vencimiento):'',String(d.unidad||'DISTRIBUCIÓN'),String(d.estado||'VIGENTE'),usuarioSistema_(),new Date()]);
  return 'Pasivo registrado correctamente.';
}
function guardarConfigFinanciera(config){
  requerirPerfil(['MASTER']); asegurarHojasFinancieras_(); config=config||{}; const sh=ss().getSheetByName(HOJA_FIN_CONFIG); const data=sh.getDataRange().getValues();
  Object.keys(config).forEach(k=>{let found=false;for(let i=1;i<data.length;i++){if(String(data[i][0])===k){sh.getRange(i+1,2).setValue(Number(config[k])||0);found=true;break;}}if(!found)sh.appendRow([k,Number(config[k])||0,'']);});
  return 'Configuración financiera guardada correctamente.';
}
function configFinancieraMap_(){asegurarHojasFinancieras_();const d=ss().getSheetByName(HOJA_FIN_CONFIG).getDataRange().getValues();const o={};for(let i=1;i<d.length;i++)o[String(d[i][0])]=Number(d[i][1])||0;return o;}
function dentroPeriodo_(v,d1,d2){const f=new Date(v);return !isNaN(f.getTime())&&f>=d1&&f<=d2;}
function obtenerCentroGerencial(filtros){
  requerirPerfil(['MASTER']); asegurarHojas(); asegurarHojasFinancieras_(); filtros=filtros||{};
  const ahora=new Date(); const d1=filtros.fechaDesde?crearFecha(filtros.fechaDesde):new Date(ahora.getFullYear(),ahora.getMonth(),1); const d2=filtros.fechaHasta?new Date(crearFecha(filtros.fechaHasta).getTime()+86399000):new Date(ahora.getFullYear(),ahora.getMonth()+1,0,23,59,59);
  const cfg=configFinancieraMap_(); const productos=obtenerProductoMap(); const ventasSh=ss().getSheetByName(HOJA_VENTAS); const ventasData=ventasSh.getDataRange().getValues();
  let ventas=0,costoVentas=0,unidades=0,numeroVentas=0;
  for(let i=1;i<ventasData.length;i++){
    const r=ventasData[i]; if(!dentroPeriodo_(r[1]||r[6],d1,d2))continue; numeroVentas++; ventas+=Number(r[3])||0;
    let items=[];try{items=JSON.parse(String(r[4]||'[]'));}catch(e){}
    items.forEach(it=>{const c=normalizarCodigo(it.codigo),q=Number(it.cantidad)||0;unidades+=q;costoVentas+=q*(Number((productos[c]||{}).precioCosto)||0);});
  }
  const fm=ss().getSheetByName(HOJA_FIN_MOVIMIENTOS).getDataRange().getValues(); let otrosIngresos=0,gastos=0,cobros=0,pagos=0; const gastosCategoria={};
  for(let i=1;i<fm.length;i++){const r=fm[i];if(!dentroPeriodo_(r[1],d1,d2))continue;const tipo=String(r[2]).toUpperCase(),cat=String(r[3]||'OTROS'),m=Number(r[5])||0,estado=String(r[8]).toUpperCase();if(tipo==='INGRESO'){otrosIngresos+=m;if(estado==='PAGADO'||estado==='COBRADO')cobros+=m;}else{gastos+=m;gastosCategoria[cat]=(gastosCategoria[cat]||0)+m;if(estado==='PAGADO')pagos+=m;}}
  const utilidadBruta=ventas-costoVentas; const utilidadOperativa=utilidadBruta+otrosIngresos-gastos; const impuesto=Math.max(0,utilidadOperativa)*(cfg.IMPUESTO_PORCENTAJE||0)/100; const utilidadNeta=utilidadOperativa-impuesto;
  const stock=obtenerStock(); const inventario=stock.reduce((a,p)=>a+(Number(p.cantidad)||0)*(Number(p.precioCosto)||0),0);
  const act=ss().getSheetByName(HOJA_FIN_ACTIVOS).getDataRange().getValues();let activosFijos=0;for(let i=1;i<act.length;i++)if(String(act[i][7]).toUpperCase()!=='BAJA')activosFijos+=Math.max(0,(Number(act[i][4])||0)-(Number(act[i][5])||0));
  const pas=ss().getSheetByName(HOJA_FIN_PASIVOS).getDataRange().getValues();let pasivos=0,cuotas=0;for(let i=1;i<pas.length;i++)if(String(pas[i][9]).toUpperCase()!=='CANCELADO'){pasivos+=Number(pas[i][4])||0;cuotas+=Number(pas[i][5])||0;}
  const caja=(cfg.CAJA_INICIAL||0)+ventas+otrosIngresos-gastos; const cuentasCobrar=cfg.CUENTAS_COBRAR||0; const cuentasPagar=cfg.CUENTAS_PAGAR||0; const activoCorriente=caja+cuentasCobrar+inventario; const totalActivos=activoCorriente+activosFijos; const totalPasivos=pasivos+cuentasPagar; const patrimonio=totalActivos-totalPasivos; const capitalTrabajo=activoCorriente-cuentasPagar; const endeudamiento=totalActivos>0?totalPasivos/totalActivos*100:0;
  const margenBruto=ventas>0?utilidadBruta/ventas*100:0,margenNeto=ventas>0?utilidadNeta/ventas*100:0,liquidez=cuentasPagar>0?activoCorriente/cuentasPagar:activoCorriente>0?99:0;
  const gastoMensual=gastos||0; const mesesCaja=gastoMensual>0?Math.max(0,caja/gastoMensual):99; let score=100; if(margenBruto<(cfg.META_MARGEN_BRUTO||25))score-=20;if(margenNeto<5)score-=15;if(endeudamiento>35)score-=20;if(capitalTrabajo<0)score-=25;if(mesesCaja<(cfg.MESES_RESERVA||3))score-=20;score=Math.max(0,score);
  const recomendaciones=[];if(margenBruto<(cfg.META_MARGEN_BRUTO||25))recomendaciones.push('Revisar precios de venta y costos de los productos con menor margen.');if(capitalTrabajo<0)recomendaciones.push('Detener inversiones no urgentes y reforzar cobranza o negociación con proveedores.');if(endeudamiento>35)recomendaciones.push('No asumir nuevas deudas hasta reducir el ratio de endeudamiento.');if(mesesCaja<(cfg.MESES_RESERVA||3))recomendaciones.push('Construir una reserva de caja antes de comprar nuevos activos.');if(inventario>ventas*1.5&&ventas>0)recomendaciones.push('Existe capital elevado en inventario; priorice liquidar productos lentos.');if(!recomendaciones.length)recomendaciones.push('La estructura financiera se encuentra estable para el periodo evaluado.');
  return {periodo:{desde:Utilities.formatDate(d1,Session.getScriptTimeZone(),'dd/MM/yyyy'),hasta:Utilities.formatDate(d2,Session.getScriptTimeZone(),'dd/MM/yyyy')},pyg:{ventas,costoVentas,utilidadBruta,otrosIngresos,gastos,utilidadOperativa,impuesto,utilidadNeta,margenBruto,margenNeto},flujo:{cajaInicial:cfg.CAJA_INICIAL||0,entradas:ventas+otrosIngresos,salidas:gastos,cajaFinal:caja,cuotasMensuales:cuotas,mesesCaja},balance:{caja,cuentasCobrar,inventario,activosFijos,totalActivos,cuentasPagar,pasivos,totalPasivos,patrimonio},capital:{activoCorriente,pasivoCorriente:cuentasPagar,capitalTrabajo,liquidez},deuda:{endeudamiento,totalPasivos,totalActivos},operacion:{numeroVentas,unidades,ticketPromedio:numeroVentas?ventas/numeroVentas:0},score,recomendaciones,gastosCategoria,config:cfg};
}


// ================= QASO V5.1 - PLANEAMIENTO FINANCIERO =================
const HOJA_FIN_PRESUPUESTO='Finanzas_Presupuesto';
const HOJA_FIN_OBJETIVOS='Finanzas_Objetivos';
function asegurarPlaneamientoFinanciero_(){
  asegurarHojasFinancieras_();const libro=ss();
  const defs=[
    [HOJA_FIN_PRESUPUESTO,['ID','Periodo','Tipo de Flujo','Categoría','Concepto','S1','S2','S3','S4','Unidad de Negocio','Usuario','Timestamp']],
    [HOJA_FIN_OBJETIVOS,['ID','Objetivo','Monto Meta','Fecha Objetivo','Prioridad','Fuente','Ahorro Asignado','Unidad de Negocio','Estado','Usuario','Timestamp']]
  ];
  defs.forEach(d=>{let sh=libro.getSheetByName(d[0])||libro.insertSheet(d[0]);if(sh.getLastRow()===0){sh.getRange(1,1,1,d[1].length).setValues([d[1]]).setBackground('#173f55').setFontColor('white').setFontWeight('bold');sh.setFrozenRows(1);sh.autoResizeColumns(1,d[1].length);}});return true;
}
function periodoValido_(p){return /^\d{4}-\d{2}$/.test(String(p||''));}
function guardarPlaneamientoFinanciero(payload){
  requerirPerfil(['MASTER']);asegurarPlaneamientoFinanciero_();payload=payload||{};const periodo=String(payload.periodo||'');if(!periodoValido_(periodo))return 'Periodo inválido.';const filas=Array.isArray(payload.filas)?payload.filas:[];const sh=ss().getSheetByName(HOJA_FIN_PRESUPUESTO),data=sh.getDataRange().getValues();
  for(let i=data.length-1;i>=1;i--)if(String(data[i][1])===periodo)sh.deleteRow(i+1);
  const vals=filas.filter(r=>String(r.concepto||'').trim()).map(r=>['P-'+periodo+'-'+Utilities.getUuid().slice(0,8),periodo,String(r.tipo||'OPERACIÓN GASTO').toUpperCase(),String(r.categoria||'OTROS'),String(r.concepto||''),Number(r.s1)||0,Number(r.s2)||0,Number(r.s3)||0,Number(r.s4)||0,String(r.unidad||'DISTRIBUCIÓN'),usuarioSistema_(),new Date()]);
  if(vals.length)sh.getRange(sh.getLastRow()+1,1,vals.length,vals[0].length).setValues(vals);return 'Presupuesto guardado correctamente.';
}
function obtenerObjetivosEstrategicos_(){asegurarPlaneamientoFinanciero_();const d=ss().getSheetByName(HOJA_FIN_OBJETIVOS).getDataRange().getValues(),tz=Session.getScriptTimeZone(),out=[];for(let i=1;i<d.length;i++){if(String(d[i][8]).toUpperCase()==='CANCELADO')continue;out.push({id:d[i][0],nombre:d[i][1],monto:Number(d[i][2])||0,fecha:d[i][3] instanceof Date?Utilities.formatDate(d[i][3],tz,'yyyy-MM-dd'):String(d[i][3]||''),prioridad:d[i][4],fuente:d[i][5],ahorro:Number(d[i][6])||0,unidad:d[i][7],estado:d[i][8]});}return out;}
function guardarObjetivoEstrategico(d){requerirPerfil(['MASTER']);asegurarPlaneamientoFinanciero_();d=d||{};const nombre=String(d.nombre||'').trim(),monto=Number(d.monto)||0;if(!nombre)return 'Ingrese el nombre del objetivo.';if(monto<=0)return 'El monto meta debe ser mayor que cero.';ss().getSheetByName(HOJA_FIN_OBJETIVOS).appendRow(['OBJ-'+Utilities.getUuid().slice(0,8).toUpperCase(),nombre,monto,d.fecha?crearFecha(d.fecha):'',String(d.prioridad||'MEDIA'),String(d.fuente||'CAPITAL PROPIO'),Number(d.ahorro)||0,String(d.unidad||'DISTRIBUCIÓN'),'ACTIVO',usuarioSistema_(),new Date()]);return 'Objetivo guardado correctamente.';}
function duplicarPlaneamientoMesAnterior(periodo){requerirPerfil(['MASTER']);asegurarPlaneamientoFinanciero_();if(!periodoValido_(periodo))return 'Periodo inválido.';const a=periodo.split('-').map(Number),prev=new Date(a[0],a[1]-2,1),pAnt=Utilities.formatDate(prev,Session.getScriptTimeZone(),'yyyy-MM'),sh=ss().getSheetByName(HOJA_FIN_PRESUPUESTO),d=sh.getDataRange().getValues(),filas=[];for(let i=1;i<d.length;i++)if(String(d[i][1])===pAnt)filas.push({tipo:d[i][2],categoria:d[i][3],concepto:d[i][4],s1:d[i][5],s2:d[i][6],s3:d[i][7],s4:d[i][8],unidad:d[i][9]});if(!filas.length)return 'No existe presupuesto en '+pAnt+' para duplicar.';return guardarPlaneamientoFinanciero({periodo:periodo,filas:filas});}
function obtenerPlaneamientoFinanciero(periodo){
  requerirPerfil(['MASTER']);asegurarPlaneamientoFinanciero_();if(!periodoValido_(periodo)){const h=new Date();periodo=Utilities.formatDate(h,Session.getScriptTimeZone(),'yyyy-MM');}
  const sh=ss().getSheetByName(HOJA_FIN_PRESUPUESTO),d=sh.getDataRange().getValues(),filas=[];for(let i=1;i<d.length;i++)if(String(d[i][1])===periodo)filas.push({id:d[i][0],tipo:String(d[i][2]),categoria:String(d[i][3]),concepto:String(d[i][4]),s1:Number(d[i][5])||0,s2:Number(d[i][6])||0,s3:Number(d[i][7])||0,s4:Number(d[i][8])||0,unidad:String(d[i][9]||'DISTRIBUCIÓN')});
  let ingresosOperativos=0,gastosOperativos=0,inversion=0,finEntrada=0,finSalida=0;filas.forEach(r=>{const t=r.s1+r.s2+r.s3+r.s4;if(r.tipo==='OPERACIÓN INGRESO')ingresosOperativos+=t;else if(r.tipo==='OPERACIÓN GASTO')gastosOperativos+=t;else if(r.tipo==='INVERSIÓN')inversion+=t;else if(r.tipo==='FINANCIAMIENTO ENTRADA')finEntrada+=t;else if(r.tipo==='FINANCIAMIENTO SALIDA')finSalida+=t;});
  const cfg=configFinancieraMap_(),margen=(cfg.META_MARGEN_BRUTO||25)/100,puntoEquilibrio=margen>0?gastosOperativos/margen:0,flujoOperativo=ingresosOperativos-gastosOperativos,flujoTotal=flujoOperativo-inversion+finEntrada-finSalida,capitalTrabajoInicial=Math.max(0,finEntrada-inversion),cajaFinal=(cfg.CAJA_INICIAL||0)+flujoTotal,recomendaciones=[];
  if(inversion>0&&capitalTrabajoInicial<gastosOperativos*3)recomendaciones.push('Después de la inversión, la reserva no cubre 3 meses de gastos operativos. Considere aumentar capital o postergar parte de la compra.');
  if(ingresosOperativos<puntoEquilibrio)recomendaciones.push('Los ingresos proyectados no alcanzan el punto de equilibrio. Debe aumentar cobranza/ventas o reducir gastos.');
  if(gastosOperativos>0&&2300/gastosOperativos>0.45)recomendaciones.push('La cuota vehicular tiene un peso alto sobre los gastos. El camión debe generar ahorro o ingresos adicionales medibles.');
  if(cajaFinal<0)recomendaciones.push('La caja final sería negativa. No ejecute el presupuesto sin corregir el déficit.');
  if(!recomendaciones.length)recomendaciones.push('El presupuesto mantiene caja positiva y cubre el punto de equilibrio proyectado.');
  return {periodo:periodo,filas:filas,resumen:{capitalTrabajoInicial,ingresosOperativos,gastosOperativos,flujoOperativo,inversion,financiamientoNeto:finEntrada-finSalida,flujoTotal,cajaFinal,puntoEquilibrio},recomendaciones:recomendaciones,objetivos:obtenerObjetivosEstrategicos_()};
}


// ================= QASO V5.2 - CORTES Y ANÁLISIS DE VENTAS =================
function obtenerAnalisisVentasTemporal(tipo, fechaRef){
  requerirPerfil(['MASTER']); asegurarHojas();
  tipo=String(tipo||'MENSUAL').toUpperCase();
  const tz=Session.getScriptTimeZone();
  let ref=fechaRef?crearFecha(fechaRef):new Date();
  if(!(ref instanceof Date)||isNaN(ref)) ref=new Date();
  const sh=ss().getSheetByName(HOJA_VENTAS), data=sh.getDataRange().getValues();
  const ventas=[];
  for(let i=1;i<data.length;i++){
    const f=crearFecha(data[i][1]||data[i][6]);
    if(!(f instanceof Date)||isNaN(f))continue;
    ventas.push({fecha:f,total:Number(data[i][3])||0});
  }
  let etiquetas=[], valores=[], titulo='', desde, hasta;
  if(tipo==='DIARIO'){
    desde=new Date(ref.getFullYear(),ref.getMonth(),1); hasta=new Date(ref.getFullYear(),ref.getMonth()+1,0,23,59,59);
    const dias=hasta.getDate(); etiquetas=Array.from({length:dias},(_,i)=>String(i+1).padStart(2,'0'));
    valores=Array(dias).fill(0); ventas.forEach(v=>{if(v.fecha>=desde&&v.fecha<=hasta)valores[v.fecha.getDate()-1]+=v.total});
    titulo='Ventas diarias - '+Utilities.formatDate(ref,tz,'MMMM yyyy');
  }else if(tipo==='SEMANAL'){
    desde=new Date(ref.getFullYear(),ref.getMonth(),1); hasta=new Date(ref.getFullYear(),ref.getMonth()+1,0,23,59,59);
    etiquetas=['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5']; valores=[0,0,0,0,0];
    ventas.forEach(v=>{if(v.fecha>=desde&&v.fecha<=hasta){const w=Math.min(4,Math.floor((v.fecha.getDate()-1)/7));valores[w]+=v.total;}});
    titulo='Ventas semanales - '+Utilities.formatDate(ref,tz,'MMMM yyyy');
  }else if(tipo==='ANUAL'){
    const años={}; ventas.forEach(v=>{const a=v.fecha.getFullYear();años[a]=(años[a]||0)+v.total});
    etiquetas=Object.keys(años).sort(); valores=etiquetas.map(a=>años[a]); titulo='Ventas por año';
    desde=etiquetas.length?new Date(Number(etiquetas[0]),0,1):new Date(ref.getFullYear(),0,1); hasta=new Date(ref.getFullYear(),11,31,23,59,59);
  }else{
    desde=new Date(ref.getFullYear(),0,1); hasta=new Date(ref.getFullYear(),11,31,23,59,59);
    etiquetas=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; valores=Array(12).fill(0);
    ventas.forEach(v=>{if(v.fecha>=desde&&v.fecha<=hasta)valores[v.fecha.getMonth()]+=v.total});
    titulo='Ventas mensuales - '+ref.getFullYear(); tipo='MENSUAL';
  }
  const total=valores.reduce((a,b)=>a+b,0), promedio=valores.length?total/valores.length:0;
  let mejor=0;for(let i=1;i<valores.length;i++)if(valores[i]>valores[mejor])mejor=i;
  const noCero=valores.filter(v=>v>0), peorValor=noCero.length?Math.min.apply(null,noCero):0, peor=peorValor?valores.indexOf(peorValor):-1;
  return {tipo,titulo,etiquetas,valores,resumen:{total,promedio,mejorEtiqueta:etiquetas[mejor]||'-',mejorValor:valores[mejor]||0,peorEtiqueta:peor>=0?etiquetas[peor]:'-',peorValor},periodo:{desde:Utilities.formatDate(desde,tz,'dd/MM/yyyy'),hasta:Utilities.formatDate(hasta,tz,'dd/MM/yyyy')}};
}


function obtenerDashboardAnalisis(codigos,anio){
  requerirPerfil(['MASTER','COMPRADOR']); asegurarHojas();
  const year=Number(anio)||new Date().getFullYear(), map=obtenerProductoMap(), gruposBase=['General','Limpieza','Ferretería','Útiles','Bisutería','Piñatería','Cuchillos','Plásticos','Otros'];
  const grupos={};gruposBase.forEach(g=>grupos[g]=0);
  const opciones=Object.keys(map).map(c=>{const p=map[c]||{},raw=String(p.grupo||'General').trim(),match=gruposBase.find(g=>g.toLowerCase()===raw.toLowerCase()),grupo=match||'Otros';grupos[grupo]++;return {codigo:c,nombre:String(p.nombre||c),grupo};}).filter(x=>x.nombre).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const ventas=ss().getSheetByName(HOJA_VENTAS).getDataRange().getValues(),totales={};
  for(let i=1;i<ventas.length;i++){
    const f=crearFecha(ventas[i][1]||ventas[i][6]);if(!(f instanceof Date)||isNaN(f)||f.getFullYear()!==year)continue;
    let items=[];try{items=JSON.parse(String(ventas[i][4]||'[]'));}catch(e){}
    items.forEach(it=>{const c=normalizarCodigo(it.codigo);if(!c)return;if(!totales[c])totales[c]={codigo:c,nombre:String(it.nombre||(map[c]||{}).nombre||c),meses:Array(12).fill(0),total:0};const monto=(Number(it.cantidad)||0)*(Number(it.precioVenta||(map[c]||{}).precioVenta)||0);totales[c].meses[f.getMonth()]+=monto;totales[c].total+=monto;});
  }
  let seleccion=Array.isArray(codigos)?codigos.map(normalizarCodigo).filter(Boolean).slice(0,3):[];
  if(!seleccion.length)seleccion=Object.values(totales).sort((a,b)=>b.total-a.total).slice(0,3).map(x=>x.codigo);
  const series=seleccion.map(c=>totales[c]||{codigo:c,nombre:(map[c]||{}).nombre||c,meses:Array(12).fill(0),total:0}).map(x=>({codigo:x.codigo,nombre:x.nombre,meses:x.meses.map(v=>Math.round(v*100)/100),total:Math.round(x.total*100)/100}));
  const distribucion=gruposBase.map(nombre=>({nombre,cantidad:grupos[nombre]||0})),totalProductos=distribucion.reduce((s,x)=>s+x.cantidad,0),totalVentas=Object.values(totales).reduce((s,x)=>s+x.total,0);
  return {anio:year,meses:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],distribucion,totalProductos,totalVentas:Math.round(totalVentas*100)/100,opciones,series,seleccion};
}

// ================= QASO V6.0 - PLANEAMIENTO, CONTABILIDAD Y CURVA S =================
const HOJA_PLAN_MENSUAL='Finanzas_Planeamiento_Mensual';
const HOJA_CONT_DIARIA='Finanzas_Contabilidad_Diaria';
const HOJA_CIERRES_CAJA='Finanzas_Cierres_Caja';
function asegurarControlEmpresarial_(){
  asegurarHojas(); const libro=ss();
  const defs=[
    [HOJA_PLAN_MENSUAL,['ID','Periodo','Tipo de Flujo','Categoría','Concepto','Monto Mensual','Unidad de Negocio','Usuario','Timestamp']],
    [HOJA_CONT_DIARIA,['ID','Fecha','Tipo de Flujo','Categoría','Concepto','Monto','Medio de Pago','Usuario','Timestamp']],
    [HOJA_CIERRES_CAJA,['Fecha','Estado','Efectivo','Yape/Plin','Banco','POS','Total Declarado','Total Sistema','Diferencia','Observación','Usuario','Timestamp']]
  ];
  defs.forEach(d=>{let sh=libro.getSheetByName(d[0])||libro.insertSheet(d[0]);if(sh.getLastRow()===0){sh.getRange(1,1,1,d[1].length).setValues([d[1]]).setBackground('#173f55').setFontColor('white').setFontWeight('bold');sh.setFrozenRows(1);sh.autoResizeColumns(1,d[1].length);}});
}
function hoyClave_(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');}
function fechaClave_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');const d=crearFecha(v);return Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd');}
function obtenerPlaneamientoMensual(periodo){
  requerirPerfil(['MASTER']); asegurarControlEmpresarial_(); if(!periodoValido_(periodo))periodo=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM');
  const d=ss().getSheetByName(HOJA_PLAN_MENSUAL).getDataRange().getValues(),filas=[];
  for(let i=1;i<d.length;i++)if(String(d[i][1])===periodo)filas.push({id:d[i][0],tipo:String(d[i][2]),categoria:String(d[i][3]),concepto:String(d[i][4]),monto:Number(d[i][5])||0,unidad:String(d[i][6]||'DISTRIBUCIÓN')});
  let ing=0,gasto=0,inv=0,finIn=0,finOut=0;filas.forEach(r=>{if(r.tipo==='OPERACIÓN INGRESO')ing+=r.monto;else if(r.tipo==='OPERACIÓN GASTO')gasto+=r.monto;else if(r.tipo==='INVERSIÓN')inv+=r.monto;else if(r.tipo==='FINANCIAMIENTO ENTRADA')finIn+=r.monto;else if(r.tipo==='FINANCIAMIENTO SALIDA')finOut+=r.monto;});
  const flujoOp=ing-gasto,flujoTotal=flujoOp-inv+finIn-finOut;
  return {periodo,filas,resumen:{ingresos:ing,gastos:gasto,inversion:inv,financiamientoEntrada:finIn,financiamientoSalida:finOut,flujoOperativo:flujoOp,flujoTotal},objetivos:obtenerObjetivosEstrategicos_()};
}
function guardarPlaneamientoMensual(payload){
  requerirPerfil(['MASTER']); asegurarControlEmpresarial_(); payload=payload||{};const periodo=String(payload.periodo||'');if(!periodoValido_(periodo))return 'Periodo inválido.';
  const sh=ss().getSheetByName(HOJA_PLAN_MENSUAL),d=sh.getDataRange().getValues();for(let i=d.length-1;i>=1;i--)if(String(d[i][1])===periodo)sh.deleteRow(i+1);
  const filas=Array.isArray(payload.filas)?payload.filas:[],vals=filas.filter(r=>String(r.concepto||'').trim()).map(r=>['PM-'+Utilities.getUuid().slice(0,8).toUpperCase(),periodo,String(r.tipo||'OPERACIÓN GASTO').toUpperCase(),String(r.categoria||'OTROS'),String(r.concepto||''),Number(r.monto)||0,String(r.unidad||'DISTRIBUCIÓN'),usuarioSistema_(),new Date()]);
  if(vals.length)sh.getRange(sh.getLastRow()+1,1,vals.length,vals[0].length).setValues(vals);return 'Planeamiento mensual guardado correctamente.';
}
function duplicarPlaneamientoMensualAnterior(periodo){
  requerirPerfil(['MASTER']);asegurarControlEmpresarial_();if(!periodoValido_(periodo))return 'Periodo inválido.';const a=periodo.split('-').map(Number),prev=Utilities.formatDate(new Date(a[0],a[1]-2,1),Session.getScriptTimeZone(),'yyyy-MM'),d=ss().getSheetByName(HOJA_PLAN_MENSUAL).getDataRange().getValues(),filas=[];
  for(let i=1;i<d.length;i++)if(String(d[i][1])===prev)filas.push({tipo:d[i][2],categoria:d[i][3],concepto:d[i][4],monto:d[i][5],unidad:d[i][6]});if(!filas.length)return 'No existe planeamiento del mes anterior.';return guardarPlaneamientoMensual({periodo,filas});
}
function cierresMap_(){asegurarControlEmpresarial_();const d=ss().getSheetByName(HOJA_CIERRES_CAJA).getDataRange().getValues(),m={};for(let i=1;i<d.length;i++){const k=fechaClave_(d[i][0]);m[k]={estado:String(d[i][1]),efectivo:Number(d[i][2])||0,yape:Number(d[i][3])||0,banco:Number(d[i][4])||0,pos:Number(d[i][5])||0,totalDeclarado:Number(d[i][6])||0,totalSistema:Number(d[i][7])||0,diferencia:Number(d[i][8])||0,observacion:String(d[i][9]||'')};}return m;}
function plantillaContable_(){return [
  {tipo:'OPERACIÓN INGRESO',categoria:'VENTAS',concepto:'Ventas / cobranza del día'},
  {tipo:'OPERACIÓN INGRESO',categoria:'OTROS INGRESOS',concepto:'Otros ingresos'},
  {tipo:'OPERACIÓN GASTO',categoria:'COMBUSTIBLE CAMIÓN',concepto:'Combustible del camión'},
  {tipo:'OPERACIÓN GASTO',categoria:'COMBUSTIBLE MOTO',concepto:'Combustible del preventista'},
  {tipo:'OPERACIÓN GASTO',categoria:'PLANILLA',concepto:'Planilla / personal'},
  {tipo:'FINANCIAMIENTO SALIDA',categoria:'CUOTA VEHICULAR',concepto:'Capital de cuota del camión'},
  {tipo:'OPERACIÓN GASTO',categoria:'INTERESES',concepto:'Interés de cuota vehicular'},
  {tipo:'OPERACIÓN GASTO',categoria:'INSUMOS',concepto:'Gastos de insumos'},
  {tipo:'OPERACIÓN GASTO',categoria:'OTROS',concepto:'Otros gastos'},
  {tipo:'INVERSIÓN',categoria:'ACTIVOS',concepto:'Compra de activos / inversión'}
];}
function obtenerContabilidadDiaria(periodo){
  requerirPerfil(['MASTER']);asegurarControlEmpresarial_();if(!periodoValido_(periodo))periodo=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM');
  const a=periodo.split('-').map(Number),dias=new Date(a[0],a[1],0).getDate(),d=ss().getSheetByName(HOJA_CONT_DIARIA).getDataRange().getValues(),map={},partidas={};
  plantillaContable_().forEach(x=>partidas[x.tipo+'|'+x.categoria+'|'+x.concepto]=Object.assign({valores:{},medios:{}},x));
  for(let i=1;i<d.length;i++){const f=fechaClave_(d[i][1]);if(f.slice(0,7)!==periodo)continue;const k=String(d[i][2])+'|'+String(d[i][3])+'|'+String(d[i][4]);if(!partidas[k])partidas[k]={tipo:String(d[i][2]),categoria:String(d[i][3]),concepto:String(d[i][4]),valores:{},medios:{}};if(!partidas[k].medios)partidas[k].medios={};const day=Number(f.slice(8,10));partidas[k].valores[day]=(partidas[k].valores[day]||0)+(Number(d[i][5])||0);partidas[k].medios[day]=String(d[i][6]||'EFECTIVO').toUpperCase();}
  const cierres=cierresMap_(),hoy=hoyClave_();
  const estados={};for(let day=1;day<=dias;day++){const f=periodo+'-'+String(day).padStart(2,'0');estados[day]=cierres[f]&&cierres[f].estado==='CERRADO'?'CERRADO':(f>hoy?'FUTURO':f===hoy?'ACTUAL':'ABIERTO');}
  return {periodo,dias,filas:Object.values(partidas),estados,cierres,hoy};
}
function guardarContabilidadDiaria(payload){
  requerirPerfil(['MASTER']);asegurarControlEmpresarial_();payload=payload||{};const periodo=String(payload.periodo||'');if(!periodoValido_(periodo))return 'Periodo inválido.';const hoy=hoyClave_(),cierres=cierresMap_(),filas=Array.isArray(payload.filas)?payload.filas:[],sh=ss().getSheetByName(HOJA_CONT_DIARIA),d=sh.getDataRange().getValues();
  // Reemplaza solo fechas editables del periodo y nunca toca fechas futuras/cerradas.
  const editables={};for(let day=1;day<=new Date(Number(periodo.slice(0,4)),Number(periodo.slice(5,7)),0).getDate();day++){const f=periodo+'-'+String(day).padStart(2,'0');if(f<=hoy&&!(cierres[f]&&cierres[f].estado==='CERRADO'))editables[f]=1;}
  for(let i=d.length-1;i>=1;i--){const f=fechaClave_(d[i][1]);if(editables[f])sh.deleteRow(i+1);}
  const vals=[];filas.forEach(r=>{const v=r.valores||{},medios=r.medios||{};Object.keys(v).forEach(day=>{const f=periodo+'-'+String(day).padStart(2,'0'),m=Number(v[day])||0,medio=String(medios[day]||'EFECTIVO').toUpperCase();if(editables[f]&&m!==0)vals.push(['CD-'+Utilities.getUuid().slice(0,8).toUpperCase(),crearFecha(f),String(r.tipo||'OPERACIÓN GASTO'),String(r.categoria||'OTROS'),String(r.concepto||''),m,medio,usuarioSistema_(),new Date()]);});});
  if(vals.length)sh.getRange(sh.getLastRow()+1,1,vals.length,vals[0].length).setValues(vals);return 'Control contable diario guardado correctamente.';
}
function totalSistemaDia_(fecha){
  const d=ss().getSheetByName(HOJA_CONT_DIARIA).getDataRange().getValues();let total=0;for(let i=1;i<d.length;i++)if(fechaClave_(d[i][1])===fecha){const t=String(d[i][2]),m=Number(d[i][5])||0;if(t==='OPERACIÓN INGRESO'||t==='FINANCIAMIENTO ENTRADA')total+=m;else total-=m;}return total;
}
function cerrarDiaContable(payload){
  requerirPerfil(['MASTER']);asegurarControlEmpresarial_();payload=payload||{};const fecha=String(payload.fecha||hoyClave_());if(fecha>hoyClave_())return 'No se puede cerrar una fecha futura.';const sh=ss().getSheetByName(HOJA_CIERRES_CAJA),d=sh.getDataRange().getValues();for(let i=d.length-1;i>=1;i--)if(fechaClave_(d[i][0])===fecha)sh.deleteRow(i+1);
  const sis=totalSistemaDia_(fecha),decl=sis;sh.appendRow([crearFecha(fecha),'CERRADO',0,0,0,0,decl,sis,0,'Cierre generado desde el control contable diario',usuarioSistema_(),new Date()]);return 'Día '+fecha+' cerrado correctamente.';
}


/**
 * NEXOVENTA V2 - ADAPTADOR API
 * Permite que el servidor privado de NexoVenta invoque únicamente las
 * funciones autorizadas por dispatch(). Mantener este bloque al final.
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
function reabrirDiaContable(fecha){requerirPerfil(['MASTER']);asegurarControlEmpresarial_();const sh=ss().getSheetByName(HOJA_CIERRES_CAJA),d=sh.getDataRange().getValues();for(let i=1;i<d.length;i++)if(fechaClave_(d[i][0])===String(fecha)){sh.getRange(i+1,2).setValue('REABIERTO');return 'Día reabierto correctamente.';}return 'No se encontró un cierre para esa fecha.';}
function ventasPorFecha_(desde,hasta){const sh=ss().getSheetByName(HOJA_VENTAS),d=sh.getDataRange().getValues(),m={};for(let i=1;i<d.length;i++){const raw=d[i][1]||d[i][6];if(!raw)continue;const f=fechaClave_(raw);if(f<desde||f>hasta)continue;m[f]=(m[f]||0)+(Number(d[i][3])||0);}return m;}
function contabilidadPorFecha_(desde,hasta){asegurarControlEmpresarial_();const d=ss().getSheetByName(HOJA_CONT_DIARIA).getDataRange().getValues(),m={};for(let i=1;i<d.length;i++){const f=fechaClave_(d[i][1]);if(f<desde||f>hasta)continue;if(!m[f])m[f]={ingresos:0,gastos:0,inversion:0,finIn:0,finOut:0};const t=String(d[i][2]),v=Number(d[i][5])||0;if(t==='OPERACIÓN INGRESO')m[f].ingresos+=v;else if(t==='OPERACIÓN GASTO')m[f].gastos+=v;else if(t==='INVERSIÓN')m[f].inversion+=v;else if(t==='FINANCIAMIENTO ENTRADA')m[f].finIn+=v;else if(t==='FINANCIAMIENTO SALIDA')m[f].finOut+=v;}return m;}
function planMesMap_(){asegurarControlEmpresarial_();const d=ss().getSheetByName(HOJA_PLAN_MENSUAL).getDataRange().getValues(),m={};for(let i=1;i<d.length;i++){const p=String(d[i][1]);if(!m[p])m[p]={ingresos:0,gastos:0,inversion:0,finIn:0,finOut:0};const t=String(d[i][2]),v=Number(d[i][5])||0;if(t==='OPERACIÓN INGRESO')m[p].ingresos+=v;else if(t==='OPERACIÓN GASTO')m[p].gastos+=v;else if(t==='INVERSIÓN')m[p].inversion+=v;else if(t==='FINANCIAMIENTO ENTRADA')m[p].finIn+=v;else if(t==='FINANCIAMIENTO SALIDA')m[p].finOut+=v;}return m;}
function valorIndicador_(o,ind){o=o||{};if(ind==='GASTOS')return o.gastos||0;if(ind==='FLUJO')return (o.ingresos||0)-(o.gastos||0)-(o.inversion||0)+(o.finIn||0)-(o.finOut||0);if(ind==='UTILIDAD')return (o.ingresos||0)-(o.gastos||0);return o.ingresos||0;}
function horaClave_(v){
  try{const d=v instanceof Date?v:new Date(v);if(isNaN(d.getTime()))return -1;return Number(Utilities.formatDate(d,Session.getScriptTimeZone()||'America/Lima','H'));}catch(e){return -1;}
}
function ventasPorHora_(fecha){
  const d=ss().getSheetByName(HOJA_VENTAS).getDataRange().getValues(),a=Array(24).fill(0);
  for(let i=1;i<d.length;i++){const f=fechaClave_(d[i][1]||d[i][6]);if(f!==fecha)continue;const h=horaClave_(d[i][6]||d[i][1]);if(h>=0)a[h]+=Number(d[i][3])||0;}
  return a;
}
function contabilidadPorHora_(fecha){
  const d=ss().getSheetByName(HOJA_CONT_DIARIA).getDataRange().getValues(),a=Array.from({length:24},()=>({ingresos:0,gastos:0,inversion:0,finIn:0,finOut:0}));
  for(let i=1;i<d.length;i++){if(fechaClave_(d[i][1])!==fecha)continue;let h=horaClave_(d[i][8]);if(h<0)h=12;const t=String(d[i][2]),v=Number(d[i][5])||0,o=a[h];if(t==='OPERACIÓN INGRESO')o.ingresos+=v;else if(t==='OPERACIÓN GASTO')o.gastos+=v;else if(t==='INVERSIÓN')o.inversion+=v;else if(t==='FINANCIAMIENTO ENTRADA')o.finIn+=v;else if(t==='FINANCIAMIENTO SALIDA')o.finOut+=v;}
  return a;
}
function resumenCanales_(desde,hasta){
  const d=ss().getSheetByName(HOJA_CONT_DIARIA).getDataRange().getValues();let ie=0,iy=0,ge=0,gy=0;
  for(let i=1;i<d.length;i++){const f=fechaClave_(d[i][1]);if(f<desde||f>hasta)continue;const t=String(d[i][2]),v=Number(d[i][5])||0,m=String(d[i][6]||'EFECTIVO').toUpperCase();if(t==='OPERACIÓN INGRESO'){if(m==='EFECTIVO')ie+=v;else if(m==='YAPE')iy+=v;}else if(t==='OPERACIÓN GASTO'){if(m==='EFECTIVO')ge+=v;else if(m==='YAPE')gy+=v;}}
  const ti=ie+iy,tg=ge+gy;return {ingresoEfectivo:ie,ingresoYape:iy,gastoEfectivo:ge,gastoYape:gy,pctIngresoEfectivo:ti?ie/ti*100:0,pctIngresoYape:ti?iy/ti*100:0,pctGastoEfectivo:tg?ge/tg*100:0,pctGastoYape:tg?gy/tg*100:0};
}
function lunesDeSemana_(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12),dia=x.getDay()||7;x.setDate(x.getDate()-dia+1);return x;}
function obtenerCurvaS(indicador,vista,fechaRef,acumulado){
  requerirPerfil(['MASTER']);asegurarControlEmpresarial_();indicador=String(indicador||'INGRESOS').toUpperCase();vista=String(vista||'DIARIA').toUpperCase();if(['DIARIA','SEMANAL','MENSUAL'].indexOf(vista)<0)vista='DIARIA';const ref=fechaRef?crearFecha(fechaRef):new Date(),tz=Session.getScriptTimeZone()||'America/Lima',hoy=hoyClave_(),y=ref.getFullYear(),mo=ref.getMonth()+1,plan=planMesMap_();let labels=[],planeado=[],real=[],desde='',hasta='',hoyIndex=-1;
  if(vista==='DIARIA'){
    const fecha=Utilities.formatDate(ref,tz,'yyyy-MM-dd'),periodo=fecha.slice(0,7),days=new Date(y,mo,0).getDate(),pm=valorIndicador_(plan[periodo],indicador),ph=pm/days/24,vh=ventasPorHora_(fecha),ch=contabilidadPorHora_(fecha);desde=hasta=fecha;
    for(let h=0;h<24;h++){labels.push(String(h).padStart(2,'0')+':00');planeado.push(ph);const c=ch[h]||{};if(indicador==='VENTAS')real.push(vh[h]||0);else if(indicador==='INGRESOS')real.push((vh[h]||0)+(c.ingresos||0));else real.push(valorIndicador_(Object.assign({},c,{ingresos:(vh[h]||0)+(c.ingresos||0)}),indicador));}
    if(fecha===hoy)hoyIndex=Number(Utilities.formatDate(new Date(),tz,'H'));
  }else if(vista==='SEMANAL'){
    const ini=lunesDeSemana_(ref),fin=new Date(ini);fin.setDate(ini.getDate()+6);desde=Utilities.formatDate(ini,tz,'yyyy-MM-dd');hasta=Utilities.formatDate(fin,tz,'yyyy-MM-dd');const ventas=ventasPorFecha_(desde,hasta),cont=contabilidadPorFecha_(desde,hasta),nombres=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    for(let i=0;i<7;i++){const dt=new Date(ini);dt.setDate(ini.getDate()+i);const f=Utilities.formatDate(dt,tz,'yyyy-MM-dd'),p=f.slice(0,7),days=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate(),pd=valorIndicador_(plan[p],indicador)/days;labels.push(nombres[i]+' '+Utilities.formatDate(dt,tz,'dd/MM'));planeado.push(pd);const c=cont[f]||{};if(indicador==='VENTAS')real.push(ventas[f]||0);else if(indicador==='INGRESOS')real.push((ventas[f]||0)+(c.ingresos||0));else real.push(valorIndicador_(Object.assign({},c,{ingresos:(ventas[f]||0)+(c.ingresos||0)}),indicador));if(f===hoy)hoyIndex=i;}
  }else{
    desde=y+'-01-01';hasta=y+'-12-31';const ventas=ventasPorFecha_(desde,hasta),cont=contabilidadPorFecha_(desde,hasta),meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    for(let m=1;m<=12;m++){const p=y+'-'+String(m).padStart(2,'0'),prefix=p+'-';labels.push(meses[m-1]);planeado.push(valorIndicador_(plan[p],indicador));let obj={ingresos:0,gastos:0,inversion:0,finIn:0,finOut:0},soloVentas=0;Object.keys(ventas).forEach(f=>{if(f.startsWith(prefix)){soloVentas+=ventas[f];obj.ingresos+=ventas[f]}});Object.keys(cont).forEach(f=>{if(f.startsWith(prefix)){const c=cont[f];obj.ingresos+=c.ingresos||0;obj.gastos+=c.gastos||0;obj.inversion+=c.inversion||0;obj.finIn+=c.finIn||0;obj.finOut+=c.finOut||0;}});real.push(indicador==='VENTAS'?soloVentas:valorIndicador_(obj,indicador));}
    if(hoy.slice(0,4)===String(y))hoyIndex=Number(hoy.slice(5,7))-1;
  }
  if(acumulado){for(let i=1;i<planeado.length;i++){planeado[i]+=planeado[i-1];real[i]+=real[i-1];}}
  const pt=planeado.length?planeado[planeado.length-1]:0,rt=real.length?real[real.length-1]:0;return {labels,planeado,real,hoyIndex,canales:resumenCanales_(desde,hasta),resumen:{planeado:pt,real:rt,diferencia:rt-pt,cumplimiento:pt?rt/pt*100:0},titulo:indicador+' · '+vista+(acumulado?' acumulado':' por periodo')};
}



// ================= QASO V7.1 - COBRANZA, RENDICIÓN Y CUENTAS POR COBRAR =================
const HOJA_COBRANZA='Operacion_Cobranza';
const HOJA_GASTOS_RUTA='Operacion_Gastos';
const HOJA_CXC='Finanzas_Cuentas_Por_Cobrar';
const HOJA_RENDICION='Finanzas_Rendicion_Diaria';
function asegurarCobranza_(){
  asegurarControlEmpresarial_(); const libro=ss();
  const defs=[
    [HOJA_COBRANZA,['ID','Venta ID','Fecha Entrega','Cliente','Total Pedido','Estado Entrega','Estado Cobro','Efectivo','Yape','Plin','Transferencia','POS','Otros','Total Cobrado','Saldo Pendiente','Fecha Promesa','Medio Prometido','Observación','Responsable','Estado Rendición','Timestamp']],
    [HOJA_GASTOS_RUTA,['ID','Fecha','Responsable','Ruta','Unidad','Partida','Descripción','Importe','Canal','Comprobante URL','Observación','Estado Rendición','Timestamp']],
    [HOJA_CXC,['ID','Venta ID','Cliente','Fecha Origen','Fecha Vencimiento','Monto Original','Monto Cobrado','Saldo','Medio Prometido','Estado','Observación','Timestamp']],
    [HOJA_RENDICION,['Fecha','Efectivo Declarado','Yape Declarado','Otros Declarado','Gastos Efectivo','Gastos Virtuales','Efectivo Esperado','Efectivo Recibido','Yape Verificado','Otros Verificado','Diferencia','Estado','Observación','Usuario','Timestamp']]
  ];
  defs.forEach(d=>{let sh=libro.getSheetByName(d[0])||libro.insertSheet(d[0]);if(sh.getLastRow()===0){sh.getRange(1,1,1,d[1].length).setValues([d[1]]).setBackground('#173f55').setFontColor('white').setFontWeight('bold');sh.setFrozenRows(1);sh.autoResizeColumns(1,d[1].length);}});
}
function cobranzaMap_(){asegurarCobranza_();const d=ss().getSheetByName(HOJA_COBRANZA).getDataRange().getValues(),m={};for(let i=1;i<d.length;i++){m[String(d[i][1])]={fila:i+1,id:d[i][0],ventaId:String(d[i][1]),fecha:fechaClave_(d[i][2]),cliente:String(d[i][3]),total:Number(d[i][4])||0,estadoEntrega:String(d[i][5]||'PENDIENTE'),estadoCobro:String(d[i][6]||'PENDIENTE'),efectivo:Number(d[i][7])||0,yape:Number(d[i][8])||0,plin:Number(d[i][9])||0,transferencia:Number(d[i][10])||0,pos:Number(d[i][11])||0,otros:Number(d[i][12])||0,totalCobrado:Number(d[i][13])||0,saldo:Number(d[i][14])||0,fechaPromesa:d[i][15]?fechaClave_(d[i][15]):'',medioPrometido:String(d[i][16]||''),observacion:String(d[i][17]||''),responsable:String(d[i][18]||''),estadoRendicion:String(d[i][19]||'PENDIENTE')};}return m;}
function obtenerCobranzaPedidos(filtros){
  requerirPerfil(['MASTER','PREVENTA']); asegurarCobranza_(); filtros=filtros||{};
  const hoy=hoyClave_(),desde=filtros.desde||hoy.slice(0,8)+'01',hasta=filtros.hasta||hoy;
  const ventas=obtenerEmisiones({fechaDesde:desde,fechaHasta:hasta,texto:filtros.texto||''}),map=cobranzaMap_();
  return ventas.map(v=>{const c=map[v.ventaId]||{};return Object.assign({},v,{estadoEntrega:c.estadoEntrega||'PENDIENTE',fechaEntrega:c.fecha||'',estadoCobro:c.estadoCobro||'PENDIENTE',efectivo:c.efectivo||0,yape:c.yape||0,plin:c.plin||0,transferencia:c.transferencia||0,pos:c.pos||0,otros:c.otros||0,totalCobrado:c.totalCobrado||0,saldo:c.saldo||0,fechaPromesa:c.fechaPromesa||'',medioPrometido:c.medioPrometido||'',observacionCobro:c.observacion||'',estadoRendicion:c.estadoRendicion||'PENDIENTE'});}).map(x=>{x.saldo=Math.max(0,Number(x.total||0)-Number(x.totalCobrado||0));return x;});
}
function actualizarCxC_(p){
  const sh=ss().getSheetByName(HOJA_CXC),d=sh.getDataRange().getValues();for(let i=d.length-1;i>=1;i--)if(String(d[i][1])===String(p.ventaId))sh.deleteRow(i+1);
  const fechaEntrega=crearFecha(p.fechaEntrega||hoyClave_()),fechaLimite=p.fechaPromesa?crearFecha(p.fechaPromesa):new Date(fechaEntrega);if(!p.fechaPromesa)fechaLimite.setDate(fechaLimite.getDate()+3);
  const saldo=Math.max(0,Number(p.totalPedido||0)-Number(p.totalCobrado||0));if(saldo>0){sh.appendRow(['CXC-'+Utilities.getUuid().slice(0,8).toUpperCase(),p.ventaId,p.cliente||'',fechaEntrega,fechaLimite,Number(p.totalPedido)||0,Number(p.totalCobrado)||0,saldo,p.medioPrometido||'',p.estadoCobro==='PARCIAL'?'PARCIAL':'PENDIENTE',p.observacion||'',new Date()]);}
}
function actualizarEstadoOperativoPedido(p){
  requerirPerfil(['MASTER','PREVENTA']); asegurarCobranza_(); p=p||{};
  const ventaId=String(p.ventaId||'').trim(), permitidos=['POR COMPRAR','COMPRADO','LISTO PARA ENTREGA','OBSERVADO'];
  const estado=String(p.estado||'POR COMPRAR').toUpperCase();
  if(!ventaId)return 'Pedido inválido.';
  if(permitidos.indexOf(estado)<0)return 'Estado operativo inválido.';
  const sh=ss().getSheetByName(HOJA_COBRANZA),map=cobranzaMap_(),actual=map[ventaId]||{};
  const total=Number(actual.total||p.totalPedido)||0, cobrado=Number(actual.totalCobrado)||0, saldo=Math.max(0,total-cobrado);
  const row=[actual.id||('COB-'+Utilities.getUuid().slice(0,8).toUpperCase()),ventaId,actual.fecha?crearFecha(actual.fecha):crearFecha(hoyClave_()),p.cliente||actual.cliente||'',total,estado,actual.estadoCobro||'PENDIENTE',actual.efectivo||0,actual.yape||0,actual.plin||0,actual.transferencia||0,actual.pos||0,actual.otros||0,cobrado,saldo,actual.fechaPromesa?crearFecha(actual.fechaPromesa):'',actual.medioPrometido||'',actual.observacion||'',usuarioSistema_(),actual.estadoRendicion||'PENDIENTE',new Date()];
  if(actual.fila)sh.getRange(actual.fila,1,1,row.length).setValues([row]);else sh.appendRow(row);
  SpreadsheetApp.flush();
  return 'Estado actualizado: '+estado+'.';
}
function guardarCobranzaPedido(p){
  requerirPerfil(['MASTER','PREVENTA']);asegurarCobranza_();p=p||{};if(!p.ventaId)return 'Pedido inválido.';
  const solicitudId=String(p.solicitudId||'').trim(),cache=CacheService.getScriptCache(),cacheKey=solicitudId?('COBRO_'+solicitudId):'';if(cacheKey&&cache.get(cacheKey))return 'Cobranza ya registrada. Se evitó duplicarla.';
  const total=Number(p.totalPedido)||0,ef=Number(p.efectivo)||0,ya=Number(p.yape)||0,pl=Number(p.plin)||0,tr=Number(p.transferencia)||0,pos=Number(p.pos)||0,ot=Number(p.otros)||0,cob=Math.round((ef+ya+pl+tr+pos+ot)*100)/100,saldo=Math.max(0,Math.round((total-cob)*100)/100);
  if(cob>total+0.01)return 'El total cobrado supera el total del pedido.';
  const entrega=String(p.estadoEntrega||'ENTREGADO').toUpperCase();let estado=saldo<=0.01?'TOTAL':(cob>0?'PARCIAL':'PENDIENTE');const solicitado=String(p.estadoPago||'').toUpperCase();if(solicitado==='PENDIENTE'&&cob===0)estado='PENDIENTE';if(solicitado==='PARCIAL'&&cob>0&&saldo>0.01)estado='PARCIAL';if(entrega==='NO ENTREGADO')estado='NO APLICA';
  // Los estados de preparación todavía no representan una entrega al cliente.
  // La promesa de pago solo es obligatoria cuando el pedido fue entregado.
  if(p.fechaPromesa){const inicio=crearFecha(p.fechaEntrega||hoyClave_()),limite=new Date(inicio);limite.setDate(limite.getDate()+3);if(crearFecha(p.fechaPromesa)>limite)return 'El compromiso no puede superar tres días desde la entrega.';}
  const sh=ss().getSheetByName(HOJA_COBRANZA),map=cobranzaMap_(),row=[map[p.ventaId]?.id||('COB-'+Utilities.getUuid().slice(0,8).toUpperCase()),p.ventaId,crearFecha(p.fechaEntrega||hoyClave_()),p.cliente||'',total,entrega,estado,ef,ya,pl,tr,pos,ot,cob,saldo,p.fechaPromesa?crearFecha(p.fechaPromesa):'',p.medioPrometido||'',p.observacion||'',usuarioSistema_(),'PENDIENTE',new Date()];
  if(map[p.ventaId])sh.getRange(map[p.ventaId].fila,1,1,row.length).setValues([row]);else sh.appendRow(row);actualizarCxC_(Object.assign({},p,{totalCobrado:cob,estadoCobro:estado}));if(cacheKey)cache.put(cacheKey,String(p.ventaId),21600);return 'Cobranza registrada correctamente. Pendiente de rendición administrativa.';
}
function subirComprobanteGasto(nombre,mime,base64){requerirPerfil(['MASTER','PREVENTA']);asegurarCobranza_();if(!base64)return '';const bytes=Utilities.base64Decode(String(base64).split(',').pop()),blob=Utilities.newBlob(bytes,mime||'image/jpeg',nombre||('comprobante-'+Date.now()+'.jpg'));let folder;const it=DriveApp.getFoldersByName('QASO_Comprobantes');folder=it.hasNext()?it.next():DriveApp.createFolder('QASO_Comprobantes');const f=folder.createFile(blob);return f.getUrl();}
function registrarGastoOperacion(p){
  requerirPerfil(['MASTER','PREVENTA']);asegurarCobranza_();p=p||{};if(!(Number(p.importe)>0))return 'Ingrese un importe válido.';if(!String(p.partida||'').trim())return 'Seleccione una categoría.';
  const solicitudId=String(p.solicitudId||'').trim(),cache=CacheService.getScriptCache(),cacheKey=solicitudId?('GASTO_'+solicitudId):'';if(cacheKey&&cache.get(cacheKey))return 'Gasto ya registrado. Se evitó duplicarlo.';
  const lock=LockService.getScriptLock();try{lock.waitLock(8000);if(cacheKey&&cache.get(cacheKey))return 'Gasto ya registrado. Se evitó duplicarlo.';const id='GOP-'+Utilities.getUuid().slice(0,8).toUpperCase();ss().getSheetByName(HOJA_GASTOS_RUTA).appendRow([id,crearFecha(p.fecha||hoyClave_()),usuarioSistema_(),p.ruta||'',p.unidad||'',p.partida||'OTROS',p.descripcion||'',Number(p.importe)||0,String(p.canal||'EFECTIVO').toUpperCase(),p.comprobanteUrl||'',p.observacion||'','PENDIENTE',new Date()]);if(cacheKey)cache.put(cacheKey,id,21600);return 'Gasto operativo registrado correctamente. Pendiente de rendición.';}finally{try{lock.releaseLock();}catch(err){}}
}
function obtenerGastosOperacion(fecha){requerirPerfil(['MASTER','PREVENTA']);asegurarCobranza_();fecha=fecha||hoyClave_();const d=ss().getSheetByName(HOJA_GASTOS_RUTA).getDataRange().getValues(),o=[];for(let i=1;i<d.length;i++)if(fechaClave_(d[i][1])===fecha)o.push({id:d[i][0],fecha:fechaClave_(d[i][1]),responsable:d[i][2],ruta:d[i][3],unidad:d[i][4],partida:d[i][5],descripcion:d[i][6],importe:Number(d[i][7])||0,canal:d[i][8],comprobanteUrl:d[i][9],observacion:d[i][10],estado:d[i][11]});return o;}
function resumenDeclaradoDia_(fecha){asegurarCobranza_();const cm=cobranzaMap_();let ef=0,ya=0,otros=0,pendiente=0;Object.keys(cm).forEach(k=>{const c=cm[k];if(c.fecha===fecha){ef+=c.efectivo;ya+=c.yape;otros+=c.plin+c.transferencia+c.pos+c.otros;pendiente+=c.saldo;}});let ge=0,gv=0;obtenerGastosOperacion(fecha).forEach(g=>{if(String(g.canal).toUpperCase()==='EFECTIVO')ge+=g.importe;else gv+=g.importe;});return {efectivo:ef,yape:ya,otros,gastosEfectivo:ge,gastosVirtuales:gv,efectivoEsperado:ef-ge,pendiente};}
function obtenerRendicionDia(fecha){requerirPerfil(['MASTER']);asegurarCobranza_();fecha=fecha||hoyClave_();const dec=resumenDeclaradoDia_(fecha),d=ss().getSheetByName(HOJA_RENDICION).getDataRange().getValues();let r=null;for(let i=1;i<d.length;i++)if(fechaClave_(d[i][0])===fecha)r={fila:i+1,efectivoRecibido:Number(d[i][7])||0,yapeVerificado:Number(d[i][8])||0,otrosVerificado:Number(d[i][9])||0,diferencia:Number(d[i][10])||0,estado:String(d[i][11]),observacion:String(d[i][12]||'')};return {fecha,declarado:dec,validacion:r};}
function volcarDiaAContabilidad_(fecha){
  asegurarCobranza_();const sh=ss().getSheetByName(HOJA_CONT_DIARIA),d=sh.getDataRange().getValues();for(let i=d.length-1;i>=1;i--){if(fechaClave_(d[i][1])===fecha&&String(d[i][7])==='SISTEMA COBRANZA')sh.deleteRow(i+1);}const dec=resumenDeclaradoDia_(fecha),vals=[];
  function add(tipo,cat,con,monto,medio){if(Math.abs(monto)>0.0001)vals.push(['CD-'+Utilities.getUuid().slice(0,8).toUpperCase(),crearFecha(fecha),tipo,cat,con,monto,medio,'SISTEMA COBRANZA',new Date()]);}
  add('OPERACIÓN INGRESO','VENTAS EFECTIVO','Ventas cobradas en efectivo',dec.efectivo,'EFECTIVO');add('OPERACIÓN INGRESO','VENTAS YAPE','Ventas cobradas por Yape',dec.yape,'YAPE');add('OPERACIÓN INGRESO','VENTAS OTROS','Ventas cobradas por otros canales',dec.otros,'OTROS');
  obtenerGastosOperacion(fecha).forEach(g=>add('OPERACIÓN GASTO',String(g.partida||'OTROS').toUpperCase(),g.descripcion||g.partida,g.importe,String(g.canal||'EFECTIVO').toUpperCase()));if(vals.length)sh.getRange(sh.getLastRow()+1,1,vals.length,vals[0].length).setValues(vals);
}
function validarRendicionDia(p){
  requerirPerfil(['MASTER']);asegurarCobranza_();p=p||{};const fecha=p.fecha||hoyClave_(),dec=resumenDeclaradoDia_(fecha),er=Number(p.efectivoRecibido)||0,yv=Number(p.yapeVerificado)||0,ov=Number(p.otrosVerificado)||0,dif=Math.round(((er-dec.efectivoEsperado)+(yv-dec.yape)+(ov-dec.otros))*100)/100;
  let estado=Math.abs(dif)<=0.01?'CONFORME':'OBSERVADO';if(estado==='OBSERVADO'&&p.compensar===true&&String(p.observacion||'').trim())estado='CONFORME CON AJUSTE';
  const sh=ss().getSheetByName(HOJA_RENDICION),d=sh.getDataRange().getValues();for(let i=d.length-1;i>=1;i--)if(fechaClave_(d[i][0])===fecha)sh.deleteRow(i+1);sh.appendRow([crearFecha(fecha),dec.efectivo,dec.yape,dec.otros,dec.gastosEfectivo,dec.gastosVirtuales,dec.efectivoEsperado,er,yv,ov,dif,estado,p.observacion||'',usuarioSistema_(),new Date()]);
  if(estado.indexOf('CONFORME')===0){volcarDiaAContabilidad_(fecha);const csh=ss().getSheetByName(HOJA_COBRANZA),cd=csh.getDataRange().getValues();for(let i=1;i<cd.length;i++)if(fechaClave_(cd[i][2])===fecha)csh.getRange(i+1,20).setValue('RENDIDO');const gsh=ss().getSheetByName(HOJA_GASTOS_RUTA),gd=gsh.getDataRange().getValues();for(let i=1;i<gd.length;i++)if(fechaClave_(gd[i][1])===fecha)gsh.getRange(i+1,12).setValue('RENDIDO');return 'Rendición conforme. Los movimientos fueron enviados a Contabilidad.';}
  return 'Rendición observada. Diferencia: S/ '+dif.toFixed(2)+'. Corrija los cobros/gastos o use compensación con sustento.';
}
// Reemplazo robusto: el botón Guardar sí persiste y devuelve cuántas filas fueron escritas.
function guardarContabilidadDiaria(payload){
  requerirPerfil(['MASTER']);asegurarControlEmpresarial_();payload=payload||{};const periodo=String(payload.periodo||'');if(!periodoValido_(periodo))return 'Periodo inválido.';const hoy=hoyClave_(),cierres=cierresMap_(),filas=Array.isArray(payload.filas)?payload.filas:[],sh=ss().getSheetByName(HOJA_CONT_DIARIA),d=sh.getDataRange().getValues(),editables={};
  for(let day=1;day<=new Date(Number(periodo.slice(0,4)),Number(periodo.slice(5,7)),0).getDate();day++){const f=periodo+'-'+String(day).padStart(2,'0');if(f<=hoy&&!(cierres[f]&&cierres[f].estado==='CERRADO'))editables[f]=1;}
  // No elimina registros automáticos provenientes de Cobranza.
  for(let i=d.length-1;i>=1;i--){const f=fechaClave_(d[i][1]),usr=String(d[i][7]||'');if(editables[f]&&usr!=='SISTEMA COBRANZA')sh.deleteRow(i+1);}
  const vals=[];filas.forEach(r=>{if(r.origen==='SISTEMA COBRANZA')return;const v=r.valores||{},medios=r.medios||{};Object.keys(v).forEach(day=>{const f=periodo+'-'+String(day).padStart(2,'0'),m=Number(v[day])||0,medio=String(medios[day]||'EFECTIVO').toUpperCase();if(editables[f]&&m!==0)vals.push(['CD-'+Utilities.getUuid().slice(0,8).toUpperCase(),crearFecha(f),String(r.tipo||'OPERACIÓN GASTO'),String(r.categoria||'OTROS'),String(r.concepto||''),m,medio,usuarioSistema_(),new Date()]);});});
  if(vals.length)sh.getRange(sh.getLastRow()+1,1,vals.length,vals[0].length).setValues(vals);SpreadsheetApp.flush();
    try{CacheService.getScriptCache().remove('QASO_CLIENTES_PREVENTA_V1');}catch(err){}return 'Control contable diario guardado correctamente. Registros escritos: '+vals.length+'.';
}
// Añade cuentas por cobrar y origen automático al control diario.
function obtenerContabilidadDiaria(periodo){
  requerirPerfil(['MASTER']);asegurarCobranza_();if(!periodoValido_(periodo))periodo=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM');const a=periodo.split('-').map(Number),dias=new Date(a[0],a[1],0).getDate(),d=ss().getSheetByName(HOJA_CONT_DIARIA).getDataRange().getValues(),partidas={};
  plantillaContable_().forEach(x=>partidas[x.tipo+'|'+x.categoria+'|'+x.concepto]=Object.assign({valores:{},medios:{},origen:'MANUAL'},x));
  for(let i=1;i<d.length;i++){const f=fechaClave_(d[i][1]);if(f.slice(0,7)!==periodo)continue;const k=String(d[i][2])+'|'+String(d[i][3])+'|'+String(d[i][4]);if(!partidas[k])partidas[k]={tipo:String(d[i][2]),categoria:String(d[i][3]),concepto:String(d[i][4]),valores:{},medios:{},origen:String(d[i][7])==='SISTEMA COBRANZA'?'SISTEMA COBRANZA':'MANUAL'};const day=Number(f.slice(8,10));partidas[k].valores[day]=(partidas[k].valores[day]||0)+(Number(d[i][5])||0);partidas[k].medios[day]=String(d[i][6]||'EFECTIVO').toUpperCase();}
  const cx=ss().getSheetByName(HOJA_CXC).getDataRange().getValues();let saldoCxc=0;for(let i=1;i<cx.length;i++)if(String(cx[i][9])!=='PAGADO')saldoCxc+=Number(cx[i][7])||0;
  const cierres=cierresMap_(),hoy=hoyClave_(),estados={};for(let day=1;day<=dias;day++){const f=periodo+'-'+String(day).padStart(2,'0');estados[day]=cierres[f]&&cierres[f].estado==='CERRADO'?'CERRADO':(f>hoy?'FUTURO':f===hoy?'ACTUAL':'ABIERTO');}
  return {periodo,dias,filas:Object.values(partidas),estados,cierres,hoy,cuentasPorCobrar:saldoCxc};
}

// Curva S V7.1: diaria=horas, semanal=días, mensual=días del mes, anual=meses.
function cxcPorFecha_(desde,hasta){asegurarCobranza_();const d=ss().getSheetByName(HOJA_CXC).getDataRange().getValues(),m={};for(let i=1;i<d.length;i++){if(String(d[i][9])==='PAGADO')continue;const f=fechaClave_(d[i][3]);if(f>=desde&&f<=hasta)m[f]=(m[f]||0)+(Number(d[i][7])||0);}return m;}
function obtenerCurvaS(indicador,vista,fechaRef,acumulado){
  requerirPerfil(['MASTER']);asegurarCobranza_();indicador=String(indicador||'INGRESOS').toUpperCase();vista=String(vista||'DIARIA').toUpperCase();if(['DIARIA','SEMANAL','MENSUAL','ANUAL'].indexOf(vista)<0)vista='DIARIA';const ref=fechaRef?crearFecha(fechaRef):new Date(),tz=Session.getScriptTimeZone()||'America/Lima',hoy=hoyClave_(),y=ref.getFullYear(),mo=ref.getMonth()+1,plan=planMesMap_();let labels=[],planeado=[],real=[],pendiente=[],desde='',hasta='',hoyIndex=-1;
  if(vista==='DIARIA'){
    const fecha=Utilities.formatDate(ref,tz,'yyyy-MM-dd'),periodo=fecha.slice(0,7),days=new Date(y,mo,0).getDate(),pm=valorIndicador_(plan[periodo],indicador),ph=pm/days/24,vh=ventasPorHora_(fecha),ch=contabilidadPorHora_(fecha),cx=cxcPorFecha_(fecha,fecha)[fecha]||0;desde=hasta=fecha;
    for(let h=0;h<24;h++){labels.push(String(h).padStart(2,'0')+':00');planeado.push(ph);const c=ch[h]||{};if(indicador==='VENTAS')real.push(vh[h]||0);else if(indicador==='INGRESOS')real.push((vh[h]||0)+(c.ingresos||0));else real.push(valorIndicador_(Object.assign({},c,{ingresos:(vh[h]||0)+(c.ingresos||0)}),indicador));pendiente.push(h===23?cx:0);}if(fecha===hoy)hoyIndex=Number(Utilities.formatDate(new Date(),tz,'H'));
  }else if(vista==='SEMANAL'){
    const ini=lunesDeSemana_(ref),fin=new Date(ini);fin.setDate(ini.getDate()+6);desde=Utilities.formatDate(ini,tz,'yyyy-MM-dd');hasta=Utilities.formatDate(fin,tz,'yyyy-MM-dd');const ventas=ventasPorFecha_(desde,hasta),cont=contabilidadPorFecha_(desde,hasta),cx=cxcPorFecha_(desde,hasta),nombres=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    for(let i=0;i<7;i++){const dt=new Date(ini);dt.setDate(ini.getDate()+i);const f=Utilities.formatDate(dt,tz,'yyyy-MM-dd'),p=f.slice(0,7),days=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate(),pd=valorIndicador_(plan[p],indicador)/days;labels.push(nombres[i]+' '+Utilities.formatDate(dt,tz,'dd/MM'));planeado.push(pd);const c=cont[f]||{};if(indicador==='VENTAS')real.push(ventas[f]||0);else if(indicador==='INGRESOS')real.push((ventas[f]||0)+(c.ingresos||0));else real.push(valorIndicador_(Object.assign({},c,{ingresos:(ventas[f]||0)+(c.ingresos||0)}),indicador));pendiente.push(cx[f]||0);if(f===hoy)hoyIndex=i;}
  }else if(vista==='MENSUAL'){
    const periodo=y+'-'+String(mo).padStart(2,'0'),days=new Date(y,mo,0).getDate();desde=periodo+'-01';hasta=periodo+'-'+String(days).padStart(2,'0');const ventas=ventasPorFecha_(desde,hasta),cont=contabilidadPorFecha_(desde,hasta),cx=cxcPorFecha_(desde,hasta),pd=valorIndicador_(plan[periodo],indicador)/days;
    for(let day=1;day<=days;day++){const f=periodo+'-'+String(day).padStart(2,'0'),c=cont[f]||{};labels.push(String(day));planeado.push(pd);if(indicador==='VENTAS')real.push(ventas[f]||0);else if(indicador==='INGRESOS')real.push((ventas[f]||0)+(c.ingresos||0));else real.push(valorIndicador_(Object.assign({},c,{ingresos:(ventas[f]||0)+(c.ingresos||0)}),indicador));pendiente.push(cx[f]||0);if(f===hoy)hoyIndex=day-1;}
  }else{
    desde=y+'-01-01';hasta=y+'-12-31';const ventas=ventasPorFecha_(desde,hasta),cont=contabilidadPorFecha_(desde,hasta),cx=cxcPorFecha_(desde,hasta),meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    for(let m=1;m<=12;m++){const p=y+'-'+String(m).padStart(2,'0'),prefix=p+'-';labels.push(meses[m-1]);planeado.push(valorIndicador_(plan[p],indicador));let obj={ingresos:0,gastos:0,inversion:0,finIn:0,finOut:0},soloVentas=0,cxp=0;Object.keys(ventas).forEach(f=>{if(f.startsWith(prefix)){soloVentas+=ventas[f];obj.ingresos+=ventas[f]}});Object.keys(cont).forEach(f=>{if(f.startsWith(prefix)){const c=cont[f];obj.ingresos+=c.ingresos||0;obj.gastos+=c.gastos||0;obj.inversion+=c.inversion||0;obj.finIn+=c.finIn||0;obj.finOut+=c.finOut||0;}});Object.keys(cx).forEach(f=>{if(f.startsWith(prefix))cxp+=cx[f]||0});real.push(indicador==='VENTAS'?soloVentas:valorIndicador_(obj,indicador));pendiente.push(cxp);}if(hoy.slice(0,4)===String(y))hoyIndex=Number(hoy.slice(5,7))-1;
  }
  if(acumulado){for(let i=1;i<planeado.length;i++){planeado[i]+=planeado[i-1];real[i]+=real[i-1];pendiente[i]+=pendiente[i-1];}}
  const pt=planeado.reduce((a,b)=>a+b,0),rt=real.reduce((a,b)=>a+b,0),cxt=pendiente.length?pendiente[pendiente.length-1]:0;return {labels,planeado,real,pendiente,hoyIndex,canales:Object.assign(resumenCanales_(desde,hasta),{cuentasPorCobrar:cxt}),resumen:{planeado:acumulado?(planeado.at?planeado.at(-1):planeado[planeado.length-1]):pt,real:acumulado?(real.at?real.at(-1):real[real.length-1]):rt,diferencia:(acumulado?(real[real.length-1]||0)-(planeado[planeado.length-1]||0):rt-pt),cumplimiento:(acumulado?(planeado[planeado.length-1]||0):pt)?(acumulado?(real[real.length-1]||0)/(planeado[planeado.length-1]||0):rt/pt)*100:0,cuentasPorCobrar:cxt},titulo:indicador+' · '+vista+(acumulado?' acumulado':' por periodo')};
}

// El cierre solo se permite después de una rendición conforme.
function cerrarDiaContable(payload){
  requerirPerfil(['MASTER']);asegurarCobranza_();payload=payload||{};const fecha=String(payload.fecha||hoyClave_());if(fecha>hoyClave_())return 'No se puede cerrar una fecha futura.';
  const rd=ss().getSheetByName(HOJA_RENDICION).getDataRange().getValues();let rend=null;for(let i=1;i<rd.length;i++)if(fechaClave_(rd[i][0])===fecha)rend={ef:Number(rd[i][7])||0,ya:Number(rd[i][8])||0,ot:Number(rd[i][9])||0,dif:Number(rd[i][10])||0,estado:String(rd[i][11]),obs:String(rd[i][12]||'')};
  if(!rend||rend.estado.indexOf('CONFORME')!==0)return 'No se puede cerrar: primero valide la rendición del día y resuelva cualquier diferencia.';
  const sh=ss().getSheetByName(HOJA_CIERRES_CAJA),d=sh.getDataRange().getValues();for(let i=d.length-1;i>=1;i--)if(fechaClave_(d[i][0])===fecha)sh.deleteRow(i+1);
  const sis=totalSistemaDia_(fecha),decl=rend.ef+rend.ya+rend.ot;sh.appendRow([crearFecha(fecha),'CERRADO',rend.ef,rend.ya,0,rend.ot,decl,sis,Math.round((decl-sis)*100)/100,rend.obs||'Cierre validado desde Rendición',usuarioSistema_(),new Date()]);SpreadsheetApp.flush();return 'Día '+fecha+' cerrado correctamente y habilitado para Curva S.';
}
