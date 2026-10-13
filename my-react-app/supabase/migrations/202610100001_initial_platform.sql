create extension if not exists pgcrypto with schema extensions;

create type public.account_role as enum ('member', 'organizer', 'admin');
create type public.host_application_status as enum ('pending', 'approved', 'rejected');
create type public.event_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
create type public.event_attendance_status as enum ('going', 'attended', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  role public.account_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.host_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_name text not null check (char_length(trim(organization_name)) between 2 and 160),
  description text not null check (char_length(trim(description)) between 20 and 3000),
  location text not null check (char_length(trim(location)) between 2 and 120),
  website text,
  contact_phone text,
  status public.host_application_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text,
  constraint host_application_website_url check (website is null or website ~* '^https://')
);

create unique index one_pending_host_application_per_user
  on public.host_applications (user_id) where status = 'pending';

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text not null check (char_length(trim(description)) between 20 and 3000),
  location text not null check (char_length(trim(location)) between 2 and 120),
  website text,
  contact_email text not null,
  contact_phone text,
  logo_path text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_website_url check (website is null or website ~* '^https://')
);

create table public.categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.categories (slug, name) values
  ('music', 'Music'), ('comedy', 'Comedy'), ('business', 'Business'),
  ('networking', 'Networking'), ('workshops', 'Workshops'), ('seminars', 'Seminars'),
  ('conferences', 'Conferences'), ('education', 'Education'), ('sports', 'Sports'),
  ('arts-culture', 'Arts & Culture'), ('food-lifestyle', 'Food & Lifestyle'),
  ('markets', 'Markets'), ('festivals', 'Festivals'), ('family', 'Family'),
  ('kids', 'Kids'), ('community', 'Community'), ('church-faith', 'Church & Faith'),
  ('technology', 'Technology'), ('health-wellness', 'Health & Wellness'),
  ('career', 'Career'), ('government', 'Government'), ('charity', 'Charity'),
  ('online-events', 'Online Events'), ('other', 'Other')
on conflict (slug) do nothing;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null check (char_length(trim(description)) between 20 and 10000),
  category_slug text not null references public.categories (slug),
  event_type text not null default 'in-person' check (event_type in ('in-person', 'online')),
  event_date date not null,
  start_time time not null,
  end_time time not null,
  venue text,
  address text,
  city text not null check (char_length(trim(city)) between 1 and 120),
  country text not null default 'Eswatini' check (char_length(trim(country)) between 1 and 120),
  price numeric(12, 2) not null default 0 check (price >= 0),
  ticket_url text,
  online_url text,
  contact_email text,
  image_path text,
  status public.event_status not null default 'pending',
  featured boolean not null default false,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (
    (event_type = 'online' and online_url is not null and online_url ~* '^https://')
    or
    (event_type = 'in-person' and venue is not null and char_length(trim(venue)) > 0)
  ),
  check (ticket_url is null or ticket_url ~* '^https://')
);

create index events_public_listing on public.events (event_date, created_at desc)
  where status = 'approved';
create index events_by_organizer on public.events (organizer_id, event_date desc);

create table public.event_attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.event_attendance_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_attendance_by_user on public.event_attendance (user_id, created_at desc);

create table public.event_ratings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review text check (review is null or char_length(review) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_ratings_by_event on public.event_ratings (event_id, created_at desc);

create table public.saved_events (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.organizer_follows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, organizer_id)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 120),
  target_user_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role')
    and (
      new.role is distinct from old.role
      or new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
    )
    and not public.is_admin() then
    raise exception 'Only administrators can change account roles'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted_name text;
begin
  submitted_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if submitted_name is null or char_length(submitted_name) > 120 then
    raise exception 'A valid full name is required';
  end if;
  insert into public.profiles (id, full_name)
  values (new.id, submitted_name);
  return new;
end;
$$;

create trigger auth_user_profile_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.guard_event_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owns_event boolean;
begin
  if public.is_admin() then
    return new;
  end if;
  select exists (
    select 1 from public.organizers o
    where o.id = coalesce(new.organizer_id, old.organizer_id)
      and o.owner_id = (select auth.uid())
  ) into owns_event;
  if not owns_event then
    raise exception 'Not authorized to change this event' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.featured then
      raise exception 'Organizer events must be submitted for review';
    end if;
  else
    if new.organizer_id <> old.organizer_id or new.featured <> old.featured then
      raise exception 'Organizers cannot change event ownership or feature status';
    end if;
    if new.status <> old.status and not (old.status in ('draft', 'rejected') and new.status = 'pending') then
      raise exception 'Invalid event status transition';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_attendance_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scheduled_date date;
begin
  if new.event_id is distinct from old.event_id
    or new.user_id is distinct from old.user_id then
    raise exception 'Attendance records cannot be reassigned'
      using errcode = '42501';
  end if;
  if old.status = 'attended' and new.status <> 'attended' and not public.is_admin() then
    raise exception 'Verified attendance cannot be removed'
      using errcode = '42501';
  end if;
  if new.status = 'attended' and old.status is distinct from 'attended' then
    if not public.is_admin() or old.status <> 'going' then
      raise exception 'Only administrators can confirm an RSVP as attended'
        using errcode = '42501';
    end if;
    select e.event_date into scheduled_date
      from public.events e where e.id = new.event_id;
    if scheduled_date is null or scheduled_date >= current_date then
      raise exception 'Attendance can only be confirmed after the event date'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_event_changes
  before insert or update on public.events
  for each row execute function public.guard_event_changes();

create or replace function public.approve_host_application(application_id uuid, approved boolean, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_row public.host_applications%rowtype;
  created_organizer_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into application_row
  from public.host_applications
  where id = application_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending host application not found';
  end if;
  if approved then
    insert into public.organizers (
      owner_id, name, description, location, website, contact_email, contact_phone
    )
    select application_row.user_id, application_row.organization_name,
      application_row.description, application_row.location, application_row.website,
      u.email, application_row.contact_phone
    from auth.users u where u.id = application_row.user_id
    returning id into created_organizer_id;
    update public.profiles set role = 'organizer', updated_at = now()
      where id = application_row.user_id;
    update public.host_applications
      set status = 'approved', reviewed_at = now(), reviewed_by = (select auth.uid()),
          review_note = left(note, 1000)
      where id = application_row.id;
  else
    update public.host_applications
      set status = 'rejected', reviewed_at = now(), reviewed_by = (select auth.uid()),
          review_note = left(note, 1000)
      where id = application_row.id;
  end if;
  insert into public.admin_audit_log (actor_id, action, target_user_id, metadata)
  values (
    (select auth.uid()),
    case when approved then 'host_application_approved' else 'host_application_rejected' end,
    application_row.user_id,
    jsonb_build_object('application_id', application_row.id)
  );
  return created_organizer_id;
end;
$$;

create or replace view public.event_metrics
with (security_invoker = false)
as
select e.id as event_id,
  coalesce(attendance.attendee_count, 0)::integer as attendee_count,
  coalesce(attendance.attendance_count, 0)::integer as attendance_count,
  coalesce(ratings.rating_count, 0)::integer as rating_count,
  ratings.average_rating
from public.events e
left join lateral (
  select count(*) filter (where a.status = 'going') as attendee_count,
    count(*) filter (where a.status = 'attended') as attendance_count
  from public.event_attendance a where a.event_id = e.id
) attendance on true
left join lateral (
  select count(*) as rating_count, round(avg(r.rating)::numeric, 2) as average_rating
  from public.event_ratings r where r.event_id = e.id
) ratings on true
where e.status = 'approved';

create or replace view public.organizer_metrics
with (security_invoker = false)
as
select o.id as organizer_id,
  count(distinct e.id) filter (where e.status = 'approved')::integer as published_event_count,
  count(distinct a.user_id)::integer as unique_attendee_count,
  count(distinct e.id) filter (
    where e.status = 'approved' and e.event_date < current_date
  )::integer as past_event_count,
  count(distinct e.id) filter (
    where e.status = 'approved' and e.event_date >= current_date
  )::integer as upcoming_event_count
from public.organizers o
left join public.events e on e.organizer_id = o.id and e.status = 'approved'
left join public.event_attendance a on a.event_id = e.id and a.status = 'attended'
group by o.id;

create or replace function public.record_event_rating(
  target_event_id uuid,
  score smallint,
  review_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rating_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if score not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if not exists (
    select 1 from public.event_attendance a
    join public.events e on e.id = a.event_id
    where a.event_id = target_event_id
      and a.user_id = (select auth.uid())
      and a.status = 'attended'
      and e.event_date < current_date
  ) then
    raise exception 'Only attendees of past events can leave a rating' using errcode = '42501';
  end if;
  insert into public.event_ratings (event_id, user_id, rating, review)
  values (target_event_id, (select auth.uid()), score, nullif(trim(review_text), ''))
  on conflict (event_id, user_id) do update
    set rating = excluded.rating, review = excluded.review, updated_at = now()
  returning id into rating_id;
  return rating_id;
end;
$$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizers_updated_at before update on public.organizers
  for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger attendance_updated_at before update on public.event_attendance
  for each row execute function public.set_updated_at();
create trigger attendance_guard before update on public.event_attendance
  for each row execute function public.guard_attendance_changes();
create trigger ratings_updated_at before update on public.event_ratings
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.host_applications enable row level security;
alter table public.organizers enable row level security;
alter table public.categories enable row level security;
alter table public.events enable row level security;
alter table public.event_attendance enable row level security;
alter table public.event_ratings enable row level security;
alter table public.saved_events enable row level security;
alter table public.organizer_follows enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "Profiles visible to self and admins" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Members can update their own name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users and admins can view host applications" on public.host_applications
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Members can submit host applications" on public.host_applications
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'member'
    )
  );
create policy "Admins can review host applications" on public.host_applications
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Approved organizers are public" on public.organizers
  for select to anon, authenticated using (true);
create policy "Organizer owners can edit their public profile" on public.organizers
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Admins can manage organizers" on public.organizers
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Active categories are public" on public.categories
  for select to anon, authenticated using (active or (select public.is_admin()));
create policy "Admins can manage categories" on public.categories
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Approved events are public" on public.events
  for select to anon, authenticated using (
    status = 'approved'
    or (select public.is_admin())
    or exists (
      select 1 from public.organizers o
      where o.id = events.organizer_id and o.owner_id = (select auth.uid())
    )
  );
create policy "Approved hosts can submit events" on public.events
  for insert to authenticated with check (
    status = 'pending'
    and featured = false
    and exists (
      select 1 from public.organizers o
      where o.id = events.organizer_id and o.owner_id = (select auth.uid())
    )
  );
create policy "Event owners and admins can update events" on public.events
  for update to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.organizers o
      where o.id = events.organizer_id and o.owner_id = (select auth.uid())
    )
  )
  with check (
    (select public.is_admin())
    or exists (
      select 1 from public.organizers o
      where o.id = events.organizer_id and o.owner_id = (select auth.uid())
    )
  );
create policy "Admins can delete events" on public.events
  for delete to authenticated using ((select public.is_admin()));

create policy "Attendance is visible to its owner and admins" on public.event_attendance
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Users can RSVP to approved events" on public.event_attendance
  for insert to authenticated with check (
    user_id = (select auth.uid()) and status = 'going'
    and exists (
      select 1 from public.events e where e.id = event_id and e.status = 'approved'
    )
  );
create policy "Users can update their own RSVP" on public.event_attendance
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and status in ('going', 'cancelled')
  );
create policy "Admins can manage attendance" on public.event_attendance
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Users can see their own ratings" on public.event_ratings
  for select to authenticated using (
    user_id = (select auth.uid()) or (select public.is_admin())
  );
create policy "Attendees can manage their rating" on public.event_ratings
  for all to authenticated using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.event_attendance a
      where a.event_id = event_ratings.event_id and a.user_id = (select auth.uid())
        and a.status = 'attended'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.event_attendance a
      where a.event_id = event_ratings.event_id and a.user_id = (select auth.uid())
        and a.status = 'attended'
    )
  );
create policy "Admins can manage ratings" on public.event_ratings
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Users can manage their saved events" on public.saved_events
  for all to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e where e.id = event_id and e.status = 'approved'
    )
  );
create policy "Users can manage their organizer follows" on public.organizer_follows
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Only admins can read audit logs" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.organizers, public.events to anon;
grant select, insert, update, delete on public.profiles, public.host_applications,
  public.organizers, public.categories, public.events, public.event_attendance,
  public.event_ratings, public.saved_events, public.organizer_follows to authenticated;
grant select on public.admin_audit_log to authenticated;
grant select on public.event_metrics, public.organizer_metrics to anon, authenticated;
grant execute on function public.approve_host_application(uuid, boolean, text) to authenticated;
grant execute on function public.record_event_rating(uuid, smallint, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Event images are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'event-media');
create policy "Approved organizers upload their own media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.organizers o
      where o.owner_id = (select auth.uid())
    )
  );
create policy "Organizers update their own media" on storage.objects
  for update to authenticated using (
    bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Organizers delete their own media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
