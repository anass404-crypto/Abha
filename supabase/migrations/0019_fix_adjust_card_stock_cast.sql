-- admin_adjust_card_stock's change_type CASE expression resolved to text,
-- which Postgres refuses to insert into the card_inventory_change_type enum
-- column without an explicit cast — the function has never actually worked.
-- Same signature as before, so create or replace is enough.
create or replace function admin_adjust_card_stock(p_stage_action_card_id uuid, p_delta integer, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_card stage_action_cards;
begin
  select * into v_card from stage_action_cards where id = p_stage_action_card_id for update;
  if v_card.id is null then
    raise exception 'card not found';
  end if;
  if not is_stage_admin(v_card.stage_id) and not is_system_admin() then
    raise exception 'not authorized';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason is required';
  end if;
  if v_card.remaining_copies + p_delta < 0 then
    raise exception 'resulting stock cannot be negative';
  end if;

  update stage_action_cards
    set remaining_copies = remaining_copies + p_delta, total_copies = total_copies + greatest(p_delta, 0)
    where id = p_stage_action_card_id;

  insert into card_inventory_transactions (stage_id, stage_action_card_id, change_type, delta, remaining_before, remaining_after, actor_id, reason)
  values (v_card.stage_id, p_stage_action_card_id,
          (case when p_delta >= 0 then 'stock_increase' else 'stock_decrease' end)::card_inventory_change_type,
          p_delta, v_card.remaining_copies, v_card.remaining_copies + p_delta, auth.uid(), p_reason);

  insert into admin_audit_log (actor_id, stage_id, action, target_table, target_id, reason)
  values (auth.uid(), v_card.stage_id, 'adjust_card_stock', 'stage_action_cards', p_stage_action_card_id, p_reason);
end;
$$;

grant execute on function admin_adjust_card_stock(uuid, integer, text) to authenticated;
