-- ============================================================================
-- double_vision's extra reveal-attempt slot was already granted correctly by
-- submit_round, but calculate_round never recorded an action_card_effects
-- row for it (unlike double_points/shield/protected_copy) — so its usage
-- never transitioned to 'applied', and publish_round's wallet-consumption
-- loop (which only looks at action_card_effects rows) never marked the
-- wallet card 'used'. The card stayed stuck in 'reserved' forever, even
-- after the round it was reserved for was published.
--
-- Same signature as before, so create or replace is enough.
-- ============================================================================
create or replace function calculate_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_sub record;
  v_att record;
  v_usage record;
  v_target profiles;
  v_seq integer := 0;
  v_exposed_ids uuid[] := '{}';
  v_effect_id uuid;
  v_points integer;
  v_priority integer;
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

  -- 0) temp_exclusion — voids the target's submission/reveal attempts and
  -- fails their other card usages for this round, before anything else runs.
  for v_usage in
    select u.* from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.effective_round_id = p_round_id and u.status = 'reserved' and sac.effect_key = 'temp_exclusion'
    order by u.submitted_at asc, u.id asc
  loop
    select priority_used into v_priority from action_card_effects where usage_id = v_usage.id limit 1;
    update submissions
      set voided_by_exclusion = true, is_correct = null, points_awarded = 0
      where round_id = p_round_id and student_id = v_usage.target_student_id;

    update reveal_attempts
      set status = 'cancelled_card_effect', processed_at = now()
      where round_id = p_round_id and revealer_id = v_usage.target_student_id and status = 'pending';

    update action_card_usages
      set status = 'failed'
      where effective_round_id = p_round_id and student_id = v_usage.target_student_id
        and status = 'reserved' and id <> v_usage.id;

    insert into action_card_effects (stage_id, round_id, usage_id, stage_action_card_id, effect_key, student_id, target_student_id, outcome, priority_used)
      values (v_round.stage_id, p_round_id, v_usage.id, v_usage.stage_action_card_id, 'temp_exclusion', v_usage.student_id, v_usage.target_student_id, 'applied', 0)
      returning id into v_effect_id;

    update action_card_usages set status = 'applied' where id = v_usage.id;
  end loop;

  -- 0b) reveal_freeze — cancels the frozen student's own pending reveal
  -- attempts this round, and fails any double_vision usage they reserved.
  -- If the target was already excluded above, this is a no-op (superseded).
  for v_usage in
    select u.* from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.effective_round_id = p_round_id and u.status = 'reserved' and sac.effect_key = 'reveal_freeze'
    order by u.submitted_at asc, u.id asc
  loop
    if exists (
      select 1 from action_card_effects
      where round_id = p_round_id and target_student_id = v_usage.target_student_id and effect_key = 'temp_exclusion' and outcome = 'applied'
    ) then
      insert into action_card_effects (stage_id, round_id, usage_id, stage_action_card_id, effect_key, student_id, target_student_id, outcome, priority_used)
        values (v_round.stage_id, p_round_id, v_usage.id, v_usage.stage_action_card_id, 'reveal_freeze', v_usage.student_id, v_usage.target_student_id, 'superseded', 0);
      update action_card_usages set status = 'failed' where id = v_usage.id;
      continue;
    end if;

    update reveal_attempts
      set status = 'cancelled_card_effect', processed_at = now()
      where round_id = p_round_id and revealer_id = v_usage.target_student_id and status = 'pending';

    update action_card_usages
      set status = 'failed'
      where effective_round_id = p_round_id and student_id = v_usage.target_student_id
        and status = 'reserved' and stage_action_card_id in (select id from stage_action_cards where effect_key = 'double_vision');

    insert into action_card_effects (stage_id, round_id, usage_id, stage_action_card_id, effect_key, student_id, target_student_id, outcome, priority_used)
      values (v_round.stage_id, p_round_id, v_usage.id, v_usage.stage_action_card_id, 'reveal_freeze', v_usage.student_id, v_usage.target_student_id, 'applied', 1);

    update action_card_usages set status = 'applied' where id = v_usage.id;
  end loop;

  -- 1) score answers (skip anything voided by exclusion above)
  for v_sub in select * from submissions where round_id = p_round_id and not voided_by_exclusion loop
    v_points := case when v_sub.selected_option = v_round.correct_option then v_round.points else 0 end;

    -- double_points: applied per-student if they hold a reserved usage this round.
    if v_points > 0 and exists (
      select 1 from action_card_usages u
      join stage_action_cards sac on sac.id = u.stage_action_card_id
      where u.student_id = v_sub.student_id and u.effective_round_id = p_round_id
        and sac.effect_key = 'double_points' and u.status = 'reserved'
    ) then
      v_points := v_points * 2;
    end if;

    update submissions
      set is_correct = (v_sub.selected_option = v_round.correct_option), points_awarded = v_points
      where id = v_sub.id;
  end loop;

  -- record double_points effects (applied regardless of whether points were
  -- actually > 0 to double — the card was activated and consumed either way)
  for v_usage in
    select u.* from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.effective_round_id = p_round_id and u.status = 'reserved' and sac.effect_key = 'double_points'
  loop
    insert into action_card_effects (stage_id, round_id, usage_id, stage_action_card_id, effect_key, student_id, target_student_id, outcome, priority_used)
      values (v_round.stage_id, p_round_id, v_usage.id, v_usage.stage_action_card_id, 'double_points', v_usage.student_id, null, 'applied', 2);
    update action_card_usages set status = 'applied' where id = v_usage.id;
  end loop;

  -- record double_vision effects (applied regardless of whether the extra
  -- guess slot was actually filled in — the card was activated and consumed
  -- either way, same rule as every other card). Without this, the wallet
  -- card never transitions out of 'reserved' in publish_round below.
  for v_usage in
    select u.* from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.effective_round_id = p_round_id and u.status = 'reserved' and sac.effect_key = 'double_vision'
  loop
    insert into action_card_effects (stage_id, round_id, usage_id, stage_action_card_id, effect_key, student_id, target_student_id, outcome, priority_used)
      values (v_round.stage_id, p_round_id, v_usage.id, v_usage.stage_action_card_id, 'double_vision', v_usage.student_id, null, 'applied', 2);
    update action_card_usages set status = 'applied' where id = v_usage.id;
  end loop;

  -- 2) shield / protected_copy — record the effect now; the reveal loop below
  -- looks these up via blocking_effect_id, they are never consumed/exhausted.
  for v_usage in
    select u.* from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.effective_round_id = p_round_id and u.status = 'reserved' and sac.effect_key in ('shadow_shield', 'protected_copy')
  loop
    insert into action_card_effects (stage_id, round_id, usage_id, stage_action_card_id, effect_key, student_id, target_student_id, outcome, priority_used)
      values (v_round.stage_id, p_round_id, v_usage.id, v_usage.stage_action_card_id,
              (select effect_key from stage_action_cards where id = v_usage.stage_action_card_id),
              v_usage.student_id, v_usage.student_id, 'applied', 3);
    update action_card_usages set status = 'applied' where id = v_usage.id;
  end loop;

  -- 3) cancel reveal attempts belonging to wrong (or voided) answers.
  update reveal_attempts ra set status = 'cancelled_wrong_answer', processed_at = now(), execution_eligible = false
  where ra.round_id = p_round_id
    and ra.status = 'pending'
    and exists (
      select 1 from submissions s
      where s.id = ra.submission_id and coalesce(s.is_correct, false) = false
    );

  update reveal_attempts set execution_eligible = true
  where round_id = p_round_id and status = 'pending';

  -- 4) sequential resolution of remaining pending attempts, oldest submission
  -- first — with shield/protected guards checked before the name comparison.
  for v_att in
    select * from reveal_attempts
    where round_id = p_round_id and status = 'pending'
    order by submitted_at asc, id asc
  loop
    v_seq := v_seq + 1;
    update reveal_attempts set sequence_in_round = v_seq where id = v_att.id;

    select id into v_effect_id from action_card_effects
      where round_id = p_round_id and target_student_id = v_att.target_id
        and effect_key in ('shadow_shield', 'protected_copy') and outcome = 'applied'
      limit 1;

    if v_effect_id is not null then
      update reveal_attempts
        set status = 'cancelled_card_effect', processed_at = now(), blocking_effect_id = v_effect_id
        where id = v_att.id;
      insert into reveal_attempt_status_history (reveal_attempt_id, from_status, to_status, internal_reason, card_effect_id)
        values (v_att.id, 'pending', 'cancelled_card_effect', 'target protected by action card', v_effect_id);
      continue;
    end if;

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
