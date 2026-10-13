create table public.event_ad_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete set null,
  event_title text not null check (char_length(trim(event_title)) between 3 and 180),
  payer_name text not null check (char_length(trim(payer_name)) between 2 and 160),
  amount numeric(12, 2) not null check (amount > 0),
  payment_reference text,
  confirmed_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  check (
    (voided_at is null and voided_by is null and void_reason is null)
    or
    (voided_at is not null and voided_by is not null and void_reason is not null and char_length(trim(void_reason)) > 0)
  ),
  check (payment_reference is null or char_length(payment_reference) <= 200)
);

create index event_ad_payments_rank on public.event_ad_payments (event_id, confirmed_at desc)
  where voided_at is null;

create policy "Admins can create approved events" on public.events
  for insert to authenticated with check (
    (select public.is_admin())
    and status = 'approved'
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
  );

alter table public.event_ad_payments enable row level security;

create policy "Admins can read ad payment records" on public.event_ad_payments
  for select to authenticated using ((select public.is_admin()));
create policy "Admins can confirm ad payments" on public.event_ad_payments
  for insert to authenticated with check (
    (select public.is_admin())
    and confirmed_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.title = event_title
        and e.status = 'approved'
        and (e.event_date + e.start_time) > (now() at time zone 'Africa/Mbabane')
    )
  );
create or replace function public.void_event_ad_payment(payment_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can void ad payments'
      using errcode = '42501';
  end if;
  if reason is null or char_length(trim(reason)) = 0 or char_length(reason) > 500 then
    raise exception 'A reason of up to 500 characters is required'
      using errcode = '22023';
  end if;
  update public.event_ad_payments
  set voided_by = (select auth.uid()),
      voided_at = now(),
      void_reason = trim(reason)
  where id = payment_id and voided_at is null;
  if not found then
    raise exception 'Ad payment was not found or is already voided'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace view public.event_ad_rankings
with (security_barrier = true)
as
select e.id as event_id,
  row_number() over (
    order by sum(p.amount) desc, e.event_date asc, e.start_time asc, e.created_at asc
  )::integer as sponsored_rank
from public.events e
join public.event_ad_payments p on p.event_id = e.id and p.voided_at is null
where e.status = 'approved'
  and (e.event_date + e.start_time) > (now() at time zone 'Africa/Mbabane')
group by e.id, e.event_date, e.start_time, e.created_at;

revoke all on public.event_ad_payments from anon, authenticated;
grant select, insert on public.event_ad_payments to authenticated;
revoke all on public.event_ad_rankings from anon, authenticated;
grant select on public.event_ad_rankings to anon, authenticated;
revoke all on function public.void_event_ad_payment(uuid, text) from public, anon;
grant execute on function public.void_event_ad_payment(uuid, text) to authenticated;
