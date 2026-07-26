-- get_round_participation_status told the client about exclusion/freeze but
-- never surfaced an active double_vision usage — submit_round's server-side
-- "+1 reveal slot" logic was correct and tested, but round-flow.tsx had no
-- way to know about it, so it always capped picks at round.reveal_attempts_allowed.
-- The bonus slot was granted server-side but never reachable from the UI.
-- Column set changes, so this needs drop+create.

drop function if exists get_round_participation_status(uuid);

create function get_round_participation_status(p_round_id uuid)
returns table (excluded boolean, reveal_frozen boolean, double_vision_active boolean)
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
      ),
      exists (
        select 1 from action_card_usages u join stage_action_cards sac on sac.id = u.stage_action_card_id
        where u.student_id = auth.uid() and u.effective_round_id = p_round_id
          and sac.effect_key = 'double_vision' and u.status = 'reserved'
      );
end;
$$;

grant execute on function get_round_participation_status(uuid) to authenticated;
