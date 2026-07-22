-- get_login_email only matched students (by username/phone), so stage admins
-- had no way to sign in through the shared /{stage}/login page even though
-- they have no username/phone at all — only an auth_email. Extend the
-- resolver to also match stage admins by their auth_email within the stage.
create or replace function get_login_email(p_stage_slug text, p_identifier text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select p.auth_email into v_email
  from profiles p
  join stages s on s.id = p.stage_id
  where s.slug = p_stage_slug
    and p.status not in ('pending', 'rejected')
    and (
      (p.role = 'student' and (lower(p.username) = lower(p_identifier) or p.phone = p_identifier))
      or (p.role = 'stage_admin' and lower(p.auth_email) = lower(p_identifier))
    )
  limit 1;

  return v_email; -- null if not found; caller shows a generic error either way
end;
$$;
