-- Full stage deletion for system admins. Every other table already cascades
-- from stages/rounds/profiles, except admin_audit_log (its stage_id and
-- actor_id references have no ON DELETE clause, which would otherwise block
-- the deletion) — clear those rows first, then let the existing cascades
-- remove everything else in one statement.
create or replace function delete_stage_completely(p_stage_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_system_admin() then
    raise exception 'not authorized';
  end if;

  delete from admin_audit_log
    where stage_id = p_stage_id
       or actor_id in (select id from profiles where stage_id = p_stage_id);

  delete from stages where id = p_stage_id;
end;
$$;

grant execute on function delete_stage_completely(uuid) to authenticated;
