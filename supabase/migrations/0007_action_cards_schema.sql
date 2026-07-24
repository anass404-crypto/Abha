-- ============================================================================
-- Action cards + reveal log: schema only (enums, tables, indexes, RLS).
-- No function bodies here — see 0008 (reveal log) and 0009 (card engine).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enum extensions
-- ---------------------------------------------------------------------------
alter type reveal_status add value if not exists 'cancelled_card_effect';
alter type ledger_type add value if not exists 'card_purchase';
alter type ledger_type add value if not exists 'card_refund';

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
create type card_effect_key as enum (
  'shadow_shield', 'double_vision', 'double_points',
  'reveal_freeze', 'temp_exclusion', 'protected_copy'
);

create type card_usage_timing as enum (
  'before_round', 'during_open', 'after_answer_before_close', 'next_round'
);

create type card_acquire_source as enum (
  'purchase', 'auto_grant', 'admin_grant', 'seasonal_reward', 'admin_compensation'
);

create type player_card_status as enum (
  'available', 'reserved', 'used', 'expired', 'cancelled'
);

create type card_usage_status as enum (
  'reserved', 'applied', 'failed', 'cancelled', 'pending_admin_approval', 'rejected'
);

create type card_inventory_change_type as enum (
  'initial_stock', 'stock_increase', 'stock_decrease', 'purchase',
  'admin_grant', 'admin_revoke', 'usage_cancel_return', 'expiry_release', 'rule_grant'
);

create type rule_condition_type as enum (
  'most_targeted_unexposed', 'consecutive_participation', 'consecutive_correct_answers',
  'first_successful_reveal', 'largest_balance_transfer', 'survivor_rounds',
  'balance_threshold', 'leaderboard_rank'
);

create type rule_scope as enum ('per_round', 'end_of_competition');

-- ---------------------------------------------------------------------------
-- stages: new per-stage visibility toggles for the two features
-- ---------------------------------------------------------------------------
alter table stages
  add column show_reveal_log boolean not null default true,
  add column enable_action_cards boolean not null default true;

-- ---------------------------------------------------------------------------
-- reveal_attempts / submissions / balance_ledger: additive columns only
-- ---------------------------------------------------------------------------
alter table submissions add column voided_by_exclusion boolean not null default false;

-- ---------------------------------------------------------------------------
-- action_card_templates: global bank (system_admin managed)
-- ---------------------------------------------------------------------------
create table action_card_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  effect_key card_effect_key not null,
  name text not null,
  description text not null,
  icon text,
  image_url text,
  default_config jsonb not null default '{}',
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  is_globally_active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stage_action_cards: per-stage instantiation of a template (bank/store config)
-- ---------------------------------------------------------------------------
create table stage_action_cards (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  template_id uuid not null references action_card_templates (id),
  effect_key card_effect_key not null,
  name text not null,
  description text not null,
  icon text,
  image_url text,
  price_points integer not null default 0 check (price_points >= 0),
  total_copies integer not null check (total_copies >= 0),
  remaining_copies integer not null check (remaining_copies >= 0),
  sold_count integer not null default 0,
  granted_count integer not null default 0,
  used_count integer not null default 0,
  expired_count integer not null default 0,
  cancelled_count integer not null default 0,
  is_active boolean not null default true,
  is_purchasable boolean not null default true,
  is_auto_grantable boolean not null default true,
  is_manual_grantable boolean not null default true,
  max_per_student integer,
  validity_hours integer,
  usage_timing card_usage_timing not null,
  requires_target boolean not null default false,
  requires_admin_approval boolean not null default false,
  stackable_with_other_cards boolean not null default true,
  conflict_priority integer not null default 100,
  allows_student_cancel boolean not null default false,
  reveal_effect_source_to_target boolean not null default false,
  effect_config jsonb not null default '{}',
  discovery_hidden_until_first_reveal boolean not null default false,
  discovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, template_id),
  constraint stage_action_cards_stock_consistency check (
    remaining_copies + sold_count + granted_count - used_count - expired_count - cancelled_count >= 0
  )
);
create index stage_action_cards_stage_idx on stage_action_cards (stage_id, is_active);

-- ---------------------------------------------------------------------------
-- player_action_cards: student wallet
-- ---------------------------------------------------------------------------
create table player_action_cards (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  stage_action_card_id uuid not null references stage_action_cards (id),
  status player_card_status not null default 'available',
  acquired_source card_acquire_source not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz,
  reserved_round_id uuid references rounds (id),
  used_round_id uuid references rounds (id),
  used_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  admin_note text,
  created_at timestamptz not null default now()
);
create index player_action_cards_student_idx on player_action_cards (student_id, status);
create index player_action_cards_stage_idx on player_action_cards (stage_id, status);

-- ---------------------------------------------------------------------------
-- action_card_purchases
-- ---------------------------------------------------------------------------
create table action_card_purchases (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  stage_action_card_id uuid not null references stage_action_cards (id),
  player_action_card_id uuid not null references player_action_cards (id),
  price_paid integer not null,
  balance_before integer not null,
  balance_after integer not null,
  purchased_at timestamptz not null default now()
);
create index action_card_purchases_student_idx on action_card_purchases (student_id, purchased_at);

-- ---------------------------------------------------------------------------
-- action_card_usages: intent to use a card ("reserved" -> "applied"/"failed"/...)
-- ---------------------------------------------------------------------------
create table action_card_usages (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  player_action_card_id uuid not null references player_action_cards (id),
  stage_action_card_id uuid not null references stage_action_cards (id),
  student_id uuid not null references profiles (id) on delete cascade,
  target_student_id uuid references profiles (id),
  round_id uuid not null references rounds (id),
  effective_round_id uuid not null references rounds (id),
  status card_usage_status not null default 'reserved',
  submitted_at timestamptz not null default now(),
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  cancelled_by uuid references profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  check (target_student_id is null or target_student_id <> student_id)
);
create index action_card_usages_round_idx on action_card_usages (effective_round_id, status);
create index action_card_usages_student_idx on action_card_usages (student_id);
create unique index action_card_usages_one_active_per_card
  on action_card_usages (player_action_card_id)
  where status in ('reserved', 'applied', 'pending_admin_approval');

-- ---------------------------------------------------------------------------
-- action_card_effects: realized internal outcome of a usage during calculate_round
-- ---------------------------------------------------------------------------
create table action_card_effects (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  usage_id uuid not null references action_card_usages (id),
  stage_action_card_id uuid not null references stage_action_cards (id),
  effect_key card_effect_key not null,
  student_id uuid not null references profiles (id),
  target_student_id uuid references profiles (id),
  outcome text not null check (outcome in ('applied', 'no_effect', 'blocked_by_conflict', 'superseded')),
  detail jsonb not null default '{}',
  priority_used integer not null,
  created_at timestamptz not null default now(),
  unique (usage_id, round_id)
);
create index action_card_effects_round_idx on action_card_effects (round_id);
create index action_card_effects_target_idx on action_card_effects (target_student_id);

-- reveal_attempts: link to the effect that blocked/affected it, plus visibility gate
alter table reveal_attempts
  add column execution_eligible boolean,
  add column blocking_effect_id uuid references action_card_effects (id);
create index reveal_attempts_blocking_effect_idx on reveal_attempts (blocking_effect_id);

-- balance_ledger: tag rows caused by a card usage (purchase debit, doubled gain, ...)
alter table balance_ledger add column card_usage_id uuid references action_card_usages (id);

-- ---------------------------------------------------------------------------
-- reveal_attempt_status_history: admin-only audit trail of status transitions
-- ---------------------------------------------------------------------------
create table reveal_attempt_status_history (
  id uuid primary key default gen_random_uuid(),
  reveal_attempt_id uuid not null references reveal_attempts (id) on delete cascade,
  from_status reveal_status,
  to_status reveal_status not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references profiles (id),
  internal_reason text,
  card_effect_id uuid references action_card_effects (id)
);
create index reveal_attempt_status_history_attempt_idx on reveal_attempt_status_history (reveal_attempt_id, changed_at);

-- ---------------------------------------------------------------------------
-- card_inventory_transactions
-- ---------------------------------------------------------------------------
create table card_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  stage_action_card_id uuid not null references stage_action_cards (id),
  change_type card_inventory_change_type not null,
  delta integer not null,
  remaining_before integer not null,
  remaining_after integer not null,
  related_purchase_id uuid references action_card_purchases (id),
  related_player_action_card_id uuid references player_action_cards (id),
  actor_id uuid references profiles (id),
  reason text,
  created_at timestamptz not null default now()
);
create index card_inventory_transactions_card_idx on card_inventory_transactions (stage_action_card_id, created_at);

-- ---------------------------------------------------------------------------
-- action_card_rules + rewards + grants (dedupe ledger)
-- ---------------------------------------------------------------------------
create table action_card_rules (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  condition_type rule_condition_type not null,
  condition_config jsonb not null default '{}',
  target_value numeric,
  repeatable boolean not null default false,
  scope rule_scope not null default 'per_round',
  max_grants integer,
  priority integer not null default 100,
  requires_admin_approval boolean not null default false,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, code)
);
create index action_card_rules_stage_idx on action_card_rules (stage_id, status);

create table action_card_rule_rewards (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references action_card_rules (id) on delete cascade,
  stage_action_card_id uuid not null references stage_action_cards (id),
  quantity integer not null default 1 check (quantity > 0),
  validity_hours_override integer,
  reserved_for_next_round boolean not null default false
);

create table action_card_rule_grants (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  rule_id uuid not null references action_card_rules (id),
  student_id uuid not null references profiles (id) on delete cascade,
  round_id uuid references rounds (id),
  evaluation_key text not null,
  approved boolean not null default true,
  player_action_card_id uuid references player_action_cards (id),
  triggered_at timestamptz not null default now(),
  unique (rule_id, evaluation_key)
);
create index action_card_rule_grants_stage_idx on action_card_rule_grants (stage_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table action_card_templates enable row level security;
alter table stage_action_cards enable row level security;
alter table player_action_cards enable row level security;
alter table action_card_purchases enable row level security;
alter table action_card_usages enable row level security;
alter table action_card_effects enable row level security;
alter table reveal_attempt_status_history enable row level security;
alter table card_inventory_transactions enable row level security;
alter table action_card_rules enable row level security;
alter table action_card_rule_rewards enable row level security;
alter table action_card_rule_grants enable row level security;

-- action_card_templates: global catalog, readable by any authenticated user
-- (stage admins need to browse it when creating a stage_action_cards row),
-- writable only by system_admin.
create policy action_card_templates_select_all on action_card_templates
  for select using (true);
create policy action_card_templates_system_admin_write on action_card_templates
  for all using (is_system_admin()) with check (is_system_admin());

-- stage_action_cards: admin-only direct table access. Students never read this
-- table directly — the store is served exclusively through get_stage_card_shop()
-- (0008/0009), exactly like get_stage_player_cards masks profiles for students.
create policy stage_action_cards_admin_all on stage_action_cards
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- player_action_cards: owner can read their own wallet; admins manage all.
create policy player_action_cards_self_select on player_action_cards
  for select using (student_id = auth.uid());
create policy player_action_cards_admin_all on player_action_cards
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- action_card_purchases: owner can read their own purchase history; admins all.
create policy action_card_purchases_self_select on action_card_purchases
  for select using (student_id = auth.uid());
create policy action_card_purchases_admin_select on action_card_purchases
  for select using (is_system_admin() or is_stage_admin(stage_id));

-- action_card_usages: owner can read their own usages; admins manage all.
-- No direct student INSERT policy — usages are only created via the
-- use_action_card() SECURITY DEFINER RPC (0009), which does its own validation.
create policy action_card_usages_self_select on action_card_usages
  for select using (student_id = auth.uid());
create policy action_card_usages_admin_all on action_card_usages
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- action_card_effects: admin-only. Never exposed to students directly —
-- the internal "detail" jsonb and effect linkage must never leak to a
-- student response; students only ever see the two-state outcome via
-- get_stage_reveal_log().
create policy action_card_effects_admin_all on action_card_effects
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- reveal_attempt_status_history: admin-only audit trail.
create policy reveal_attempt_status_history_admin_select on reveal_attempt_status_history
  for select using (
    is_system_admin()
    or is_stage_admin((select r.stage_id from reveal_attempts ra join rounds r on r.id = ra.round_id where ra.id = reveal_attempt_id))
  );

-- card_inventory_transactions: admin-only.
create policy card_inventory_transactions_admin_all on card_inventory_transactions
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- action_card_rules / rewards / grants: admin-only (rules are an admin
-- configuration surface, not student-visible).
create policy action_card_rules_admin_all on action_card_rules
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

create policy action_card_rule_rewards_admin_all on action_card_rule_rewards
  for all using (
    is_system_admin()
    or is_stage_admin((select r.stage_id from action_card_rules r where r.id = rule_id))
  )
  with check (
    is_system_admin()
    or is_stage_admin((select r.stage_id from action_card_rules r where r.id = rule_id))
  );

create policy action_card_rule_grants_admin_all on action_card_rule_grants
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- Realtime: let the store/wallet pages react live to stock/wallet changes,
-- matching how other student-facing tables are already published.
alter publication supabase_realtime add table stage_action_cards;
alter publication supabase_realtime add table player_action_cards;
