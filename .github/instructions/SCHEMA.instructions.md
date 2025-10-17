create table public.users (
id uuid primary key default gen_random_uuid(),
auth_user_id uuid not null unique references auth.users(id) on delete cascade,
name text not null,
email text not null unique,
role text not null check (role in ('admin', 'member')),
is_banned boolean not null default false,
created_at timestamp with time zone default timezone('utc', now())
);

create table public.faces (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references public.users(id) on delete cascade,
embedding jsonb not null,
image_url text not null,
created_at timestamp with time zone default timezone('utc', now())
);

create table public.visits (
id uuid primary key default gen_random_uuid(),
timestamp timestamp with time zone default timezone('utc', now()),
status text not null check (status in ('accepted', 'rejected')),
image_url text not null,
matched_user_id uuid references public.users(id) on delete set null
);

alter table public.users enable row level security;
alter table public.faces enable row level security;
alter table public.visits enable row level security;

create policy "Users: only admins can select" on public.users
for select using ( (auth.uid() is not null) and (exists (
select 1 from public.users u
where u.auth_user_id = auth.uid() and u.role = 'admin'
)));

create policy "Users: only admins can modify" on public.users
for all using (exists (
select 1 from public.users u
where u.auth_user_id = auth.uid() and u.role = 'admin'
));

create policy "Faces: admins only" on public.faces
for all using (exists (
select 1 from public.users u
where u.auth_user_id = auth.uid() and u.role = 'admin'
));

create policy "Visits: admins read" on public.visits
for select using (exists (
select 1 from public.users u
where u.auth_user_id = auth.uid() and u.role = 'admin'
));

create policy "Visits: anyone signed in can insert" on public.visits
for insert with check (auth.uid() is not null);

create policy "Visits: admins manage" on public.visits
for all using (exists (
select 1 from public.users u
where u.auth_user_id = auth.uid() and u.role = 'admin'
));

create or replace function public.handle_new_auth_user()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
insert into public.users (auth_user_id, name, email, role)
values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email, 'member');
return new;
end;

$$
;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
$$
