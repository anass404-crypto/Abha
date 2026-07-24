-- ============================================================================
-- Auto-grant rules engine: evaluate_action_card_rules (called atomically from
-- publish_round, per_round scope), evaluate_end_of_competition_rules (manual
-- admin trigger, end_of_competition scope), grant_action_card_from_rule
-- (shared granting logic), approve_rule_grant (admin-approval-gated rules).
--
-- Dedup guarantee: action_card_rule_grants has unique(rule_id, evaluation_key).
-- grant_action_card_from_rule always inserts there first with
-- "on conflict do nothing" before granting anything — running either
-- evaluator twice for the same round/student/rule never double-grants,
-- and publish_round itself can only run once per round (status guard), so
-- calling this from publish_round is safe by construction.
-- ============================================================================

create or replace function grant_action_card_from_rule(
  p_rule action_card_rules,
  p_student_id uuid,
  p_round_id uuid,
  p_evaluation_key text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_grant_count integer;
  v_grant_id uuid;
  v_reward record;
  v_card stage_action_cards;
  v_player_card_id uuid;
  v_i integer;
  v_expires timestamptz;
  v_reserved_round uuid;
begin
  if p_rule.max_grants is not null then
    select count(*) into v_grant_count from action_card_rule_grants where rule_id = p_rule.id;
    if v_grant_count >= p_rule.max_grants then
      return;
    end if;
  end if;

  insert into action_card_rule_grants (stage_id, rule_id, student_id, round_id, evaluation_key, approved)
  values (p_rule.stage_id, p_rule.id, p_student_id, p_round_id, p_evaluation_key, not p_rule.requires_admin_approval)
  on conflict (rule_id, evaluation_key) do nothing
  returning id into v_grant_id;

  if v_grant_id is null then
    return;
  end if;

  if p_rule.requires_admin_approval then
    return;
  end if;

  for v_reward in select * from action_card_rule_rewards where rule_id = p_rule.id loop
    select * into v_card from stage_action_cards where id = v_reward.stage_action_card_id for update;
    if v_card.id is null then
      continue;
    end if;

    v_expires := case
      when v_reward.validity_hours_override is not null then now() + (v_reward.validity_hours_override || ' hours')::interval
      when v_card.validity_hours is not null then now() + (v_card.validity_hours || ' hours')::interval
      else null
    end;

    v_reserved_round := null;
    if v_reward.reserved_for_next_round and p_round_id is not null then
      select id into v_reserved_round from rounds
        where stage_id = p_rule.stage_id and round_number > (select round_number from rounds where id = p_round_id)
        order by round_number asc limit 1;
    end if;

    for v_i in 1..v_reward.quantity loop
      insert into player_action_cards (stage_id, student_id, stage_action_card_id, acquired_source, expires_at, reserved_round_id)
      values (p_rule.stage_id, p_student_id, v_card.id, 'auto_grant', v_expires, v_reserved_round)
      returning id into v_player_card_id;

      insert into card_inventory_transactions (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, related_player_action_card_id, reason)
      values (p_rule.stage_id, v_card.id, 'rule_grant', 0, v_card.remaining_copies, v_card.remaining_copies, v_player_card_id, 'auto-granted by rule: ' || p_rule.name);

      update stage_action_cards set granted_count = granted_count + 1 where id = v_card.id;
    end loop;

    update action_card_rule_grants set player_action_card_id = v_player_card_id where id = v_grant_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- evaluate_action_card_rules: per_round scope, called once from publish_round
-- (same transaction as the publish itself).
-- ---------------------------------------------------------------------------
create or replace function evaluate_action_card_rules(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stage_id uuid;
  v_round_number integer;
  v_rule action_card_rules;
  v_student_id uuid;
  v_key text;
  v_needed integer;
begin
  select stage_id, round_number into v_stage_id, v_round_number from rounds where id = p_round_id;
  if v_stage_id is null then
    raise exception 'round not found';
  end if;

  for v_rule in
    select * from action_card_rules
    where stage_id = v_stage_id and status = 'active' and scope = 'per_round'
    order by priority asc
  loop
    if v_rule.condition_type = 'most_targeted_unexposed' then
      select ra.target_id into v_student_id
        from reveal_attempts ra
        join profiles p on p.id = ra.target_id
        where ra.round_id = p_round_id and p.status <> 'exposed'
        group by ra.target_id
        order by count(*) desc
        limit 1;
      if v_student_id is not null then
        v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
        perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
      end if;

    elsif v_rule.condition_type = 'first_successful_reveal' then
      if not exists (select 1 from action_card_rule_grants where rule_id = v_rule.id) then
        select ra.revealer_id into v_student_id
          from reveal_attempts ra
          where ra.round_id = p_round_id and ra.status = 'executed'
          order by ra.processed_at asc limit 1;
        if v_student_id is not null then
          perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, 'first');
        end if;
      end if;

    elsif v_rule.condition_type = 'largest_balance_transfer' then
      select bl.student_id into v_student_id
        from balance_ledger bl
        where bl.round_id = p_round_id and bl.type = 'reveal_gain'
        order by bl.amount desc limit 1;
      if v_student_id is not null then
        v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
        perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
      end if;

    elsif v_rule.condition_type = 'consecutive_correct_answers' then
      v_needed := coalesce(v_rule.target_value, 3)::integer;
      for v_student_id in
        select s.student_id from submissions s
        join rounds r on r.id = s.round_id
        where r.stage_id = v_stage_id and r.round_number <= v_round_number and r.round_number > v_round_number - v_needed
        group by s.student_id
        having count(*) filter (where s.is_correct) = v_needed and count(*) = v_needed
      loop
        v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
        perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
      end loop;

    elsif v_rule.condition_type = 'consecutive_participation' then
      v_needed := coalesce(v_rule.target_value, 3)::integer;
      for v_student_id in
        select s.student_id from submissions s
        join rounds r on r.id = s.round_id
        where r.stage_id = v_stage_id and r.round_number <= v_round_number and r.round_number > v_round_number - v_needed
        group by s.student_id
        having count(*) = v_needed
      loop
        v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
        perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
      end loop;

    elsif v_rule.condition_type = 'survivor_rounds' then
      if v_round_number >= coalesce(v_rule.target_value, 3)::integer then
        for v_student_id in
          select id from profiles where stage_id = v_stage_id and role = 'student' and status = 'active'
        loop
          v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
          perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
        end loop;
      end if;

    elsif v_rule.condition_type = 'balance_threshold' then
      for v_student_id in
        select id from profiles
        where stage_id = v_stage_id and role = 'student' and status = 'active' and balance >= coalesce(v_rule.target_value, 0)
      loop
        v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
        perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
      end loop;

    elsif v_rule.condition_type = 'leaderboard_rank' then
      for v_student_id in
        select id from (
          select id, row_number() over (order by balance desc) as rnk
          from profiles where stage_id = v_stage_id and role = 'student' and status = 'active'
        ) ranked where rnk <= coalesce(v_rule.target_value, 1)
      loop
        v_key := v_student_id::text || case when v_rule.repeatable then ':' || p_round_id::text else '' end;
        perform grant_action_card_from_rule(v_rule, v_student_id, p_round_id, v_key);
      end loop;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- evaluate_end_of_competition_rules: manual admin trigger, end_of_competition
-- scope only. There is no automatic "competition ended" event in the current
-- schema, so this is intentionally a deliberate admin action, not a callback.
-- ---------------------------------------------------------------------------
create or replace function evaluate_end_of_competition_rules(p_stage_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rule action_card_rules;
  v_student_id uuid;
  v_last_round_number integer;
  v_needed integer;
begin
  if not is_stage_admin(p_stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;

  select max(round_number) into v_last_round_number from rounds where stage_id = p_stage_id and status = 'published';

  for v_rule in
    select * from action_card_rules
    where stage_id = p_stage_id and status = 'active' and scope = 'end_of_competition'
    order by priority asc
  loop
    if v_rule.condition_type = 'survivor_rounds' then
      for v_student_id in
        select id from profiles where stage_id = p_stage_id and role = 'student' and status = 'active'
      loop
        perform grant_action_card_from_rule(v_rule, v_student_id, null, v_student_id::text);
      end loop;

    elsif v_rule.condition_type = 'balance_threshold' then
      for v_student_id in
        select id from profiles
        where stage_id = p_stage_id and role = 'student' and status = 'active' and balance >= coalesce(v_rule.target_value, 0)
      loop
        perform grant_action_card_from_rule(v_rule, v_student_id, null, v_student_id::text);
      end loop;

    elsif v_rule.condition_type = 'leaderboard_rank' then
      for v_student_id in
        select id from (
          select id, row_number() over (order by balance desc) as rnk
          from profiles where stage_id = p_stage_id and role = 'student' and status = 'active'
        ) ranked where rnk <= coalesce(v_rule.target_value, 1)
      loop
        perform grant_action_card_from_rule(v_rule, v_student_id, null, v_student_id::text);
      end loop;

    elsif v_rule.condition_type = 'consecutive_correct_answers' and v_last_round_number is not null then
      v_needed := coalesce(v_rule.target_value, 3)::integer;
      for v_student_id in
        select s.student_id from submissions s
        join rounds r on r.id = s.round_id
        where r.stage_id = p_stage_id and r.round_number > v_last_round_number - v_needed
        group by s.student_id
        having count(*) filter (where s.is_correct) = v_needed and count(*) = v_needed
      loop
        perform grant_action_card_from_rule(v_rule, v_student_id, null, v_student_id::text);
      end loop;

    elsif v_rule.condition_type = 'consecutive_participation' and v_last_round_number is not null then
      v_needed := coalesce(v_rule.target_value, 3)::integer;
      for v_student_id in
        select s.student_id from submissions s
        join rounds r on r.id = s.round_id
        where r.stage_id = p_stage_id and r.round_number > v_last_round_number - v_needed
        group by s.student_id
        having count(*) = v_needed
      loop
        perform grant_action_card_from_rule(v_rule, v_student_id, null, v_student_id::text);
      end loop;
    end if;
  end loop;
end;
$$;

grant execute on function evaluate_end_of_competition_rules(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_rule_grant: finishes the grant for rules with requires_admin_approval
-- (grant_action_card_from_rule stops right after recording the dedup row for
-- those, without handing out any card yet).
-- ---------------------------------------------------------------------------
create or replace function approve_rule_grant(p_grant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_grant action_card_rule_grants;
  v_rule action_card_rules;
  v_reward record;
  v_card stage_action_cards;
  v_player_card_id uuid;
  v_i integer;
  v_expires timestamptz;
  v_reserved_round uuid;
begin
  select * into v_grant from action_card_rule_grants where id = p_grant_id for update;
  if v_grant.id is null then
    raise exception 'grant not found';
  end if;
  if not is_stage_admin(v_grant.stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if v_grant.approved then
    raise exception 'grant already approved';
  end if;

  select * into v_rule from action_card_rules where id = v_grant.rule_id;

  for v_reward in select * from action_card_rule_rewards where rule_id = v_rule.id loop
    select * into v_card from stage_action_cards where id = v_reward.stage_action_card_id for update;
    if v_card.id is null then
      continue;
    end if;

    v_expires := case
      when v_reward.validity_hours_override is not null then now() + (v_reward.validity_hours_override || ' hours')::interval
      when v_card.validity_hours is not null then now() + (v_card.validity_hours || ' hours')::interval
      else null
    end;

    v_reserved_round := null;
    if v_reward.reserved_for_next_round and v_grant.round_id is not null then
      select id into v_reserved_round from rounds
        where stage_id = v_rule.stage_id and round_number > (select round_number from rounds where id = v_grant.round_id)
        order by round_number asc limit 1;
    end if;

    for v_i in 1..v_reward.quantity loop
      insert into player_action_cards (stage_id, student_id, stage_action_card_id, acquired_source, expires_at, reserved_round_id)
      values (v_rule.stage_id, v_grant.student_id, v_card.id, 'auto_grant', v_expires, v_reserved_round)
      returning id into v_player_card_id;

      insert into card_inventory_transactions (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, related_player_action_card_id, actor_id, reason)
      values (v_rule.stage_id, v_card.id, 'rule_grant', 0, v_card.remaining_copies, v_card.remaining_copies, v_player_card_id, auth.uid(), 'approved rule grant: ' || v_rule.name);

      update stage_action_cards set granted_count = granted_count + 1 where id = v_card.id;
    end loop;

    update action_card_rule_grants set player_action_card_id = v_player_card_id where id = p_grant_id;
  end loop;

  update action_card_rule_grants set approved = true where id = p_grant_id;

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_grant.stage_id, 'approve_rule_grant', 'action_card_rule_grants', p_grant_id, 'admin approved auto-grant rule');
end;
$$;

grant execute on function approve_rule_grant(uuid) to authenticated;
