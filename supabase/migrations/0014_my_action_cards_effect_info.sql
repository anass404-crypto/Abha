-- ============================================================================
-- get_my_action_cards was missing effect_key/requires_target — the student
-- client needs these to know whether "use this card" should prompt for a
-- target before calling use_action_card(). The column set changes, so this
-- needs drop+create rather than create or replace (Postgres rejects an
-- in-place return-type change).
-- ============================================================================

drop function if exists get_my_action_cards(uuid);

create function get_my_action_cards(p_stage_id uuid)
returns table (
  id uuid,
  card_name text,
  card_icon text,
  effect_key card_effect_key,
  requires_target boolean,
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
    select pac.id, sac.name, sac.icon, sac.effect_key, sac.requires_target, pac.status, pac.acquired_source, pac.acquired_at,
           pac.expires_at, pac.reserved_round_id, pac.used_round_id
    from player_action_cards pac
    join stage_action_cards sac on sac.id = pac.stage_action_card_id
    where pac.stage_id = p_stage_id and pac.student_id = auth.uid()
    order by pac.acquired_at desc;
end;
$$;

grant execute on function get_my_action_cards(uuid) to authenticated;
