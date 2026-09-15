// Local, mocked API checks: never sends mutations to production.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, executablePath:process.env.TEST_CHROME});
const day = new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const session = {ok:true,token:'local-ui-fixture',usuario:'qa',nombre:'Prueba Visual',perfil:'MASTER',permisos:[]};
const clients = [{id:'QA1',nombre:'Cliente',apellidos:'de prueba',contacto:'999999999',direccion:'Dirección de prueba',correo:'',fechaCumpleanos:'1990-09-15',estado:'ACTIVO'}];
const products = Array.from({length:12},(_,i)=>({codigo:`QA${i}`,nombre:`Producto mayorista ${i+1} paquete x10`,grupo:i%2?'Limpieza':'Ferretería',stock:100,stockMin:5,precioCosto:10,precioVenta:15,unidad:'Paquete',nombrePresentacion:'Paquete',factorPresentacion:10}));
const orders = Array.from({length:3},(_,i)=>({ventaId:`QA-PEDIDO-${i}`,fecha:day,cliente:'Cliente de prueba',total:30,itemsCount:1,observaciones:'',estadoOperativo:'POR_COMPRAR',estadoEntrega:'POR_COMPRAR',saldo:30,telefono:'999999999',items:[{codigo:'QA0',nombre:products[0].nombre,cantidad:2,precioUnitario:15,subtotal:30}]}));
const plan = {filas:[{categoria:'Combustible',concepto:'Combustible',tipo:'GASTO',monto:100,activo:true}],resumen:{},objetivo:1000};
const errors=[]; const requests=[]; const movements=[];
await mkdir('artifacts/stitch-qa',{recursive:true});
for (const width of [390,768,1440]) {
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Lima'});
 await context.addInitScript(s=>localStorage.setItem('nexoventa_session',JSON.stringify(s)),session);
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push({width,message:e.message}));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='localhost' && url.hostname!=='127.0.0.1') return route.abort();
  if(url.pathname==='/api/data-source')return route.fulfill({json:{ok:true,label:'QA LOCAL',database:{connected:true}}});
  if(url.pathname!=='/api/qaso')return route.continue();
  const {fn,args}=route.request().postDataJSON();requests.push(fn);
  if(fn === 'registrarMovimiento')movements.push(args[0]);
  const values={obtenerSesion:session,obtenerClientes:clients,obtenerCatalogoProductos:products,obtenerEmisiones:orders,obtenerCobranzaPedidos:orders,obtenerActividadReciente:[],obtenerResumen:{totalClientes:1,totalProductos:12,valorTotalInventario:12000,periodo:{periodo:day.slice(0,7)+'-01',estado:'ABIERTO'}},obtenerPlaneamientoMensual:plan,obtenerContabilidadDiaria:{},obtenerCurvaS:{},obtenerResumenFinanciero:{cobrado:0,gastos:0,ventas:0,porCobrar:90,cobrosPorDia:{},gastosPorDia:{}},obtenerRendicionDia:{declarado:{},validacion:null},obtenerResumenJornada:{gastos:{total:0},cobros:{},saldos:{}},obtenerUsuarios:[{usuario:'qa',nombre:'Prueba Visual',perfil:'MASTER',estado:'ACTIVO',permisos:['configuracion']} ]};
  return route.fulfill({json:{ok:true,resultado:['registrarGastoOperacion','registrarMovimiento'].includes(fn) ? 'Registrado correctamente' : values[fn] ?? []}});
 });
 await page.goto('http://localhost:3100');
 await page.getByText('Hola, Prueba',{exact:true}).waitFor({timeout:90000});
 async function shot(name) {
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(overflow.scroll>width+1)errors.push({width,screen:name,overflow});
  await page.screenshot({path:`artifacts/stitch-qa/${name}-${width}.png`,fullPage:true});
 }
 await shot('inicio');
 for(const [label,child,selector] of [['Clientes',null,'.sx-directory'],['Preventa','Nueva preventa','.sx-catalogue'],['Pedidos','Por comprar','.sx-order-grid'],['Inventario','Existencias','.sx-stock-grid'],['Inventario','Nuevo ingreso','.sx-stock-entry'],['Gestión financiera','Cuentas por cobrar','.sx-hero-green'],['Gestión financiera','Análisis de ventas','.sx-split'],['Gestión financiera','Reporte de caja','.sx-metrics'],['Administración','Usuarios','.sx-admin-users'],['Administración','Mantenimiento','.sx-layout'],['Rendiciones','Nueva rendición','.sx-expense-fields']]) {
  const menu=page.getByRole('button',{name:'Abrir menú',exact:true});
  if(await menu.isVisible())await menu.click();
  const nav=page.locator('.stitch-sidebar-menu');
  const target=nav.locator('.sidebar-primary-item').filter({has:page.locator('b').getByText(label,{exact:true})});
  const primary=nav.locator('.sidebar-primary-item').filter({hasText:label});
  if(!child || await primary.getAttribute('aria-expanded') !== 'true')await primary.click();
  if(child)await nav.locator('.menu-group-items button').filter({hasText:child}).click();
  await page.locator(selector).first().waitFor({timeout:15000});
  await page.waitForTimeout(250);
  await shot((child || label).replaceAll(' ','-'));
  console.log(JSON.stringify({width,screen:child || label,passed:true}));
  if(child === 'Nuevo ingreso') {
    await page.getByRole('button',{name:'Producto mayorista 1 paquete x10 QA0',exact:true}).click();
    await page.getByLabel('Cantidad de presentaciones').fill('63');
    await shot('ingreso-63-paquetes');
    await page.getByRole('button',{name:'Confirmar movimiento',exact:true}).click();
    await page.locator('.sx-stock-grid').waitFor();
    const movement=movements.at(-1);
    if(movement.cantidad !== 63 || movement.factor !== 10 || !movement.solicitudId)throw new Error('Incorrect wholesale stock payload');
  }
  if(child === 'Nueva rendición') {
    await page.locator('#expense-amount').fill('120');
    await page.getByLabel('Descripción',{exact:true}).fill('Gasto de prueba local');
    await page.getByRole('button',{name:'Registrar gasto',exact:true}).click();
    await page.getByText('Registro exitoso',{exact:true}).waitFor();
    if(await page.locator('.sx-expense-fields').count())throw new Error('Expense form did not close');
    await page.getByRole('button',{name:'Entendido',exact:true}).click();
  }
 }
 await context.close();
}
await browser.close();
console.log(JSON.stringify({errors,requests:[...new Set(requests)]},null,2));
if(errors.length)process.exitCode=1;
