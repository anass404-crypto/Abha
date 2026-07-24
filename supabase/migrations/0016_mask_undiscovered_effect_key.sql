-- get_stage_card_shop already masks name/description/icon/image_url for a
-- card still marked "undiscovered", but 0015 left effect_key unmasked —
-- that alone reveals what the mystery card does. Same signature as 0015,
-- so create or replace is enough (no drop needed).
create or replace function get_stage_card_shop(p_stage_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  icon text,
  image_url text,
  rarity text,
  effect_key card_effect_key,
  price_points integer,
  remaining_copies integer,
  sold_out boolean,
  usage_timing card_usage_timing,
  requires_target boolean,
  max_per_student integer,
  is_purchasable boolean,
  is_undiscovered boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_active_student(p_stage_id) or is_stage_admin(p_stage_id)) then
    raise exception 'not authorized';
  end if;

  return query
    select
      sac.id,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then 'بطاقة غير مكتشفة' else sac.name end,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.description end,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.icon end,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.image_url end,
      sac.rarity,
      case when sac.discovery_hidden_until_first_reveal and sac.discovered_at is null then null else sac.effect_key end,
      sac.price_points,
      sac.remaining_copies,
      sac.remaining_copies <= 0,
      sac.usage_timing,
      sac.requires_target,
      sac.max_per_student,
      sac.is_purchasable,
      (sac.discovery_hidden_until_first_reveal and sac.discovered_at is null)
    from stage_action_cards sac
    where sac.stage_id = p_stage_id and sac.is_active
    order by sac.price_points asc;
end;
$$;

grant execute on function get_stage_card_shop(uuid) to authenticated;
