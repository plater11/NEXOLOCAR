alter table public.usuarios_perfil
  add column if not exists usuario text,
  add column if not exists perfil_legacy text,
  add column if not exists permisos text[] not null default '{}',
  add column if not exists comentarios text not null default '',
  add column if not exists ultimo_login timestamptz;

create unique index if not exists usuarios_perfil_usuario_key
  on public.usuarios_perfil (lower(usuario))
  where usuario is not null;

update public.usuarios_perfil
set perfil_legacy = case rol
  when 'ADMINISTRADOR' then 'MASTER'
  when 'PREVENTISTA' then 'PREVENTA'
  when 'ALMACENERO' then 'COMPRADOR'
  else rol
end
where perfil_legacy is null;
