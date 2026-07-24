-- get_stage_player_cards fed every student-facing roster (display screen,
-- leaderboard, reveal target picker, admin preview) and never excluded
-- 'pending'/'rejected' profiles — people who were never actually accepted
-- into the competition showed up looking like real competitors. Same
-- signature as before, so create or replace is enough.
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
    where p.stage_id = p_stage_id and p.role = 'student' and p.status not in ('pending', 'rejected')
    order by p.created_at asc;
end;
$$;

grant execute on function get_stage_player_cards(uuid) to authenticated;
