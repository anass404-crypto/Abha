-- ============================================================================
-- get_stage_player_cards required is_active_student() (status='active'
-- specifically) to authorize a student caller — an exposed student calling
-- it themselves would hit "not authorized" and get nothing back, even
-- though requireStageMember() already lets them reach /display. This
-- broadens read access to any non-pending/rejected student (active or
-- exposed) or an admin. It only affects who can VIEW the roster; every
-- mutating RPC (submit_round, use_action_card, ...) still requires
-- status='active' on its own and is untouched here.
-- Same signature/output as 0017, so create or replace is enough.
-- ============================================================================
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
  if not (
    exists (
      select 1 from profiles pr
      where pr.id = auth.uid() and pr.role = 'student' and pr.stage_id = p_stage_id and pr.status in ('active', 'exposed')
    )
    or is_stage_admin(p_stage_id)
  ) then
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
