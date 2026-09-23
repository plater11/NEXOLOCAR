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
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Lima',reducedMotion:'reduce'});
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
  if(fn === 'validarCargaMasivaInventario')return route.fulfill({json:{ok:true,resultado:{ok:true,filas:[{codigo:'QA0',producto:products[0].nombre,presentacion:'Paquete',factor:10,stockActual:10,cantidad:63,stockNuevo:73,costoActual:100,nuevoCosto:null}],errores:[],resumen:{productos:1,filas:1,cantidadPresentaciones:63,valorEstimado:6300}}}});
  if(fn === 'obtenerPreparacionPedido')return route.fulfill({json:{ok:true,resultado:{lineas:[{codigo:'QA0',producto:products[0].nombre,cantidadPedido:2,precio:15,subtotal:30,presentacion:'Paquete',factorPresentacion:10,cantidadPreparada:0,estadoLinea:'PENDIENTE'}]}}});
  const values={obtenerSesion:session,obtenerClientes:clients,obtenerCatalogoProductos:products,obtenerEmisiones:orders,obtenerCobranzaPedidos:orders,obtenerActividadReciente:[],obtenerResumen:{totalClientes:1,totalProductos:12,valorTotalInventario:12000,periodo:{periodo:day.slice(0,7)+'-01',estado:'ABIERTO'}},obtenerPlaneamientoMensual:plan,obtenerContabilidadDiaria:{},obtenerCurvaS:{},obtenerResumenFinanciero:{cobrado:0,gastos:0,ventas:0,porCobrar:90,cobrosPorDia:{},gastosPorDia:{}},obtenerRendicionDia:{declarado:{},validacion:null},obtenerResumenJornada:{gastos:{total:0},cobros:{},saldos:{}},obtenerUsuarios:[{usuario:'qa',nombre:'Prueba Visual',perfil:'MASTER',estado:'ACTIVO',permisos:['configuracion']} ]};
  return route.fulfill({json:{ok:true,resultado:['registrarGastoOperacion','registrarMovimiento'].includes(fn) ? 'Registrado correctamente' : values[fn] ?? []}});
 });
 await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3100');
 await page.getByText('Hola, Prueba',{exact:true}).waitFor({timeout:90000});
 await page.waitForLoadState('networkidle');
 async function shot(name) {
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(overflow.scroll>width+1)errors.push({width,screen:name,overflow});
  await page.screenshot({path:`artifacts/stitch-qa/${name}-${width}.png`,fullPage:!['carrito','detalle-pedido'].includes(name)});
 }
 await shot('inicio');
 const drawer=page.locator('#nexa-navigation');
 const menuTrigger=page.getByRole('button',{name:'Abrir menú',exact:true});
 if(width<=900){
   if(await drawer.isVisible())throw new Error('Closed mobile drawer remains visible');
   await menuTrigger.click();
   await page.getByRole('dialog',{name:'Navegación principal'}).waitFor();
   if(!await page.locator('.workspace').evaluate(el=>el.inert))throw new Error('Drawer does not isolate background');
   await page.getByRole('button',{name:'Cerrar sesión',exact:true}).focus();
   await page.keyboard.press('Tab');
   if(!await page.getByRole('button',{name:'Cerrar menú',exact:true}).evaluate(el=>el===document.activeElement))throw new Error('Focus escaped drawer');
   await shot('menu-lateral');
   await page.keyboard.press('Escape');
   await drawer.waitFor({state:'hidden'});
   if(!await menuTrigger.evaluate(el=>el===document.activeElement))throw new Error('Menu focus not restored');
 } else if(!await drawer.isVisible())throw new Error('Desktop navigation is hidden');
 if(await page.locator('.menu-group-items:not([hidden])').count())throw new Error('Submenus should start collapsed');
 for(const [label,child,selector] of [['Clientes',null,'.sx-directory'],['Preventa','Nueva preventa','.sx-catalogue'],['Pedidos','Por comprar','.sx-order-grid'],['Inventario','Existencias','.sx-stock-grid'],['Inventario','Nuevo ingreso','.sx-stock-entry'],['Gestión financiera','Cuentas por cobrar','.sx-hero-green'],['Gestión financiera','Análisis de ventas','.sx-split'],['Gestión financiera','Reporte de caja','.sx-metrics'],['Reportes',null,'.sx-material-report'],['Administración','Usuarios','.sx-admin-users'],['Administración','Mantenimiento','.sx-layout'],['Rendiciones','Nueva rendición','.sx-expense-fields']]) {
  const menu=page.getByRole('button',{name:'Abrir menú',exact:true});
  if(await menu.isVisible())await menu.click();
  const nav=page.locator('.stitch-sidebar-menu');
  const primary=nav.locator('.sidebar-primary-item').filter({hasText:label});
  if(!child || await primary.getAttribute('aria-expanded') !== 'true')await primary.click();
  if(child && label !== 'Preventa')await nav.locator('.menu-group-items button').filter({hasText:child}).click();
  await page.locator(selector).first().waitFor({timeout:15000});
  await page.waitForTimeout(250);
  await shot((child || label).replaceAll(' ','-'));
  console.log(JSON.stringify({width,screen:child || label,passed:true}));
  if(label === 'Clientes') {
    await page.goBack();
    await page.getByText('Hola, Prueba',{exact:true}).waitFor();
    await page.goForward();
    await page.locator('.sx-directory').waitFor();
  }
  if(label === 'Reportes') {
    await page.locator('.sx-report-filters select').selectOption('Limpieza');
    const materialRows=page.locator('.sx-material-ranking article');
    if(await materialRows.count() !== 6)throw new Error('Family filter did not apply');
    await page.getByRole('button',{name:'Por reponer',exact:true}).click();
    if(await materialRows.count() !== 0)throw new Error('Replenishment filter incorrect');
    await page.getByRole('button',{name:'Código',exact:true}).click();
    const downloaded=page.waitForEvent('download');
    await page.getByRole('button',{name:'↓ Excel',exact:true}).click();
    const download=await downloaded;
    if(!download.suggestedFilename().endsWith('.xlsx'))throw new Error('Material export missing');
  }
  if(child === 'Nueva preventa') {
    if(await page.locator('.stitch-sidebar-menu .sidebar-primary-item').filter({hasText:'Preventa'}).getAttribute('aria-expanded') !== null)throw new Error('Preventa still has submenu');
    const tabs=page.locator('.sx-sales-tabs button');
    const tabWidths=await tabs.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));
    if(Math.abs(tabWidths[0]-tabWidths[1])>1)throw new Error('Preventa tabs have unequal widths');
    const beforeTabs=await page.locator('.sx-sales-tabs').boundingBox();
    await page.getByRole('button',{name:'Borradores (0)',exact:true}).click();
    await page.locator('.sx-draft-list').waitFor();
    const afterTabs=await page.locator('.sx-sales-tabs').boundingBox();
    if(!beforeTabs || !afterTabs || ['x','y','width','height'].some(key=>Math.abs(beforeTabs[key]-afterTabs[key])>1))throw new Error('Tabs shifted switching to drafts');
    await shot('borradores-estable');
    await page.goBack();
    await page.locator('.sx-catalogue').waitFor();
    const launch=page.locator('.sx-cart-launch');
    const box=await launch.boundingBox();
    if(!box || box.y<0 || box.y+box.height>900)throw new Error('Cart not in viewport');
    await page.getByRole('textbox',{name:'Buscar cliente',exact:true}).fill('Cliente');
    await page.locator('.sx-client-options button').first().click();
    await page.getByRole('button',{name:'Seleccionar Producto mayorista 1 paquete x10',exact:true}).click();
    if(!await launch.innerText().then(t=>t.includes('15.00')))throw new Error('Card did not add material');
    await page.getByRole('button',{name:'Agregar Producto mayorista 1 paquete x10',exact:true}).click();
    if(!await launch.innerText().then(t=>t.includes('30.00')))throw new Error('Plus added incorrect quantity');
    await page.locator('.sx-cart-launch').click();
    const cart=page.getByRole('dialog',{name:'Carrito de preventa'});
    await cart.getByLabel('Cliente del pedido').fill('zz-no-existe');
    await cart.getByText('No se encontraron clientes.',{exact:true}).waitFor();
    if(await cart.getByRole('button',{name:'Registrar preventa',exact:true}).isEnabled())throw new Error('Sale allowed without client');
    await cart.getByLabel('Cliente del pedido').fill('999999999');
    await cart.locator('.sx-cart-client-results button').first().click();
    if(!await cart.getByRole('button',{name:'Registrar preventa',exact:true}).isEnabled())throw new Error('Cart client not selected');
    if((await cart.locator('.sx-item-count').innerText())!=='1')throw new Error('Wrong material count');
    await page.goBack();
    await cart.waitFor({state:'hidden'});
    await page.locator('.sx-catalogue').waitFor();
    await launch.click();
    await cart.getByRole('spinbutton',{name:'Cantidad de Producto mayorista 1 paquete x10',exact:true}).fill('2');
    if(!(await cart.locator('.sx-cart-total').innerText()).includes('30.00'))throw new Error('Wrong cart total');
    await shot('carrito');
    await cart.getByRole('button',{name:'Guardar borrador',exact:true}).click();
    await cart.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Continuar preventa',exact:true}).click();
    if(!(await launch.innerText()).includes('30.00'))throw new Error('Draft total not restored');
    await launch.click();
    await page.keyboard.press('Escape');
    await cart.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Borradores (1)',exact:true}).click();
    await page.locator('.sx-draft-list').waitFor();
    await page.goBack();
    await page.locator('.sx-catalogue').waitFor();
  }
  if(child === 'Por comprar') {
    await page.getByRole('button',{name:'QA-PEDIDO-0',exact:true}).click();
    await page.getByRole('dialog',{name:'Detalle y estado del pedido'}).waitFor();
    await page.getByRole('spinbutton',{name:'Preparado de Producto mayorista 1 paquete x10',exact:true}).waitFor();
    await shot('detalle-pedido');
    await page.getByRole('button',{name:'Cerrar detalle del pedido',exact:true}).click();
  }
  if(child === 'Nuevo ingreso') {
    await page.getByRole('button',{name:'Producto mayorista 1 paquete x10 QA0',exact:true}).click();
    await page.getByLabel('Cantidad de presentaciones').fill('63');
    await shot('ingreso-63-paquetes');
    await page.getByRole('button',{name:'Confirmar movimiento',exact:true}).click();
    await page.locator('.sx-stock-grid').waitFor();
    const movement=movements.at(-1);
    if(movement.cantidad !== 63 || movement.factor !== 10 || !movement.solicitudId)throw new Error('Incorrect wholesale stock payload');
    await page.getByLabel('Vista de inventario').selectOption('Carga masiva');
    const bulk=page.locator('.sx-bulk-stock');
    const confirm=bulk.getByRole('button',{name:/Confirmar ingreso/});
    if(await confirm.isEnabled())throw new Error('Bulk import enabled before validation');
    await bulk.getByLabel('Archivo de ingreso de stock').setInputFiles({name:'stock.csv',mimeType:'text/csv',buffer:Buffer.from('Código,Presentación,Cantidad a ingresar\nQA0,Paquete,63')});
    await bulk.locator('.sx-bulk-preview article').waitFor();
    if(!await confirm.isEnabled())throw new Error('Validated file not available for confirmation');
    await shot('carga-masiva');
    await bulk.getByRole('button',{name:'Descartar archivo',exact:true}).click();
    if(await bulk.locator('.sx-bulk-preview article').count() || await confirm.isEnabled())throw new Error('Discard did not clear preview');
    if(requests.includes('importarCargaMasivaInventario'))throw new Error('Preview/discard wrote stock');
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
