-- ERP catalogs contain only real products. Placeholder codes remain available
-- in history but are hidden from operational catalog and stock templates.
update public.productos
set activo=false,updated_at=now()
where activo=true and upper(btrim(nombre))='SIN NOMBRE';
