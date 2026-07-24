-- ============================================================================
-- protected_copy grants immunity from reveal AND balance transfer for the
-- round it's active in — this closes the second half of that guarantee by
-- blocking admin_adjust_balance/admin_expose_player from touching a student
-- while their protection is in force (reserved before calculate_round runs,
-- or applied after it — either way "this round" hasn't resolved yet).
-- Once the round is published the protection's round is over, so this never
-- blocks retroactive/unrelated admin actions after that point.
-- ============================================================================

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
  if exists (
    select 1 from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    join rounds r on r.id = u.effective_round_id
    where u.student_id = p_student_id and sac.effect_key = 'protected_copy'
      and u.status in ('reserved', 'applied') and r.status <> 'published'
  ) then
    raise exception 'student is protected by an active card this round';
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

create or replace function admin_expose_player(p_student_id uuid, p_reason text default null)
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
  if exists (
    select 1 from action_card_usages u
    join stage_action_cards sac on sac.id = u.stage_action_card_id
    join rounds r on r.id = u.effective_round_id
    where u.student_id = p_student_id and sac.effect_key = 'protected_copy'
      and u.status in ('reserved', 'applied') and r.status <> 'published'
  ) then
    raise exception 'student is protected by an active card this round';
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
