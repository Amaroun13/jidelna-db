create table if not exists public.review_posts (
    id bigint generated always as identity primary key,
    meal_id integer not null,
    meal_name text not null,
    discord_forum_id text not null,
    discord_thread_id text not null unique,
    closes_at timestamptz not null,
    automatic boolean not null default false,
    schedule_date text,
    meal_variant text,
    created_at timestamptz not null default now(),
    unique (schedule_date, meal_variant)
);

-- Doplnění sloupců u tabulek vytvořených starší verzí aplikace.
alter table public.review_posts
    add column if not exists id bigint;

do $$
declare
    identity_type text;
begin
    select coalesce(attidentity::text, '') into identity_type
    from pg_attribute
    where attrelid = 'public.review_posts'::regclass
      and attname = 'id';

    if coalesce(trim(identity_type), '') = '' then
        create sequence if not exists public.review_posts_id_seq
            owned by public.review_posts.id;
        alter table public.review_posts
            alter column id set default nextval('public.review_posts_id_seq');
    end if;
end
$$;

with maxima as (
    select coalesce(max(id), 0) as max_id
    from public.review_posts
),
missing as (
    select ctid, row_number() over (order by ctid) as position
    from public.review_posts
    where id is null
)
update public.review_posts as posts
set id = maxima.max_id + missing.position
from missing, maxima
where posts.ctid = missing.ctid;

-- Pro tabulky vytvořené před přidáním automatických recenzí doplníme
-- sloupce, které create table if not exists u stávající tabulky nevytvoří.
alter table public.review_posts
    add column if not exists automatic boolean not null default false,
    add column if not exists schedule_date text,
    add column if not exists meal_variant text;

create unique index if not exists review_posts_schedule_variant_idx
    on public.review_posts (schedule_date, meal_variant)
    where schedule_date is not null and meal_variant is not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.review_posts'::regclass
          and contype = 'p'
    ) then
        alter table public.review_posts
            add constraint review_posts_pkey primary key (id);
    end if;
end
$$;

-- identity-sekvence mohou být po přechodu dat nebo ručním vložení záznamů
-- posunuté za aktuální maximální id. Synchronizujeme je, aby nový insert
-- neopakoval již existující primární klíč.
select setval(
    pg_get_serial_sequence('public.review_posts', 'id'),
    coalesce((select max(id) from public.review_posts), 1),
    exists (select 1 from public.review_posts)
);

create table if not exists public.pending_reviews (
    id bigint generated always as identity primary key,
    meal_id integer not null,
    meal_name text not null,
    discord_user_id text not null,
    discord_username text not null,
    rating integer not null check (rating between 1 and 5),
    comment text not null default '',
    status text not null default 'pending' check (status in ('pending', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (meal_id, discord_user_id)
);

alter table public.pending_reviews
    add column if not exists id bigint;

do $$
declare
    identity_type text;
begin
    select coalesce(attidentity::text, '') into identity_type
    from pg_attribute
    where attrelid = 'public.pending_reviews'::regclass
      and attname = 'id';

    if coalesce(trim(identity_type), '') = '' then
        create sequence if not exists public.pending_reviews_id_seq
            owned by public.pending_reviews.id;
        alter table public.pending_reviews
            alter column id set default nextval('public.pending_reviews_id_seq');
    end if;
end
$$;

create table if not exists public.approved_reviews (
    id bigint generated always as identity primary key,
    meal_id integer not null,
    meal_name text not null,
    discord_user_id text not null,
    discord_username text not null,
    rating integer not null check (rating between 1 and 5),
    comment text not null default '',
    approved_at timestamptz not null default now(),
    unique (meal_id, discord_user_id)
);

alter table public.approved_reviews
    add column if not exists id bigint;

do $$
declare
    identity_type text;
begin
    select coalesce(attidentity::text, '') into identity_type
    from pg_attribute
    where attrelid = 'public.approved_reviews'::regclass
      and attname = 'id';

    if coalesce(trim(identity_type), '') = '' then
        create sequence if not exists public.approved_reviews_id_seq
            owned by public.approved_reviews.id;
        alter table public.approved_reviews
            alter column id set default nextval('public.approved_reviews_id_seq');
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.pending_reviews'::regclass
          and contype = 'p'
    ) then
        alter table public.pending_reviews
            add constraint pending_reviews_pkey primary key (id);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.approved_reviews'::regclass
          and contype = 'p'
    ) then
        alter table public.approved_reviews
            add constraint approved_reviews_pkey primary key (id);
    end if;
end
$$;

select setval(
    pg_get_serial_sequence('public.pending_reviews', 'id'),
    coalesce((select max(id) from public.pending_reviews), 1),
    exists (select 1 from public.pending_reviews)
);
select setval(
    pg_get_serial_sequence('public.approved_reviews', 'id'),
    coalesce((select max(id) from public.approved_reviews), 1),
    exists (select 1 from public.approved_reviews)
);

alter table public.review_posts enable row level security;
alter table public.pending_reviews enable row level security;
alter table public.approved_reviews enable row level security;

drop policy if exists "approved_reviews_public_read" on public.approved_reviews;

create policy "approved_reviews_public_read"
    on public.approved_reviews
    for select
    to anon, authenticated
    using (true);

grant select on table public.approved_reviews to anon, authenticated;

grant all on table public.review_posts to service_role;
grant all on table public.pending_reviews to service_role;
grant all on table public.approved_reviews to service_role;

grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
