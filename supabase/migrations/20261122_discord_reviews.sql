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

alter table public.review_posts enable row level security;
alter table public.pending_reviews enable row level security;
alter table public.approved_reviews enable row level security;

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
