-- ============================================================================
-- Students had no way to see a card's rarity, and once a card was purchased/
-- granted, get_my_action_cards dropped its description entirely — so a
-- student could no longer tell what a card in their wallet actually does
-- before using it. This adds rarity to stage_action_cards (copied from the
-- template at instantiation time) and exposes rarity + description through
-- both the shop and the wallet listing.
-- ============================================================================

alter table stage_action_cards
  add column rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary'));

update stage_action_cards sac
  set rarity = t.rarity
  from action_card_templates t
  where sac.template_id = t.id;

drop function if exists get_stage_card_shop(uuid);

create function get_stage_card_shop(p_stage_id uuid)
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
      sac.effect_key,
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

drop function if exists get_my_action_cards(uuid);

create function get_my_action_cards(p_stage_id uuid)
returns table (
  id uuid,
  card_name text,
  card_icon text,
  card_description text,
  rarity text,
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
    select pac.id, sac.name, sac.icon, sac.description, sac.rarity, sac.effect_key, sac.requires_target,
           pac.status, pac.acquired_source, pac.acquired_at, pac.expires_at, pac.reserved_round_id, pac.used_round_id
    from player_action_cards pac
    join stage_action_cards sac on sac.id = pac.stage_action_card_id
    where pac.stage_id = p_stage_id and pac.student_id = auth.uid()
    order by pac.acquired_at desc;
end;
$$;

grant execute on function get_my_action_cards(uuid) to authenticated;
