-- ============================================================================
-- Competition platform — core schema, RLS policies, and game-logic functions.
-- Multi-tenant: every operational table carries stage_id and is isolated by RLS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('system_admin', 'stage_admin', 'student');

create type player_status as enum (
  'pending', 'rejected', 'active', 'suspended', 'excluded', 'exposed'
);

create type round_status as enum (
  'draft', 'scheduled', 'open', 'closed', 'calculating', 'calculated', 'published'
);

create type publish_mode as enum ('manual', 'auto');

create type reveal_status as enum (
  'pending', 'executed', 'wrong_guess',
  'cancelled_wrong_answer', 'cancelled_target_exposed',
  'cancelled_revealer_exposed', 'cancelled_admin'
);

create type ledger_type as enum (
  'correct_answer', 'reveal_gain', 'admin_adjustment', 'exposed_reset'
);

-- ---------------------------------------------------------------------------
-- stages: one isolated competition/phase
-- ---------------------------------------------------------------------------
create table stages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  logo_url text,
  colors jsonb not null default '{"primary":"#7c3aed","secondary":"#0ea5a4","background":"#0b0b16"}',
  terminology jsonb not null default '{}',
  -- extra registration fields the admin defines per stage, e.g. [{"key":"grade","label":"الصف","required":true}]
  extra_field_defs jsonb not null default '[]',
  registration_open boolean not null default true,
  auto_approve boolean not null default false,
  starting_balance integer not null default 0,
  show_leaderboard boolean not null default true,
  show_balances boolean not null default true,
  enable_risk_indicator boolean not null default true,
  enable_most_wanted boolean not null default true,
  enable_badges boolean not null default true,
  enable_streak boolean not null default true,
  enable_sound_fx boolean not null default true,
  default_reveal_attempts integer not null default 1,
  allow_answer_edit boolean not null default false,
  results_publish_mode publish_mode not null default 'manual',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (student / stage_admin / system_admin)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  stage_id uuid references stages (id) on delete cascade,
  role user_role not null default 'student',
  real_name text,
  display_name text,
  phone text,
  username text,
  emoji text,
  auth_email text not null,
  extra_fields jsonb not null default '{}',
  status player_status not null default 'pending',
  balance integer not null default 0,
  exposed_by uuid references profiles (id),
  exposed_round_id uuid,
  approved_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_needs_stage check (role <> 'student' or stage_id is not null)
);

create unique index profiles_stage_phone_uk on profiles (stage_id, phone) where role = 'student';
create unique index profiles_stage_username_uk on profiles (stage_id, lower(username)) where role = 'student';
create unique index profiles_stage_display_name_uk on profiles (stage_id, lower(display_name)) where role = 'student';
create index profiles_stage_role_idx on profiles (stage_id, role);

-- ---------------------------------------------------------------------------
-- rounds
-- ---------------------------------------------------------------------------
create table rounds (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  round_number integer not null,
  title text not null,
  question text not null,
  options jsonb not null,
  correct_option text not null,
  points integer not null default 10,
  reveal_attempts_allowed integer not null default 1,
  reveal_enabled boolean not null default true,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  publish_mode publish_mode not null default 'manual',
  results_published_at timestamptz,
  open_message text,
  closing_soon_message text,
  post_submit_message text not null default
    'تم استلام إجابتك ومحاولة الكشف بنجاح، وستظهر النتائج بعد اعتماد الجولة.',
  attachment_url text,
  status round_status not null default 'draft',
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (stage_id, round_number),
  check (closes_at > opens_at)
);

create index rounds_stage_status_idx on rounds (stage_id, status);

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
create table submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  selected_option text not null,
  is_correct boolean,
  points_awarded integer,
  submitted_at timestamptz not null default now(),
  edited_at timestamptz,
  unique (round_id, student_id)
);

create index submissions_round_idx on submissions (round_id);

-- ---------------------------------------------------------------------------
-- reveal_attempts
-- ---------------------------------------------------------------------------
create table reveal_attempts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  submission_id uuid not null references submissions (id) on delete cascade,
  revealer_id uuid not null references profiles (id) on delete cascade,
  target_id uuid not null references profiles (id) on delete cascade,
  guessed_real_name text not null,
  is_correct boolean,
  status reveal_status not null default 'pending',
  cancel_reason text,
  attempt_index integer not null default 1,
  sequence_in_round integer,
  submitted_at timestamptz not null default now(),
  processed_at timestamptz,
  check (revealer_id <> target_id)
);

create index reveal_attempts_round_idx on reveal_attempts (round_id, submitted_at);
create index reveal_attempts_target_idx on reveal_attempts (target_id);

-- ---------------------------------------------------------------------------
-- balance_ledger
-- ---------------------------------------------------------------------------
create table balance_ledger (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  round_id uuid references rounds (id) on delete cascade,
  type ledger_type not null,
  amount integer not null,
  balance_before integer not null,
  balance_after integer not null,
  reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index balance_ledger_student_idx on balance_ledger (student_id, created_at);
create index balance_ledger_round_idx on balance_ledger (round_id);

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
create table badges (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  icon text,
  unique (stage_id, code)
);

create table student_badges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  badge_id uuid not null references badges (id) on delete cascade,
  round_id uuid references rounds (id),
  awarded_at timestamptz not null default now(),
  unique (student_id, badge_id)
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  student_id uuid references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_student_idx on notifications (student_id, created_at);

-- ---------------------------------------------------------------------------
-- events_log: public-safe live feed (also feeds the display screen)
-- ---------------------------------------------------------------------------
create table events_log (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  round_id uuid references rounds (id),
  type text not null,
  payload jsonb not null default '{}',
  visible_to_students boolean not null default true,
  created_at timestamptz not null default now()
);

create index events_log_stage_idx on events_log (stage_id, created_at);

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  stage_id uuid references stages (id),
  action text not null,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Helper functions
-- ============================================================================
create or replace function current_profile()
returns profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;

create or replace function is_system_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'system_admin');
$$;

create or replace function is_stage_admin(p_stage_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and status = 'active'
      and ((role = 'stage_admin' and stage_id = p_stage_id) or role = 'system_admin')
  );
$$;

create or replace function is_active_student(p_stage_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'student' and stage_id = p_stage_id and status = 'active'
  );
$$;

-- Public (anon-callable) login resolver: given an identifier (username or phone)
-- and a stage slug, returns the synthetic auth email to sign in with — nothing else.
create or replace function get_login_email(p_stage_slug text, p_identifier text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select p.auth_email into v_email
  from profiles p
  join stages s on s.id = p.stage_id
  where s.slug = p_stage_slug
    and p.role = 'student'
    and p.status not in ('pending', 'rejected')
    and (lower(p.username) = lower(p_identifier) or p.phone = p_identifier)
  limit 1;

  return v_email; -- null if not found; caller shows a generic error either way
end;
$$;

grant execute on function get_login_email(text, text) to anon, authenticated;

-- Safe peer-facing card data: real_name is only ever returned once a player
-- is 'exposed'. Callable by any active student of the stage, or its admins.
create or replace function get_stage_player_cards(p_stage_id uuid)
returns table (
  id uuid,
  display_name text,
  emoji text,
  balance integer,
  status player_status,
  real_name text,
  exposed_by uuid,
  exposed_round_id uuid
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_active_student(p_stage_id) or is_stage_admin(p_stage_id)) then
    raise exception 'not authorized';
  end if;

  return query
    select
      p.id, p.display_name, p.emoji, p.balance, p.status,
      case when p.status = 'exposed' or is_stage_admin(p_stage_id) then p.real_name else null end,
      p.exposed_by, p.exposed_round_id
    from profiles p
    where p.stage_id = p_stage_id and p.role = 'student'
    order by p.balance desc;
end;
$$;

grant execute on function get_stage_player_cards(uuid) to authenticated;

-- Roster of real names for the reveal dropdown, with zero mapping to aliases.
create or replace function get_stage_real_names(p_stage_id uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_active_student(p_stage_id) or is_stage_admin(p_stage_id)) then
    raise exception 'not authorized';
  end if;

  return (
    select coalesce(array_agg(p.real_name order by p.real_name), array[]::text[])
    from profiles p
    where p.stage_id = p_stage_id and p.role = 'student' and p.status = 'active'
  );
end;
$$;

grant execute on function get_stage_real_names(uuid) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table stages enable row level security;
alter table profiles enable row level security;
alter table rounds enable row level security;
alter table submissions enable row level security;
alter table reveal_attempts enable row level security;
alter table balance_ledger enable row level security;
alter table badges enable row level security;
alter table student_badges enable row level security;
alter table notifications enable row level security;
alter table events_log enable row level security;
alter table admin_audit_log enable row level security;

-- stages: public can read stage branding/settings for its own slug page (needed
-- pre-login for register/login screens); write restricted to admins.
create policy stages_select_all on stages for select using (true);
create policy stages_admin_write on stages for all
  using (is_system_admin() or is_stage_admin(id))
  with check (is_system_admin() or is_stage_admin(id));

-- profiles
create policy profiles_self_select on profiles for select
  using (id = auth.uid());

-- NOTE: peers deliberately have NO direct SELECT policy on profiles for other
-- rows. real_name/phone must never be readable by classmates. Peer card data
-- (emoji/display_name/balance/status — real_name only once status='exposed')
-- is served exclusively through the get_stage_player_cards() function below,
-- which enforces the column masking server-side regardless of RLS.

create policy profiles_admin_select on profiles for select
  using (is_system_admin() or is_stage_admin(stage_id));

create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

create policy profiles_self_update_limited on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = 'student');

create policy profiles_admin_write on profiles for update
  using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

create policy profiles_system_admin_insert on profiles for insert
  with check (is_system_admin());

-- rounds
create policy rounds_admin_all on rounds for all
  using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

create policy rounds_student_select_open_or_past on rounds for select
  using (
    is_active_student(stage_id)
    and status in ('open', 'closed', 'calculating', 'calculated', 'published')
  );

-- submissions
create policy submissions_admin_select on submissions for select
  using (is_system_admin() or is_stage_admin((select r.stage_id from rounds r where r.id = round_id)));

create policy submissions_self_select on submissions for select
  using (student_id = auth.uid());

create policy submissions_self_insert on submissions for insert
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from rounds r
      where r.id = round_id and r.status = 'open' and now() between r.opens_at and r.closes_at
    )
  );

create policy submissions_self_update on submissions for update
  using (student_id = auth.uid())
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from rounds r
      where r.id = round_id and r.status = 'open' and now() between r.opens_at and r.closes_at
        and r.stage_id in (select stage_id from stages where allow_answer_edit)
    )
  );

-- reveal_attempts
create policy reveal_admin_select on reveal_attempts for select
  using (is_system_admin() or is_stage_admin((select r.stage_id from rounds r where r.id = round_id)));

create policy reveal_self_select on reveal_attempts for select
  using (revealer_id = auth.uid());

create policy reveal_self_insert on reveal_attempts for insert
  with check (
    revealer_id = auth.uid()
    and target_id <> auth.uid()
    and exists (
      select 1 from rounds r
      where r.id = round_id and r.status = 'open' and r.reveal_enabled
        and now() between r.opens_at and r.closes_at
    )
    and exists (select 1 from profiles t where t.id = target_id and t.status = 'active')
  );

create policy reveal_self_delete on reveal_attempts for delete
  using (
    revealer_id = auth.uid()
    and exists (select 1 from rounds r where r.id = round_id and r.status = 'open')
  );

-- balance_ledger: read-only for owners/admins, writes only via SECURITY DEFINER functions
create policy ledger_self_select on balance_ledger for select
  using (student_id = auth.uid());

create policy ledger_admin_select on balance_ledger for select
  using (is_system_admin() or is_stage_admin(stage_id));

-- badges
create policy badges_select_all on badges for select
  using (stage_id in (select stage_id from profiles where id = auth.uid()) or is_system_admin());

create policy badges_admin_write on badges for all
  using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

create policy student_badges_select on student_badges for select
  using (
    student_id = auth.uid()
    or is_system_admin()
    or is_stage_admin((select p.stage_id from profiles p where p.id = student_id))
  );

-- notifications
create policy notifications_self_select on notifications for select
  using (student_id = auth.uid() or student_id is null);

create policy notifications_self_update on notifications for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy notifications_admin_all on notifications for all
  using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- events_log
create policy events_select_students on events_log for select
  using (visible_to_students and is_active_student(stage_id));

create policy events_admin_all on events_log for all
  using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- admin_audit_log
create policy audit_admin_select on admin_audit_log for select
  using (is_system_admin() or is_stage_admin(stage_id));

create policy audit_admin_insert on admin_audit_log for insert
  with check (is_system_admin() or is_stage_admin(stage_id));

-- ============================================================================
-- Game-logic functions (all SECURITY DEFINER with explicit permission checks
-- so RLS on the invoking role never blocks a legitimate multi-row transition)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- submit_round: one atomic call = answer + reveal attempts for a round.
-- ---------------------------------------------------------------------------
create or replace function submit_round(
  p_round_id uuid,
  p_selected_option text,
  p_reveal_targets jsonb -- [{"target_id": "...", "guessed_real_name": "..."}]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_student profiles;
  v_submission_id uuid;
  v_allow_edit boolean;
  v_target jsonb;
  v_max_attempts integer;
  v_idx integer := 0;
begin
  select * into v_student from profiles where id = auth.uid();
  if v_student.id is null or v_student.role <> 'student' or v_student.status <> 'active' then
    raise exception 'not an active student';
  end if;

  select * into v_round from rounds where id = p_round_id for update;
  if v_round.id is null or v_round.stage_id <> v_student.stage_id then
    raise exception 'round not found';
  end if;
  if v_round.status <> 'open' or now() not between v_round.opens_at and v_round.closes_at then
    raise exception 'round is not open';
  end if;
  if not (v_round.options ? p_selected_option) then
    raise exception 'invalid option';
  end if;

  select allow_answer_edit into v_allow_edit from stages where id = v_round.stage_id;

  select id into v_submission_id from submissions
    where round_id = p_round_id and student_id = v_student.id;

  if v_submission_id is not null and not v_allow_edit then
    raise exception 'already submitted';
  end if;

  if v_submission_id is null then
    insert into submissions (round_id, student_id, selected_option)
    values (p_round_id, v_student.id, p_selected_option)
    returning id into v_submission_id;
  else
    update submissions set selected_option = p_selected_option, edited_at = now()
      where id = v_submission_id;
    delete from reveal_attempts where submission_id = v_submission_id;
  end if;

  v_max_attempts := coalesce(v_round.reveal_attempts_allowed, 0);

  if v_round.reveal_enabled and p_reveal_targets is not null then
    for v_target in select * from jsonb_array_elements(p_reveal_targets)
    loop
      v_idx := v_idx + 1;
      if v_idx > v_max_attempts then
        raise exception 'too many reveal attempts';
      end if;

      if (v_target->>'target_id')::uuid = v_student.id then
        raise exception 'cannot target yourself';
      end if;

      if not exists (
        select 1 from profiles
        where id = (v_target->>'target_id')::uuid
          and stage_id = v_student.stage_id and role = 'student' and status = 'active'
      ) then
        raise exception 'invalid or already-exposed target';
      end if;

      insert into reveal_attempts
        (round_id, submission_id, revealer_id, target_id, guessed_real_name, attempt_index)
      values (
        p_round_id, v_submission_id, v_student.id,
        (v_target->>'target_id')::uuid, trim(v_target->>'guessed_real_name'), v_idx
      );
    end loop;
  end if;

  insert into events_log (stage_id, round_id, type, payload, visible_to_students)
    values (v_round.stage_id, p_round_id, 'submission_received', jsonb_build_object('count', 1), false);

  return v_submission_id;
end;
$$;

grant execute on function submit_round(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- calculate_round: scoring + sequential reveal resolution (preview only)
-- ---------------------------------------------------------------------------
create or replace function calculate_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_sub record;
  v_att record;
  v_target profiles;
  v_seq integer := 0;
  v_new_balance integer;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found';
  end if;
  if not is_stage_admin(v_round.stage_id) then
    raise exception 'not authorized';
  end if;
  if v_round.status <> 'closed' then
    raise exception 'round must be closed before calculation';
  end if;

  update rounds set status = 'calculating' where id = p_round_id;

  -- 1) score answers
  for v_sub in select * from submissions where round_id = p_round_id loop
    declare
      v_is_correct boolean := (v_sub.selected_option = v_round.correct_option);
      v_points integer := case when v_is_correct then v_round.points else 0 end;
      v_before integer;
    begin
      update submissions set is_correct = v_is_correct, points_awarded = v_points
        where id = v_sub.id;

      if v_is_correct and v_points > 0 then
        select balance into v_before from profiles where id = v_sub.student_id for update;
        v_new_balance := v_before + v_points;
        update profiles set balance = v_new_balance where id = v_sub.student_id;
        insert into balance_ledger
          (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
        values
          (v_round.stage_id, v_sub.student_id, p_round_id, 'correct_answer', v_points, v_before, v_new_balance,
           'إجابة صحيحة في الجولة ' || v_round.round_number);
      end if;
    end;
  end loop;

  -- 2) cancel reveal attempts belonging to wrong (or missing/incorrect) answers
  update reveal_attempts ra set status = 'cancelled_wrong_answer', processed_at = now()
  where ra.round_id = p_round_id
    and ra.status = 'pending'
    and exists (
      select 1 from submissions s
      where s.id = ra.submission_id and coalesce(s.is_correct, false) = false
    );

  -- 3) sequential resolution of remaining pending attempts, oldest submission first
  for v_att in
    select * from reveal_attempts
    where round_id = p_round_id and status = 'pending'
    order by submitted_at asc, id asc
  loop
    v_seq := v_seq + 1;
    update reveal_attempts set sequence_in_round = v_seq where id = v_att.id;

    select * into v_target from profiles where id = v_att.target_id for update;

    if v_target.status = 'exposed' then
      update reveal_attempts
        set status = 'cancelled_target_exposed', processed_at = now(),
            cancel_reason = 'الهدف تم كشفه بمحاولة أسبق في هذه الجولة أو قبلها'
        where id = v_att.id;
      continue;
    end if;

    if exists (select 1 from profiles where id = v_att.revealer_id and status = 'exposed') then
      update reveal_attempts
        set status = 'cancelled_revealer_exposed', processed_at = now(),
            cancel_reason = 'الكاشف نفسه انكشف قبل تنفيذ محاولته'
        where id = v_att.id;
      continue;
    end if;

    if trim(lower(v_att.guessed_real_name)) = trim(lower(v_target.real_name)) then
      -- successful reveal: transfer full current balance
      declare
        v_transfer integer := v_target.balance;
        v_revealer_before integer;
        v_revealer_after integer;
      begin
        update profiles
          set status = 'exposed', exposed_by = v_att.revealer_id, exposed_round_id = p_round_id, balance = 0
          where id = v_target.id;

        insert into balance_ledger
          (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
        values
          (v_round.stage_id, v_target.id, p_round_id, 'exposed_reset', -v_transfer, v_target.balance, 0,
           'تم كشفه، انتقل رصيده بالكامل');

        select balance into v_revealer_before from profiles where id = v_att.revealer_id for update;
        v_revealer_after := v_revealer_before + v_transfer;
        update profiles set balance = v_revealer_after where id = v_att.revealer_id;

        insert into balance_ledger
          (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
        values
          (v_round.stage_id, v_att.revealer_id, p_round_id, 'reveal_gain', v_transfer, v_revealer_before, v_revealer_after,
           'كشف لاعبًا وحصل على رصيده');

        update reveal_attempts
          set status = 'executed', is_correct = true, processed_at = now()
          where id = v_att.id;
      end;
    else
      update reveal_attempts
        set status = 'wrong_guess', is_correct = false, processed_at = now()
        where id = v_att.id;
    end if;
  end loop;

  update rounds set status = 'calculated', calculated_at = now() where id = p_round_id;
end;
$$;

grant execute on function calculate_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_round: reveal the (already calculated) results to students
-- ---------------------------------------------------------------------------
create or replace function publish_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_exposed record;
  v_correct_count integer;
  v_reveal_count integer;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found';
  end if;
  if not is_stage_admin(v_round.stage_id) then
    raise exception 'not authorized';
  end if;
  if v_round.status <> 'calculated' then
    raise exception 'round must be calculated before publishing';
  end if;

  update rounds set status = 'published', results_published_at = now() where id = p_round_id;

  select count(*) into v_correct_count from submissions where round_id = p_round_id and is_correct;
  select count(*) into v_reveal_count from reveal_attempts where round_id = p_round_id and status = 'executed';

  insert into events_log (stage_id, round_id, type, payload, visible_to_students)
  values (v_round.stage_id, p_round_id, 'round_results_published',
    jsonb_build_object('correct_count', v_correct_count, 'reveal_count', v_reveal_count), true);

  for v_exposed in
    select ra.*, tp.real_name as target_real_name, tp.display_name as target_display_name
    from reveal_attempts ra
    join profiles tp on tp.id = ra.target_id
    where ra.round_id = p_round_id and ra.status = 'executed'
  loop
    insert into events_log (stage_id, round_id, type, payload, visible_to_students)
    values (v_round.stage_id, p_round_id, 'player_exposed',
      jsonb_build_object('target_id', v_exposed.target_id, 'revealer_id', v_exposed.revealer_id), true);

    insert into notifications (stage_id, student_id, type, title, body, data)
    values (v_round.stage_id, v_exposed.target_id, 'exposed', 'تم كشفك!',
      'كُشفت في الجولة ' || v_round.round_number || ' وانتقل رصيدك بالكامل.',
      jsonb_build_object('round_id', p_round_id, 'revealer_id', v_exposed.revealer_id));

    insert into notifications (stage_id, student_id, type, title, body, data)
    values (v_round.stage_id, v_exposed.revealer_id, 'reveal_success', 'كشف ناجح!',
      'كشفت لاعبًا في الجولة ' || v_round.round_number || ' وحصلت على رصيده.',
      jsonb_build_object('round_id', p_round_id, 'target_id', v_exposed.target_id));
  end loop;

  insert into notifications (stage_id, student_id, type, title, body, data)
  select v_round.stage_id, s.student_id,
    case when s.is_correct then 'correct_answer' else 'wrong_answer' end,
    case when s.is_correct then 'إجابة صحيحة' else 'نتيجة الجولة' end,
    'ظهرت نتائج الجولة ' || v_round.round_number || '.',
    jsonb_build_object('round_id', p_round_id, 'points_awarded', s.points_awarded)
  from submissions s where s.round_id = p_round_id;
end;
$$;

grant execute on function publish_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- undo_calculation: reverse everything calculate_round did (only pre-publish)
-- ---------------------------------------------------------------------------
create or replace function undo_calculation(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_entry record;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if v_round.id is null then
    raise exception 'round not found';
  end if;
  if not is_stage_admin(v_round.stage_id) then
    raise exception 'not authorized';
  end if;
  if v_round.status not in ('calculated') then
    raise exception 'only a calculated (unpublished) round can be undone';
  end if;

  -- reverse ledger entries for this round, most recent first
  for v_entry in
    select * from balance_ledger where round_id = p_round_id order by created_at desc
  loop
    update profiles set balance = balance - v_entry.amount where id = v_entry.student_id;
  end loop;
  delete from balance_ledger where round_id = p_round_id;

  -- restore exposed players whose exposure came from this round
  update profiles set status = 'active', exposed_by = null, exposed_round_id = null
    where exposed_round_id = p_round_id;

  update reveal_attempts
    set status = 'pending', is_correct = null, processed_at = null, cancel_reason = null, sequence_in_round = null
    where round_id = p_round_id;

  update submissions set is_correct = null, points_awarded = null where round_id = p_round_id;

  delete from events_log where round_id = p_round_id and type in ('player_exposed', 'round_results_published');

  update rounds set status = 'closed', calculated_at = null where id = p_round_id;
end;
$$;

grant execute on function undo_calculation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_adjust_balance: manual balance correction with a mandatory reason
-- ---------------------------------------------------------------------------
create or replace function admin_adjust_balance(p_student_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student profiles;
  v_new_balance integer;
begin
  select * into v_student from profiles where id = p_student_id for update;
  if v_student.id is null or v_student.role <> 'student' then
    raise exception 'student not found';
  end if;
  if not is_stage_admin(v_student.stage_id) then
    raise exception 'not authorized';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason is required';
  end if;

  v_new_balance := v_student.balance + p_amount;
  update profiles set balance = v_new_balance where id = p_student_id;

  insert into balance_ledger
    (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason, created_by)
  values
    (v_student.stage_id, p_student_id, null, 'admin_adjustment', p_amount, v_student.balance, v_new_balance,
     p_reason, auth.uid());

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_student.stage_id, 'admin_adjust_balance', 'profiles', p_student_id, p_reason);
end;
$$;

grant execute on function admin_adjust_balance(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_expose_player: manual exposure by an admin (edge-case control)
-- ---------------------------------------------------------------------------
create or replace function admin_expose_player(p_student_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student profiles;
begin
  select * into v_student from profiles where id = p_student_id for update;
  if v_student.id is null or v_student.role <> 'student' then
    raise exception 'student not found';
  end if;
  if not is_stage_admin(v_student.stage_id) then
    raise exception 'not authorized';
  end if;

  update profiles set status = 'exposed', balance = 0 where id = p_student_id;

  if v_student.balance <> 0 then
    insert into balance_ledger
      (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason, created_by)
    values
      (v_student.stage_id, p_student_id, null, 'exposed_reset', -v_student.balance, v_student.balance, 0,
       coalesce(p_reason, 'كشف إداري'), auth.uid());
  end if;

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_student.stage_id, 'admin_expose_player', 'profiles', p_student_id, p_reason);
end;
$$;

grant execute on function admin_expose_player(uuid, text) to authenticated;

-- ============================================================================
-- Realtime: broadcast changes on tables the UI subscribes to
-- ============================================================================
alter publication supabase_realtime add table profiles, rounds, events_log, notifications, reveal_attempts;
