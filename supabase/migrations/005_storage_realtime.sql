insert into storage.buckets(id,name,public) values ('comprobantes','comprobantes',false),('evidencias-entrega','evidencias-entrega',false),('documentos','documentos',false) on conflict(id) do nothing;
create policy "authenticated upload comprobantes" on storage.objects for insert to authenticated with check(bucket_id in ('comprobantes','evidencias-entrega','documentos'));
create policy "authenticated read own operational files" on storage.objects for select to authenticated using(bucket_id in ('comprobantes','evidencias-entrega','documentos'));
alter publication supabase_realtime add table public.pedidos;
alter publication supabase_realtime add table public.eventos;
alter publication supabase_realtime add table public.gastos;
