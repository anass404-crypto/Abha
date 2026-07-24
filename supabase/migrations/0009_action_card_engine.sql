-- ============================================================================
-- Action card engine: calculate_round/publish_round/undo_calculation extended
-- with the full card pipeline, submit_round extended for double_vision/
-- temp_exclusion, and every student/admin RPC needed to purchase, use, grant,
-- revoke, and manage cards.
--
-- Core invariant preserved from 0005/0008: calculate_round never writes to
-- profiles.balance/status, player_action_cards.status, or stage_action_cards
-- counters — it is still a pure, re-runnable preview. Only publish_round
-- commits real balance/wallet/inventory state, exactly once per round
-- (guarded by the existing status <> 'calculated' check).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- calculate_round: full pipeline (exclusion -> freeze -> scoring -> double
-- points -> shield/protected -> eligibility -> sequential reveal resolution
-- with card guards -> history logging)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- publish_round: unchanged base logic (points/reveal transfers only commit
-- here), extended for double_points on reveal-gain, wallet consumption,
-- and card notifications. Ends by calling evaluate_action_card_rules (0010).
-- ---------------------------------------------------------------------------
create or replace function publish_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_sub record;
  v_att record;
  v_effect record;
  v_before integer;
  v_transfer integer;
  v_revealer_before integer;
  v_revealer_after integer;
  v_exposed record;
  v_correct_count integer;
  v_reveal_count integer;
  v_card_name text;
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

  -- award correct-answer points (points_awarded was already doubled at
  -- calculate time if double_points applied — no extra logic needed here)
  for v_sub in
    select * from submissions where round_id = p_round_id and is_correct and coalesce(points_awarded, 0) > 0
  loop
    select balance into v_before from profiles where id = v_sub.student_id for update;
    update profiles set balance = v_before + v_sub.points_awarded where id = v_sub.student_id;
    insert into balance_ledger
      (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
    values
      (v_round.stage_id, v_sub.student_id, p_round_id, 'correct_answer', v_sub.points_awarded,
       v_before, v_before + v_sub.points_awarded, 'إجابة صحيحة في الجولة ' || v_round.round_number);
  end loop;

  -- apply successful reveals in the order they were resolved during calculation
  for v_att in
    select * from reveal_attempts where round_id = p_round_id and status = 'executed' order by sequence_in_round asc
  loop
    select balance into v_transfer from profiles where id = v_att.target_id for update;

    update profiles
      set status = 'exposed', exposed_by = v_att.revealer_id, exposed_round_id = p_round_id, balance = 0
      where id = v_att.target_id;

    insert into balance_ledger
      (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
    values
      (v_round.stage_id, v_att.target_id, p_round_id, 'exposed_reset', -v_transfer, v_transfer, 0,
       'تم كشفه، انتقل رصيده بالكامل');

    select balance into v_revealer_before from profiles where id = v_att.revealer_id for update;

    -- double_points (all_round_gains scope) doubles the revealer's gain only —
    -- the victim's loss is always their full real balance, never doubled.
    declare
      v_gain integer := v_transfer;
      v_usage_id uuid;
    begin
      select u.id into v_usage_id
        from action_card_usages u
        join stage_action_cards sac on sac.id = u.stage_action_card_id
        where u.student_id = v_att.revealer_id and u.effective_round_id = p_round_id
          and sac.effect_key = 'double_points' and u.status = 'applied'
          and (sac.effect_config->>'scope') = 'all_round_gains'
        limit 1;
      if v_usage_id is not null then
        v_gain := v_transfer * 2;
      end if;

      v_revealer_after := v_revealer_before + v_gain;
      update profiles set balance = v_revealer_after where id = v_att.revealer_id;

      insert into balance_ledger
        (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason, card_usage_id)
      values
        (v_round.stage_id, v_att.revealer_id, p_round_id, 'reveal_gain', v_gain, v_revealer_before, v_revealer_after,
         'كشف لاعبًا وحصل على رصيده', v_usage_id);
    end;
  end loop;

  -- consume/return wallet cards for every usage resolved this round
  for v_effect in select * from action_card_effects where round_id = p_round_id loop
    if v_effect.outcome = 'applied' then
      update player_action_cards pac
        set status = 'used', used_at = now(), used_round_id = p_round_id
        where pac.id = (select player_action_card_id from action_card_usages where id = v_effect.usage_id);
      update stage_action_cards set used_count = used_count + 1 where id = v_effect.stage_action_card_id;
      insert into card_inventory_transactions (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, related_player_action_card_id, actor_id, reason)
        select v_round.stage_id, sac.id, 'stock_decrease'::card_inventory_change_type, 0, sac.remaining_copies, sac.remaining_copies,
               (select player_action_card_id from action_card_usages where id = v_effect.usage_id), null, 'card used in round ' || v_round.round_number
        from stage_action_cards sac where sac.id = v_effect.stage_action_card_id;
    end if;
  end loop;

  -- usages that ended up failed (e.g. frozen/excluded) never took effect —
  -- return the wallet card to available rather than consuming it
  update player_action_cards pac
    set status = 'available', reserved_round_id = null
    where pac.status = 'reserved'
      and pac.id in (select player_action_card_id from action_card_usages where effective_round_id = p_round_id and status = 'failed');

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

  -- card-usage notifications (identity of who/whom only if the card owner's
  -- stage_action_cards row opts into revealing it)
  for v_effect in select * from action_card_effects where round_id = p_round_id and outcome = 'applied' loop
    select name into v_card_name from stage_action_cards where id = v_effect.stage_action_card_id;
    insert into notifications (stage_id, student_id, type, title, body, data)
    values (v_round.stage_id, v_effect.student_id, 'card_used', 'تم تفعيل بطاقتك',
      'تم تفعيل بطاقة "' || v_card_name || '" في الجولة ' || v_round.round_number || '.',
      jsonb_build_object('round_id', p_round_id));

    if v_effect.target_student_id is not null and v_effect.target_student_id <> v_effect.student_id then
      insert into notifications (stage_id, student_id, type, title, body, data)
      select v_round.stage_id, v_effect.target_student_id, 'card_targeted',
        case when sac.reveal_effect_source_to_target then 'استُهدفت ببطاقة' else 'تأثير في الجولة' end,
        case when sac.reveal_effect_source_to_target
          then 'استُهدفت ببطاقة "' || v_card_name || '" في الجولة ' || v_round.round_number || '.'
          else 'حدث تأثير خاص أثّر على مشاركتك في الجولة ' || v_round.round_number || '.'
        end,
        jsonb_build_object('round_id', p_round_id)
      from stage_action_cards sac where sac.id = v_effect.stage_action_card_id;
    end if;
  end loop;

  perform evaluate_action_card_rules(p_round_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- undo_calculation: also resets the card-preview state (effects/history) —
-- nothing here touches wallets/inventory since calculate_round never did.
-- ---------------------------------------------------------------------------
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

  delete from reveal_attempt_status_history where reveal_attempt_id in (select id from reveal_attempts where round_id = p_round_id);
  delete from action_card_effects where round_id = p_round_id;

  update action_card_usages set status = 'reserved'
  where effective_round_id = p_round_id and status in ('applied', 'failed');

  update reveal_attempts
    set status = 'pending', is_correct = null, processed_at = null, cancel_reason = null,
        sequence_in_round = null, execution_eligible = null, blocking_effect_id = null
    where round_id = p_round_id;

  update submissions set is_correct = null, points_awarded = null, voided_by_exclusion = false where round_id = p_round_id;

  update rounds set status = 'closed', calculated_at = null where id = p_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_round: extended for double_vision (extra attempt slot) and
-- temp_exclusion (hard block). reveal_freeze is NOT blocked here — the
-- student's submission/reveal attempt is accepted, and calculate_round's
-- phase 0b cancels it, matching the spec's "shows as incomplete" wording
-- rather than a hard submission rejection.
-- ---------------------------------------------------------------------------
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

  v_max_attempts := coalesce(v_round.reveal_attempts_allowed, 0);
  if exists (
    select 1 from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    where u.student_id = v_student.id and u.effective_round_id = p_round_id
      and sac.effect_key = 'double_vision' and u.status = 'reserved'
  ) then
    v_max_attempts := v_max_attempts + 1;
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

-- ---------------------------------------------------------------------------
-- get_round_participation_status: the caller's own restrictions for a round —
-- safe to expose pre-publish because it is the student's own state, not
-- another player's result.
-- ---------------------------------------------------------------------------
create or replace function get_round_participation_status(p_round_id uuid)
returns table (excluded boolean, reveal_frozen boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
    select
      exists (
        select 1 from action_card_usages u join stage_action_cards sac on sac.id = u.stage_action_card_id
        where u.target_student_id = auth.uid() and u.effective_round_id = p_round_id
          and sac.effect_key = 'temp_exclusion' and u.status in ('reserved', 'applied')
      ),
      exists (
        select 1 from action_card_usages u join stage_action_cards sac on sac.id = u.stage_action_card_id
        where u.target_student_id = auth.uid() and u.effective_round_id = p_round_id
          and sac.effect_key = 'reveal_freeze' and u.status in ('reserved', 'applied')
      );
end;
$$;

grant execute on function get_round_participation_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_stage_card_shop: masked store listing for students (mirrors
-- get_stage_player_cards' masking pattern — no sold/granted/effect_config
-- internals reach the client).
-- ---------------------------------------------------------------------------
create or replace function get_stage_card_shop(p_stage_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  icon text,
  image_url text,
  price_points integer,
  remaining_copies integer,
  sold_out boolean,
  usage_timing card_usage_timing,
  requires_target boolean,
  max_per_student integer,
  is_purchasable boolean,
  is_undiscovered boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_active_student(p_stage_id) or is_stage_admin(p_stage_id)) then
    raise exception 'not authorized';
  end if;

  return query
    select
      sac.id,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then 'بطاقة غير مكتشفة' else sac.name end,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.description end,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.icon end,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.image_url end,
      sac.price_points,
      sac.remaining_copies,
      sac.remaining_copies <= 0,
      sac.usage_timing,
      sac.requires_target,
      sac.max_per_student,
      sac.is_purchasable,
      (sac.discovery_hidden_until_first_reveal and sac.discovered_at is null)
    from stage_action_cards sac
    where sac.stage_id = p_stage_id and sac.is_active
    order by sac.price_points asc;
end;
$$;

grant execute on function get_stage_card_shop(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_action_cards: the caller's wallet, joined with card display info
-- (students have no direct SELECT on stage_action_cards, so this function
-- is the only way to see the card name/description for an owned card).
-- ---------------------------------------------------------------------------
create or replace function get_my_action_cards(p_stage_id uuid)
returns table (
  id uuid,
  card_name text,
  card_icon text,
  status player_card_status,
  acquired_source card_acquire_source,
  acquired_at timestamptz,
  expires_at timestamptz,
  reserved_round_id uuid,
  used_round_id uuid
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  return query
    select pac.id, sac.name, sac.icon, pac.status, pac.acquired_source, pac.acquired_at,
           pac.expires_at, pac.reserved_round_id, pac.used_round_id
    from player_action_cards pac
    join stage_action_cards sac on sac.id = pac.stage_action_card_id
    where pac.stage_id = p_stage_id and pac.student_id = auth.uid()
    order by pac.acquired_at desc;
end;
$$;

grant execute on function get_my_action_cards(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- purchase_action_card: atomic buy with row-level locking to prevent
-- overselling the last copy.
-- ---------------------------------------------------------------------------
create or replace function purchase_action_card(p_stage_action_card_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_card stage_action_cards;
  v_student profiles;
  v_owned_count integer;
  v_player_card_id uuid;
  v_new_balance integer;
begin
  select * into v_student from profiles where id = auth.uid() for update;
  if v_student.id is null or v_student.role <> 'student' or v_student.status <> 'active' then
    raise exception 'not an active student';
  end if;

  select * into v_card from stage_action_cards where id = p_stage_action_card_id for update;
  if v_card.id is null or v_card.stage_id <> v_student.stage_id then
    raise exception 'card not found';
  end if;
  if not v_card.is_active or not v_card.is_purchasable then
    raise exception 'card not purchasable';
  end if;
  if v_card.remaining_copies <= 0 then
    raise exception 'sold out';
  end if;
  if v_student.balance < v_card.price_points then
    raise exception 'insufficient balance';
  end if;
  if v_card.max_per_student is not null then
    select count(*) into v_owned_count from player_action_cards
      where student_id = v_student.id and stage_action_card_id = v_card.id and status <> 'cancelled';
    if v_owned_count >= v_card.max_per_student then
      raise exception 'max per student reached';
    end if;
  end if;

  v_new_balance := v_student.balance - v_card.price_points;
  update profiles set balance = v_new_balance where id = v_student.id;

  insert into player_action_cards (stage_id, student_id, stage_action_card_id, acquired_source, expires_at)
  values (v_card.stage_id, v_student.id, v_card.id, 'purchase',
          case when v_card.validity_hours is not null then now() + (v_card.validity_hours || ' hours')::interval else null end)
  returning id into v_player_card_id;

  insert into action_card_purchases (stage_id, student_id, stage_action_card_id, player_action_card_id, price_paid, balance_before, balance_after)
  values (v_card.stage_id, v_student.id, v_card.id, v_player_card_id, v_card.price_points, v_student.balance, v_new_balance);

  insert into balance_ledger (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
  values (v_card.stage_id, v_student.id, null, 'card_purchase', -v_card.price_points, v_student.balance, v_new_balance,
          'شراء بطاقة: ' || v_card.name);

  update stage_action_cards
    set remaining_copies = remaining_copies - 1, sold_count = sold_count + 1
    where id = v_card.id;

  insert into card_inventory_transactions
    (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, related_purchase_id, actor_id)
  values (v_card.stage_id, v_card.id, 'purchase', -1, v_card.remaining_copies, v_card.remaining_copies - 1,
          (select id from action_card_purchases where player_action_card_id = v_player_card_id), v_student.id);

  if v_card.discovery_hidden_until_first_reveal and v_card.discovered_at is null then
    update stage_action_cards set discovered_at = now() where id = v_card.id;
    insert into events_log (stage_id, round_id, type, payload, visible_to_students)
      values (v_card.stage_id, null, 'card_discovered', jsonb_build_object('card_name', v_card.name), true);
  end if;

  return v_player_card_id;
end;
$$;

grant execute on function purchase_action_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- use_action_card: reserve a wallet card's effect for a round (or the next
-- round, for reveal_freeze/temp_exclusion which always target the round
-- after the one the student is currently on).
-- ---------------------------------------------------------------------------
create or replace function use_action_card(
  p_player_action_card_id uuid,
  p_round_id uuid,
  p_target_student_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student profiles;
  v_card player_action_cards;
  v_stage_card stage_action_cards;
  v_round rounds;
  v_effective_round_id uuid;
  v_target profiles;
  v_usage_id uuid;
begin
  select * into v_student from profiles where id = auth.uid();
  if v_student.id is null or v_student.role <> 'student' or v_student.status <> 'active' then
    raise exception 'not an active student';
  end if;

  select * into v_card from player_action_cards where id = p_player_action_card_id for update;
  if v_card.id is null or v_card.student_id <> v_student.id then
    raise exception 'card not found';
  end if;
  if v_card.status <> 'available' then
    raise exception 'card is not available';
  end if;
  if v_card.expires_at is not null and v_card.expires_at < now() then
    raise exception 'card has expired';
  end if;

  select * into v_stage_card from stage_action_cards where id = v_card.stage_action_card_id;
  if not v_stage_card.is_active then
    raise exception 'card is disabled';
  end if;

  select * into v_round from rounds where id = p_round_id and stage_id = v_student.stage_id;
  if v_round.id is null then
    raise exception 'round not found';
  end if;

  if v_stage_card.effect_key in ('reveal_freeze', 'temp_exclusion') then
    select id into v_effective_round_id from rounds
      where stage_id = v_student.stage_id and round_number > v_round.round_number
      order by round_number asc limit 1;
    if v_effective_round_id is null then
      raise exception 'no next round scheduled yet';
    end if;
  else
    v_effective_round_id := p_round_id;
  end if;

  if v_stage_card.requires_target then
    if p_target_student_id is null then
      raise exception 'this card requires a target';
    end if;
    if p_target_student_id = v_student.id then
      raise exception 'cannot target yourself';
    end if;
    select * into v_target from profiles where id = p_target_student_id;
    if v_target.id is null or v_target.stage_id <> v_student.stage_id or v_target.role <> 'student' or v_target.status <> 'active' then
      raise exception 'invalid or ineligible target';
    end if;
  end if;

  insert into action_card_usages
    (stage_id, player_action_card_id, stage_action_card_id, student_id, target_student_id, round_id, effective_round_id, status)
  values
    (v_student.stage_id, v_card.id, v_stage_card.id, v_student.id, p_target_student_id, p_round_id, v_effective_round_id, 'reserved')
  returning id into v_usage_id;

  update player_action_cards set status = 'reserved', reserved_round_id = v_effective_round_id where id = v_card.id;

  return v_usage_id;
end;
$$;

grant execute on function use_action_card(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_action_card_usage: student-side cancel, only when the card's own
-- config allows it and it hasn't been processed yet.
-- ---------------------------------------------------------------------------
create or replace function cancel_action_card_usage(p_usage_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usage action_card_usages;
  v_stage_card stage_action_cards;
begin
  select * into v_usage from action_card_usages where id = p_usage_id for update;
  if v_usage.id is null or v_usage.student_id <> auth.uid() then
    raise exception 'usage not found';
  end if;
  if v_usage.status <> 'reserved' then
    raise exception 'usage can no longer be cancelled';
  end if;

  select * into v_stage_card from stage_action_cards where id = v_usage.stage_action_card_id;
  if not v_stage_card.allows_student_cancel then
    raise exception 'this card cannot be cancelled by the student';
  end if;

  update action_card_usages set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid() where id = p_usage_id;
  update player_action_cards set status = 'available', reserved_round_id = null where id = v_usage.player_action_card_id;
end;
$$;

grant execute on function cancel_action_card_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
create or replace function admin_grant_action_card(
  p_student_id uuid, p_stage_action_card_id uuid, p_quantity integer,
  p_reason text, p_expires_at timestamptz default null, p_reserved_round_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_card stage_action_cards;
  v_student profiles;
  v_i integer;
  v_new_id uuid;
begin
  select * into v_student from profiles where id = p_student_id;
  if v_student.id is null or v_student.role <> 'student' then
    raise exception 'student not found';
  end if;
  if not is_stage_admin(v_student.stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason is required';
  end if;

  select * into v_card from stage_action_cards where id = p_stage_action_card_id for update;
  if v_card.id is null or v_card.stage_id <> v_student.stage_id then
    raise exception 'card not found';
  end if;

  for v_i in 1..p_quantity loop
    insert into player_action_cards (stage_id, student_id, stage_action_card_id, acquired_source, expires_at, reserved_round_id, admin_note)
    values (v_card.stage_id, p_student_id, v_card.id, 'admin_grant', p_expires_at, p_reserved_round_id, p_reason)
    returning id into v_new_id;

    insert into card_inventory_transactions (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, related_player_action_card_id, actor_id, reason)
      values (v_card.stage_id, v_card.id, 'admin_grant', 0, v_card.remaining_copies, v_card.remaining_copies, v_new_id, auth.uid(), p_reason);
  end loop;

  update stage_action_cards set granted_count = granted_count + p_quantity where id = v_card.id;

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_card.stage_id, 'grant_action_card', 'player_action_cards', p_student_id, p_reason);
end;
$$;

grant execute on function admin_grant_action_card(uuid, uuid, integer, text, timestamptz, uuid) to authenticated;

create or replace function admin_revoke_action_card(p_player_action_card_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_card player_action_cards;
begin
  select * into v_card from player_action_cards where id = p_player_action_card_id for update;
  if v_card.id is null then
    raise exception 'card not found';
  end if;
  if not is_stage_admin(v_card.stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if v_card.status not in ('available', 'reserved') then
    raise exception 'only an unused card can be revoked';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason is required';
  end if;

  update player_action_cards set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason where id = p_player_action_card_id;
  update action_card_usages set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
    where player_action_card_id = p_player_action_card_id and status = 'reserved';

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_card.stage_id, 'revoke_action_card', 'player_action_cards', p_player_action_card_id, p_reason);
end;
$$;

grant execute on function admin_revoke_action_card(uuid, text) to authenticated;

create or replace function admin_cancel_card_usage(p_usage_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usage action_card_usages;
begin
  select * into v_usage from action_card_usages where id = p_usage_id for update;
  if v_usage.id is null then
    raise exception 'usage not found';
  end if;
  if not is_stage_admin(v_usage.stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if v_usage.status <> 'reserved' then
    raise exception 'only a reserved usage can be cancelled';
  end if;

  update action_card_usages set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason where id = p_usage_id;
  update player_action_cards set status = 'available', reserved_round_id = null where id = v_usage.player_action_card_id;

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_usage.stage_id, 'cancel_card_usage', 'action_card_usages', p_usage_id, p_reason);
end;
$$;

grant execute on function admin_cancel_card_usage(uuid, text) to authenticated;

create or replace function admin_cancel_reveal_attempt(p_attempt_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_attempt reveal_attempts;
  v_stage_id uuid;
begin
  select * into v_attempt from reveal_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then
    raise exception 'attempt not found';
  end if;
  select stage_id into v_stage_id from rounds where id = v_attempt.round_id;
  if not is_stage_admin(v_stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if exists (select 1 from rounds where id = v_attempt.round_id and status = 'published') then
    raise exception 'cannot cancel an attempt after results are published';
  end if;

  update reveal_attempts set status = 'cancelled_admin', processed_at = now(), cancel_reason = p_reason where id = p_attempt_id;
  insert into reveal_attempt_status_history (reveal_attempt_id, from_status, to_status, changed_by, internal_reason)
    values (p_attempt_id, v_attempt.status, 'cancelled_admin', auth.uid(), p_reason);

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_stage_id, 'cancel_reveal_attempt', 'reveal_attempts', p_attempt_id, p_reason);
end;
$$;

grant execute on function admin_cancel_reveal_attempt(uuid, text) to authenticated;

create or replace function admin_adjust_card_stock(p_stage_action_card_id uuid, p_delta integer, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_card stage_action_cards;
begin
  select * into v_card from stage_action_cards where id = p_stage_action_card_id for update;
  if v_card.id is null then
    raise exception 'card not found';
  end if;
  if not is_stage_admin(v_card.stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason is required';
  end if;
  if v_card.remaining_copies + p_delta < 0 then
    raise exception 'resulting stock cannot be negative';
  end if;

  update stage_action_cards
    set remaining_copies = remaining_copies + p_delta, total_copies = total_copies + greatest(p_delta, 0)
    where id = p_stage_action_card_id;

  insert into card_inventory_transactions (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, actor_id, reason)
  values (v_card.stage_id, p_stage_action_card_id, case when p_delta >= 0 then 'stock_increase' else 'stock_decrease' end,
          p_delta, v_card.remaining_copies, v_card.remaining_copies + p_delta, auth.uid(), p_reason);

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_card.stage_id, 'adjust_card_stock', 'stage_action_cards', p_stage_action_card_id, p_reason);
end;
$$;

grant execute on function admin_adjust_card_stock(uuid, integer, text) to authenticated;
