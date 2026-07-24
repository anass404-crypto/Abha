-- ============================================================================
-- Reveal log: get_stage_reveal_log() + calculate_round/undo_calculation
-- updated to compute/reset reveal_attempts.execution_eligible.
--
-- execution_eligible is set once, at calculate time, in the exact same
-- statement that already marks wrong-answer attempts cancelled — this makes
-- a wrong-answer owner's reveal attempt structurally ABSENT from the
-- student-facing log (not merely filtered), matching the requirement that
-- students never even know such an attempt existed.
--
-- No card-effect logic yet (see 0009) — this migration only touches the
-- reveal-log feature so it can ship/be tested independently.
-- ============================================================================

create or replace function calculate_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_sub record;
  v_att record;
  v_target profiles;
  v_seq integer := 0;
  v_exposed_ids uuid[] := '{}';
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

  -- 1) score answers (submissions only — balances are awarded at publish time)
  for v_sub in select * from submissions where round_id = p_round_id loop
    update submissions
      set is_correct = (v_sub.selected_option = v_round.correct_option),
          points_awarded = case when v_sub.selected_option = v_round.correct_option then v_round.points else 0 end
      where id = v_sub.id;
  end loop;

  -- 2) cancel reveal attempts belonging to wrong (or missing/incorrect) answers.
  -- execution_eligible=false here is the structural gate that removes these
  -- rows from get_stage_reveal_log entirely.
  update reveal_attempts ra set status = 'cancelled_wrong_answer', processed_at = now(), execution_eligible = false
  where ra.round_id = p_round_id
    and ra.status = 'pending'
    and exists (
      select 1 from submissions s
      where s.id = ra.submission_id and coalesce(s.is_correct, false) = false
    );

  -- Every attempt still pending belongs to a correct-answer submission —
  -- eligible to appear in the reveal log once published, whatever its
  -- eventual resolution below.
  update reveal_attempts set execution_eligible = true
  where round_id = p_round_id and status = 'pending';

  -- 3) sequential resolution of remaining pending attempts, oldest submission first.
  for v_att in
    select * from reveal_attempts
    where round_id = p_round_id and status = 'pending'
    order by submitted_at asc, id asc
  loop
    v_seq := v_seq + 1;
    update reveal_attempts set sequence_in_round = v_seq where id = v_att.id;

    select * into v_target from profiles where id = v_att.target_id;

    if v_target.status = 'exposed' or v_att.target_id = any(v_exposed_ids) then
      update reveal_attempts
        set status = 'cancelled_target_exposed', processed_at = now(),
            cancel_reason = 'الهدف تم كشفه بمحاولة أسبق في هذه الجولة أو قبلها'
        where id = v_att.id;
      continue;
    end if;

    if v_att.revealer_id = any(v_exposed_ids)
       or (select status from profiles where id = v_att.revealer_id) = 'exposed'
    then
      update reveal_attempts
        set status = 'cancelled_revealer_exposed', processed_at = now(),
            cancel_reason = 'الكاشف نفسه انكشف قبل تنفيذ محاولته'
        where id = v_att.id;
      continue;
    end if;

    if trim(lower(v_att.guessed_real_name)) = trim(lower(v_target.real_name)) then
      v_exposed_ids := array_append(v_exposed_ids, v_target.id);
      update reveal_attempts
        set status = 'executed', is_correct = true, processed_at = now()
        where id = v_att.id;
    else
      update reveal_attempts
        set status = 'wrong_guess', is_correct = false, processed_at = now()
        where id = v_att.id;
    end if;
  end loop;

  update rounds set status = 'calculated', calculated_at = now() where id = p_round_id;
end;
$$;

create or replace function undo_calculation(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
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

  update reveal_attempts
    set status = 'pending', is_correct = null, processed_at = null, cancel_reason = null,
        sequence_in_round = null, execution_eligible = null
    where round_id = p_round_id;

  update submissions set is_correct = null, points_awarded = null where round_id = p_round_id;

  update rounds set status = 'closed', calculated_at = null where id = p_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_stage_reveal_log: the only way a student ever reads reveal_attempts.
-- Structural guarantees (not app-layer filtering):
--   - r.status = 'published' — same gate rounds_student_select_open_or_past
--     already relies on; nothing before publish can ever be returned.
--   - ra.execution_eligible is true — wrong-answer-owner attempts are never
--     in the result set at all.
--   - The return type has no column for the real status enum, cancel_reason,
--     guessed_real_name, or blocking_effect_id — there is no path to leak
--     them even if a future caller misuses the filters.
-- ---------------------------------------------------------------------------
create or replace function get_stage_reveal_log(
  p_stage_id uuid,
  p_round_id uuid default null,
  p_revealer_id uuid default null,
  p_target_id uuid default null,
  p_outcome text default null
)
returns table (
  round_id uuid,
  round_number integer,
  revealer_id uuid,
  revealer_display_name text,
  revealer_emoji text,
  target_id uuid,
  target_display_name text,
  target_emoji text,
  target_real_name text,
  outcome text,
  sequence_in_round integer,
  processed_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_active_student(p_stage_id) or is_stage_admin(p_stage_id)) then
    raise exception 'not authorized';
  end if;

  return query
    select
      r.id, r.round_number,
      rp.id, rp.display_name, rp.emoji,
      tp.id, tp.display_name, tp.emoji,
      case when ra.status = 'executed' then tp.real_name else null end,
      case when ra.status = 'executed' then 'exposed' else 'incomplete' end,
      ra.sequence_in_round, ra.processed_at
    from reveal_attempts ra
    join rounds r on r.id = ra.round_id
    join profiles rp on rp.id = ra.revealer_id
    join profiles tp on tp.id = ra.target_id
    where r.stage_id = p_stage_id
      and r.status = 'published'
      and ra.execution_eligible is true
      and (p_round_id is null or r.id = p_round_id)
      and (p_revealer_id is null or ra.revealer_id = p_revealer_id)
      and (p_target_id is null or ra.target_id = p_target_id)
      and (p_outcome is null or (case when ra.status = 'executed' then 'exposed' else 'incomplete' end) = p_outcome)
    order by r.round_number desc, ra.sequence_in_round asc nulls last, ra.processed_at asc;
end;
$$;

grant execute on function get_stage_reveal_log(uuid, uuid, uuid, uuid, text) to authenticated;
