-- calculate_round was writing directly to profiles.balance/status (and
-- balance_ledger) the moment the admin calculated a round — before
-- publish_round ever ran. That's a real leak: a stray realtime event on
-- events_log (e.g. any other student's submission, which itself inserts a
-- 'submission_received' row) triggers every open player-grid to refetch
-- get_stage_player_cards, which reads live profiles.balance/status — so a
-- calculated-but-unpublished round's results could already be visible to
-- students before the admin decided to publish. "Calculated" is supposed
-- to be a private preview for the admin only (submissions/reveal_attempts,
-- already admin-only via RLS); actual balance/status changes now happen
-- only inside publish_round, atomically, right before it makes anything
-- visible to students.

create or replace function calculate_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_sub record;
  v_att record;
  v_target profiles;
  v_seq integer := 0;
  v_exposed_ids uuid[] := '{}'; -- simulated exposures for this pass only, not persisted
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

  -- 2) cancel reveal attempts belonging to wrong (or missing/incorrect) answers
  update reveal_attempts ra set status = 'cancelled_wrong_answer', processed_at = now()
  where ra.round_id = p_round_id
    and ra.status = 'pending'
    and exists (
      select 1 from submissions s
      where s.id = ra.submission_id and coalesce(s.is_correct, false) = false
    );

  -- 3) sequential resolution of remaining pending attempts, oldest submission first.
  -- Exposure is tracked only in v_exposed_ids here — profiles.status is untouched
  -- until publish, so this cascading logic must simulate it locally.
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

-- ---------------------------------------------------------------------------
-- publish_round: now performs the actual balance/status mutations (moved
-- here from calculate_round), then makes results visible to students.
-- ---------------------------------------------------------------------------
create or replace function publish_round(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_sub record;
  v_att record;
  v_before integer;
  v_transfer integer;
  v_revealer_before integer;
  v_revealer_after integer;
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

  -- award correct-answer points
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
    v_revealer_after := v_revealer_before + v_transfer;
    update profiles set balance = v_revealer_after where id = v_att.revealer_id;

    insert into balance_ledger
      (stage_id, student_id, round_id, type, amount, balance_before, balance_after, reason)
    values
      (v_round.stage_id, v_att.revealer_id, p_round_id, 'reveal_gain', v_transfer, v_revealer_before, v_revealer_after,
       'كشف لاعبًا وحصل على رصيده');
  end loop;

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

-- ---------------------------------------------------------------------------
-- undo_calculation: much simpler now — calculate_round no longer touches
-- profiles/balance_ledger, so there is nothing there to reverse. Only the
-- computed preview fields on submissions/reveal_attempts need resetting.
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

  update reveal_attempts
    set status = 'pending', is_correct = null, processed_at = null, cancel_reason = null, sequence_in_round = null
    where round_id = p_round_id;

  update submissions set is_correct = null, points_awarded = null where round_id = p_round_id;

  update rounds set status = 'closed', calculated_at = null where id = p_round_id;
end;
$$;
