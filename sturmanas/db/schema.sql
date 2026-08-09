-- ═══════════ Šturmanas — duomenų bazė (Supabase) ═══════════
-- Paskyros: Supabase Auth (paštas + slaptažodis).
-- Esmė: laikai matomi TIK savo rato draugams. Jokio viešo reitingo.
-- Saugu leisti pakartotinai.

-- ── Profilis (vardas, kurį mato draugai) ──
create table if not exists public.profiliai (
  id uuid primary key references auth.users(id) on delete cascade,
  vardas text not null default 'Vairuotojas',
  sukurta timestamptz not null default now()
);

-- ── Draugų ratas ──
create table if not exists public.ratai (
  id uuid primary key default gen_random_uuid(),
  kodas text unique not null,               -- pvz. RALIS-7K2M
  pavadinimas text not null default 'Mano ratas',
  savininkas uuid not null references auth.users(id) on delete cascade,
  sukurta timestamptz not null default now()
);

create table if not exists public.rato_nariai (
  ratas uuid not null references public.ratai(id) on delete cascade,
  vartotojas uuid not null references auth.users(id) on delete cascade,
  prisijungė timestamptz not null default now(),
  primary key (ratas, vartotojas)
);

-- ── Važiavimo rezultatai ──
create table if not exists public.rezultatai (
  id uuid primary key default gen_random_uuid(),
  vartotojas uuid not null references auth.users(id) on delete cascade,
  trasa text not null,                      -- routeHash: ta pati trasa = tas pats raktas
  trasos_vardas text default '',
  km numeric(6,1) not null,
  sek int not null,
  vid_v int, maks_v int, sklandumas int,
  sukurta timestamptz not null default now()
);
create index if not exists idx_rez_trasa on public.rezultatai(trasa);
create index if not exists idx_rez_vart on public.rezultatai(vartotojas);

-- ── Savos trasos (dalijimasis) ──
create table if not exists public.trasos (
  id uuid primary key default gen_random_uuid(),
  kodas text unique not null,               -- dalijimosi kodas nuorodai
  savininkas uuid not null references auth.users(id) on delete cascade,
  pavadinimas text not null default 'Mano trasa',
  hash text not null,                       -- routeHash — sieja su rezultatais
  km numeric(6,1), posukiu int, cpk numeric(5,1),
  geometrija text not null,                 -- polyline (koduota)
  vieša boolean not null default false,     -- true = mato visi, turintys nuorodą
  sukurta timestamptz not null default now()
);

-- ═══════════ RLS: kas ką mato ═══════════
alter table public.profiliai   enable row level security;
alter table public.ratai       enable row level security;
alter table public.rato_nariai enable row level security;
alter table public.rezultatai  enable row level security;
alter table public.trasos      enable row level security;

-- Pagalbinė: ar mudu bendrame rate? (security definer — kad RLS nesirekursuotų)
create or replace function public.bendras_ratas(a uuid, b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from rato_nariai x
    join rato_nariai y on y.ratas = x.ratas
    where x.vartotojas = a and y.vartotojas = b
  );
$$;

-- Profiliai: matau save ir savo rato draugus
drop policy if exists prof_select on public.profiliai;
create policy prof_select on public.profiliai for select to authenticated
  using (id = auth.uid() or public.bendras_ratas(auth.uid(), id));
drop policy if exists prof_upsert on public.profiliai;
create policy prof_upsert on public.profiliai for insert to authenticated with check (id = auth.uid());
drop policy if exists prof_update on public.profiliai;
create policy prof_update on public.profiliai for update to authenticated using (id = auth.uid());

-- Ar esu šiame rate? (security definer — kitaip taisyklė rekursuotų pati į save)
create or replace function public.esu_rate(p_ratas uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from rato_nariai where ratas = p_ratas and vartotojas = auth.uid());
$$;
grant execute on function public.esu_rate(uuid) to authenticated;

-- Ratai: matau tuos, kuriuose esu; kurti gali bet kas (sau)
drop policy if exists rat_select on public.ratai;
create policy rat_select on public.ratai for select to authenticated
  using (savininkas = auth.uid() or public.esu_rate(id));
drop policy if exists rat_insert on public.ratai;
create policy rat_insert on public.ratai for insert to authenticated with check (savininkas = auth.uid());
drop policy if exists rat_delete on public.ratai;
create policy rat_delete on public.ratai for delete to authenticated using (savininkas = auth.uid());

-- Narystės: matau savo ratų narius; prisijungti/išeiti galiu tik pats
drop policy if exists nar_select on public.rato_nariai;
create policy nar_select on public.rato_nariai for select to authenticated
  using (vartotojas = auth.uid() or public.esu_rate(ratas));
drop policy if exists nar_insert on public.rato_nariai;
create policy nar_insert on public.rato_nariai for insert to authenticated with check (vartotojas = auth.uid());
drop policy if exists nar_delete on public.rato_nariai;
create policy nar_delete on public.rato_nariai for delete to authenticated using (vartotojas = auth.uid());

-- Rezultatai: SAVO + rato draugų. Vieši reitingai negalimi pagal dizainą.
drop policy if exists rez_select on public.rezultatai;
create policy rez_select on public.rezultatai for select to authenticated
  using (vartotojas = auth.uid() or public.bendras_ratas(auth.uid(), vartotojas));
drop policy if exists rez_insert on public.rezultatai;
create policy rez_insert on public.rezultatai for insert to authenticated with check (vartotojas = auth.uid());
drop policy if exists rez_delete on public.rezultatai;
create policy rez_delete on public.rezultatai for delete to authenticated using (vartotojas = auth.uid());

-- Trasos: savo ir rato draugų. „Vieša" trasa NĖRA randama naršant —
-- ji pasiekiama tik pagal kodą, per trasa_pagal_koda() žemiau.
drop policy if exists tra_select on public.trasos;
create policy tra_select on public.trasos for select to authenticated
  using (savininkas = auth.uid() or public.bendras_ratas(auth.uid(), savininkas));
drop policy if exists tra_insert on public.trasos;
create policy tra_insert on public.trasos for insert to authenticated with check (savininkas = auth.uid());
drop policy if exists tra_update on public.trasos;
create policy tra_update on public.trasos for update to authenticated using (savininkas = auth.uid());
drop policy if exists tra_delete on public.trasos;
create policy tra_delete on public.trasos for delete to authenticated using (savininkas = auth.uid());

-- Naujam vartotojui — profilis automatiškai
create or replace function public.naujas_vartotojas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiliai (id, vardas)
  values (new.id, coalesce(new.raw_user_meta_data->>'vardas', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists trg_naujas_vartotojas on auth.users;
create trigger trg_naujas_vartotojas after insert on auth.users
  for each row execute function public.naujas_vartotojas();

-- Prisijungimas prie rato pagal kodą (kodo žinojimas = teisė įeiti)
create or replace function public.jungtis_i_rata(p_kodas text)
returns table(ratas uuid, pavadinimas text)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select id, ratai.pavadinimas into r from ratai where kodas = upper(trim(p_kodas));
  if not found then raise exception 'Tokio rato nėra'; end if;
  insert into rato_nariai (ratas, vartotojas) values (r.id, auth.uid()) on conflict do nothing;
  return query select r.id, r.pavadinimas;
end $$;
grant execute on function public.jungtis_i_rata(text) to authenticated;

-- Kodo žinojimas = teisė gauti tą vieną trasą (ir nieko daugiau)
create or replace function public.trasa_pagal_koda(p_kodas text)
returns table(id uuid, kodas text, pavadinimas text, hash text, km numeric,
              posukiu int, cpk numeric, geometrija text, savininkas uuid)
language sql security definer stable set search_path = public as $$
  select t.id, t.kodas, t.pavadinimas, t.hash, t.km, t.posukiu, t.cpk, t.geometrija, t.savininkas
  from trasos t
  where t.kodas = upper(trim(p_kodas)) and t.vieša = true;
$$;
grant execute on function public.trasa_pagal_koda(text) to authenticated;
