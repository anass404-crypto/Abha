-- The player grid re-sorted by balance, so an exposed player (balance
-- reset to 0) would drift toward the bottom on its own even without a
-- separate "exposed" section — the requirement is a fixed grid position
-- per player regardless of balance/status changes. Order by registration
-- time instead, which never changes for a given player.
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
    order by p.created_at asc;
end;
$$;
