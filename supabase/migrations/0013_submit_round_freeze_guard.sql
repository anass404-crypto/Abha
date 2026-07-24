-- ============================================================================
-- submit_round was missing the reveal_freeze check on the reveal-attempts
-- slot count: only temp_exclusion was blocking submission outright, so a
-- frozen student who also held a reserved double_vision usage could still
-- submit reveal attempts (including the extra double_vision slot) before
-- calculate_round's phase 0b cancelled them after the fact. The conflict
-- resolution plan (scenario 3: double_vision vs reveal_freeze) requires
-- freeze to be the first line of defense — a frozen student gets zero
-- reveal-attempt slots this round, full stop, before double_vision is even
-- considered.
-- ============================================================================

create or replace function submit_round(
  p_round_id uuid,
  p_selected_option text,
  p_reveal_targets jsonb
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
  v_frozen boolean;
begin
  select * into v_student from profiles where id = auth.uid();
  if v_student.id is null or v_student.role <> 'student' or v_student.status <> 'active' then
    raise exception 'not an active student';
  end if;

  select * into v_round from rounds where id = p_round_id for update;
  if v_round.id is null or v_round.stage_id <> v_student.stage_id then
    raise exception 'round not found';
  end if;
  if v_round.status <> 'open' or (
    v_round.opens_at is not null and v_round.closes_at is not null
    and now() not between v_round.opens_at and v_round.closes_at
  ) then
    raise exception 'round is not open';
  end if;
  if not (v_round.options ? p_selected_option) then
    raise exception 'invalid option';
  end if;

  if exists (
    select 1 from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.target_student_id = v_student.id and u.effective_round_id = p_round_id
      and sac.effect_key = 'temp_exclusion' and u.status in ('reserved', 'applied')
  ) then
    raise exception 'participation suspended this round by an action card';
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

  select exists (
    select 1 from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.target_student_id = v_student.id and u.effective_round_id = p_round_id
      and sac.effect_key = 'reveal_freeze' and u.status in ('reserved', 'applied')
  ) into v_frozen;

  if v_frozen then
    v_max_attempts := 0;
  else
    v_max_attempts := coalesce(v_round.reveal_attempts_allowed, 0);
    if exists (
      select 1 from action_card_usages u
      join stage_action_cards sac on sac.id = u.stage_action_card_id
      where u.student_id = v_student.id and u.effective_round_id = p_round_id
        and sac.effect_key = 'double_vision' and u.status = 'reserved'
    ) then
      v_max_attempts := v_max_attempts + 1;
    end if;
  end if;

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
