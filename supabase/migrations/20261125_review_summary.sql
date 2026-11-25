create or replace function public.get_review_summary(p_meal_id integer)
returns table (review_count bigint, rating_sum bigint)
language sql
stable
security invoker
set search_path = ''
as $$
    select count(*)::bigint, coalesce(sum(reviews.rating), 0)::bigint
    from public.approved_reviews as reviews
    where reviews.meal_id = p_meal_id;
$$;

revoke all on function public.get_review_summary(integer) from public;
grant execute on function public.get_review_summary(integer) to anon, authenticated;
